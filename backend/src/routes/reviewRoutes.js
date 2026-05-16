const express = require('express');
const ReviewController = require('../controllers/reviewController');
const { verifyToken } = require('../middlewares/authMiddleware');

const router = express.Router();

router.post('/products/:productId/reviews', verifyToken, ReviewController.createReview);
router.get('/products/:productId/reviews', ReviewController.getProductReviews);
router.get('/products/:productId/rating', ReviewController.getAverageRating);
router.delete('/reviews/:reviewId', verifyToken, ReviewController.deleteReview);

module.exports = router;
