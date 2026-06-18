/**
 * Fluxo unico de migracoes do banco.
 *
 * Use:
 * - npm run init-db  -> cria a base pelo database.sql e roda estas migracoes.
 * - npm run migrate  -> aplica somente estas migracoes em uma base existente.
 *
 * O servidor tambem chama este runner no boot para garantir compatibilidade,
 * mas a apresentacao/documentacao deve usar os comandos acima.
 */
const db = require('./database');

const migrations = [
    {
        name: 'users_profile_and_security_columns',
        statements: [
            `ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(20)`,
            `ALTER TABLE users ADD COLUMN IF NOT EXISTS cpf VARCHAR(20)`,
            `ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`,
            `ALTER TABLE users ADD COLUMN IF NOT EXISTS cep VARCHAR(20)`,
            `ALTER TABLE users ADD COLUMN IF NOT EXISTS address TEXT`,
            `ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token VARCHAR(255)`,
            `ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token_expires TIMESTAMP`,
            `ALTER TABLE users ADD COLUMN IF NOT EXISTS is_super_admin BOOLEAN DEFAULT FALSE`,
            `UPDATE users SET updated_at = CURRENT_TIMESTAMP WHERE updated_at IS NULL`,
        ],
    },
    {
        name: 'admin_audit_logs',
        statements: [
            `CREATE TABLE IF NOT EXISTS admin_audit_logs (
                id SERIAL PRIMARY KEY,
                admin_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                admin_name VARCHAR(120),
                admin_email VARCHAR(120),
                action VARCHAR(80) NOT NULL,
                entity_type VARCHAR(80) NOT NULL,
                entity_id INTEGER,
                details JSONB DEFAULT '{}'::jsonb,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`,
            `CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_admin_id ON admin_audit_logs(admin_id)`,
            `CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_action ON admin_audit_logs(action)`,
            `CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_created_at ON admin_audit_logs(created_at DESC)`,
        ],
    },
    {
        name: 'orders_status_standardization',
        statements: [
            `DO $$
             BEGIN
                IF EXISTS (
                    SELECT 1
                    FROM information_schema.tables
                    WHERE table_schema = 'public'
                      AND table_name = 'orders'
                ) THEN
                    ALTER TABLE orders ALTER COLUMN status SET DEFAULT 'aguardando_pagamento';
                    UPDATE orders
                    SET status = 'aguardando_pagamento', updated_at = CURRENT_TIMESTAMP
                    WHERE status = 'pendente';
                    CREATE INDEX IF NOT EXISTS idx_orders_status ON orders (status);
                END IF;
            END $$`,
        ],
    },
    {
        name: 'orders_shipping_address',
        statements: [
            `ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_address JSONB DEFAULT '{}'::jsonb`,
        ],
    },
    {
        name: 'product_size_stock',
        statements: [
            `CREATE TABLE IF NOT EXISTS product_sizes (
                id SERIAL PRIMARY KEY,
                product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
                size VARCHAR(10) NOT NULL,
                stock INTEGER DEFAULT 10,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(product_id, size)
            )`,
            `CREATE INDEX IF NOT EXISTS idx_product_sizes_product_id ON product_sizes(product_id)`,
            `INSERT INTO product_sizes (product_id, size, stock)
             SELECT
                p.id,
                TRIM(unnest(string_to_array(p.sizes, ','))) AS size,
                p.stock
             FROM products p
             WHERE p.sizes IS NOT NULL AND p.sizes <> ''
             ON CONFLICT (product_id, size) DO NOTHING`,
        ],
    },
    {
        name: 'product_images',
        statements: [
            `CREATE TABLE IF NOT EXISTS product_images (
                id SERIAL PRIMARY KEY,
                product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
                image_url TEXT NOT NULL,
                sort_order INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`,
            `CREATE INDEX IF NOT EXISTS idx_product_images_product_id ON product_images(product_id)`,
        ],
    },
    {
        name: 'pix_transactions',
        statements: [
            `CREATE TABLE IF NOT EXISTS pix_transactions (
                id SERIAL PRIMARY KEY,
                order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                amount NUMERIC(10, 2) NOT NULL,
                qr_code TEXT,
                status VARCHAR(50) DEFAULT 'pending',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`,
            `ALTER TABLE pix_transactions ADD COLUMN IF NOT EXISTS qr_code TEXT`,
            `ALTER TABLE pix_transactions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`,
            `INSERT INTO pix_transactions (order_id, user_id, amount, status, created_at)
             SELECT o.id, o.user_id, o.total,
                    CASE
                        WHEN o.status = 'aguardando_pagamento' THEN 'pending'
                        WHEN o.status = 'cancelado' THEN 'cancelled'
                        ELSE 'confirmed'
                    END,
                    o.created_at
             FROM orders o
             WHERE NOT EXISTS (
                SELECT 1 FROM pix_transactions pt WHERE pt.order_id = o.id
             )`,
            `UPDATE pix_transactions pt
             SET status = 'confirmed', updated_at = CURRENT_TIMESTAMP
             FROM orders o
             WHERE pt.order_id = o.id
               AND pt.status <> 'confirmed'
               AND o.status IN ('processando', 'enviado', 'entregue')`,
        ],
    },
    {
        name: 'cart_items',
        statements: [
            `CREATE TABLE IF NOT EXISTS cart_items (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
                size VARCHAR(10) NOT NULL DEFAULT '',
                quantity INTEGER NOT NULL CHECK (quantity > 0),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(user_id, product_id, size)
            )`,
            `CREATE INDEX IF NOT EXISTS idx_cart_items_user_id ON cart_items(user_id)`,
        ],
    },
    {
        name: 'addresses_checkout_fields',
        statements: [
            `DO $$
             BEGIN
                IF EXISTS (
                    SELECT 1
                    FROM information_schema.tables
                    WHERE table_schema = 'public'
                      AND table_name = 'addresses'
                ) THEN
                    ALTER TABLE addresses ADD COLUMN IF NOT EXISTS neighborhood VARCHAR(120);
                    ALTER TABLE addresses ADD COLUMN IF NOT EXISTS country VARCHAR(80);
                    ALTER TABLE addresses ADD COLUMN IF NOT EXISTS type VARCHAR(30);
                END IF;
             END $$`,
        ],
    },
    {
        name: 'coupons_columns',
        statements: [
            `ALTER TABLE coupons ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP`,
            `ALTER TABLE coupons ADD COLUMN IF NOT EXISTS max_uses INTEGER`,
            `ALTER TABLE coupons ADD COLUMN IF NOT EXISTS uses_count INTEGER DEFAULT 0`,
            `ALTER TABLE coupons ADD COLUMN IF NOT EXISTS min_value NUMERIC(10, 2) DEFAULT 0`,
            `ALTER TABLE coupons ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT TRUE`,
            `ALTER TABLE coupons ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`,
            `UPDATE coupons SET uses_count = 0 WHERE uses_count IS NULL`,
        ],
    },
    {
        name: 'products_catalog_columns',
        statements: [
            `ALTER TABLE products ADD COLUMN IF NOT EXISTS brand VARCHAR(80)`,
            `ALTER TABLE products ADD COLUMN IF NOT EXISTS model_group VARCHAR(120)`,
            `ALTER TABLE products ADD COLUMN IF NOT EXISTS gender VARCHAR(20) DEFAULT 'unissex'`,
            `ALTER TABLE products ADD COLUMN IF NOT EXISTS is_launch BOOLEAN DEFAULT FALSE`,
            `ALTER TABLE products ADD COLUMN IF NOT EXISTS is_outlet BOOLEAN DEFAULT FALSE`,
            `ALTER TABLE products ADD COLUMN IF NOT EXISTS discount_percent NUMERIC(5, 2) DEFAULT 0`,
            `ALTER TABLE products ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP`,
            `UPDATE products
             SET brand = CASE
                WHEN LOWER(name) LIKE '%new balance%' THEN 'New Balance'
                WHEN LOWER(name) LIKE '%nike%' THEN 'Nike'
                WHEN LOWER(name) LIKE '%jordan%' THEN 'Jordan'
                WHEN LOWER(name) LIKE '%adidas%' THEN 'Adidas'
                WHEN LOWER(name) LIKE '%vans%' THEN 'Vans'
                WHEN LOWER(name) LIKE '%puma%' THEN 'Puma'
                WHEN LOWER(name) LIKE '%asics%' THEN 'ASICS'
                WHEN LOWER(name) LIKE '%mizuno%' THEN 'Mizuno'
                WHEN LOWER(name) LIKE '%converse%' THEN 'Converse'
                ELSE split_part(name, ' ', 1)
             END
             WHERE name IS NOT NULL
               AND (brand IS NULL OR brand = '' OR LOWER(brand) IN ('tenis', 'tenis'))`,
            `UPDATE products
             SET is_outlet = TRUE
             WHERE COALESCE(discount_percent, 0) > 0`,
            `UPDATE products
             SET model_group = TRIM(name)
             WHERE name IS NOT NULL
               AND (model_group IS NULL OR TRIM(model_group) = '')`,
            `CREATE INDEX IF NOT EXISTS idx_products_category_lower ON products (LOWER(category))`,
            `CREATE INDEX IF NOT EXISTS idx_products_brand_lower ON products (LOWER(brand))`,
            `CREATE INDEX IF NOT EXISTS idx_products_model_group_lower ON products (LOWER(model_group))`,
            `CREATE INDEX IF NOT EXISTS idx_products_gender_lower ON products (LOWER(gender))`,
            `CREATE INDEX IF NOT EXISTS idx_products_launch ON products (is_launch)`,
            `CREATE INDEX IF NOT EXISTS idx_products_outlet ON products (is_outlet)`,
            `CREATE INDEX IF NOT EXISTS idx_products_archived_at ON products (archived_at)`,
            `CREATE INDEX IF NOT EXISTS idx_products_created_at ON products (created_at DESC)`,
        ],
    },
    {
        name: 'newsletter_subscribers',
        statements: [
            `CREATE TABLE IF NOT EXISTS newsletter_subscribers (
                id SERIAL PRIMARY KEY,
                email VARCHAR(120) UNIQUE NOT NULL,
                active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`,
        ],
    },
];

function shouldIgnoreMissingBaseTable(err, options) {
    return options.ignoreMissingBaseTables && err && err.code === '42P01';
}

async function runStatement(statement, migrationName, options) {
    try {
        await db.query(statement);
    } catch (err) {
        if (shouldIgnoreMissingBaseTable(err, options)) {
            if (options.log) {
                console.warn(`[MIGRATE] ${migrationName}: tabela base ausente, comando ignorado.`);
            }
            return;
        }

        throw err;
    }
}

async function promoteKnownSuperAdmins(options) {
    const superAdminEmails = [
        process.env.SEED_SUPERADMIN_EMAIL || process.env.SEED_ADMIN_EMAIL,
        'admin@tenis.com',
    ].filter(Boolean);

    for (const superAdminEmail of superAdminEmails) {
        try {
            const promoted = await db.query(
                `UPDATE users
                 SET is_admin = TRUE, is_super_admin = TRUE
                 WHERE LOWER(email) = LOWER($1)
                 RETURNING id, email`,
                [superAdminEmail]
            );

            if (options.log && promoted.rows.length > 0) {
                console.log(`[MIGRATE] Superadmin verificado: ${superAdminEmail}`);
            }
        } catch (err) {
            if (shouldIgnoreMissingBaseTable(err, options)) {
                if (options.log) {
                    console.warn(`[MIGRATE] users ausente; superadmin ${superAdminEmail} nao foi verificado.`);
                }
                continue;
            }

            throw err;
        }
    }
}

async function runMigrations(options = {}) {
    const resolvedOptions = {
        log: options.log !== false,
        ignoreMissingBaseTables: Boolean(options.ignoreMissingBaseTables),
    };

    if (resolvedOptions.log) {
        console.log('[MIGRATE] Iniciando migracoes...');
    }

    for (const migration of migrations) {
        if (resolvedOptions.log) {
            console.log(`[MIGRATE] ${migration.name}`);
        }

        for (const statement of migration.statements) {
            await runStatement(statement, migration.name, resolvedOptions);
        }
    }

    await promoteKnownSuperAdmins(resolvedOptions);

    if (resolvedOptions.log) {
        console.log('[MIGRATE] Migracoes concluidas com sucesso.');
    }
}

async function runMigrationsCli() {
    try {
        await runMigrations({ log: true });
        await db.pool.end();
        process.exit(0);
    } catch (err) {
        console.error('[MIGRATE] Erro:', err.message);
        await db.pool.end().catch(() => {});
        process.exit(1);
    }
}

if (require.main === module) {
    runMigrationsCli();
}

module.exports = {
    migrations,
    runMigrations,
    runMigrationsCli,
};
