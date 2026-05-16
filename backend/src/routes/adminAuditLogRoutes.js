const express = require('express');
const AdminAuditLogController = require('../controllers/adminAuditLogController');
const { verifyToken, requireSuperAdmin } = require('../middlewares/authMiddleware');

const router = express.Router();

router.get('/', verifyToken, requireSuperAdmin, AdminAuditLogController.list);

module.exports = router;
