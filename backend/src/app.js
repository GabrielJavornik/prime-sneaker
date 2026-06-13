/**
 * App Express - configura middlewares globais, rotas e Swagger.
 */
const express = require('express');
const cors = require('cors');
const path = require('path');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./config/swagger');
require('dotenv').config();

const healthRoutes = require('./routes/healthRoutes');
const authRoutes = require('./routes/authRoutes');
const productRoutes = require('./routes/productRoutes');
const cartRoutes = require('./routes/cartRoutes');
const couponRoutes = require('./routes/couponRoutes');
const orderRoutes = require('./routes/orderRoutes');
const reportRoutes = require('./routes/reportRoutes');
const userRoutes = require('./routes/userRoutes');
const adminRoutes = require('./routes/adminRoutes');
const reviewRoutes = require('./routes/reviewRoutes');
const wishlistRoutes = require('./routes/wishlistRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const adminReportRoutes = require('./routes/adminReportRoutes');
const adminAuditLogRoutes = require('./routes/adminAuditLogRoutes');
const addressRoutes = require('./routes/addressRoutes');
const newsletterRoutes = require('./routes/newsletterRoutes');
const { notFoundHandler, errorHandler } = require('./middlewares/errorMiddleware');

const app = express();

const DEFAULT_DEV_CORS_ORIGINS = [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:5500',
    'http://127.0.0.1:5500',
];

function parseCsvEnv(value) {
    return String(value || '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
}

function isProduction() {
    return String(process.env.NODE_ENV || '').toLowerCase() === 'production';
}

function validateCorsOrigins(origins) {
    const unsafeOrigins = origins.filter((origin) => {
        const normalized = origin.toLowerCase();
        return normalized === '*' || normalized === 'null';
    });

    if (unsafeOrigins.length > 0) {
        throw new Error('[SECURITY] CORS_ORIGINS nao pode usar * ou null. Informe origens explicitas.');
    }

    return origins;
}

function resolveAllowedCorsOrigins() {
    const configuredOrigins = validateCorsOrigins(parseCsvEnv(process.env.CORS_ORIGINS));

    if (configuredOrigins.length > 0) {
        return configuredOrigins;
    }

    if (isProduction()) {
        throw new Error('[SECURITY] CORS_ORIGINS precisa ser definido em producao.');
    }

    return DEFAULT_DEV_CORS_ORIGINS;
}

const allowedCorsOrigins = resolveAllowedCorsOrigins();

function corsOptions() {
    return {
        origin(origin, callback) {
            if (!origin || allowedCorsOrigins.includes(origin)) {
                return callback(null, true);
            }

            const error = new Error(`Origem nao permitida pelo CORS: ${origin}`);
            error.status = 403;
            return callback(error);
        },
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization'],
        optionsSuccessStatus: 204,
    };
}

function shouldExposeApiDocs() {
    if (isProduction()) {
        return false;
    }

    return process.env.ENABLE_API_DOCS === 'true';
}

function buildContentSecurityPolicy() {
    const directives = [
        "default-src 'self'",
        "base-uri 'self'",
        "object-src 'none'",
        "frame-ancestors 'none'",
        "form-action 'self'",
        "img-src 'self' data: https:",
        "font-src 'self' data:",
        "connect-src 'self' https://viacep.com.br https://brasilapi.com.br",
        // O frontend legado ainda tem scripts/handlers inline. A CSP ja bloqueia
        // origens externas e objetos; a etapa seguinte e migrar inline para JS local.
        "script-src 'self' 'unsafe-inline'",
        "style-src 'self' 'unsafe-inline'",
    ];

    if (isProduction()) {
        directives.push('upgrade-insecure-requests');
    }

    return directives.join('; ');
}

function securityHeaders(req, res, next) {
    res.setHeader('Content-Security-Policy', buildContentSecurityPolicy());
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
    next();
}

// Middlewares globais
app.use(securityHeaders);
app.use(cors(corsOptions()));
app.use(express.json({ limit: '8mb' }));

// Log simples de requisicoes
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
    next();
});

// Swagger fica desligado por padrao para nao expor o mapa da API em producao.
if (shouldExposeApiDocs()) {
    app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
}

// Frontend estatico (serve os arquivos da pasta frontend na raiz)
const uploadsPath = path.join(__dirname, '..', 'uploads');
app.use('/uploads', express.static(uploadsPath));

const frontendPath = path.join(__dirname, '..', '..', 'frontend');

function sendFrontendPage(res, fileName) {
    return res.sendFile(path.join(frontendPath, fileName));
}

app.get(['/admin', '/admin/'], (req, res) => {
    res.redirect(302, '/admin-login.html');
});
app.get(['/busca', '/busca/'], (req, res) => sendFrontendPage(res, 'search.html'));
app.get(['/carrinho', '/carrinho/'], (req, res) => sendFrontendPage(res, 'cart.html'));
app.get(['/p/:slug/:id', '/p/:id'], (req, res) => sendFrontendPage(res, 'product.html'));
app.use(express.static(frontendPath));

// Rotas da API (prefixo /api)
app.use('/api', healthRoutes);
app.use('/api', authRoutes);
app.use('/api', productRoutes);
app.use('/api', cartRoutes);
app.use('/api', couponRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/admin-reports', adminReportRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/users', userRoutes);
app.use('/api/addresses', addressRoutes);
app.use('/api', reviewRoutes);
app.use('/api/wishlist', wishlistRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/admin-audit-logs', adminAuditLogRoutes);
app.use('/api', newsletterRoutes);

// Tambem expoe /health na raiz, conforme especificacao
app.use('/', healthRoutes);

// Tratadores de erro (precisam estar DEPOIS de todas as rotas)
app.use('/api', notFoundHandler);
app.use(errorHandler);

module.exports = app;
