const db = require('../config/database');

const CouponModel = {
    async findAll() {
        const result = await db.query('SELECT * FROM coupons ORDER BY id DESC');
        return result.rows;
    },

    async findAllPaginated({ page = 1, limit = 10 } = {}) {
        const safePage = Math.max(Number(page) || 1, 1);
        const safeLimit = Math.min(Math.max(Number(limit) || 10, 1), 100);
        const offset = (safePage - 1) * safeLimit;

        const countResult = await db.query('SELECT COUNT(*) FROM coupons');
        const total = parseInt(countResult.rows[0].count, 10);
        const result = await db.query(
            'SELECT * FROM coupons ORDER BY id DESC LIMIT $1 OFFSET $2',
            [safeLimit, offset]
        );

        return {
            items: result.rows,
            pagination: {
                page: safePage,
                limit: safeLimit,
                total,
                totalPages: Math.ceil(total / safeLimit),
            },
        };
    },

    async findById(id) {
        const result = await db.query('SELECT * FROM coupons WHERE id = $1', [id]);
        return result.rows[0];
    },

    async findByCode(code) {
        const result = await db.query(
            `SELECT * FROM coupons
             WHERE UPPER(code) = UPPER($1)
             AND active = TRUE
             AND (expires_at IS NULL OR expires_at > NOW())
             AND (max_uses IS NULL OR COALESCE(uses_count, 0) < max_uses)`,
            [code]
        );
        return result.rows[0];
    },

    async create({ code, discount_percent, min_value = 0, active = true, expires_at = null, max_uses = null }) {
        const result = await db.query(
            `INSERT INTO coupons (code, discount_percent, min_value, active, expires_at, max_uses, uses_count)
             VALUES ($1, $2, $3, $4, $5, $6, 0) RETURNING *`,
            [code.toUpperCase(), discount_percent, min_value, active, expires_at, max_uses]
        );
        return result.rows[0];
    },

    async update(id, data) {
        const sets = [];
        const params = [];
        let i = 1;

        ['code', 'discount_percent', 'min_value', 'active', 'expires_at', 'max_uses'].forEach(f => {
            if (data[f] !== undefined) {
                sets.push(`${f} = $${i}`);
                params.push(f === 'code' ? data[f].toUpperCase() : data[f]);
                i++;
            }
        });

        if (sets.length === 0) return await this.findById(id);
        params.push(id);
        const result = await db.query(
            `UPDATE coupons SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`,
            params
        );
        return result.rows[0];
    },

    async incrementUses(id, queryRunner = db) {
        const result = await queryRunner.query(
            `UPDATE coupons
             SET uses_count = COALESCE(uses_count, 0) + 1
             WHERE id = $1
               AND active = TRUE
               AND (expires_at IS NULL OR expires_at > NOW())
               AND (max_uses IS NULL OR COALESCE(uses_count, 0) < max_uses)
             RETURNING *`,
            [id]
        );
        return result.rows[0];
    },

    async delete(id) {
        const result = await db.query('DELETE FROM coupons WHERE id = $1 RETURNING id', [id]);
        return result.rows[0];
    },
};

module.exports = CouponModel;
