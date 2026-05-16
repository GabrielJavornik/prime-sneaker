const AdminAuditLogModel = require('../models/adminAuditLogModel');

function normalizeAuditDate(value, endOfDay = false) {
    if (!value) return null;
    const date = new Date(`${value}T00:00:00`);
    if (Number.isNaN(date.getTime())) return null;
    if (endOfDay) {
        date.setDate(date.getDate() + 1);
    }
    return date.toISOString();
}

const AdminAuditLogController = {
    async list(req, res, next) {
        try {
            const limit = Number(req.query.limit) || 100;
            const offset = Number(req.query.offset) || 0;
            const filters = {
                dateFrom: normalizeAuditDate(req.query.dateFrom),
                dateTo: normalizeAuditDate(req.query.dateTo, true),
                admin: String(req.query.admin || '').trim(),
                action: String(req.query.action || '').trim(),
                target: String(req.query.target || '').trim(),
            };
            const logs = await AdminAuditLogModel.findAll({ limit, offset, ...filters });
            res.status(200).json({ items: logs, filters });
        } catch (err) {
            next(err);
        }
    },
};

module.exports = AdminAuditLogController;
