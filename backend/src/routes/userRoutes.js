const express = require('express');
const UserController = require('../controllers/userController');
const { verifyToken } = require('../middlewares/authMiddleware');

const router = express.Router();

router.get('/profile', verifyToken, UserController.getProfile);
router.put('/profile', verifyToken, UserController.updateProfile);

module.exports = router;
