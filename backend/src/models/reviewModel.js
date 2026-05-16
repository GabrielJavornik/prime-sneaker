const db = require('../config/database');

const ReviewModel = {
    async create({ productId, userId, rating, comment }) {
        const result = await db.query(
            `INSERT INTO reviews (product_id, user_id, rating, comment)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (product_id, user_id) DO UPDATE
             SET rating = EXCLUDED.rating, comment = EXCLUDED.comment, created_at = CURRENT_TIMESTAMP
             RETURNING *`,
            [productId, userId, rating, comment || null]
        );
        return result.rows[0];
    },

    async findByProductId(productId, limit = 10) {
        const result = await db.query(
            `SELECT r.id, r.rating, r.comment, r.created_at, u.name as user_name
             FROM reviews r
             JOIN users u ON r.user_id = u.id
             WHERE r.product_id = $1
             ORDER BY r.created_at DESC
             LIMIT $2`,
            [productId, limit]
        );
        return result.rows;
    },

    async getAverageRating(productId) {
        const result = await db.query(
            `SELECT
                AVG(rating) as average_rating,
                COUNT(*) as total_reviews,
                COUNT(CASE WHEN rating = 5 THEN 1 END) as five_star,
                COUNT(CASE WHEN rating = 4 THEN 1 END) as four_star,
                COUNT(CASE WHEN rating = 3 THEN 1 END) as three_star,
                COUNT(CASE WHEN rating = 2 THEN 1 END) as two_star,
                COUNT(CASE WHEN rating = 1 THEN 1 END) as one_star
             FROM reviews
             WHERE product_id = $1`,
            [productId]
        );
        return result.rows[0];
    },

    async findById(id) {
        const result = await db.query('SELECT * FROM reviews WHERE id = $1', [id]);
        return result.rows[0];
    },

    async delete(id) {
        const result = await db.query('DELETE FROM reviews WHERE id = $1 RETURNING id', [id]);
        return result.rows[0];
    },

    async findUserReview(productId, userId) {
        const result = await db.query(
            'SELECT * FROM reviews WHERE product_id = $1 AND user_id = $2',
            [productId, userId]
        );
        return result.rows[0];
    },
};

module.exports = ReviewModel;
