const db = require('../config/database');
const CouponModel = require('../models/couponModel');
const { getProductSalePrice, getProductDiscountPercent } = require('./productPricingService');
const { ORDER_STATUS, normalizeOrderStatus } = require('./orderStatusService');

const SHIPPING_BY_REGION = {
    sul: { label: 'Sul', amount: 15 },
    sudeste: { label: 'Sudeste', amount: 25 },
    centroOeste: { label: 'Centro-Oeste', amount: 30 },
    norte: { label: 'Norte', amount: 35 },
    nordeste: { label: 'Nordeste', amount: 45 },
};
const MAX_CHECKOUT_ITEMS = 100;

function formatBRL(value) {
    return Number(value || 0).toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
    });
}

function makeHttpError(message, status = 400) {
    const err = new Error(message);
    err.status = status;
    return err;
}

function getQueryRunner(queryRunner) {
    return queryRunner && typeof queryRunner.query === 'function' ? queryRunner : db;
}

function resolveShippingByCep(cep) {
    const digits = String(cep || '').replace(/\D/g, '');
    if (digits.length !== 8) return null;

    const prefix = Number(digits.substring(0, 5));
    if (!Number.isFinite(prefix)) return null;

    if (prefix >= 1000 && prefix <= 39999) return SHIPPING_BY_REGION.sudeste;
    if (prefix >= 40000 && prefix <= 65999) return SHIPPING_BY_REGION.nordeste;
    if (prefix >= 66000 && prefix <= 69999) return SHIPPING_BY_REGION.norte;
    if (prefix >= 70000 && prefix <= 76799) return SHIPPING_BY_REGION.centroOeste;
    if (prefix >= 76800 && prefix <= 77999) return SHIPPING_BY_REGION.norte;
    if (prefix >= 78000 && prefix <= 78899) return SHIPPING_BY_REGION.centroOeste;
    if (prefix >= 78900 && prefix <= 78999) return SHIPPING_BY_REGION.norte;
    if (prefix >= 79000 && prefix <= 79999) return SHIPPING_BY_REGION.centroOeste;
    if (prefix >= 80000 && prefix <= 99999) return SHIPPING_BY_REGION.sul;

    return null;
}

function calculateShipping(cep) {
    const region = resolveShippingByCep(cep);
    if (!region) {
        throw makeHttpError('CEP inválido', 400);
    }

    return {
        amount: region.amount,
        region: region.label,
    };
}

function normalizeCheckoutItems(items) {
    if (!Array.isArray(items) || items.length === 0) {
        throw makeHttpError('Carrinho vazio. Envie ao menos um item.', 400);
    }

    if (items.length > MAX_CHECKOUT_ITEMS) {
        throw makeHttpError(`Maximo ${MAX_CHECKOUT_ITEMS} itens por carrinho`, 400);
    }

    return items;
}

function getProductId(item, idx) {
    const productId = Number(item.productId || item.product_id || item.id);
    if (!Number.isInteger(productId) || productId < 1) {
        throw makeHttpError(`Item ${idx + 1} sem productId valido`, 400);
    }
    return productId;
}

function getQuantity(item, idx) {
    const quantity = Number(item.quantity);
    if (!Number.isInteger(quantity) || quantity < 1) {
        throw makeHttpError(`Item ${idx + 1} sem quantidade valida`, 400);
    }
    return quantity;
}

async function findProductForCheckout(productId, queryRunner, lockRows = false) {
    const runner = getQueryRunner(queryRunner);
    const result = await runner.query(
        `SELECT * FROM products WHERE id = $1${lockRows ? ' FOR UPDATE' : ''}`,
        [productId]
    );
    return result.rows[0] || null;
}

async function getSizeStockForCheckout(productId, size, queryRunner, lockRows = false) {
    const runner = getQueryRunner(queryRunner);
    const result = await runner.query(
        `SELECT stock
         FROM product_sizes
         WHERE product_id = $1 AND size = $2${lockRows ? ' FOR UPDATE' : ''}`,
        [productId, size]
    );
    return Number(result.rows[0]?.stock || 0);
}

async function findCouponForCheckout(code, queryRunner, lockRows = false) {
    const normalizedCode = String(code || '').trim().toUpperCase();
    if (!normalizedCode) return null;

    const runner = getQueryRunner(queryRunner);
    const result = await runner.query(
        `SELECT *
         FROM coupons
         WHERE UPPER(code) = UPPER($1)
           AND active = TRUE
           AND (expires_at IS NULL OR expires_at > NOW())
           AND (max_uses IS NULL OR COALESCE(uses_count, 0) < max_uses)
         ${lockRows ? 'FOR UPDATE' : ''}`,
        [normalizedCode]
    );
    return result.rows[0] || null;
}

async function calculateOrderPricing(items, couponCode, options = {}) {
    const queryRunner = getQueryRunner(options.queryRunner);
    const lockRows = options.lockRows === true;
    let subtotal = 0;
    const normalizedItems = [];

    for (const [idx, item] of normalizeCheckoutItems(items).entries()) {
        const productId = getProductId(item, idx);
        const quantity = getQuantity(item, idx);
        const product = await findProductForCheckout(productId, queryRunner, lockRows);

        if (!product) {
            throw makeHttpError(`Produto id=${productId} nao encontrado`, 404);
        }

        const size = item.size ? String(item.size).trim() : null;
        if (size) {
            const sizeStock = await getSizeStockForCheckout(productId, size, queryRunner, lockRows);
            if (sizeStock < quantity) {
                throw makeHttpError(`Estoque insuficiente para "${product.name}" no tamanho ${size}. Disponivel: ${sizeStock}`, 400);
            }
        } else if (Number(product.stock) < quantity) {
            throw makeHttpError(`Estoque insuficiente para "${product.name}". Disponivel: ${product.stock}`, 400);
        }

        const price = getProductSalePrice(product);
        const lineTotal = Number((price * quantity).toFixed(2));
        subtotal += lineTotal;

        normalizedItems.push({
            productId,
            name: product.name,
            image_url: product.image_url,
            price,
            original_price: Number(product.price),
            discount_percent: getProductDiscountPercent(product),
            quantity,
            size,
            lineTotal,
        });
    }

    subtotal = Number(subtotal.toFixed(2));
    const shippingInfo = calculateShipping(options.cep || options.shippingCep || options.postalCode);
    const shipping = shippingInfo.amount;
    let discount = 0;
    let appliedCoupon = null;

    if (couponCode) {
        const coupon = await findCouponForCheckout(couponCode, queryRunner, lockRows);
        if (!coupon) {
            throw makeHttpError('Cupom invalido', 400);
        }

        const minValue = Number(coupon.min_value) || 0;
        if (subtotal < minValue) {
            throw makeHttpError(
                `Cupom ${coupon.code} requer compra minima de ${formatBRL(minValue)}. Seu subtotal atual e ${formatBRL(subtotal)}.`,
                400
            );
        }

        discount = Number(((subtotal * Number(coupon.discount_percent)) / 100).toFixed(2));
        appliedCoupon = {
            id: coupon.id,
            code: coupon.code,
            discount_percent: coupon.discount_percent,
        };
    }

    const total = Number((subtotal + shipping - discount).toFixed(2));

    return {
        items: normalizedItems,
        subtotal,
        shipping,
        shippingRegion: shippingInfo.region,
        discount,
        total,
        appliedCoupon,
    };
}

async function decrementCheckoutStock(client, item) {
    if (item.size) {
        const stockResult = await client.query(
            `UPDATE product_sizes
             SET stock = stock - $1
             WHERE product_id = $2
               AND size = $3
               AND stock >= $1
             RETURNING stock`,
            [item.quantity, item.productId, item.size]
        );

        if (stockResult.rowCount === 0) {
            throw makeHttpError(`Estoque insuficiente para o tamanho ${item.size}`, 400);
        }

        await client.query(
            `UPDATE products
             SET stock = COALESCE((
                 SELECT SUM(stock)
                 FROM product_sizes
                 WHERE product_id = $1
             ), 0)
             WHERE id = $1`,
            [item.productId]
        );
        return;
    }

    const productStockResult = await client.query(
        `UPDATE products
         SET stock = stock - $1
         WHERE id = $2
           AND stock >= $1
         RETURNING stock`,
        [item.quantity, item.productId]
    );

    if (productStockResult.rowCount === 0) {
        throw makeHttpError(`Estoque insuficiente para o produto ${item.name}`, 400);
    }
}

async function insertOrderItem(client, orderId, item) {
    await client.query(
        `INSERT INTO order_items (order_id, product_id, product_name, product_price, quantity, size, line_total)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
            orderId,
            item.productId,
            item.name,
            item.price,
            item.quantity,
            item.size,
            item.lineTotal,
        ]
    );
}

function sanitizeAddressValue(value) {
    return String(value || '').trim().slice(0, 160);
}

function normalizeShippingAddress(address = {}, fallbackCep = null) {
    const source = address && typeof address === 'object' ? address : {};
    const cepDigits = String(source.cep || source.postalCode || source.shippingCep || fallbackCep || '').replace(/\D/g, '');
    const formattedCep = cepDigits.length === 8 ? `${cepDigits.slice(0, 5)}-${cepDigits.slice(5)}` : sanitizeAddressValue(source.cep || fallbackCep);

    return {
        cep: formattedCep,
        rua: sanitizeAddressValue(source.rua || source.street || source.address),
        numero: sanitizeAddressValue(source.numero || source.number),
        complemento: sanitizeAddressValue(source.complemento || source.complement),
        bairro: sanitizeAddressValue(source.bairro || source.neighborhood),
        cidade: sanitizeAddressValue(source.cidade || source.city),
        estado: sanitizeAddressValue(source.estado || source.state || source.uf),
    };
}

async function createOrderWithPricing({ userId, items, couponCode = null, status = ORDER_STATUS.WAITING_PAYMENT, cep = null, address = null }) {
    if (!Number.isInteger(Number(userId)) || Number(userId) < 1) {
        throw makeHttpError('Usuario invalido para criar pedido', 401);
    }

    const client = await db.pool.connect();
    try {
        await client.query('BEGIN');

        const pricing = await calculateOrderPricing(items, couponCode, {
            queryRunner: client,
            lockRows: true,
            cep,
        });
        const normalizedStatus = normalizeOrderStatus(status) || ORDER_STATUS.WAITING_PAYMENT;
        const shippingAddress = normalizeShippingAddress(address, cep);

        const result = await client.query(
            `INSERT INTO orders (user_id, subtotal, shipping, shipping_address, discount, total, coupon_code, status)
             VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8)
             RETURNING *`,
            [
                userId,
                pricing.subtotal,
                pricing.shipping,
                JSON.stringify(shippingAddress),
                pricing.discount,
                pricing.total,
                pricing.appliedCoupon ? pricing.appliedCoupon.code : null,
                normalizedStatus,
            ]
        );
        const order = result.rows[0];

        for (const item of pricing.items) {
            await decrementCheckoutStock(client, item);
            await insertOrderItem(client, order.id, item);
        }

        if (pricing.appliedCoupon) {
            const coupon = await CouponModel.incrementUses(pricing.appliedCoupon.id, client);
            if (!coupon) {
                throw makeHttpError('Cupom expirado ou limite de usos atingido', 400);
            }
        }

        await client.query('COMMIT');
        return { order, pricing };
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}

module.exports = {
    calculateOrderPricing,
    calculateShipping,
    createOrderWithPricing,
    formatBRL,
    normalizeShippingAddress,
};

