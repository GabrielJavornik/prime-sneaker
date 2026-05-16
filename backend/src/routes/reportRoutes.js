const express = require('express');
const ReportController = require('../controllers/reportController');
const { verifyToken } = require('../middlewares/authMiddleware');

const router = express.Router();

router.get('/summary', verifyToken, ReportController.getSalesSummary);
router.get('/top-products', verifyToken, ReportController.getTopProducts);
router.get('/monthly-sales', verifyToken, ReportController.getMonthlySales);
router.get('/full', verifyToken, ReportController.getFullReport);

module.exports = router;
