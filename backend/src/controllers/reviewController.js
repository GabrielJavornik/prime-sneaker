const ReviewModel = require('../models/reviewModel');
const ProductModel = require('../models/productModel');

const ReviewController = {
    async createReview(req, res, next) {
        try {
            const { productId } = req.params;
            const { rating, comment } = req.body;
            const userId = req.user.id;

            const productId_int = parseInt(productId);
            if (!Number.isInteger(productId_int) || productId_int < 1) {
                return res.status(400).json({ error: 'ID do produto invalido', status: 400 });
            }

            const product = await ProductModel.findById(productId_int);
            if (!product) {
                return res.status(404).json({ error: 'Produto nao encontrado', status: 404 });
            }

            if (!rating || !Number.isInteger(Number(rating)) || rating < 1 || rating > 5) {
                return res.status(400).json({
                    error: 'Rating deve ser numero entre 1 e 5',
                    status: 400,
                });
            }

            if (comment && typeof comment !== 'string') {
                return res.status(400).json({
                    error: 'Comentario deve ser texto',
                    status: 400,
                });
            }

            const review = await ReviewModel.create({
                productId: productId_int,
                userId,
                rating: Number(rating),
                comment: comment?.trim() || null,
            });

            res.status(201).json(review);
        } catch (err) {
            next(err);
        }
    },

    async getProductReviews(req, res, next) {
        try {
            const { productId } = req.params;
            const productId_int = parseInt(productId);

            if (!Number.isInteger(productId_int) || productId_int < 1) {
                return res.status(400).json({ error: 'ID do produto invalido', status: 400 });
            }

            const product = await ProductModel.findById(productId_int);
            if (!product) {
                return res.status(404).json({ error: 'Produto nao encontrado', status: 404 });
            }

            const reviews = await ReviewModel.findByProductId(productId_int);
            const stats = await ReviewModel.getAverageRating(productId_int);

            res.status(200).json({
                reviews,
                stats: {
                    averageRating: stats.average_rating ? parseFloat(stats.average_rating).toFixed(1) : 0,
                    totalReviews: parseInt(stats.total_reviews || 0),
                    distribution: {
                        five: parseInt(stats.five_star || 0),
                        four: parseInt(stats.four_star || 0),
                        three: parseInt(stats.three_star || 0),
                        two: parseInt(stats.two_star || 0),
                        one: parseInt(stats.one_star || 0),
                    },
                },
            });
        } catch (err) {
            next(err);
        }
    },

    async getAverageRating(req, res, next) {
        try {
            const { productId } = req.params;
            const productId_int = parseInt(productId);

            if (!Number.isInteger(productId_int) || productId_int < 1) {
                return res.status(400).json({ error: 'ID do produto invalido', status: 400 });
            }

            const stats = await ReviewModel.getAverageRating(productId_int);

            res.status(200).json({
                averageRating: stats.average_rating ? parseFloat(stats.average_rating).toFixed(1) : 0,
                totalReviews: parseInt(stats.total_reviews || 0),
            });
        } catch (err) {
            next(err);
        }
    },

    async deleteReview(req, res, next) {
        try {
            const { reviewId } = req.params;
            const userId = req.user.id;

            const reviewId_int = parseInt(reviewId);
            if (!Number.isInteger(reviewId_int) || reviewId_int < 1) {
                return res.status(400).json({ error: 'ID invalido', status: 400 });
            }

            const review = await ReviewModel.findById(reviewId_int);
            if (!review) {
                return res.status(404).json({ error: 'Avaliacao nao encontrada', status: 404 });
            }

            if (review.user_id !== userId && !req.user.isAdmin) {
                return res.status(403).json({
                    error: 'Nao autorizado a deletar esta avaliacao',
                    status: 403,
                });
            }

            await ReviewModel.delete(reviewId_int);
            res.status(200).json({ message: 'Avaliacao removida' });
        } catch (err) {
            next(err);
        }
    },
};

module.exports = ReviewController;
