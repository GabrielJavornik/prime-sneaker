const db = require('./src/config/database');

async function migrate() {
    try {
        console.log('Iniciando migração...');

        // Adicionar colunas ao cupom
        await db.query(`
            ALTER TABLE coupons
            ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP,
            ADD COLUMN IF NOT EXISTS max_uses INTEGER,
            ADD COLUMN IF NOT EXISTS uses_count INTEGER DEFAULT 0
        `);

        // Adicionar colunas faltando em users
        await db.query(`
            ALTER TABLE users
            ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            ADD COLUMN IF NOT EXISTS cep VARCHAR(20),
            ADD COLUMN IF NOT EXISTS address TEXT,
            ADD COLUMN IF NOT EXISTS reset_token VARCHAR(255),
            ADD COLUMN IF NOT EXISTS reset_token_expires TIMESTAMP
        `);

        // Criar tabela de histórico de transações PIX
        await db.query(`
            CREATE TABLE IF NOT EXISTS pix_transactions (
                id SERIAL PRIMARY KEY,
                order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                amount NUMERIC(10, 2) NOT NULL,
                status VARCHAR(50) DEFAULT 'pending',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Backfill: criar transacoes PIX para pedidos antigos que nao possuem registro
        const backfill = await db.query(`
            INSERT INTO pix_transactions (order_id, user_id, amount, status, created_at)
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
            )
            RETURNING id
        `);
        console.log(`↪  ${backfill.rowCount} transacao(oes) PIX preenchida(s) retroativamente.`);

        console.log('✅ Migração concluída com sucesso!');
        process.exit(0);
    } catch (err) {
        console.error('❌ Erro na migração:', err.message);
        process.exit(1);
    }
}

migrate();
