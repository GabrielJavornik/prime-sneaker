const express = require('express');
const UserController = require('../controllers/userController');
const { verifyToken, requireAdmin, requireSuperAdmin } = require('../middlewares/authMiddleware');

const router = express.Router();

router.get('/session', verifyToken, UserController.adminSession);
router.get('/users', verifyToken, requireAdmin, UserController.listAdmins);
router.post('/users', verifyToken, requireSuperAdmin, UserController.createAdmin);
router.put('/users/:id', verifyToken, requireSuperAdmin, UserController.updateAdmin);
router.delete('/users/:id', verifyToken, requireSuperAdmin, UserController.deleteAdmin);

module.exports = router;
