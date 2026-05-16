const express = require('express');
const OrderController = require('../controllers/orderController');
const { verifyToken } = require('../middlewares/authMiddleware');

const router = express.Router();

router.post('/', verifyToken, OrderController.create);
router.get('/my-orders', verifyToken, OrderController.getMyOrders);
router.get('/admin/all', verifyToken, OrderController.listAllAdmin);
router.delete('/pending/cancel-all', verifyToken, OrderController.cancelAllPending);
router.delete('/cancelled/delete-all', verifyToken, OrderController.deleteAllCancelled);
router.get('/:id', verifyToken, OrderController.getOrderDetail);
router.patch('/:id/status', verifyToken, OrderController.updateStatus);
router.delete('/:id/cancel', verifyToken, OrderController.cancel);
router.delete('/:id', verifyToken, OrderController.deleteOne);

module.exports = router;
