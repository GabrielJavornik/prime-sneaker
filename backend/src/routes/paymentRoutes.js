const express = require('express');
const PaymentController = require('../controllers/paymentController');
const { verifyToken, requireAdmin } = require('../middlewares/authMiddleware');

const router = express.Router();

router.post('/checkout', verifyToken, PaymentController.checkout);
router.post('/pix-preview', verifyToken, PaymentController.previewPix);
router.get('/pix/:orderId', verifyToken, PaymentController.getPixInfo);
router.post('/confirm', verifyToken, requireAdmin, PaymentController.confirmPayment);

module.exports = router;
