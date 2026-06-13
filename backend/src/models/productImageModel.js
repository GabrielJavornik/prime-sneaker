const db = require('../config/database');

const ProductImageModel = {
    async findByProduct(productId) {
        const r = await db.query(
            'SELECT * FROM product_images WHERE product_id = $1 ORDER BY sort_order, id',
            [productId]
        );
        return r.rows;
    },

    async countByProduct(productId) {
        const r = await db.query(
            'SELECT COUNT(*)::int AS count FROM product_images WHERE product_id = $1',
            [productId]
        );
        return Number(r.rows[0]?.count || 0);
    },

    async add(productId, imageUrl, sortOrder = 0) {
        const r = await db.query(
            'INSERT INTO product_images (product_id, image_url, sort_order) VALUES ($1, $2, $3) RETURNING *',
            [productId, imageUrl, sortOrder]
        );
        return r.rows[0];
    },

    async findById(imageId) {
        const r = await db.query('SELECT * FROM product_images WHERE id = $1', [imageId]);
        return r.rows[0];
    },

    async remove(imageId) {
        const r = await db.query('DELETE FROM product_images WHERE id = $1 RETURNING *', [imageId]);
        return r.rows[0];
    },

    async deleteByProduct(productId) {
        await db.query('DELETE FROM product_images WHERE product_id = $1', [productId]);
    },
};

module.exports = ProductImageModel;
