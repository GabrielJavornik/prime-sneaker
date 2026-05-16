const express = require('express');
const CartController = require('../controllers/cartController');

const router = express.Router();

router.post('/cart', CartController.checkout);

module.exports = router;
