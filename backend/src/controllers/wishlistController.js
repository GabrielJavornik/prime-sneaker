const WishlistModel = require('../models/wishlistModel');
const ProductModel = require('../models/productModel');
const validators = require('../utils/validators');

const WishlistController = {
    async addToWishlist(req, res, next) {
        try {
            const { productId } = req.body;
            const userId = req.user.id;

            if (!productId || !Number.isInteger(productId) || productId < 1) {
                return res.status(400).json({
                    error: 'ID do produto invalido',
                    status: 400,
                });
            }

            const product = await ProductModel.findById(productId);
            if (!product) {
                return res.status(404).json({
                    error: 'Produto nao encontrado',
                    status: 404,
                });
            }

            const result = await WishlistModel.add({ userId, productId });

            res.status(201).json({
                message: 'Produto adicionado aos favoritos',
                favorite: result,
            });
        } catch (err) {
            next(err);
        }
    },

    async removeFromWishlist(req, res, next) {
        try {
            const { productId } = req.params;
            const userId = req.user.id;

            const productId_int = parseInt(productId);
            if (!Number.isInteger(productId_int) || productId_int < 1) {
                return res.status(400).json({
                    error: 'ID do produto invalido',
                    status: 400,
                });
            }

            const result = await WishlistModel.remove({ userId, productId: productId_int });

            if (!result) {
                return res.status(404).json({
                    error: 'Produto nao esta na wishlist',
                    status: 404,
                });
            }

            res.status(200).json({
                message: 'Produto removido dos favoritos',
            });
        } catch (err) {
            next(err);
        }
    },

    async getWishlist(req, res, next) {
        try {
            const userId = req.user.id;
            const page = Number(req.query.page) || 1;
            const limit = Number(req.query.limit) || 10;

            if (!validators.isValidPageLimit(page, limit)) {
                return res.status(400).json({
                    error: 'Paginacao invalida',
                    status: 400,
                });
            }

            const result = await WishlistModel.findByUser(userId, page, limit);

            res.status(200).json(result);
        } catch (err) {
            next(err);
        }
    },

    async checkIsFavorite(req, res, next) {
        try {
            const { productId } = req.params;
            const userId = req.user.id;

            const productId_int = parseInt(productId);
            if (!Number.isInteger(productId_int) || productId_int < 1) {
                return res.status(400).json({
                    error: 'ID do produto invalido',
                    status: 400,
                });
            }

            const isFavorite = await WishlistModel.isFavorite({
                userId,
                productId: productId_int,
            });

            res.status(200).json({ isFavorite });
        } catch (err) {
            next(err);
        }
    },

    async checkManyFavorites(req, res, next) {
        try {
            const userId = req.user.id;
            const productIds = [...new Set(String(req.query.ids || '')
                .split(',')
                .map(id => Number(id))
                .filter(id => Number.isInteger(id) && id > 0))]
                .slice(0, 100);

            if (productIds.length === 0) {
                return res.status(200).json({ favoriteIds: [], byId: {} });
            }

            const favoriteIds = await WishlistModel.findFavoriteProductIds({ userId, productIds });
            const favoriteSet = new Set(favoriteIds);
            const byId = Object.fromEntries(productIds.map(id => [id, favoriteSet.has(id)]));

            res.status(200).json({ favoriteIds, byId });
        } catch (err) {
            next(err);
        }
    },

    async getWishlistCount(req, res, next) {
        try {
            const userId = req.user.id;
            const count = await WishlistModel.getFavoriteCount(userId);

            res.status(200).json({ count });
        } catch (err) {
            next(err);
        }
    },
};

module.exports = WishlistController;
