const db = require('../config/database');

const ProductSizeModel = {
    async getStockByProductAndSize(productId, size) {
        const result = await db.query(
            'SELECT stock FROM product_sizes WHERE product_id = $1 AND size = $2',
            [productId, size]
        );
        return result.rows[0]?.stock || 0;
    },

    async getStocksByProduct(productId) {
        const result = await db.query(
            `SELECT size, stock
             FROM product_sizes
             WHERE product_id = $1
             ORDER BY
                CASE
                    WHEN size ~ '^[0-9]+([,.][0-9]+)?$'
                    THEN REPLACE(size, ',', '.')::numeric
                END NULLS LAST,
                size`,
            [productId]
        );
        return result.rows;
    },

    async updateStock(productId, size, quantity) {
        const result = await db.query(
            `UPDATE product_sizes
             SET stock = $1
             WHERE product_id = $2 AND size = $3
             RETURNING *`,
            [quantity, productId, size]
        );
        return result.rows[0];
    },

    async decreaseStock(productId, size, quantity) {
        const currentStock = await this.getStockByProductAndSize(productId, size);
        if (currentStock < quantity) {
            throw new Error(`Estoque insuficiente para o tamanho ${size}`);
        }
        return await this.updateStock(productId, size, currentStock - quantity);
    },

    async addStock(productId, size, quantity) {
        const result = await db.query(
            `INSERT INTO product_sizes (product_id, size, stock)
             VALUES ($1, $2, $3)
             ON CONFLICT (product_id, size)
             DO UPDATE SET stock = product_sizes.stock + $3
             RETURNING *`,
            [productId, size, quantity]
        );
        return result.rows[0];
    },

    async removeSizesNotIn(productId, sizes) {
        const normalizedSizes = [...new Set((sizes || []).map(size => String(size).trim()).filter(Boolean))];
        if (!normalizedSizes.length) {
            await db.query('DELETE FROM product_sizes WHERE product_id = $1', [productId]);
            return;
        }

        await db.query(
            `DELETE FROM product_sizes
             WHERE product_id = $1
               AND NOT (size = ANY($2::text[]))`,
            [productId, normalizedSizes]
        );
    },
};

module.exports = ProductSizeModel;
