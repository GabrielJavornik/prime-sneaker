const express = require('express');
const AdminReportController = require('../controllers/adminReportController');
const { verifyToken, requireAdmin } = require('../middlewares/authMiddleware');

const router = express.Router();

router.get('/pending-orders', verifyToken, requireAdmin, AdminReportController.getPendingOrders);
router.get('/order-notifications', verifyToken, requireAdmin, AdminReportController.getOrderNotifications);
router.get('/order-status-summary', verifyToken, requireAdmin, AdminReportController.getOrderStatusSummary);
router.get('/customers', verifyToken, requireAdmin, AdminReportController.getCustomerReport);
router.get('/low-stock', verifyToken, requireAdmin, AdminReportController.getLowStockProducts);
router.get('/pix-transactions', verifyToken, requireAdmin, AdminReportController.getPixTransactions);

module.exports = router;
