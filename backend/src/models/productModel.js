/**
 * Model de Produto (tenis).
 */
const db = require('../config/database');
const PRODUCT_STOCK_TOTAL_SQL = `COALESCE((
    SELECT SUM(ps.stock)::int
    FROM product_sizes ps
    WHERE ps.product_id = products.id
), CASE
    WHEN NULLIF(TRIM(COALESCE(products.sizes, '')), '') IS NULL THEN COALESCE(products.stock, 0)
    ELSE 0
END, 0)`;
const PRODUCT_SELECT_COLUMNS = `
    products.id,
    products.name,
    products.description,
    products.price,
    products.image_url,
    products.sizes,
    products.color,
    COALESCE(NULLIF(TRIM(products.model_group), ''), TRIM(products.name)) AS model_group,
    products.category,
    products.brand,
    products.gender,
    products.is_launch,
    products.is_outlet,
    products.discount_percent,
    ${PRODUCT_STOCK_TOTAL_SQL} AS stock,
    products.archived_at,
    COALESCE((
        SELECT ROUND(AVG(r.rating)::numeric, 1)
        FROM reviews r
        WHERE r.product_id = products.id
    ), 0)::float AS average_rating,
    COALESCE((
        SELECT COUNT(*)::int
        FROM reviews r
        WHERE r.product_id = products.id
    ), 0) AS total_reviews,
    products.created_at
`;

function normalizeModelText(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

const MODEL_NAME_STOP_WORDS = new Set([
    'tenis',
    'masculino',
    'feminino',
    'infantil',
    'unissex',
    'adulto',
    'adultos',
    'calcado',
    'sapato',
    'premium',
    'original',
    'novo',
    'nova',
]);

const COLOR_STOP_WORDS = new Set([
    'amarelo',
    'azul',
    'bege',
    'branco',
    'branca',
    'caramelo',
    'cinza',
    'dourado',
    'laranja',
    'marrom',
    'preto',
    'preta',
    'rosa',
    'roxo',
    'verde',
    'vermelho',
    'vermelha',
]);

function getComparableModelName(product) {
    const colorWords = new Set(normalizeModelText(product?.color).split(' ').filter(Boolean));
    return normalizeModelText(product?.name)
        .split(' ')
        .filter(Boolean)
        .filter(token => !MODEL_NAME_STOP_WORDS.has(token))
        .filter(token => !COLOR_STOP_WORDS.has(token))
        .filter(token => !colorWords.has(token))
        .join(' ');
}

function getComparableBrand(product) {
    return normalizeModelText(product?.brand);
}

function areSameModelVariants(baseProduct, candidateProduct) {
    const baseModelName = getComparableModelName(baseProduct);
    const candidateModelName = getComparableModelName(candidateProduct);
    if (!baseModelName || !candidateModelName || baseModelName !== candidateModelName) {
        return false;
    }

    const baseBrand = getComparableBrand(baseProduct);
    const candidateBrand = getComparableBrand(candidateProduct);
    return !baseBrand || !candidateBrand || baseBrand === candidateBrand;
}

function getModelLookupTerms(product) {
    return getComparableModelName(product)
        .split(' ')
        .filter(token => token.length >= 3 || /^\d+$/.test(token))
        .slice(0, 4);
}

const ProductModel = {
    async findAll() {
        const result = await db.query(`SELECT ${PRODUCT_SELECT_COLUMNS} FROM products WHERE archived_at IS NULL ORDER BY id DESC`);
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
        const where = ['archived_at IS NULL'];
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
            stock_asc: `${PRODUCT_STOCK_TOTAL_SQL} ASC, id DESC`,
            stock_desc: `${PRODUCT_STOCK_TOTAL_SQL} DESC, id DESC`,
            name_asc: 'LOWER(name) ASC, id DESC',
        };
        const orderClause = orderMap[sortBy] || orderMap.recent;
        const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

        const countResult = await db.query(`SELECT COUNT(*) FROM products ${whereSql}`, params);
        const total = parseInt(countResult.rows[0].count, 10);
        const queryParams = [...params, safeLimit, offset];
        const result = await db.query(
            `SELECT ${PRODUCT_SELECT_COLUMNS} FROM products ${whereSql} ORDER BY ${orderClause} LIMIT $${i} OFFSET $${i + 1}`,
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
        const result = await db.query(`SELECT ${PRODUCT_SELECT_COLUMNS} FROM products WHERE id = $1 AND archived_at IS NULL`, [id]);
        return result.rows[0];
    },

    async findColorVariants(product) {
        const modelGroup = String(product?.model_group || '').trim();
        const name = String(product?.name || '').trim();
        const brand = String(product?.brand || '').trim();
        const productId = Number(product?.id) || 0;

        if (!modelGroup && !name) return [];

        const params = [];
        const groups = [];

        if (modelGroup) {
            params.push(modelGroup);
            groups.push(`LOWER(TRIM(model_group)) = LOWER(TRIM($${params.length}))`);
        }

        if (name) {
            params.push(name);
            const nameParam = params.length;
            params.push(brand);
            const brandParam = params.length;
            groups.push(`(
                LOWER(TRIM(name)) = LOWER(TRIM($${nameParam}))
                AND LOWER(TRIM(COALESCE(brand, ''))) = LOWER(TRIM(COALESCE($${brandParam}, '')))
            )`);
        }

        const lookupTerms = getModelLookupTerms(product);
        if (lookupTerms.length) {
            const termClauses = lookupTerms.map(term => {
                params.push(`%${term}%`);
                return `LOWER(name) LIKE $${params.length}`;
            });
            groups.push(`(${termClauses.join(' AND ')})`);
        }

        params.push(productId);
        const productIdParam = params.length;

        const result = await db.query(
            `SELECT id, name, image_url, color, brand, price, discount_percent, is_outlet, model_group
             FROM products
             WHERE (${groups.join(' OR ')})
             AND archived_at IS NULL
             ORDER BY
               CASE WHEN id = $${productIdParam} THEN 0 ELSE 1 END,
               LOWER(COALESCE(color, '')),
               id`,
            params
        );

        const normalizedGroup = normalizeModelText(modelGroup);
        const uniqueVariants = new Map();

        result.rows.forEach(row => {
            const sameManualGroup = normalizedGroup
                && normalizeModelText(row.model_group) === normalizedGroup;
            if (Number(row.id) === productId || sameManualGroup || areSameModelVariants(product, row)) {
                uniqueVariants.set(Number(row.id), row);
            }
        });

        const sortedVariants = [...uniqueVariants.values()].sort((a, b) => {
            if (Number(a.id) === productId) return -1;
            if (Number(b.id) === productId) return 1;
            return String(a.color || '').localeCompare(String(b.color || ''), 'pt-BR') || Number(a.id) - Number(b.id);
        });

        const variantsByColor = new Map();
        sortedVariants.forEach(row => {
            const colorKey = normalizeModelText(row.color) || `produto-${row.id}`;
            if (!variantsByColor.has(colorKey)) {
                variantsByColor.set(colorKey, row);
            }
        });

        return [...variantsByColor.values()];
    },

    async findTopN(n = 4) {
        const result = await db.query(`SELECT ${PRODUCT_SELECT_COLUMNS} FROM products WHERE archived_at IS NULL ORDER BY created_at DESC LIMIT $1`, [n]);
        return result.rows;
    },

    async getMenuFacets() {
        const result = await db.query(`
            SELECT
                COALESCE(NULLIF(TRIM(brand), ''), split_part(name, ' ', 1)) AS brand,
                LOWER(COALESCE(NULLIF(TRIM(gender), ''), 'unissex')) AS gender,
                COALESCE(is_launch, FALSE) AS is_launch,
                (COALESCE(is_outlet, FALSE) OR COALESCE(discount_percent, 0) > 0) AS is_outlet,
                COALESCE(sizes, '') AS sizes,
                EXISTS (
                    SELECT 1
                    FROM product_sizes ps_exists
                    WHERE ps_exists.product_id = products.id
                ) AS has_size_rows,
                COALESCE((
                    SELECT json_agg(ps.size ORDER BY
                        CASE
                            WHEN ps.size ~ '^[0-9]+([,.][0-9]+)?$'
                            THEN REPLACE(ps.size, ',', '.')::numeric
                        END NULLS LAST,
                        ps.size
                    )
                    FROM product_sizes ps
                    WHERE ps.product_id = products.id
                      AND ps.stock > 0
                ), '[]'::json) AS stock_sizes
            FROM products
            WHERE name IS NOT NULL
              AND archived_at IS NULL
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
        const where = ['archived_at IS NULL'];
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
            const normalizedGender = gender.toLowerCase();
            if (normalizedGender === 'infantil') {
                where.push(`LOWER(COALESCE(gender, 'unissex')) = $${i}`);
            } else {
                where.push(`(LOWER(COALESCE(gender, 'unissex')) = $${i} OR LOWER(COALESCE(gender, 'unissex')) = 'unissex')`);
            }
            params.push(normalizedGender);
            i++;
        }
        if (launch === true || launch === 'true' || launch === '1') {
            where.push(`is_launch = TRUE`);
        }
        if (outlet === true || outlet === 'true' || outlet === '1') {
            where.push(`is_outlet = TRUE`);
        }
        if (size) {
            where.push(`(
                EXISTS (
                    SELECT 1
                    FROM product_sizes ps
                    WHERE ps.product_id = products.id
                      AND ps.size = $${i}
                      AND ps.stock > 0
                )
                OR (
                    NOT EXISTS (
                        SELECT 1
                        FROM product_sizes ps_any
                        WHERE ps_any.product_id = products.id
                    )
                    AND $${i} = ANY(string_to_array(REPLACE(COALESCE(products.sizes, ''), ' ', ''), ','))
                )
            )`);
            params.push(String(size).trim());
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

        const sql = `
            SELECT ${PRODUCT_SELECT_COLUMNS}
            FROM products
            ${whereSql}
            ORDER BY ${orderClause}
            LIMIT $${i} OFFSET $${i + 1}
        `;
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
        model_group,
        category,
        brand,
        gender,
        is_launch,
        is_outlet,
        discount_percent,
        stock,
    }) {
        const result = await db.query(
            `INSERT INTO products (name, description, price, image_url, sizes, color, model_group, category, brand, gender, is_launch, is_outlet, discount_percent, stock)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING *`,
            [
                name,
                description,
                price,
                image_url,
                sizes,
                color,
                model_group,
                category,
                brand,
                gender || 'unissex',
                is_launch === true || is_launch === 'true' || is_launch === '1' || is_launch === 1,
                is_outlet === true || is_outlet === 'true' || is_outlet === '1' || is_outlet === 1,
                Number(discount_percent || 0),
                Number(stock ?? 0),
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
            'model_group',
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
        const referenceResult = await db.query(
            'SELECT EXISTS (SELECT 1 FROM order_items WHERE product_id = $1) AS has_orders',
            [id]
        );
        const hasOrders = referenceResult.rows[0]?.has_orders === true;

        if (hasOrders) {
            const result = await db.query(
                `UPDATE products
                 SET archived_at = CURRENT_TIMESTAMP
                 WHERE id = $1 AND archived_at IS NULL
                 RETURNING id, TRUE AS archived`,
                [id]
            );
            return result.rows[0];
        }

        const result = await db.query('DELETE FROM products WHERE id = $1 RETURNING id, FALSE AS archived', [id]);
        return result.rows[0];
    },

    async getRecommended(productId, limit = 4) {
        const product = await this.findById(productId);
        if (!product) return [];

        const result = await db.query(
            `SELECT ${PRODUCT_SELECT_COLUMNS} FROM products
             WHERE id != $1
             AND category = $2
             AND archived_at IS NULL
             AND price BETWEEN ($3 * 0.7) AND ($3 * 1.3)
             ORDER BY RANDOM()
             LIMIT $4`,
            [productId, product.category, product.price, limit]
        );

        return result.rows;
    },
};

module.exports = ProductModel;
