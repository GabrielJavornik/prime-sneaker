/**
 * Configuracao de conexao com PostgreSQL usando o driver "pg".
 * Pool de conexoes reutilizavel em toda a aplicacao.
 */
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_NAME || 'ecommerce_tenis',
});

pool.on('connect', () => {
    console.log('[DB] Conectado ao PostgreSQL.');
});

pool.on('error', (err) => {
    console.error('[DB] Erro inesperado no pool:', err);
});

module.exports = {
    query: (text, params) => pool.query(text, params),
    pool,
};
