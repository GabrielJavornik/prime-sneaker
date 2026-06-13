const db = require('../config/database');

function buildAuditWhere({ dateFrom, dateTo, admin, action, target } = {}) {
    const where = [];
    const values = [];

    const addValue = (value) => {
        values.push(value);
        return `$${values.length}`;
    };

    if (dateFrom) {
        where.push(`created_at >= ${addValue(dateFrom)}`);
    }

    if (dateTo) {
        where.push(`created_at < ${addValue(dateTo)}`);
    }

    if (admin) {
        const param = addValue(`%${admin}%`);
        where.push(`(admin_name ILIKE ${param} OR admin_email ILIKE ${param})`);
    }

    if (action) {
        where.push(`action = ${addValue(action)}`);
    }

    if (target) {
        const param = addValue(`%${target}%`);
        where.push(`(entity_type ILIKE ${param} OR CAST(entity_id AS TEXT) ILIKE ${param} OR details::text ILIKE ${param})`);
    }

    return {
        whereClause: where.length ? `WHERE ${where.join(' AND ')}` : '',
        values,
        addValue,
    };
}

const AdminAuditLogModel = {
    async create({ adminId, adminName, adminEmail, action, entityType, entityId = null, details = {} }) {
        const result = await db.query(
            `INSERT INTO admin_audit_logs
                (admin_id, admin_name, admin_email, action, entity_type, entity_id, details)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING *`,
            [
                adminId || null,
                adminName || null,
                adminEmail || null,
                action,
                entityType,
                entityId || null,
                details || {},
            ]
        );
        return result.rows[0];
    },

    async findAll({ limit = 100, offset = 0, dateFrom, dateTo, admin, action, target } = {}) {
        const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 300);
        const safeOffset = Math.max(Number(offset) || 0, 0);
        const { whereClause, values, addValue } = buildAuditWhere({ dateFrom, dateTo, admin, action, target });
        const limitParam = addValue(safeLimit);
        const offsetParam = addValue(safeOffset);
        const result = await db.query(
            `SELECT *
             FROM admin_audit_logs
             ${whereClause}
             ORDER BY created_at DESC, id DESC
             LIMIT ${limitParam} OFFSET ${offsetParam}`,
            values
        );
        return result.rows;
    },

    async count({ dateFrom, dateTo, admin, action, target } = {}) {
        const { whereClause, values } = buildAuditWhere({ dateFrom, dateTo, admin, action, target });
        const result = await db.query(
            `SELECT COUNT(*)::int AS count
             FROM admin_audit_logs
             ${whereClause}`,
            values
        );
        return Number(result.rows[0]?.count || 0);
    },
};

module.exports = AdminAuditLogModel;
