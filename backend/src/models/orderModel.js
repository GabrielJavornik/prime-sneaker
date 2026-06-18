const db = require('../config/database');
const { ORDER_STATUS, LEGACY_PENDING_STATUS, normalizeOrderStatus } = require('../services/orderStatusService');

function appendDateRangeFilters(whereParts, params, column, { startDate, endDate } = {}) {
    if (startDate) {
        params.push(startDate);
        whereParts.push(`${column} >= $${params.length}::date`);
    }

    if (endDate) {
        params.push(endDate);
        whereParts.push(`${column} < ($${params.length}::date + INTERVAL '1 day')`);
    }
}

const OrderModel = {
    async create({ userId, couponCode, items, status = ORDER_STATUS.WAITING_PAYMENT, cep = null, address = null }) {
        // Compatibilidade: qualquer criacao de pedido deve passar pelo servico
        // unico/transacional de checkout, nunca gravar valores recebidos de fora.
        const { createOrderWithPricing } = require('../services/orderPricingService');
        const { order } = await createOrderWithPricing({ userId, items, couponCode, status, cep, address });
        return order;
    },

    async findById(id) {
        const order = await db.query('SELECT * FROM orders WHERE id = $1', [id]);
        if (!order.rows[0]) return null;

        const items = await db.query(
            `SELECT oi.*, p.image_url, p.color, p.brand
             FROM order_items oi
             LEFT JOIN products p ON p.id = oi.product_id
             WHERE oi.order_id = $1
             ORDER BY oi.id ASC`,
            [id]
        );

        return {
            ...order.rows[0],
            items: items.rows,
        };
    },

    async findByUserId(userId, page = 1, limit = 10) {
        const offset = (page - 1) * limit;

        const countResult = await db.query('SELECT COUNT(*) FROM orders WHERE user_id = $1', [userId]);
        const total = parseInt(countResult.rows[0].count);

        const result = await db.query(
            'SELECT * FROM orders WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3',
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

    async findAllForAdmin({ status = null, q = '', page = 1, limit = 50 } = {}) {
        const offset = (page - 1) * limit;
        const params = [];
        const whereParts = [];
        if (status) {
            params.push(normalizeOrderStatus(status));
            whereParts.push(`o.status = $${params.length}`);
        }

        const searchTerm = String(q || '').trim();
        if (searchTerm) {
            const searchLike = `%${searchTerm.toLowerCase()}%`;
            const numericId = Number(searchTerm.replace(/^#/, ''));
            params.push(searchLike);
            const searchIndex = params.length;
            const searchClauses = [
                `LOWER(COALESCE(u.name, '')) LIKE $${searchIndex}`,
                `LOWER(COALESCE(u.email, '')) LIKE $${searchIndex}`,
                `LOWER(COALESCE(u.phone, '')) LIKE $${searchIndex}`,
            ];

            const phoneDigits = searchTerm.replace(/\D/g, '');
            if (phoneDigits) {
                params.push(`%${phoneDigits}%`);
                searchClauses.push(`REGEXP_REPLACE(COALESCE(u.phone, ''), '\\D', '', 'g') LIKE $${params.length}`);
            }

            if (Number.isInteger(numericId) && numericId > 0) {
                params.push(numericId);
                searchClauses.push(`o.id = $${params.length}`);
            }

            whereParts.push(`(${searchClauses.join(' OR ')})`);
        }
        const where = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '';

        const countResult = await db.query(
            `SELECT COUNT(*)
             FROM orders o
             JOIN users u ON o.user_id = u.id
             ${where}`,
            params
        );
        const total = parseInt(countResult.rows[0].count);

        params.push(limit);
        params.push(offset);
        const result = await db.query(
            `SELECT o.*, u.name AS customer_name, u.email AS customer_email, u.phone AS customer_phone,
                    COUNT(oi.id) AS item_count
             FROM orders o
             JOIN users u ON o.user_id = u.id
             LEFT JOIN order_items oi ON o.id = oi.order_id
             ${where}
             GROUP BY o.id, u.id, u.name, u.email, u.phone
             ORDER BY o.created_at DESC
             LIMIT $${params.length - 1} OFFSET $${params.length}`,
            params
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

    async updateStatus(orderId, status) {
        const normalizedStatus = normalizeOrderStatus(status);
        const result = await db.query(
            'UPDATE orders SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
            [normalizedStatus, orderId]
        );
        return result.rows[0];
    },

    async cancelAllPendingByUser(userId) {
        const result = await db.query(
            `UPDATE orders
             SET status = $2, updated_at = CURRENT_TIMESTAMP
             WHERE user_id = $1 AND status IN ($3, $4)
             RETURNING id`,
            [userId, ORDER_STATUS.CANCELED, ORDER_STATUS.WAITING_PAYMENT, LEGACY_PENDING_STATUS]
        );
        return result.rows;
    },

    async deleteCancelledByUser(userId) {
        // order_items tem ON DELETE CASCADE, entao serao removidos automaticamente
        const result = await db.query(
            `DELETE FROM orders
             WHERE user_id = $1 AND status = $2
             RETURNING id`,
            [userId, ORDER_STATUS.CANCELED]
        );
        return result.rows;
    },

    async deleteById(orderId, userId) {
        const result = await db.query(
            `DELETE FROM orders
             WHERE id = $1 AND user_id = $2
             RETURNING id`,
            [orderId, userId]
        );
        return result.rows[0] || null;
    },

    async getTotalSales(dateRange = {}) {
        const params = [ORDER_STATUS.CANCELED];
        const whereParts = ['status != $1'];
        appendDateRangeFilters(whereParts, params, 'created_at', dateRange);

        const result = await db.query(
            `SELECT SUM(total) as total_sales, COUNT(*) as total_orders
             FROM orders
             WHERE ${whereParts.join(' AND ')}`,
            params
        );
        return result.rows[0];
    },

    async getTopProducts(dateRange = {}) {
        const params = [ORDER_STATUS.CANCELED];
        const whereParts = ['o.status != $1'];
        appendDateRangeFilters(whereParts, params, 'o.created_at', dateRange);

        const result = await db.query(`
            SELECT oi.product_name, SUM(oi.quantity) as total_sold, SUM(oi.line_total) as total_revenue
            FROM order_items oi
            JOIN orders o ON o.id = oi.order_id
            WHERE ${whereParts.join(' AND ')}
            GROUP BY oi.product_name
            ORDER BY total_sold DESC
            LIMIT 10
        `, params);
        return result.rows;
    },

    async getMonthlySales(dateRange = {}) {
        const params = [ORDER_STATUS.CANCELED];
        const whereParts = ['status != $1'];
        appendDateRangeFilters(whereParts, params, 'created_at', dateRange);

        const result = await db.query(`
            SELECT
                DATE_TRUNC('month', created_at) as month,
                SUM(total) as total_sales,
                COUNT(*) as total_orders
            FROM orders
            WHERE ${whereParts.join(' AND ')}
            GROUP BY DATE_TRUNC('month', created_at)
            ORDER BY month DESC
            LIMIT 12
        `, params);
        return result.rows;
    },
};

module.exports = OrderModel;
