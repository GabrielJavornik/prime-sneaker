const ProductModel = require('../models/productModel');
const ProductSizeModel = require('../models/productSizeModel');
const ProductImageModel = require('../models/productImageModel');
const validators = require('../utils/validators');
const { logAdminAction } = require('../services/auditService');
const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');

function parseBooleanFlag(value) {
    return value === true || value === 'true' || value === '1' || value === 1 || value === 'on';
}

function firstDefined(...values) {
    return values.find(value => value !== undefined);
}

const PRODUCT_FACETS_CACHE_MS = 60 * 1000;
const MAX_PRODUCT_IMAGES = 4;
const MAX_UPLOAD_IMAGE_BYTES = 5 * 1024 * 1024;
const UPLOAD_IMAGE_TYPES = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
};
let productFacetsCache = {
    expiresAt: 0,
    data: null,
};

function clearProductFacetsCache() {
    productFacetsCache = { expiresAt: 0, data: null };
}

function uniqueSorted(values) {
    return [...new Set(values.filter(Boolean))]
        .sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

function splitProductSizes(value) {
    return String(value || '')
        .split(',')
        .map(size => size.trim())
        .filter(Boolean);
}

function sortSizes(values) {
    return [...new Set(values.filter(Boolean))]
        .sort((a, b) => {
            const numericA = Number(String(a).replace(',', '.'));
            const numericB = Number(String(b).replace(',', '.'));
            if (Number.isFinite(numericA) && Number.isFinite(numericB)) {
                return numericA - numericB;
            }
            return String(a).localeCompare(String(b), 'pt-BR', { numeric: true });
        });
}

function normalizeModelGroupInput(modelGroup, name) {
    const manualGroup = String(modelGroup || '').trim();
    if (manualGroup) return manualGroup;
    return String(name || '').trim();
}

function isAutoModelGroup(product) {
    const modelGroup = String(product?.model_group || '').trim().toLowerCase();
    const name = String(product?.name || '').trim().toLowerCase();
    return !modelGroup || modelGroup === name;
}

function getProductUploadDir() {
    return path.join(__dirname, '..', '..', 'uploads', 'products');
}

function parseUploadedImage(dataUrl) {
    const match = String(dataUrl || '').match(/^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/=\s]+)$/);
    if (!match) {
        const error = new Error('Imagem invalida. Envie PNG, JPG, WEBP ou GIF.');
        error.status = 400;
        throw error;
    }

    const mimeType = match[1];
    const extension = UPLOAD_IMAGE_TYPES[mimeType];
    const buffer = Buffer.from(match[2].replace(/\s/g, ''), 'base64');

    if (!buffer.length || buffer.length > MAX_UPLOAD_IMAGE_BYTES) {
        const error = new Error('Imagem muito grande. Limite maximo: 5MB.');
        error.status = 400;
        throw error;
    }

    return { buffer, mimeType, extension };
}

function assertImageSignature(buffer, mimeType) {
    const signatures = {
        'image/jpeg': () => buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff,
        'image/png': () => buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
        'image/gif': () => buffer.subarray(0, 3).toString('ascii') === 'GIF',
        'image/webp': () => buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP',
    };

    if (!signatures[mimeType]?.()) {
        const error = new Error('Arquivo enviado nao parece ser uma imagem valida.');
        error.status = 400;
        throw error;
    }
}

function buildMenuFacets(rows) {
    const brands = uniqueSorted(rows.map(row => row.brand));
    const launchBrands = uniqueSorted(rows.filter(row => row.is_launch).map(row => row.brand));
    const outletBrands = uniqueSorted(rows.filter(row => row.is_outlet).map(row => row.brand));
    const availableSizes = sortSizes(rows.flatMap(row => {
        const stockSizes = Array.isArray(row.stock_sizes) ? row.stock_sizes : [];
        return row.has_size_rows ? stockSizes : splitProductSizes(row.sizes);
    }));

    const brandsByGender = (gender) => uniqueSorted(rows
        .filter(row => row.gender === gender || (gender !== 'infantil' && row.gender === 'unissex'))
        .map(row => row.brand));

    return {
        brands,
        launchBrands,
        outletBrands,
        byGender: {
            masculino: brandsByGender('masculino'),
            feminino: brandsByGender('feminino'),
            infantil: brandsByGender('infantil'),
        },
        sizes: availableSizes,
        generatedAt: new Date().toISOString(),
    };
}

const ProductController = {
    async list(req, res, next) {
        try {
            if (req.query.page || req.query.limit) {
                const page = Number(req.query.page) || 1;
                const limit = Number(req.query.limit) || 10;

                if (!validators.isValidPageLimit(page, limit)) {
                    return res.status(400).json({
                        error: 'Paginacao invalida: page deve ser > 0, limit entre 1 e 100',
                        status: 400,
                    });
                }

                const category = req.query.categoria || req.query.category;
                if (category && !validators.isValidCategory(category)) {
                    return res.status(400).json({
                        error: 'Categoria invalida. Validas: casual, esportivo, formal, trekking',
                        status: 400,
                    });
                }

                const brand = req.query.marca || req.query.brand;
                if (brand && !validators.isValidBrand(brand)) {
                    return res.status(400).json({ error: 'Marca invalida', status: 400 });
                }

                const result = await ProductModel.findAllPaginated({
                    page,
                    limit,
                    query: req.query.q || req.query.query,
                    category,
                    brand,
                    launch: req.query.lancamento || req.query.launch,
                    outlet: req.query.outlet,
                    sortBy: req.query.sortBy || 'recent',
                });
                return res.status(200).json(result);
            }

            const products = await ProductModel.findAll();
            res.status(200).json(products);
        } catch (err) {
            next(err);
        }
    },

    async top(req, res, next) {
        try {
            let n = parseInt(req.query.n) || 4;
            if (!Number.isInteger(n) || n < 1 || n > 100) {
                return res.status(400).json({ error: 'Parametro "n" deve ser um numero entre 1 e 100', status: 400 });
            }
            const products = await ProductModel.findTopN(n);
            res.status(200).json(products);
        } catch (err) {
            next(err);
        }
    },

    async facets(req, res, next) {
        try {
            const forceRefresh = req.query.refresh === '1' || req.query.refresh === 'true';
            const now = Date.now();
            if (!forceRefresh && productFacetsCache.data && productFacetsCache.expiresAt > now) {
                res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
                res.set('X-Cache', 'HIT');
                return res.status(200).json(productFacetsCache.data);
            }

            const rows = await ProductModel.getMenuFacets();
            const facets = buildMenuFacets(rows);
            productFacetsCache = {
                data: facets,
                expiresAt: now + PRODUCT_FACETS_CACHE_MS,
            };

            res.set('Cache-Control', forceRefresh ? 'no-store' : 'public, max-age=60, stale-while-revalidate=300');
            res.set('X-Cache', forceRefresh ? 'BYPASS' : 'MISS');
            return res.status(200).json(facets);
        } catch (err) {
            next(err);
        }
    },

    async getById(req, res, next) {
        try {
            const id = parseInt(req.params.id);
            if (!Number.isInteger(id) || id < 1) {
                return res.status(400).json({ error: 'ID invalido', status: 400 });
            }
            const product = await ProductModel.findById(id);
            if (!product) {
                return res.status(404).json({ error: 'Produto nao encontrado', status: 404 });
            }
            const images = await ProductImageModel.findByProduct(id);
            product.images = images;
            product.color_variants = await ProductModel.findColorVariants(product);
            res.status(200).json(product);
        } catch (err) {
            next(err);
        }
    },

    async search(req, res, next) {
        try {
            const page = Number(req.query.page) || Number(req.query.pagina) || 1;
            const limit = Number(req.query.limit) || Number(req.query.limite) || 10;

            if (!validators.isValidPageLimit(page, limit)) {
                return res.status(400).json({
                    error: 'Paginacao invalida: page deve ser > 0, limit entre 1 e 100',
                    status: 400,
                });
            }

            const minPrice = req.query.minPrice || req.query.precoMin;
            const maxPrice = req.query.maxPrice || req.query.precoMax;

            if (minPrice && !validators.isValidPrice(minPrice)) {
                return res.status(400).json({ error: 'Preco minimo invalido', status: 400 });
            }
            if (maxPrice && !validators.isValidPrice(maxPrice)) {
                return res.status(400).json({ error: 'Preco maximo invalido', status: 400 });
            }

            const category = req.query.categoria || req.query.category;
            if (category && !validators.isValidCategory(category)) {
                return res.status(400).json({
                    error: 'Categoria invalida. Validas: casual, esportivo, formal, trekking',
                    status: 400,
                });
            }

            const brand = req.query.marca || req.query.brand;
            if (brand && !validators.isValidBrand(brand)) {
                return res.status(400).json({ error: 'Marca invalida', status: 400 });
            }

            const gender = req.query.genero || req.query.gender;
            if (gender && !validators.isValidGender(gender)) {
                return res.status(400).json({
                    error: 'Publico invalido. Validos: masculino, feminino, infantil, unissex',
                    status: 400,
                });
            }

            const result = await ProductModel.search({
                query: req.query.q || req.query.query,
                category,
                brand,
                gender,
                launch: req.query.lancamento || req.query.launch,
                outlet: req.query.outlet,
                size: req.query.tamanho || req.query.size,
                minPrice,
                maxPrice,
                page,
                limit,
                sortBy: req.query.sortBy || 'recent',
                sortOrder: req.query.sortOrder || 'DESC',
            });
            res.status(200).json(result);
        } catch (err) {
            next(err);
        }
    },

    async create(req, res, next) {
        try {
            const {
                name,
                description,
                price,
                image_url,
                sizes,
                color,
                model_group,
                category,
                brand,
                gender,
                is_launch,
                is_outlet,
                launch,
                lancamento,
                outlet,
                discount_percent,
                outlet_discount_percent,
                stock,
            } = req.body;

            if (!validators.isValidName(name)) {
                return res.status(400).json({
                    error: 'Nome invalido: deve ter entre 2 e 100 caracteres',
                    status: 400,
                });
            }
            if (!validators.isValidPrice(price)) {
                return res.status(400).json({
                    error: 'Preco invalido: deve ser numero entre 0 e 999999.99',
                    status: 400,
                });
            }
            if (description && !validators.isValidDescription(description)) {
                return res.status(400).json({
                    error: 'Descricao invalida: maximo 500 caracteres',
                    status: 400,
                });
            }
            if (category && !validators.isValidCategory(category)) {
                return res.status(400).json({
                    error: 'Categoria invalida. Validas: casual, esportivo, formal, trekking',
                    status: 400,
                });
            }
            if (brand && !validators.isValidBrand(brand)) {
                return res.status(400).json({ error: 'Marca invalida', status: 400 });
            }
            if (!validators.isValidModelGroup(model_group)) {
                return res.status(400).json({
                    error: 'Grupo do modelo invalido: maximo 120 caracteres',
                    status: 400,
                });
            }
            if (gender && !validators.isValidGender(gender)) {
                return res.status(400).json({
                    error: 'Publico invalido. Validos: masculino, feminino, infantil, unissex',
                    status: 400,
                });
            }
            const discountPercent = firstDefined(discount_percent, outlet_discount_percent, 0);
            if (!validators.isValidDiscountPercent(discountPercent)) {
                return res.status(400).json({
                    error: 'Desconto invalido: use um percentual entre 0 e 99',
                    status: 400,
                });
            }
            const hasDiscount = Number(discountPercent || 0) > 0;
            if (stock !== undefined && !validators.isValidStock(stock)) {
                return res.status(400).json({
                    error: 'Estoque invalido: deve ser numero entre 0 e 9999',
                    status: 400,
                });
            }
            const totalStock = stock !== undefined ? Number(stock) : 0;

            const p = await ProductModel.create({
                name: name.trim(),
                description: description?.trim() || '',
                price: Number(price),
                image_url: image_url || '',
                sizes: sizes || '',
                color: color || '',
                model_group: normalizeModelGroupInput(model_group, name),
                category: (category || 'casual').toLowerCase(),
                brand: brand?.trim() || name.trim().split(' ')[0],
                gender: (gender || 'unissex').toLowerCase(),
                is_launch: parseBooleanFlag(firstDefined(is_launch, launch, lancamento)),
                is_outlet: parseBooleanFlag(firstDefined(is_outlet, outlet)) || hasDiscount,
                discount_percent: Number(discountPercent || 0),
                stock: totalStock,
            });

            // Populer product_sizes automaticamente se houver tamanhos
            if (sizes) {
                const sizeList = sizes.split(',').map(s => s.trim()).filter(Boolean);
                const stockPerSize = sizeList.length ? Math.floor(totalStock / sizeList.length) : 0;
                for (const size of sizeList) {
                    try {
                        await ProductSizeModel.addStock(p.id, size, stockPerSize);
                    } catch (err) {
                        console.warn(`Erro ao criar estoque para tamanho ${size}:`, err.message);
                    }
                }
            }

            clearProductFacetsCache();

            await logAdminAction(req, {
                action: 'product.create',
                entityType: 'product',
                entityId: p.id,
                details: {
                    name: p.name,
                    price: p.price,
                    category: p.category,
                    brand: p.brand,
                    gender: p.gender,
                    model_group: p.model_group,
                    is_launch: p.is_launch,
                    is_outlet: p.is_outlet,
                    discount_percent: p.discount_percent,
                    stock: p.stock,
                },
            });

            res.status(201).json(p);
        } catch (err) {
            next(err);
        }
    },

    async update(req, res, next) {
        try {
            const id = parseInt(req.params.id);
            if (!Number.isInteger(id) || id < 1) {
                return res.status(400).json({ error: 'ID invalido', status: 400 });
            }

            const existing = await ProductModel.findById(id);
            if (!existing) {
                return res.status(404).json({ error: 'Produto nao encontrado', status: 404 });
            }

            const data = {};
            if (req.body.name !== undefined) {
                if (!validators.isValidName(req.body.name)) {
                    return res.status(400).json({
                        error: 'Nome invalido: deve ter entre 2 e 100 caracteres',
                        status: 400,
                    });
                }
                data.name = req.body.name.trim();
            }
            if (req.body.price !== undefined) {
                if (!validators.isValidPrice(req.body.price)) {
                    return res.status(400).json({
                        error: 'Preco invalido: deve ser numero entre 0 e 999999.99',
                        status: 400,
                    });
                }
                data.price = Number(req.body.price);
            }
            if (req.body.description !== undefined) {
                if (!validators.isValidDescription(req.body.description)) {
                    return res.status(400).json({
                        error: 'Descricao invalida: maximo 500 caracteres',
                        status: 400,
                    });
                }
                data.description = req.body.description.trim();
            }
            if (req.body.category !== undefined) {
                if (!validators.isValidCategory(req.body.category)) {
                    return res.status(400).json({
                        error: 'Categoria invalida. Validas: casual, esportivo, formal, trekking',
                        status: 400,
                    });
                }
                data.category = req.body.category.toLowerCase();
            }
            if (req.body.brand !== undefined) {
                if (!validators.isValidBrand(req.body.brand)) {
                    return res.status(400).json({ error: 'Marca invalida', status: 400 });
                }
                data.brand = req.body.brand.trim();
            }
            if (req.body.model_group !== undefined) {
                if (!validators.isValidModelGroup(req.body.model_group)) {
                    return res.status(400).json({
                        error: 'Grupo do modelo invalido: maximo 120 caracteres',
                        status: 400,
                    });
                }
                data.model_group = normalizeModelGroupInput(req.body.model_group, data.name || existing.name);
            }
            if (data.name && req.body.model_group === undefined && isAutoModelGroup(existing)) {
                data.model_group = data.name;
            }
            if (req.body.gender !== undefined) {
                if (!validators.isValidGender(req.body.gender)) {
                    return res.status(400).json({
                        error: 'Publico invalido. Validos: masculino, feminino, infantil, unissex',
                        status: 400,
                    });
                }
                data.gender = req.body.gender.toLowerCase();
            }
            const launchFlag = firstDefined(req.body.is_launch, req.body.launch, req.body.lancamento);
            const outletFlag = firstDefined(req.body.is_outlet, req.body.outlet);
            if (launchFlag !== undefined) data.is_launch = parseBooleanFlag(launchFlag);
            if (outletFlag !== undefined) data.is_outlet = parseBooleanFlag(outletFlag);
            const discountFlag = firstDefined(req.body.discount_percent, req.body.outlet_discount_percent);
            if (discountFlag !== undefined) {
                if (!validators.isValidDiscountPercent(discountFlag)) {
                    return res.status(400).json({
                        error: 'Desconto invalido: use um percentual entre 0 e 99',
                        status: 400,
                    });
                }
                data.discount_percent = Number(discountFlag || 0);
                if (data.discount_percent > 0) {
                    data.is_outlet = true;
                }
            }
            if (req.body.stock !== undefined) {
                if (!validators.isValidStock(req.body.stock)) {
                    return res.status(400).json({
                        error: 'Estoque invalido: deve ser numero entre 0 e 9999',
                        status: 400,
                    });
                }
                data.stock = Number(req.body.stock);
            }
            if (req.body.image_url !== undefined) {
                const nextMainImageCount = String(req.body.image_url || '').trim() ? 1 : 0;
                const extraImagesCount = await ProductImageModel.countByProduct(id);
                if (nextMainImageCount + extraImagesCount > MAX_PRODUCT_IMAGES) {
                    return res.status(400).json({
                        error: `Limite de ${MAX_PRODUCT_IMAGES} imagens por tenis atingido`,
                        status: 400,
                    });
                }
                data.image_url = req.body.image_url;
            }
            if (req.body.sizes !== undefined) data.sizes = req.body.sizes;
            if (req.body.color !== undefined) data.color = req.body.color;

            const updated = await ProductModel.update(id, data);
            clearProductFacetsCache();
            await logAdminAction(req, {
                action: 'product.update',
                entityType: 'product',
                entityId: id,
                details: {
                    before: existing,
                    after: updated,
                    changedFields: Object.keys(data),
                },
            });
            res.status(200).json(updated);
        } catch (err) {
            next(err);
        }
    },

    async remove(req, res, next) {
        try {
            const id = parseInt(req.params.id);
            if (!Number.isInteger(id) || id < 1) {
                return res.status(400).json({ error: 'ID invalido', status: 400 });
            }

            const existing = await ProductModel.findById(id);
            const removed = await ProductModel.delete(id);
            if (!removed) {
                return res.status(404).json({ error: 'Produto nao encontrado', status: 404 });
            }
            clearProductFacetsCache();
            await logAdminAction(req, {
                action: 'product.delete',
                entityType: 'product',
                entityId: removed.id,
                details: {
                    name: existing?.name,
                    price: existing?.price,
                    category: existing?.category,
                    brand: existing?.brand,
                    archived: removed.archived === true,
                },
            });
            res.status(200).json({
                message: removed.archived ? 'Produto arquivado e removido do catalogo' : 'Produto removido',
                id: removed.id,
                archived: removed.archived === true,
            });
        } catch (err) {
            next(err);
        }
    },

    async getRecommended(req, res, next) {
        try {
            const id = parseInt(req.params.id);
            if (!Number.isInteger(id) || id < 1) {
                return res.status(400).json({ error: 'ID invalido', status: 400 });
            }

            const recommended = await ProductModel.getRecommended(id, 4);
            res.status(200).json(recommended);
        } catch (err) {
            next(err);
        }
    },

    async getSizeStock(req, res, next) {
        try {
            const id = parseInt(req.params.id);
            if (!Number.isInteger(id) || id < 1) {
                return res.status(400).json({ error: 'ID invalido', status: 400 });
            }

            const stocks = await ProductSizeModel.getStocksByProduct(id);
            res.status(200).json(stocks);
        } catch (err) {
            next(err);
        }
    },

    async updateSizeStock(req, res, next) {
        try {
            const id = parseInt(req.params.id);
            if (!Number.isInteger(id) || id < 1) {
                return res.status(400).json({ error: 'ID invalido', status: 400 });
            }

            const existing = await ProductModel.findById(id);
            if (!existing) {
                return res.status(404).json({ error: 'Produto nao encontrado', status: 404 });
            }

            const { stocks } = req.body;
            if (!Array.isArray(stocks)) {
                return res.status(400).json({ error: 'stocks deve ser um array', status: 400 });
            }

            for (const item of stocks) {
                if (!item.size || item.stock === undefined) {
                    return res.status(400).json({ error: 'Cada item deve ter size e stock', status: 400 });
                }
                const qty = Number(item.stock);
                if (!Number.isInteger(qty) || qty < 0 || qty > 9999) {
                    return res.status(400).json({ error: 'stock invalido: deve ser numero entre 0 e 9999', status: 400 });
                }
            }

            const updated = [];
            await ProductSizeModel.removeSizesNotIn(id, stocks.map(item => item.size));
            for (const item of stocks) {
                const result = await ProductSizeModel.updateStock(id, item.size, Number(item.stock));
                if (!result) {
                    await ProductSizeModel.addStock(id, item.size, Number(item.stock));
                }
                updated.push({ size: item.size, stock: Number(item.stock) });
            }
            clearProductFacetsCache();

            await logAdminAction(req, {
                action: 'product.stock.update',
                entityType: 'product',
                entityId: id,
                details: {
                    product: existing.name,
                    stocks: updated,
                },
            });

            res.status(200).json(updated);
        } catch (err) {
            next(err);
        }
    },

    async listImages(req, res, next) {
        try {
            const id = parseInt(req.params.id);
            if (!Number.isInteger(id) || id < 1) {
                return res.status(400).json({ error: 'ID invalido', status: 400 });
            }
            const images = await ProductImageModel.findByProduct(id);
            res.status(200).json(images);
        } catch (err) {
            next(err);
        }
    },

    async addImage(req, res, next) {
        try {
            const id = parseInt(req.params.id);
            if (!Number.isInteger(id) || id < 1) {
                return res.status(400).json({ error: 'ID invalido', status: 400 });
            }
            const { image_url, sort_order } = req.body;
            if (!image_url) {
                return res.status(400).json({ error: 'image_url obrigatorio', status: 400 });
            }
            const existing = await ProductModel.findById(id);
            if (!existing) {
                return res.status(404).json({ error: 'Produto nao encontrado', status: 404 });
            }
            const mainImageCount = existing.image_url ? 1 : 0;
            const extraImagesCount = await ProductImageModel.countByProduct(id);
            if (mainImageCount + extraImagesCount >= MAX_PRODUCT_IMAGES) {
                return res.status(400).json({
                    error: `Limite de ${MAX_PRODUCT_IMAGES} imagens por tenis atingido`,
                    status: 400,
                });
            }
            const img = await ProductImageModel.add(id, image_url, sort_order || 0);
            await logAdminAction(req, {
                action: 'product.image.add',
                entityType: 'product_image',
                entityId: img.id,
                details: {
                    productId: id,
                    product: existing.name,
                    image_url: img.image_url,
                },
            });
            res.status(201).json(img);
        } catch (err) {
            next(err);
        }
    },

    async deleteImage(req, res, next) {
        try {
            const imageId = parseInt(req.params.imageId);
            if (!Number.isInteger(imageId) || imageId < 1) {
                return res.status(400).json({ error: 'ID invalido', status: 400 });
            }
            const removed = await ProductImageModel.remove(imageId);
            await logAdminAction(req, {
                action: 'product.image.delete',
                entityType: 'product_image',
                entityId: imageId,
                details: removed || {},
            });
            res.status(200).json({ message: 'Imagem removida', id: imageId });
        } catch (err) {
            next(err);
        }
    },

    async uploadImage(req, res, next) {
        try {
            const { image, file_name } = req.body || {};
            const { buffer, mimeType, extension } = parseUploadedImage(image);
            assertImageSignature(buffer, mimeType);

            const uploadDir = getProductUploadDir();
            await fs.mkdir(uploadDir, { recursive: true });

            const originalName = String(file_name || 'produto')
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .replace(/\.[^.]+$/, '')
                .replace(/[^a-zA-Z0-9_-]+/g, '-')
                .replace(/^-+|-+$/g, '')
                .toLowerCase()
                .slice(0, 40) || 'produto';
            const fileName = `${originalName}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${extension}`;
            const fullPath = path.join(uploadDir, fileName);

            await fs.writeFile(fullPath, buffer);

            const url = `/uploads/products/${fileName}`;
            await logAdminAction(req, {
                action: 'product.image.upload',
                entityType: 'product_image',
                details: {
                    file: fileName,
                    url,
                    mimeType,
                    bytes: buffer.length,
                },
            });

            res.status(201).json({ url, image_url: url, file: fileName });
        } catch (err) {
            next(err);
        }
    },
};

module.exports = ProductController;
