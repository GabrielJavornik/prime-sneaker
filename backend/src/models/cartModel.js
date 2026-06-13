const db = require('../config/database');
const {
    getProductDiscountPercent,
    getProductSalePrice,
} = require('../services/productPricingService');

const MAX_CART_QUANTITY = 9999;

function httpError(message, status = 400) {
    const err = new Error(message);
    err.status = status;
    return err;
}

function normalizeSize(size) {
    return String(size || '').trim();
}

function normalizeQuantity(quantity) {
    const parsed = Number(quantity);

    if (!Number.isInteger(parsed) || parsed < 1) {
        throw httpError('Quantidade invalida para o carrinho.', 400);
    }

    return Math.min(parsed, MAX_CART_QUANTITY);
}

function normalizeProductId(productId) {
    const parsed = Number(productId);

    if (!Number.isInteger(parsed) || parsed < 1) {
        throw httpError('Produto invalido para o carrinho.', 400);
    }

    return parsed;
}

function mapCartRow(row) {
    const salePrice = getProductSalePrice(row);
    const quantity = Number(row.quantity || 0);

    return {
        id: Number(row.id),
        productId: Number(row.product_id),
        product_id: Number(row.product_id),
        name: row.name,
        image_url: row.image_url,
        size: row.size || null,
        quantity,
        price: salePrice,
        original_price: Number(row.price || 0),
        discount_percent: getProductDiscountPercent(row),
        stock: Number(row.available_stock || row.stock || 0),
        lineTotal: Number((salePrice * quantity).toFixed(2)),
        updated_at: row.updated_at,
    };
}

async function getProductAvailability(productId, size) {
    const result = await db.query(
        `SELECT
            p.id,
            p.stock,
            COALESCE(ps.stock, p.stock, 0) AS available_stock
         FROM products p
         LEFT JOIN product_sizes ps
            ON ps.product_id = p.id
           AND ps.size = $2
           AND $2 <> ''
         WHERE p.id = $1`,
        [productId, size]
    );

    return result.rows[0] || null;
}

async function assertCanStoreCartItem(productId, size, quantity) {
    const product = await getProductAvailability(productId, size);

    if (!product) {
        throw httpError('Produto nao encontrado.', 404);
    }

    const availableStock = Number(product.available_stock || 0);
    if (quantity > availableStock) {
        throw httpError(`Estoque insuficiente para este produto. Disponivel: ${availableStock}.`, 400);
    }
}

const CartModel = {
    async findAllByUser(userId) {
        const result = await db.query(
            `SELECT
                ci.id,
                ci.product_id,
                NULLIF(ci.size, '') AS size,
                ci.quantity,
                ci.updated_at,
                p.name,
                p.image_url,
                p.price,
                p.stock,
                p.discount_percent,
                p.is_outlet,
                COALESCE(ps.stock, p.stock, 0) AS available_stock
             FROM cart_items ci
             INNER JOIN products p ON p.id = ci.product_id
             LEFT JOIN product_sizes ps
                ON ps.product_id = ci.product_id
               AND ps.size = ci.size
               AND ci.size <> ''
             WHERE ci.user_id = $1
             ORDER BY ci.updated_at DESC, ci.id DESC`,
            [userId]
        );

        return result.rows.map(mapCartRow);
    },

    async upsert({ userId, productId, size = null, quantity = 1 }) {
        const normalizedProductId = normalizeProductId(productId);
        const normalizedSize = normalizeSize(size);
        const normalizedQuantity = normalizeQuantity(quantity);

        await assertCanStoreCartItem(normalizedProductId, normalizedSize, normalizedQuantity);

        await db.query(
            `INSERT INTO cart_items (user_id, product_id, size, quantity, updated_at)
             VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
             ON CONFLICT (user_id, product_id, size)
             DO UPDATE SET
                quantity = EXCLUDED.quantity,
                updated_at = CURRENT_TIMESTAMP`,
            [userId, normalizedProductId, normalizedSize, normalizedQuantity]
        );

        return this.findAllByUser(userId);
    },

    async remove({ userId, productId, size }) {
        const normalizedProductId = normalizeProductId(productId);

        if (size === undefined || size === null) {
            await db.query(
                'DELETE FROM cart_items WHERE user_id = $1 AND product_id = $2',
                [userId, normalizedProductId]
            );
        } else {
            await db.query(
                'DELETE FROM cart_items WHERE user_id = $1 AND product_id = $2 AND size = $3',
                [userId, normalizedProductId, normalizeSize(size)]
            );
        }

        return this.findAllByUser(userId);
    },

    async clear(userId) {
        await db.query('DELETE FROM cart_items WHERE user_id = $1', [userId]);
        return [];
    },
};

module.exports = CartModel;
