const db = require('../config/database');

const AddressModel = {
    async create(userId, { cep, street, number, complement, neighborhood, city, state, country, type, isDefault = false }) {
        const result = await db.query(
            `INSERT INTO addresses (user_id, cep, street, number, complement, neighborhood, city, state, country, type, is_default)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
             RETURNING id, cep, street, number, complement, neighborhood, city, state, country, type, is_default`,
            [userId, cep, street, number, complement || null, neighborhood || null, city, state, country || null, type || null, isDefault]
        );
        return result.rows[0];
    },

    async findByUserId(userId) {
        const result = await db.query(
            'SELECT id, cep, street, number, complement, neighborhood, city, state, country, type, is_default FROM addresses WHERE user_id = $1 ORDER BY is_default DESC, created_at DESC',
            [userId]
        );
        return result.rows;
    },

    async findById(id, userId) {
        const result = await db.query(
            'SELECT id, cep, street, number, complement, neighborhood, city, state, country, type, is_default FROM addresses WHERE id = $1 AND user_id = $2',
            [id, userId]
        );
        return result.rows[0];
    },

    async update(id, userId, { cep, street, number, complement, neighborhood, city, state, country, type, isDefault }) {
        const fields = [];
        const params = [];
        let i = 1;

        if (cep !== undefined) {
            fields.push(`cep = $${i}`);
            params.push(cep);
            i++;
        }
        if (street !== undefined) {
            fields.push(`street = $${i}`);
            params.push(street);
            i++;
        }
        if (number !== undefined) {
            fields.push(`number = $${i}`);
            params.push(number);
            i++;
        }
        if (complement !== undefined) {
            fields.push(`complement = $${i}`);
            params.push(complement || null);
            i++;
        }
        if (neighborhood !== undefined) {
            fields.push(`neighborhood = $${i}`);
            params.push(neighborhood || null);
            i++;
        }
        if (city !== undefined) {
            fields.push(`city = $${i}`);
            params.push(city);
            i++;
        }
        if (state !== undefined) {
            fields.push(`state = $${i}`);
            params.push(state);
            i++;
        }
        if (country !== undefined) {
            fields.push(`country = $${i}`);
            params.push(country || null);
            i++;
        }
        if (type !== undefined) {
            fields.push(`type = $${i}`);
            params.push(type || null);
            i++;
        }
        if (isDefault !== undefined) {
            fields.push(`is_default = $${i}`);
            params.push(isDefault);
            i++;
        }

        if (fields.length === 0) return await this.findById(id, userId);

        params.push(id);
        params.push(userId);

        const sql = `UPDATE addresses SET ${fields.join(', ')} WHERE id = $${i} AND user_id = $${i + 1} RETURNING id, cep, street, number, complement, neighborhood, city, state, country, type, is_default`;
        const result = await db.query(sql, params);
        return result.rows[0];
    },

    async delete(id, userId) {
        const result = await db.query(
            'DELETE FROM addresses WHERE id = $1 AND user_id = $2 RETURNING id',
            [id, userId]
        );
        return result.rows[0];
    },

    async setDefault(id, userId) {
        // Remove default de todos os endereços do usuário
        await db.query('UPDATE addresses SET is_default = FALSE WHERE user_id = $1', [userId]);
        // Define o novo como padrão
        await db.query('UPDATE addresses SET is_default = TRUE WHERE id = $1 AND user_id = $2', [id, userId]);
    },
};

module.exports = AddressModel;
