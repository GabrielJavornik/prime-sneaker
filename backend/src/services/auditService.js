const AdminAuditLogModel = require('../models/adminAuditLogModel');

function getAdminSnapshot(req) {
    const user = req.user || {};
    return {
        adminId: user.id || null,
        adminName: user.name || null,
        adminEmail: user.email || null,
    };
}

async function logAdminAction(req, { action, entityType, entityId = null, details = {} }) {
    const isAdmin = req.user && (req.user.isAdmin || req.user.is_admin);
    if (!isAdmin) return null;

    try {
        return await AdminAuditLogModel.create({
            ...getAdminSnapshot(req),
            action,
            entityType,
            entityId,
            details,
        });
    } catch (err) {
        // Auditoria nunca deve derrubar a acao principal do admin.
        console.error('[AUDIT] Falha ao registrar acao administrativa:', err.message);
        return null;
    }
}

module.exports = {
    logAdminAction,
};
