const express = require('express');
const WishlistController = require('../controllers/wishlistController');
const { verifyToken } = require('../middlewares/authMiddleware');

const router = express.Router();

router.post('/add', verifyToken, WishlistController.addToWishlist);
router.delete('/:productId', verifyToken, WishlistController.removeFromWishlist);
router.get('/', verifyToken, WishlistController.getWishlist);
router.get('/check', verifyToken, WishlistController.checkManyFavorites);
router.get('/check/:productId', verifyToken, WishlistController.checkIsFavorite);
router.get('/count/total', verifyToken, WishlistController.getWishlistCount);

module.exports = router;
