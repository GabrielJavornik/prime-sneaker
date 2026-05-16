/**
 * Model de Produto (tenis).
 */
const db = require('../config/database');

const ProductModel = {
    async findAll() {
        const result = await db.query('SELECT * FROM products ORDER BY id DESC');
        return result.rows;
    },

    async findAllPaginated({
        page = 1,
        limit = 10,
        query,
        category,
        brand,
        launch,
        outlet,
        sortBy = 'recent',
    } = {}) {
        const safePage = Math.max(Number(page) || 1, 1);
        const safeLimit = Math.min(Math.max(Number(limit) || 10, 1), 100);
        const offset = (safePage - 1) * safeLimit;
        const where = [];
        const params = [];
        let i = 1;
        const salePriceSql = `(price * CASE WHEN COALESCE(discount_percent, 0) > 0 THEN (1 - COALESCE(discount_percent, 0) / 100) ELSE 1 END)`;
        const outletSql = `(COALESCE(is_outlet, FALSE) OR COALESCE(discount_percent, 0) > 0)`;

        if (query) {
            where.push(`(
                LOWER(name) LIKE $${i}
                OR LOWER(COALESCE(description, '')) LIKE $${i}
                OR LOWER(COALESCE(category, '')) LIKE $${i}
                OR LOWER(COALESCE(brand, '')) LIKE $${i}
            )`);
            params.push(`%${String(query).trim().toLowerCase()}%`);
            i++;
        }

        if (category) {
            where.push(`LOWER(category) = $${i}`);
            params.push(String(category).trim().toLowerCase());
            i++;
        }

        if (brand) {
            where.push(`LOWER(COALESCE(brand, '')) LIKE $${i}`);
            params.push(`%${String(brand).trim().toLowerCase()}%`);
            i++;
        }

        if (launch === true || launch === 'true' || launch === '1') {
            where.push('COALESCE(is_launch, FALSE) = TRUE');
        } else if (launch === false || launch === 'false' || launch === '0') {
            where.push('COALESCE(is_launch, FALSE) = FALSE');
        }

        if (outlet === true || outlet === 'true' || outlet === '1') {
            where.push(`${outletSql} = TRUE`);
        } else if (outlet === false || outlet === 'false' || outlet === '0') {
            where.push(`${outletSql} = FALSE`);
        }

        const orderMap = {
            recent: 'created_at DESC NULLS LAST, id DESC',
            price_asc: `${salePriceSql} ASC, id DESC`,
            price_desc: `${salePriceSql} DESC, id DESC`,
            stock_asc: 'stock ASC, id DESC',
            stock_desc: 'stock DESC, id DESC',
            name_asc: 'LOWER(name) ASC, id DESC',
        };
        const orderClause = orderMap[sortBy] || orderMap.recent;
        const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

        const countResult = await db.query(`SELECT COUNT(*) FROM products ${whereSql}`, params);
        const total = parseInt(countResult.rows[0].count, 10);
        const queryParams = [...params, safeLimit, offset];
        const result = await db.query(
            `SELECT * FROM products ${whereSql} ORDER BY ${orderClause} LIMIT $${i} OFFSET $${i + 1}`,
            queryParams
        );

        return {
            items: result.rows,
            pagination: {
                page: safePage,
                limit: safeLimit,
                total,
                totalPages: Math.ceil(total / safeLimit),
            },
            filters: { query, category, brand, launch, outlet, sortBy },
        };
    },

    async findById(id) {
        const result = await db.query('SELECT * FROM products WHERE id = $1', [id]);
        return result.rows[0];
    },

    async findTopN(n = 4) {
        const result = await db.query('SELECT * FROM products ORDER BY created_at DESC LIMIT $1', [n]);
        return result.rows;
    },

    async getMenuFacets() {
        const result = await db.query(`
            SELECT
                COALESCE(NULLIF(TRIM(brand), ''), split_part(name, ' ', 1)) AS brand,
                LOWER(COALESCE(NULLIF(TRIM(gender), ''), 'unissex')) AS gender,
                COALESCE(is_launch, FALSE) AS is_launch,
                (COALESCE(is_outlet, FALSE) OR COALESCE(discount_percent, 0) > 0) AS is_outlet
            FROM products
            WHERE name IS NOT NULL
            ORDER BY brand ASC
        `);
        return result.rows;
    },

    /**
     * Busca produtos com filtros de query, categoria, tamanho, faixa de preco, paginacao e ordenacao.
     */
    async search({
        query,
        category,
        size,
        brand,
        gender,
        launch,
        outlet,
        minPrice,
        maxPrice,
        page = 1,
        limit = 10,
        sortBy = 'recent',
        sortOrder = 'DESC',
    }) {
        const where = [];
        const params = [];
        let i = 1;
        const salePriceSql = `(price * CASE WHEN COALESCE(discount_percent, 0) > 0 THEN (1 - COALESCE(discount_percent, 0) / 100) ELSE 1 END)`;

        if (query) {
            where.push(`(
                LOWER(name) LIKE $${i}
                OR LOWER(COALESCE(description, '')) LIKE $${i}
                OR LOWER(COALESCE(category, '')) LIKE $${i}
                OR LOWER(COALESCE(brand, '')) LIKE $${i}
            )`);
            params.push(`%${query.toLowerCase()}%`);
            i++;
        }
        if (category) {
            where.push(`LOWER(category) = $${i}`);
            params.push(category.toLowerCase());
            i++;
        }
        if (brand) {
            where.push(`LOWER(COALESCE(brand, '')) = $${i}`);
            params.push(brand.toLowerCase());
            i++;
        }
        if (gender) {
            where.push(`(LOWER(COALESCE(gender, 'unissex')) = $${i} OR LOWER(COALESCE(gender, 'unissex')) = 'unissex')`);
            params.push(gender.toLowerCase());
            i++;
        }
        if (launch === true || launch === 'true' || launch === '1') {
            where.push(`is_launch = TRUE`);
        }
        if (outlet === true || outlet === 'true' || outlet === '1') {
            where.push(`is_outlet = TRUE`);
        }
        if (size) {
            where.push(`sizes LIKE $${i}`);
            params.push(`%${size}%`);
            i++;
        }
        if (minPrice) {
            where.push(`${salePriceSql} >= $${i}`);
            params.push(Number(minPrice));
            i++;
        }
        if (maxPrice) {
            where.push(`${salePriceSql} <= $${i}`);
            params.push(Number(maxPrice));
            i++;
        }

        const normalizedSortOrder = String(sortOrder || 'DESC').toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
        const orderMap = {
            recent: 'created_at DESC, id DESC',
            price_low: `${salePriceSql} ASC, id DESC`,
            price_high: `${salePriceSql} DESC, id DESC`,
            name: 'LOWER(name) ASC, id DESC',
            stock: 'stock DESC, id DESC',
        };
        const orderClause = orderMap[sortBy] || `created_at ${normalizedSortOrder}, id DESC`;

        const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
        const offset = (Number(page) - 1) * Number(limit);

        const countSql = `SELECT COUNT(*) FROM products ${whereSql}`;
        const countResult = await db.query(countSql, params);
        const total = parseInt(countResult.rows[0].count, 10);

        const sql = `SELECT * FROM products ${whereSql} ORDER BY ${orderClause} LIMIT $${i} OFFSET $${i + 1}`;
        params.push(Number(limit), offset);

        const result = await db.query(sql, params);
        return {
            items: result.rows,
            pagination: {
                page: Number(page),
                limit: Number(limit),
                total,
                totalPages: Math.ceil(total / Number(limit)),
            },
            filters: {
                sortBy,
                sortOrder: normalizedSortOrder,
            },
        };
    },

    async create({
        name,
        description,
        price,
        image_url,
        sizes,
        color,
        category,
        brand,
        gender,
        is_launch,
        is_outlet,
        discount_percent,
        stock,
    }) {
        const result = await db.query(
            `INSERT INTO products (name, description, price, image_url, sizes, color, category, brand, gender, is_launch, is_outlet, discount_percent, stock)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING *`,
            [
                name,
                description,
                price,
                image_url,
                sizes,
                color,
                category,
                brand,
                gender || 'unissex',
                is_launch === true || is_launch === 'true' || is_launch === '1' || is_launch === 1,
                is_outlet === true || is_outlet === 'true' || is_outlet === '1' || is_outlet === 1,
                Number(discount_percent || 0),
                stock || 10,
            ]
        );
        return result.rows[0];
    },

    async update(id, data) {
        const fields = [
            'name',
            'description',
            'price',
            'image_url',
            'sizes',
            'color',
            'category',
            'brand',
            'gender',
            'is_launch',
            'is_outlet',
            'discount_percent',
            'stock',
        ];
        const sets = [];
        const params = [];
        let i = 1;
        fields.forEach(f => {
            if (data[f] !== undefined) {
                sets.push(`${f} = $${i}`);
                params.push(data[f]);
                i++;
            }
        });
        if (sets.length === 0) return await this.findById(id);
        params.push(id);
        const sql = `UPDATE products SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`;
        const result = await db.query(sql, params);
        return result.rows[0];
    },

    async delete(id) {
        const result = await db.query('DELETE FROM products WHERE id = $1 RETURNING id', [id]);
        return result.rows[0];
    },

    async getRecommended(productId, limit = 4) {
        const product = await this.findById(productId);
        if (!product) return [];

        const result = await db.query(
            `SELECT * FROM products
             WHERE id != $1
             AND category = $2
             AND price BETWEEN ($3 * 0.7) AND ($3 * 1.3)
             ORDER BY RANDOM()
             LIMIT $4`,
            [productId, product.category, product.price, limit]
        );

        return result.rows;
    },
};

module.exports = ProductModel;
