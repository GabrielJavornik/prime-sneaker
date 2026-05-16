/**
 * Middlewares de autenticacao.
 * - verifyToken: valida JWT de usuarios logados.
 * - requireAdmin: exige que o usuario autenticado seja admin.
 * - basicAuthAdmin: aceita Bearer JWT de admin; Basic Auth legado fica restrito a ambiente local.
 */
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const MIN_JWT_SECRET_LENGTH = 32;
const MIN_BASIC_AUTH_PASSWORD_LENGTH = 16;
const WEAK_JWT_SECRETS = new Set([
    'dev_secret',
    'secret',
    'jwt_secret',
    'admin',
    'admin123',
    'password',
    'senha',
    '123456',
    'sua_chave_secreta_aqui',
    'minha_chave_super_secreta_trocar_em_producao',
    'troque_por_uma_chave_aleatoria_com_no_minimo_32_caracteres',
]);
const WEAK_BASIC_AUTH_PASSWORDS = new Set([
    'admin',
    'admin123',
    'password',
    'senha',
    '123456',
    '12345678',
]);

function normalizeEnvValue(value) {
    return String(value || '').trim();
}

function isWeakJwtSecret(secret) {
    const normalizedSecret = normalizeEnvValue(secret);
    const lowerSecret = normalizedSecret.toLowerCase();

    return (
        normalizedSecret.length < MIN_JWT_SECRET_LENGTH ||
        WEAK_JWT_SECRETS.has(lowerSecret) ||
        lowerSecret.includes('troque_por') ||
        lowerSecret.includes('change_me') ||
        lowerSecret.includes('changeme')
    );
}

function requireStrongJwtSecret() {
    const secret = normalizeEnvValue(process.env.JWT_SECRET);

    if (isWeakJwtSecret(secret)) {
        throw new Error(
            '[SECURITY] JWT_SECRET ausente ou fraco. Defina uma chave aleatoria com pelo menos 32 caracteres antes de iniciar o backend.'
        );
    }

    return secret;
}

function isBasicAuthEnabled() {
    return process.env.ENABLE_BASIC_AUTH === 'true' && isLocalEnvironment();
}

function isLocalEnvironment() {
    const env = normalizeEnvValue(process.env.NODE_ENV || 'development').toLowerCase();
    return ['development', 'dev', 'local', 'test'].includes(env);
}

function hasStrongBasicAuthConfig() {
    const user = normalizeEnvValue(process.env.ADMIN_USER);
    const pass = normalizeEnvValue(process.env.ADMIN_PASS);

    return (
        user.length > 0 &&
        pass.length >= MIN_BASIC_AUTH_PASSWORD_LENGTH &&
        !WEAK_BASIC_AUTH_PASSWORDS.has(pass.toLowerCase()) &&
        user.toLowerCase() !== pass.toLowerCase()
    );
}

function safeCompare(left, right) {
    const leftBuffer = Buffer.from(String(left || ''));
    const rightBuffer = Buffer.from(String(right || ''));

    return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

const JWT_SECRET = requireStrongJwtSecret();
requireSafeBasicAuthConfig();

function requireSafeBasicAuthConfig() {
    if (process.env.ENABLE_BASIC_AUTH !== 'true') return;

    if (!isLocalEnvironment()) {
        throw new Error(
            '[SECURITY] Basic Auth legado so pode ser habilitado em ambiente local. Use Bearer JWT em producao.'
        );
    }

    if (!hasStrongBasicAuthConfig()) {
        throw new Error(
            '[SECURITY] Basic Auth habilitado sem ADMIN_USER/ADMIN_PASS fortes.'
        );
    }
}

function verifyToken(req, res, next) {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Token nao fornecido', status: 401 });
    }
    const token = auth.substring(7);
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Token invalido ou expirado', status: 401 });
    }
}

function requireAdmin(req, res, next) {
    if (!req.user || !(req.user.isAdmin || req.user.is_admin)) {
        return res.status(401).json({ error: 'Acesso restrito a administradores', status: 401 });
    }
    next();
}

function requireSuperAdmin(req, res, next) {
    const isAdmin = req.user && (req.user.isAdmin || req.user.is_admin);
    const isSuperAdmin = req.user && (req.user.isSuperAdmin || req.user.is_super_admin);

    if (!isAdmin || !isSuperAdmin) {
        return res.status(403).json({
            error: 'Acesso restrito ao superadmin',
            status: 403,
        });
    }

    next();
}

function basicAuthAdmin(req, res, next) {
    const auth = req.headers.authorization;

    // Fluxo recomendado: painel admin sempre deve usar Bearer JWT.
    if (auth && auth.startsWith('Bearer ')) {
        return verifyToken(req, res, () => requireAdmin(req, res, next));
    }

    if (!isBasicAuthEnabled()) {
        return res.status(401).json({
            error: 'Basic Auth desabilitado ou restrito ao ambiente local. Use Bearer JWT de administrador.',
            status: 401,
        });
    }

    if (!hasStrongBasicAuthConfig()) {
        return res.status(500).json({
            error: 'Basic Auth mal configurado. Defina ADMIN_USER e uma ADMIN_PASS forte ou mantenha ENABLE_BASIC_AUTH=false.',
            status: 500,
        });
    }

    if (!auth || !auth.startsWith('Basic ')) {
        res.set('WWW-Authenticate', 'Basic realm="admin"');
        return res.status(401).json({ error: 'Autenticacao necessaria', status: 401 });
    }
    const encoded = auth.substring(6);
    const decoded = Buffer.from(encoded, 'base64').toString('utf8');
    const separatorIndex = decoded.indexOf(':');
    const user = separatorIndex >= 0 ? decoded.slice(0, separatorIndex) : '';
    const pass = separatorIndex >= 0 ? decoded.slice(separatorIndex + 1) : '';
    if (safeCompare(user, process.env.ADMIN_USER) && safeCompare(pass, process.env.ADMIN_PASS)) {
        req.user = { name: user, isAdmin: true, isSuperAdmin: false };
        return next();
    }
    res.set('WWW-Authenticate', 'Basic realm="admin"');
    return res.status(401).json({ error: 'Credenciais invalidas', status: 401 });
}

module.exports = { verifyToken, requireAdmin, requireSuperAdmin, basicAuthAdmin, JWT_SECRET };
