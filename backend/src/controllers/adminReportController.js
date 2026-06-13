const db = require('../config/database');
const PixTransactionModel = require('../models/pixTransactionModel');
const { ORDER_STATUS, LEGACY_PENDING_STATUS } = require('../services/orderStatusService');
const { getDateRangeFromQuery, appendDateRangeFilters } = require('../utils/dateRange');

const AdminReportController = {
    async getOrderNotifications(req, res, next) {
        try {
            if (!req.user.isAdmin) {
                return res.status(403).json({ error: 'Nao autorizado', status: 403 });
            }

            const awaitingPaymentStatuses = [ORDER_STATUS.WAITING_PAYMENT, LEGACY_PENDING_STATUS];
            const actionableStatuses = [...awaitingPaymentStatuses, ORDER_STATUS.PROCESSING];
            const dateRange = getDateRangeFromQuery(req.query);
            const countParams = [awaitingPaymentStatuses, ORDER_STATUS.PROCESSING, actionableStatuses];
            const countWhere = ['status = ANY($3)'];
            appendDateRangeFilters(countWhere, countParams, 'created_at', dateRange);

            const countsResult = await db.query(`
                SELECT
                    COUNT(*) FILTER (WHERE status = ANY($1)) AS awaiting_payment,
                    COUNT(*) FILTER (WHERE status = $2) AS payment_confirmed
                FROM orders
                WHERE ${countWhere.join(' AND ')}
            `, countParams);

            const ordersParams = [actionableStatuses, awaitingPaymentStatuses, ORDER_STATUS.PROCESSING];
            const ordersWhere = ['o.status = ANY($1)'];
            appendDateRangeFilters(ordersWhere, ordersParams, 'o.created_at', dateRange);

            const ordersResult = await db.query(`
                SELECT o.*, u.name, u.email, u.phone,
                       COUNT(oi.id) AS item_count
                FROM orders o
                JOIN users u ON o.user_id = u.id
                LEFT JOIN order_items oi ON o.id = oi.order_id
                WHERE ${ordersWhere.join(' AND ')}
                GROUP BY o.id, u.id, u.name, u.email, u.phone
                ORDER BY
                    CASE
                        WHEN o.status = ANY($2) THEN 1
                        WHEN o.status = $3 THEN 2
                        ELSE 3
                    END,
                    o.updated_at DESC NULLS LAST,
                    o.created_at DESC
                LIMIT 8
            `, ordersParams);

            const counts = countsResult.rows[0] || {};
            const awaitingPayment = Number(counts.awaiting_payment || 0);
            const paymentConfirmed = Number(counts.payment_confirmed || 0);

            res.status(200).json({
                total: awaitingPayment + paymentConfirmed,
                counts: {
                    awaiting_payment: awaitingPayment,
                    payment_confirmed: paymentConfirmed,
                },
                items: ordersResult.rows,
            });
        } catch (err) {
            next(err);
        }
    },

    async getPendingOrders(req, res, next) {
        try {
            if (!req.user.isAdmin) {
                return res.status(403).json({ error: 'Nao autorizado', status: 403 });
            }

            const dateRange = getDateRangeFromQuery(req.query);
            const params = [ORDER_STATUS.WAITING_PAYMENT];
            const whereParts = ['o.status = $1'];
            appendDateRangeFilters(whereParts, params, 'o.created_at', dateRange);

            const result = await db.query(`
                SELECT o.*, u.name, u.email, u.phone,
                       COUNT(oi.id) as item_count
                FROM orders o
                JOIN users u ON o.user_id = u.id
                LEFT JOIN order_items oi ON o.id = oi.order_id
                WHERE ${whereParts.join(' AND ')}
                GROUP BY o.id, u.id, u.name, u.email, u.phone
                ORDER BY o.created_at ASC
            `, params);

            res.status(200).json({
                total: result.rows.length,
                items: result.rows,
            });
        } catch (err) {
            next(err);
        }
    },

    async getOrderStatusSummary(req, res, next) {
        try {
            if (!req.user.isAdmin) {
                return res.status(403).json({ error: 'Nao autorizado', status: 403 });
            }

            const awaitingPaymentStatuses = [ORDER_STATUS.WAITING_PAYMENT, LEGACY_PENDING_STATUS];
            const dateRange = getDateRangeFromQuery(req.query);
            const params = [
                awaitingPaymentStatuses,
                ORDER_STATUS.PROCESSING,
                ORDER_STATUS.SHIPPED,
                ORDER_STATUS.DELIVERED,
                ORDER_STATUS.CANCELED,
            ];
            const whereParts = [];
            appendDateRangeFilters(whereParts, params, 'created_at', dateRange);
            const whereSql = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '';

            const result = await db.query(`
                SELECT
                    COUNT(*) FILTER (WHERE status = ANY($1)) AS awaiting_payment,
                    COUNT(*) FILTER (WHERE status = $2) AS processing,
                    COUNT(*) FILTER (WHERE status = $3) AS shipped,
                    COUNT(*) FILTER (WHERE status = $4) AS delivered,
                    COUNT(*) FILTER (WHERE status = $5) AS canceled,
                    COUNT(*) AS total
                FROM orders
                ${whereSql}
            `, params);

            const row = result.rows[0] || {};
            res.status(200).json({
                awaiting_payment: Number(row.awaiting_payment || 0),
                processing: Number(row.processing || 0),
                shipped: Number(row.shipped || 0),
                delivered: Number(row.delivered || 0),
                canceled: Number(row.canceled || 0),
                total: Number(row.total || 0),
            });
        } catch (err) {
            next(err);
        }
    },

    async getCustomerReport(req, res, next) {
        try {
            if (!req.user.isAdmin) {
                return res.status(403).json({ error: 'Nao autorizado', status: 403 });
            }

            const result = await db.query(`
                SELECT
                    u.id,
                    u.name,
                    u.email,
                    u.phone,
                    COUNT(o.id) as total_orders,
                    SUM(o.total) as total_spent,
                    MAX(o.created_at) as last_order_date
                FROM users u
                LEFT JOIN orders o ON u.id = o.user_id
                WHERE u.is_admin = FALSE
                GROUP BY u.id, u.name, u.email, u.phone
                ORDER BY total_spent DESC NULLS LAST
            `);

            res.status(200).json(result.rows);
        } catch (err) {
            next(err);
        }
    },

    async getLowStockProducts(req, res, next) {
        try {
            if (!req.user.isAdmin) {
                return res.status(403).json({ error: 'Nao autorizado', status: 403 });
            }

            const threshold = parseInt(req.query.threshold) || 10;
            const criticalThreshold = parseInt(req.query.criticalThreshold) || 5;
            const includeAll = ['1', 'true', 'all'].includes(String(req.query.all || req.query.includeAll || '').toLowerCase());
            const page = Math.max(parseInt(req.query.page) || 1, 1);
            const limit = Math.min(Math.max(parseInt(req.query.limit) || 10, 1), 100);
            const offset = (page - 1) * limit;
            const sortBy = String(req.query.sortBy || 'severity');
            const filterSql = includeAll ? '' : 'WHERE stock <= $1';
            const orderMap = {
                severity: 'severity_rank ASC, stock ASC, name ASC',
                stock_asc: 'stock ASC, name ASC',
                stock_desc: 'stock DESC, name ASC',
                name_asc: 'LOWER(name) ASC, id DESC',
            };
            const orderClause = orderMap[sortBy] || orderMap.severity;
            const productStockCte = `
                WITH product_stock AS (
                    SELECT
                        p.id,
                        p.name,
                        p.price,
                        p.category,
                        p.sizes,
                        COALESCE(
                            SUM(ps.stock)::int,
                            CASE
                                WHEN NULLIF(TRIM(COALESCE(p.sizes, '')), '') IS NULL THEN COALESCE(p.stock, 0)
                                ELSE 0
                            END,
                            0
                        ) as stock,
                        COALESCE((
                            SELECT json_agg(
                                json_build_object('size', ps2.size, 'stock', COALESCE(ps2.stock, 0))
                                ORDER BY
                                    CASE
                                        WHEN ps2.size ~ '^[0-9]+([.,][0-9]+)?$'
                                        THEN REPLACE(ps2.size, ',', '.')::numeric
                                    END NULLS LAST,
                                    ps2.size
                            )
                            FROM product_sizes ps2
                            WHERE ps2.product_id = p.id
                        ), '[]'::json) as stock_by_size
                    FROM products p
                    LEFT JOIN product_sizes ps ON p.id = ps.product_id
                    WHERE p.archived_at IS NULL
                    GROUP BY p.id, p.name, p.price, p.category, p.sizes, p.stock
                )
            `;

            const result = await db.query(`
                ${productStockCte}
                SELECT
                    id,
                    name,
                    price,
                    category,
                    sizes,
                    stock,
                    stock_by_size,
                    CASE
                        WHEN stock <= $2 THEN 'critical'
                        WHEN stock <= $1 THEN 'attention'
                        ELSE 'ok'
                    END as severity,
                    CASE
                        WHEN stock <= $2 THEN 0
                        WHEN stock <= $1 THEN 1
                        ELSE 2
                    END as severity_rank
                FROM product_stock
                ${filterSql}
                ORDER BY ${orderClause}
                LIMIT $3 OFFSET $4
            `, [threshold, criticalThreshold, limit, offset]);

            const countResult = await db.query(`
                ${productStockCte}
                SELECT COUNT(*)::int AS total
                FROM product_stock
                ${filterSql}
            `, includeAll ? [] : [threshold]);

            const summaryResult = await db.query(`
                ${productStockCte}
                SELECT
                    COUNT(*) FILTER (WHERE stock <= $2)::int as critical,
                    COUNT(*) FILTER (WHERE stock > $2 AND stock <= $1)::int as attention,
                    COUNT(*) FILTER (WHERE stock > $1)::int as ok
                FROM product_stock
            `, [threshold, criticalThreshold]);
            const summary = summaryResult.rows[0] || {};
            const total = Number(countResult.rows[0]?.total || 0);

            res.status(200).json({
                threshold,
                criticalThreshold,
                total,
                severity: {
                    critical: Number(summary.critical || 0),
                    attention: Number(summary.attention || 0),
                    ok: Number(summary.ok || 0),
                },
                pagination: {
                    page,
                    limit,
                    total,
                    totalPages: Math.max(1, Math.ceil(total / limit)),
                },
                items: result.rows,
            });
        } catch (err) {
            next(err);
        }
    },

    async getPixTransactions(req, res, next) {
        try {
            if (!req.user.isAdmin) {
                return res.status(403).json({ error: 'Nao autorizado', status: 403 });
            }

            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 20;
            const offset = (page - 1) * limit;

            const dateRange = getDateRangeFromQuery(req.query);
            const transactions = await PixTransactionModel.findAll(limit, offset, dateRange);
            const stats = await PixTransactionModel.getStats(dateRange);

            res.status(200).json({
                transactions: transactions.items,
                pagination: {
                    page,
                    limit,
                    total: transactions.total,
                    totalPages: Math.ceil(transactions.total / limit),
                },
                stats: {
                    total_transactions: parseInt(stats.total_transactions),
                    confirmed: parseInt(stats.confirmed),
                    pending: parseInt(stats.pending),
                    total_amount: parseFloat(stats.total_amount || 0).toFixed(2),
                },
            });
        } catch (err) {
            next(err);
        }
    },
};

module.exports = AdminReportController;
