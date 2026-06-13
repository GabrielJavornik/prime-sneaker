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
            const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 100);
            const offset = Math.max(Number(req.query.offset) || 0, 0);
            const filters = {
                dateFrom: normalizeAuditDate(req.query.dateFrom),
                dateTo: normalizeAuditDate(req.query.dateTo, true),
                admin: String(req.query.admin || '').trim(),
                action: String(req.query.action || '').trim(),
                target: String(req.query.target || '').trim(),
            };
            const [logs, total] = await Promise.all([
                AdminAuditLogModel.findAll({ limit, offset, ...filters }),
                AdminAuditLogModel.count(filters),
            ]);
            const page = Math.floor(offset / limit) + 1;

            res.status(200).json({
                items: logs,
                filters,
                pagination: {
                    page,
                    limit,
                    offset,
                    total,
                    totalPages: Math.max(1, Math.ceil(total / limit)),
                },
            });
        } catch (err) {
            next(err);
        }
    },
};

module.exports = AdminAuditLogController;
