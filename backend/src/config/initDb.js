/**
 * Script utilitario para criar as tabelas e inserir dados iniciais (seed).
 * Rode com: npm run init-db
 */
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const db = require('./database');

async function init() {
    try {
        console.log('[INIT-DB] Criando tabelas...');

        // Lê o arquivo SQL e executa os comandos
        const sqlPath = path.join(__dirname, '..', '..', 'database.sql');
        const rawSql = fs.readFileSync(sqlPath, 'utf8');

        // 1) Remove TODOS os comentarios de linha ("-- ...")
        //    antes de dividir por ";" — senao o primeiro CREATE TABLE
        //    vem "colado" nos comentarios do cabecalho e e descartado.
        const cleanSql = rawSql
            .split('\n')
            .map(line => {
                const idx = line.indexOf('--');
                return idx >= 0 ? line.slice(0, idx) : line;
            })
            .join('\n');

        // 2) Divide por ";" e filtra vazios
        const statements = cleanSql
            .split(';')
            .map(s => s.trim())
            .filter(s => s.length > 0);

        for (const stmt of statements) {
            try {
                await db.query(stmt);
            } catch (err) {
                // Ignora erros de "ja existe" para permitir reexecucao
                if (!err.message.includes('duplicate key') &&
                    !err.message.includes('already exists')) {
                    console.warn('[INIT-DB] Aviso:', err.message);
                }
            }
        }

        await db.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_super_admin BOOLEAN DEFAULT FALSE`);

        // Em entrega real, credencial padrao hardcoded vira falha grave.
        // Para criar o dono do painel, configure SEED_SUPERADMIN_* no .env.
        // Mantemos fallback para SEED_ADMIN_* para nao quebrar ambientes antigos.
        const adminEmail = process.env.SEED_SUPERADMIN_EMAIL || process.env.SEED_ADMIN_EMAIL;
        const adminPassword = process.env.SEED_SUPERADMIN_PASSWORD || process.env.SEED_ADMIN_PASSWORD;
        const adminName = process.env.SEED_SUPERADMIN_NAME || process.env.SEED_ADMIN_NAME || 'Super Administrador';

        if (adminEmail && adminPassword) {
            const exists = await db.query('SELECT id FROM users WHERE email = $1', [adminEmail]);

            if (exists.rows.length === 0) {
                const hash = await bcrypt.hash(adminPassword, 10);
                await db.query(
                    'INSERT INTO users (name, email, password, is_admin, is_super_admin) VALUES ($1, $2, $3, $4, $5)',
                    [adminName, adminEmail, hash, true, true]
                );
                console.log(`[INIT-DB] Usuario superadmin inicial criado: ${adminEmail}`);
            } else {
                await db.query(
                    'UPDATE users SET is_admin = TRUE, is_super_admin = TRUE WHERE email = $1',
                    [adminEmail]
                );
                console.log('[INIT-DB] Usuario superadmin inicial ja existe e foi promovido/verificado.');
            }
        } else {
            console.log('[INIT-DB] Seed de superadmin ignorado. Configure SEED_SUPERADMIN_EMAIL e SEED_SUPERADMIN_PASSWORD se precisar criar o dono do painel.');
        }

        await db.query(
            `UPDATE users
             SET is_admin = TRUE, is_super_admin = TRUE
             WHERE LOWER(email) = LOWER($1)`,
            ['admin@tenis.com']
        );

        console.log('[INIT-DB] Inicializacao concluida com sucesso.');
        process.exit(0);
    } catch (err) {
        console.error('[INIT-DB] Erro fatal:', err);
        process.exit(1);
    }
}

init();
