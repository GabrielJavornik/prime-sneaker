const db = require('../config/database');
const { appendDateRangeFilters } = require('../utils/dateRange');

const PixTransactionModel = {
    async create({ orderId, userId, amount, status = 'pending' }) {
        const result = await db.query(
            `INSERT INTO pix_transactions (order_id, user_id, amount, status)
             VALUES ($1, $2, $3, $4) RETURNING *`,
            [orderId, userId, amount, status]
        );
        return result.rows[0];
    },

    async updateStatus(id, status) {
        const result = await db.query(
            `UPDATE pix_transactions SET status = $1 WHERE id = $2 RETURNING *`,
            [status, id]
        );
        return result.rows[0];
    },

    async updateStatusByOrderId(orderId, status) {
        const result = await db.query(
            `UPDATE pix_transactions SET status = $1 WHERE order_id = $2 RETURNING *`,
            [status, orderId]
        );
        return result.rows[0];
    },

    async findByOrderId(orderId) {
        const result = await db.query(
            `SELECT * FROM pix_transactions WHERE order_id = $1 ORDER BY created_at DESC LIMIT 1`,
            [orderId]
        );
        return result.rows[0];
    },

    async findAll(limit = 100, offset = 0, dateRange = {}) {
        const countParams = [];
        const countWhere = [];
        appendDateRangeFilters(countWhere, countParams, 'created_at', dateRange);
        const whereSql = countWhere.length ? `WHERE ${countWhere.join(' AND ')}` : '';

        const countResult = await db.query(`SELECT COUNT(*) FROM pix_transactions ${whereSql}`, countParams);
        const total = parseInt(countResult.rows[0].count);

        const params = [...countParams, limit, offset];
        const result = await db.query(
            `SELECT pt.*, u.name, u.email, o.id as order_id
             FROM pix_transactions pt
             JOIN users u ON pt.user_id = u.id
             JOIN orders o ON pt.order_id = o.id
             ${whereSql ? whereSql.replace(/\bcreated_at\b/g, 'pt.created_at') : ''}
             ORDER BY pt.created_at DESC
             LIMIT $${params.length - 1} OFFSET $${params.length}`,
            params
        );

        return {
            items: result.rows,
            total,
            limit,
            offset,
        };
    },

    async getStats(dateRange = {}) {
        const params = [];
        const whereParts = [];
        appendDateRangeFilters(whereParts, params, 'created_at', dateRange);
        const whereSql = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '';

        const result = await db.query(`
            SELECT
                COUNT(*) as total_transactions,
                COUNT(CASE WHEN status = 'confirmed' THEN 1 END) as confirmed,
                COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
                SUM(amount) as total_amount
            FROM pix_transactions
            ${whereSql}
        `, params);
        return result.rows[0];
    },
};

module.exports = PixTransactionModel;
