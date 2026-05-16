const OrderModel = require('../models/orderModel');
const { getDateRangeFromQuery } = require('../utils/dateRange');

const ReportController = {
    async getSalesSummary(req, res, next) {
        try {
            if (!req.user.isAdmin) {
                return res.status(403).json({
                    error: 'Apenas administradores podem acessar relatorios',
                    status: 403,
                });
            }

            const salesData = await OrderModel.getTotalSales(getDateRangeFromQuery(req.query));

            res.status(200).json({
                totalSales: parseFloat(salesData.total_sales || 0),
                totalOrders: parseInt(salesData.total_orders || 0),
                averageTicket: salesData.total_orders > 0
                    ? parseFloat((parseFloat(salesData.total_sales) / parseInt(salesData.total_orders)).toFixed(2))
                    : 0,
            });
        } catch (err) {
            next(err);
        }
    },

    async getTopProducts(req, res, next) {
        try {
            if (!req.user.isAdmin) {
                return res.status(403).json({
                    error: 'Apenas administradores podem acessar relatorios',
                    status: 403,
                });
            }

            const products = await OrderModel.getTopProducts(getDateRangeFromQuery(req.query));

            res.status(200).json({
                topProducts: products.map(p => ({
                    name: p.product_name,
                    totalSold: parseInt(p.total_sold),
                    totalRevenue: parseFloat(p.total_revenue),
                })),
            });
        } catch (err) {
            next(err);
        }
    },

    async getMonthlySales(req, res, next) {
        try {
            if (!req.user.isAdmin) {
                return res.status(403).json({
                    error: 'Apenas administradores podem acessar relatorios',
                    status: 403,
                });
            }

            const monthlySales = await OrderModel.getMonthlySales(getDateRangeFromQuery(req.query));

            res.status(200).json({
                monthlySales: monthlySales.map(m => ({
                    month: m.month ? m.month.toISOString().split('T')[0] : null,
                    totalSales: parseFloat(m.total_sales || 0),
                    totalOrders: parseInt(m.total_orders || 0),
                })),
            });
        } catch (err) {
            next(err);
        }
    },

    async getFullReport(req, res, next) {
        try {
            if (!req.user.isAdmin) {
                return res.status(403).json({
                    error: 'Apenas administradores podem acessar relatorios',
                    status: 403,
                });
            }

            const dateRange = getDateRangeFromQuery(req.query);
            const [salesData, topProducts, monthlySales] = await Promise.all([
                OrderModel.getTotalSales(dateRange),
                OrderModel.getTopProducts(dateRange),
                OrderModel.getMonthlySales(dateRange),
            ]);

            res.status(200).json({
                summary: {
                    totalSales: parseFloat(salesData.total_sales || 0),
                    totalOrders: parseInt(salesData.total_orders || 0),
                    averageTicket: salesData.total_orders > 0
                        ? parseFloat((parseFloat(salesData.total_sales) / parseInt(salesData.total_orders)).toFixed(2))
                        : 0,
                },
                topProducts: topProducts.map(p => ({
                    name: p.product_name,
                    totalSold: parseInt(p.total_sold),
                    totalRevenue: parseFloat(p.total_revenue),
                })),
                monthlySales: monthlySales.map(m => ({
                    month: m.month ? m.month.toISOString().split('T')[0] : null,
                    totalSales: parseFloat(m.total_sales || 0),
                    totalOrders: parseInt(m.total_orders || 0),
                })),
            });
        } catch (err) {
            next(err);
        }
    },
};

module.exports = ReportController;
