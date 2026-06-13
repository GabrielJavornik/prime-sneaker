const express = require('express');
const CartController = require('../controllers/cartController');
const { verifyToken } = require('../middlewares/authMiddleware');

const router = express.Router();

router.get('/cart', verifyToken, CartController.getCart);
router.put('/cart/items', verifyToken, CartController.upsertItem);
router.delete('/cart/items/:productId', verifyToken, CartController.removeItem);
router.delete('/cart', verifyToken, CartController.clear);
router.post('/cart', CartController.checkout);

module.exports = router;
