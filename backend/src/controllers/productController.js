const ProductModel = require('../models/productModel');
const ProductSizeModel = require('../models/productSizeModel');
const ProductImageModel = require('../models/productImageModel');
const validators = require('../utils/validators');
const { logAdminAction } = require('../services/auditService');

function parseBooleanFlag(value) {
    return value === true || value === 'true' || value === '1' || value === 1 || value === 'on';
}

function firstDefined(...values) {
    return values.find(value => value !== undefined);
}

const PRODUCT_FACETS_CACHE_MS = 60 * 1000;
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

function buildMenuFacets(rows) {
    const brands = uniqueSorted(rows.map(row => row.brand));
    const launchBrands = uniqueSorted(rows.filter(row => row.is_launch).map(row => row.brand));
    const outletBrands = uniqueSorted(rows.filter(row => row.is_outlet).map(row => row.brand));

    const brandsByGender = (gender) => uniqueSorted(rows
        .filter(row => row.gender === gender || row.gender === 'unissex')
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
            const now = Date.now();
            if (productFacetsCache.data && productFacetsCache.expiresAt > now) {
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

            res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
            res.set('X-Cache', 'MISS');
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

            const p = await ProductModel.create({
                name: name.trim(),
                description: description?.trim() || '',
                price: Number(price),
                image_url: image_url || '',
                sizes: sizes || '',
                color: color || '',
                category: (category || 'casual').toLowerCase(),
                brand: brand?.trim() || name.trim().split(' ')[0],
                gender: (gender || 'unissex').toLowerCase(),
                is_launch: parseBooleanFlag(firstDefined(is_launch, launch, lancamento)),
                is_outlet: parseBooleanFlag(firstDefined(is_outlet, outlet)) || hasDiscount,
                discount_percent: Number(discountPercent || 0),
                stock: stock || 10,
            });

            // Populer product_sizes automaticamente se houver tamanhos
            if (sizes) {
                const sizeList = sizes.split(',').map(s => s.trim()).filter(Boolean);
                const stockPerSize = Math.floor((stock || 10) / sizeList.length);
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
            if (req.body.image_url !== undefined) data.image_url = req.body.image_url;
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
                },
            });
            res.status(200).json({ message: 'Produto removido', id: removed.id });
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
            for (const item of stocks) {
                const result = await ProductSizeModel.updateStock(id, item.size, Number(item.stock));
                if (!result) {
                    await ProductSizeModel.addStock(id, item.size, Number(item.stock));
                }
                updated.push({ size: item.size, stock: Number(item.stock) });
            }

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
};

module.exports = ProductController;
