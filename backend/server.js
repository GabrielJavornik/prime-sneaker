/**
 * Ponto de entrada do servidor.
 */
require('dotenv').config();
const app = require('./src/app');
const db = require('./src/config/database');

const PORT = process.env.PORT || 3000;

// Garante que colunas adicionadas em versoes posteriores existam.
// Necessario porque CREATE TABLE IF NOT EXISTS nao altera tabelas
// pre-existentes. Falha silenciosa se a tabela nao existir ainda.
async function ensureSchema() {
    const stmts = [
        `ALTER TABLE coupons ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP`,
        `ALTER TABLE coupons ADD COLUMN IF NOT EXISTS max_uses INTEGER`,
        `ALTER TABLE coupons ADD COLUMN IF NOT EXISTS uses_count INTEGER DEFAULT 0`,
        `ALTER TABLE coupons ADD COLUMN IF NOT EXISTS min_value NUMERIC(10, 2) DEFAULT 0`,
        `ALTER TABLE coupons ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT TRUE`,
        `ALTER TABLE products ADD COLUMN IF NOT EXISTS brand VARCHAR(80)`,
        `ALTER TABLE products ADD COLUMN IF NOT EXISTS model_group VARCHAR(120)`,
        `ALTER TABLE products ADD COLUMN IF NOT EXISTS gender VARCHAR(20) DEFAULT 'unissex'`,
        `ALTER TABLE products ADD COLUMN IF NOT EXISTS is_launch BOOLEAN DEFAULT FALSE`,
        `ALTER TABLE products ADD COLUMN IF NOT EXISTS is_outlet BOOLEAN DEFAULT FALSE`,
        `ALTER TABLE products ADD COLUMN IF NOT EXISTS discount_percent NUMERIC(5, 2) DEFAULT 0`,
        `ALTER TABLE products ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP`,
        `CREATE INDEX IF NOT EXISTS idx_products_model_group_lower ON products (LOWER(model_group))`,
        `CREATE INDEX IF NOT EXISTS idx_products_archived_at ON products (archived_at)`,
        `ALTER TABLE users ADD COLUMN IF NOT EXISTS is_super_admin BOOLEAN DEFAULT FALSE`,
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
           AND (brand IS NULL OR brand = '' OR LOWER(brand) IN ('tenis', 'tênis'))`,
        `UPDATE products
         SET is_outlet = TRUE
         WHERE COALESCE(discount_percent, 0) > 0`,
        `UPDATE products
         SET model_group = TRIM(name)
         WHERE name IS NOT NULL
           AND (model_group IS NULL OR TRIM(model_group) = '')`,
        `CREATE TABLE IF NOT EXISTS newsletter_subscribers (
            id SERIAL PRIMARY KEY,
            email VARCHAR(120) UNIQUE NOT NULL,
            active BOOLEAN DEFAULT TRUE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,
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
    ];
    for (const sql of stmts) {
        try { await db.query(sql); } catch (_) { /* tabela ainda nao criada */ }
    }

    const superAdminEmails = [
        process.env.SEED_SUPERADMIN_EMAIL || process.env.SEED_ADMIN_EMAIL,
        'admin@tenis.com',
    ].filter(Boolean);

    for (const superAdminEmail of superAdminEmails) {
        try {
            await db.query(
                `UPDATE users
                 SET is_admin = TRUE, is_super_admin = TRUE
                 WHERE LOWER(email) = LOWER($1)`,
                [superAdminEmail]
            );
        } catch (_) { /* users ainda nao criada */ }
    }
}

const server = app.listen(PORT, () => {
    console.log('==============================================');
    console.log(` Servidor rodando em http://localhost:${PORT}`);
    console.log(` Swagger em http://localhost:${PORT}/api-docs`);
    console.log(` Frontend em http://localhost:${PORT}/`);
    console.log('==============================================');
});

server.on('error', (err) => {
    console.error('[SERVER] Erro ao iniciar:', err.message);
    process.exit(1);
});

ensureSchema()
    .then(() => {
        console.log('[DB] Estrutura do banco conferida.');
    })
    .catch((err) => {
        console.error('[DB] Erro ao conferir estrutura do banco:', err.message);
    });
