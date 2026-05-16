const db = require('../config/database');

const WishlistModel = {
    async add({ userId, productId }) {
        const result = await db.query(
            `INSERT INTO favorites (user_id, product_id)
             VALUES ($1, $2)
             ON CONFLICT (user_id, product_id) DO NOTHING
             RETURNING *`,
            [userId, productId]
        );
        return result.rows[0];
    },

    async remove({ userId, productId }) {
        const result = await db.query(
            'DELETE FROM favorites WHERE user_id = $1 AND product_id = $2 RETURNING id',
            [userId, productId]
        );
        return result.rows[0];
    },

    async findByUser(userId, page = 1, limit = 10) {
        const offset = (page - 1) * limit;

        const countResult = await db.query(
            'SELECT COUNT(*) FROM favorites WHERE user_id = $1',
            [userId]
        );
        const total = parseInt(countResult.rows[0].count);

        const result = await db.query(
            `SELECT f.id, f.created_at, p.* FROM favorites f
             JOIN products p ON f.product_id = p.id
             WHERE f.user_id = $1
             ORDER BY f.created_at DESC
             LIMIT $2 OFFSET $3`,
            [userId, limit, offset]
        );

        return {
            items: result.rows,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
        };
    },

    async isFavorite({ userId, productId }) {
        const result = await db.query(
            'SELECT id FROM favorites WHERE user_id = $1 AND product_id = $2',
            [userId, productId]
        );
        return result.rows.length > 0;
    },

    async findFavoriteProductIds({ userId, productIds }) {
        if (!Array.isArray(productIds) || productIds.length === 0) {
            return [];
        }

        const result = await db.query(
            'SELECT product_id FROM favorites WHERE user_id = $1 AND product_id = ANY($2::int[])',
            [userId, productIds]
        );
        return result.rows.map(row => Number(row.product_id));
    },

    async getFavoriteCount(userId) {
        const result = await db.query(
            'SELECT COUNT(*) FROM favorites WHERE user_id = $1',
            [userId]
        );
        return parseInt(result.rows[0].count);
    },
};

module.exports = WishlistModel;
