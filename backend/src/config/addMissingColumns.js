/**
 * Migration script to add missing columns to users table
 * Run with: node src/config/addMissingColumns.js
 */
const db = require('./database');

async function migrate() {
    try {
        console.log('[MIGRATION] Adding missing columns to users table...');

        // Add phone column if it doesn't exist
        await db.query(`
            ALTER TABLE users
            ADD COLUMN IF NOT EXISTS phone VARCHAR(20)
        `);
        console.log('[MIGRATION] phone column added/verified');

        // Add cpf column if it doesn't exist
        await db.query(`
            ALTER TABLE users
            ADD COLUMN IF NOT EXISTS cpf VARCHAR(20)
        `);
        console.log('[MIGRATION] cpf column added/verified');

        await db.query(`
            ALTER TABLE users
            ADD COLUMN IF NOT EXISTS is_super_admin BOOLEAN DEFAULT FALSE
        `);
        console.log('[MIGRATION] is_super_admin column added/verified');

        await db.query(`
            CREATE TABLE IF NOT EXISTS admin_audit_logs (
                id SERIAL PRIMARY KEY,
                admin_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                admin_name VARCHAR(120),
                admin_email VARCHAR(120),
                action VARCHAR(80) NOT NULL,
                entity_type VARCHAR(80) NOT NULL,
                entity_id INTEGER,
                details JSONB DEFAULT '{}'::jsonb,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        await db.query(`CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_admin_id ON admin_audit_logs(admin_id)`);
        await db.query(`CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_action ON admin_audit_logs(action)`);
        await db.query(`CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_created_at ON admin_audit_logs(created_at DESC)`);
        console.log('[MIGRATION] admin_audit_logs table created/verified');

        await db.query(`
            DO $$
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
            END $$;
        `);
        console.log('[MIGRATION] orders status default normalized/verified');

        // Add pix_transactions table if it doesn't exist
        await db.query(`
            CREATE TABLE IF NOT EXISTS pix_transactions (
                id SERIAL PRIMARY KEY,
                order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                amount NUMERIC(10, 2) NOT NULL,
                qr_code TEXT,
                status VARCHAR(50) DEFAULT 'pending',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('[MIGRATION] pix_transactions table created/verified');

        // Garante colunas de cupons (tabelas antigas podem nao ter)
        await db.query(`ALTER TABLE coupons ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP`);
        await db.query(`ALTER TABLE coupons ADD COLUMN IF NOT EXISTS max_uses INTEGER`);
        await db.query(`ALTER TABLE coupons ADD COLUMN IF NOT EXISTS uses_count INTEGER DEFAULT 0`);
        await db.query(`ALTER TABLE coupons ADD COLUMN IF NOT EXISTS min_value NUMERIC(10, 2) DEFAULT 0`);
        await db.query(`ALTER TABLE coupons ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT TRUE`);
        await db.query(`ALTER TABLE coupons ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`);
        await db.query(`UPDATE coupons SET uses_count = 0 WHERE uses_count IS NULL`);
        console.log('[MIGRATION] coupons columns added/verified');

        await db.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS brand VARCHAR(80)`);
        await db.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS gender VARCHAR(20) DEFAULT 'unissex'`);
        await db.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS is_launch BOOLEAN DEFAULT FALSE`);
        await db.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS is_outlet BOOLEAN DEFAULT FALSE`);
        await db.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS discount_percent NUMERIC(5, 2) DEFAULT 0`);
        await db.query(`
            UPDATE products
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
              AND (brand IS NULL OR brand = '' OR LOWER(brand) IN ('tenis', 'tênis'))
        `);
        await db.query(`
            UPDATE products
            SET is_outlet = TRUE
            WHERE COALESCE(discount_percent, 0) > 0
        `);
        await db.query(`CREATE INDEX IF NOT EXISTS idx_products_category_lower ON products (LOWER(category))`);
        await db.query(`CREATE INDEX IF NOT EXISTS idx_products_brand_lower ON products (LOWER(brand))`);
        await db.query(`CREATE INDEX IF NOT EXISTS idx_products_gender_lower ON products (LOWER(gender))`);
        await db.query(`CREATE INDEX IF NOT EXISTS idx_products_launch ON products (is_launch)`);
        await db.query(`CREATE INDEX IF NOT EXISTS idx_products_outlet ON products (is_outlet)`);
        await db.query(`CREATE INDEX IF NOT EXISTS idx_products_created_at ON products (created_at DESC)`);
        console.log('[MIGRATION] products menu columns added/verified');

        const superAdminEmails = [
            process.env.SEED_SUPERADMIN_EMAIL || process.env.SEED_ADMIN_EMAIL,
            'admin@tenis.com',
        ].filter(Boolean);

        for (const superAdminEmail of superAdminEmails) {
            const promoted = await db.query(
                `UPDATE users
                 SET is_admin = TRUE, is_super_admin = TRUE
                 WHERE LOWER(email) = LOWER($1)
                 RETURNING id, email`,
                [superAdminEmail]
            );
            if (promoted.rows.length > 0) {
                console.log(`[MIGRATION] Superadmin promoted/verified: ${superAdminEmail}`);
            } else {
                console.log(`[MIGRATION] Superadmin email not found to promote: ${superAdminEmail}`);
            }
        }

        console.log('[MIGRATION] Migration completed successfully');
        process.exit(0);
    } catch (err) {
        console.error('[MIGRATION] Error:', err.message);
        process.exit(1);
    }
}

migrate();
