const db = require('../config/database');

const UserModel = {
    async findByEmail(email) {
        const result = await db.query('SELECT * FROM users WHERE email = $1', [email]);
        return result.rows[0];
    },

    async findById(id) {
        const result = await db.query('SELECT id, name, email, phone, cpf, cep, address, is_admin, is_super_admin, created_at FROM users WHERE id = $1', [id]);
        return result.rows[0];
    },

    async findAuthById(id) {
        const result = await db.query('SELECT id, password FROM users WHERE id = $1', [id]);
        return result.rows[0];
    },

    async create({ name, email, password, phone, cpf, isAdmin = false, isSuperAdmin = false }) {
        const result = await db.query(
            `INSERT INTO users (name, email, password, phone, cpf, is_admin, is_super_admin)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING id, name, email, phone, is_admin, is_super_admin`,
            [name, email, password, phone || null, cpf || null, isAdmin, isSuperAdmin]
        );
        return result.rows[0];
    },

    async update(id, { name, email, phone, cpf, cep, address, password }) {
        const fields = [];
        const params = [];
        let i = 1;

        if (name !== undefined) {
            fields.push(`name = $${i}`);
            params.push(name);
            i++;
        }
        if (email !== undefined) {
            fields.push(`email = $${i}`);
            params.push(email);
            i++;
        }
        if (phone !== undefined) {
            fields.push(`phone = $${i}`);
            params.push(phone);
            i++;
        }
        if (cpf !== undefined) {
            fields.push(`cpf = $${i}`);
            params.push(cpf);
            i++;
        }
        if (cep !== undefined) {
            fields.push(`cep = $${i}`);
            params.push(cep);
            i++;
        }
        if (address !== undefined) {
            fields.push(`address = $${i}`);
            params.push(address);
            i++;
        }
        if (password !== undefined) {
            fields.push(`password = $${i}`);
            params.push(password);
            i++;
        }

        if (fields.length === 0) return await this.findById(id);

        fields.push(`updated_at = CURRENT_TIMESTAMP`);
        params.push(id);

        const sql = `UPDATE users SET ${fields.join(', ')} WHERE id = $${i} RETURNING id, name, email, phone, cpf, cep, address, is_admin, is_super_admin, created_at`;
        const result = await db.query(sql, params);
        return result.rows[0];
    },

    async setResetToken(email, token, expiresIn = 3600000) {
        const expiresAt = new Date(Date.now() + expiresIn);
        const result = await db.query(
            'UPDATE users SET reset_token = $1, reset_token_expires = $2 WHERE email = $3 RETURNING id, email',
            [token, expiresAt, email]
        );
        return result.rows[0];
    },

    async findByResetToken(token) {
        const result = await db.query(
            'SELECT * FROM users WHERE reset_token = $1 AND reset_token_expires > NOW()',
            [token]
        );
        return result.rows[0];
    },

    async clearResetToken(id) {
        await db.query(
            'UPDATE users SET reset_token = NULL, reset_token_expires = NULL WHERE id = $1',
            [id]
        );
    },

    async findAll() {
        const result = await db.query(
            'SELECT id, name, email, phone, cpf, cep, address, is_admin, is_super_admin, created_at FROM users ORDER BY created_at DESC'
        );
        return result.rows;
    },

    async delete(id) {
        const result = await db.query(
            'DELETE FROM users WHERE id = $1 RETURNING id',
            [id]
        );
        return result.rows[0];
    },
};

module.exports = UserModel;
