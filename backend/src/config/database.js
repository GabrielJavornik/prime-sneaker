/**
 * Configuracao de conexao com PostgreSQL usando o driver "pg".
 * Pool de conexoes reutilizavel em toda a aplicacao.
 */
const { Pool, types } = require('pg');
require('dotenv').config();

const TIMESTAMP_WITHOUT_TIMEZONE_OID = 1114;
const configuredTimezone = process.env.APP_TIMEZONE || 'America/Sao_Paulo';
const APP_TIMEZONE = /^[A-Za-z0-9_/-]+$/.test(configuredTimezone)
    ? configuredTimezone
    : 'America/Sao_Paulo';

types.setTypeParser(TIMESTAMP_WITHOUT_TIMEZONE_OID, (value) => {
    if (!value) return value;
    return String(value).replace(' ', 'T');
});

const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_NAME || 'ecommerce_tenis',
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
    options: `-c timezone=${APP_TIMEZONE}`,
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
