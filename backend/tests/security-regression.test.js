const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const tests = [];
const backendRoot = path.resolve(__dirname, '..');
const workspaceRoot = path.resolve(backendRoot, '..');

function test(name, fn) {
    tests.push({ name, fn });
}

function readBackendFile(relativePath) {
    return fs.readFileSync(path.join(backendRoot, relativePath), 'utf8');
}

function readWorkspaceFile(relativePath) {
    return fs.readFileSync(path.join(workspaceRoot, relativePath), 'utf8');
}

function listWorkspaceFiles(relativeDir, extensions) {
    const root = path.join(workspaceRoot, relativeDir);
    const results = [];

    function walk(currentDir) {
        for (const item of fs.readdirSync(currentDir)) {
            const fullPath = path.join(currentDir, item);
            const stat = fs.statSync(fullPath);
            if (stat.isDirectory()) {
                walk(fullPath);
            } else if (extensions.includes(path.extname(fullPath))) {
                results.push(fullPath);
            }
        }
    }

    walk(root);
    return results;
}

function extractBetween(source, startPattern, endPattern) {
    const start = source.search(startPattern);
    assert.notEqual(start, -1, `Nao encontrou inicio: ${startPattern}`);

    const rest = source.slice(start);
    const end = rest.search(endPattern);
    assert.notEqual(end, -1, `Nao encontrou fim: ${endPattern}`);

    return rest.slice(0, end);
}

function extractBalancedBlock(source, startPattern) {
    const start = source.search(startPattern);
    assert.notEqual(start, -1, `Nao encontrou inicio: ${startPattern}`);

    const openBrace = source.indexOf('{', start);
    assert.notEqual(openBrace, -1, `Nao encontrou chave de abertura: ${startPattern}`);

    let depth = 0;
    let quote = null;
    let escaped = false;
    let lineComment = false;
    let blockComment = false;

    for (let index = openBrace; index < source.length; index++) {
        const char = source[index];
        const next = source[index + 1];

        if (lineComment) {
            if (char === '\n') lineComment = false;
            continue;
        }

        if (blockComment) {
            if (char === '*' && next === '/') {
                blockComment = false;
                index++;
            }
            continue;
        }

        if (quote) {
            if (escaped) {
                escaped = false;
            } else if (char === '\\') {
                escaped = true;
            } else if (char === quote) {
                quote = null;
            }
            continue;
        }

        if (char === '/' && next === '/') {
            lineComment = true;
            index++;
            continue;
        }

        if (char === '/' && next === '*') {
            blockComment = true;
            index++;
            continue;
        }

        if (char === '\'' || char === '"' || char === '`') {
            quote = char;
            continue;
        }

        if (char === '{') depth++;

        if (char === '}') {
            depth--;
            if (depth === 0) {
                return source.slice(start, index + 1);
            }
        }
    }

    assert.fail(`Nao encontrou fim do bloco: ${startPattern}`);
}

function contrastRatio(hexA, hexB) {
    function toLinear(channel) {
        const value = channel / 255;
        return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    }

    function luminance(hex) {
        const normalized = hex.replace('#', '');
        const rgb = [0, 2, 4].map(index => parseInt(normalized.slice(index, index + 2), 16));
        const [r, g, b] = rgb.map(toLinear);
        return (0.2126 * r) + (0.7152 * g) + (0.0722 * b);
    }

    const lighter = Math.max(luminance(hexA), luminance(hexB));
    const darker = Math.min(luminance(hexA), luminance(hexB));
    return (lighter + 0.05) / (darker + 0.05);
}

test('cadastro publico nao aceita privilegio admin vindo do body', () => {
    const source = readBackendFile('src/controllers/authController.js');
    const registerBlock = extractBetween(source, /async register\(/, /async login\(/);

    assert.doesNotMatch(registerBlock, /const\s*\{[^}]*isAdmin[^}]*\}\s*=\s*req\.body/);
    assert.doesNotMatch(registerBlock, /isAdmin\s*:\s*!!/);
    assert.match(registerBlock, /isAdmin\s*:\s*false/);
});

test('senhas simples sao bloqueadas em cadastro reset perfil e admin', () => {
    const validators = require(path.join(backendRoot, 'src/utils/validators'));
    const authController = readBackendFile('src/controllers/authController.js');
    const userController = readBackendFile('src/controllers/userController.js');
    const authRoutes = readBackendFile('src/routes/authRoutes.js');
    const commonJs = readWorkspaceFile('frontend/js/common.js');
    const registerHtml = readWorkspaceFile('frontend/register.html');
    const resetPasswordHtml = readWorkspaceFile('frontend/reset-password.html');
    const profileHtml = readWorkspaceFile('frontend/profile.html');
    const adminJs = readWorkspaceFile('frontend/js/admin.js');
    const admHtml = readWorkspaceFile('frontend/adm.html');

    assert.ok(validators.getPasswordStrengthError('123456'));
    assert.ok(validators.getPasswordStrengthError('12345678'));
    assert.ok(validators.getPasswordStrengthError('senha123'));
    assert.ok(validators.getPasswordStrengthError('aaaaaaaa'));
    assert.equal(validators.getPasswordStrengthError('Tenis2026'), null);

    assert.match(authController, /validators\.getPasswordStrengthError\(password\)/);
    assert.match(userController, /validators\.getPasswordStrengthError\(newPassword\)/);
    assert.match(userController, /validators\.getPasswordStrengthError\(password\)/);
    assert.match(commonJs, /function getStrongPasswordError/);
    assert.match(registerHtml, /getStrongPasswordError\(password\)/);
    assert.match(resetPasswordHtml, /getStrongPasswordError\(password\)/);
    assert.match(profileHtml, /getStrongPasswordError\(newPassword\)/);
    assert.match(adminJs, /getStrongPasswordError\(password\)/);
    assert.match(admHtml, /id="a-password" required minlength="8"/);
    assert.match(admHtml, /id="admin-form-alert"/);
    assert.match(adminJs, /function setAdminFormAlert/);
    assert.doesNotMatch(registerHtml, /toast\(passwordError|toast\('As senhas/);
    assert.doesNotMatch(resetPasswordHtml, /Notifications\.error\(passwordError|Notifications\.error\('As senhas/);
    assert.doesNotMatch(profileHtml, /Notifications\.error\(passwordError|Notifications\.error\('As novas senhas/);
    assert.doesNotMatch(adminJs, /toast\(passwordError|toast\('As senhas/);
    assert.doesNotMatch(authRoutes, /example:\s*"123456"/);
});

test('confirmacao manual de pagamento exige admin', () => {
    const routes = readBackendFile('src/routes/paymentRoutes.js');
    const controller = readBackendFile('src/controllers/paymentController.js');
    const compactRoutes = routes.replace(/\s+/g, ' ');
    const confirmBlock = extractBalancedBlock(controller, /async confirmPayment\(/);

    assert.match(routes, /requireAdmin/);
    assert.match(compactRoutes, /router\.post\('\/confirm', verifyToken, requireAdmin, PaymentController\.confirmPayment\)/);
    assert.match(confirmBlock, /!req\.user\s*\|\|\s*!req\.user\.isAdmin/);
    assert.doesNotMatch(confirmBlock, /order\.user_id\s*!==\s*userId\s*&&\s*!req\.user\.isAdmin/);
});

test('fluxo de pedidos usa status aguardando_pagamento de ponta a ponta', () => {
    const statusService = readBackendFile('src/services/orderStatusService.js');
    const orderModel = readBackendFile('src/models/orderModel.js');
    const orderController = readBackendFile('src/controllers/orderController.js');
    const paymentController = readBackendFile('src/controllers/paymentController.js');
    const adminReportController = readBackendFile('src/controllers/adminReportController.js');
    const emailService = readBackendFile('src/services/emailService.js');
    const sql = readBackendFile('database.sql');
    const migration = readBackendFile('src/config/migrations.js');
    const updateStatusBlock = extractBetween(orderController, /async updateStatus\(/, /async cancelAllPending\(/);

    assert.match(statusService, /WAITING_PAYMENT:\s*'aguardando_pagamento'/);
    assert.match(statusService, /LEGACY_PENDING_STATUS = 'pendente'/);
    assert.match(statusService, /\[LEGACY_PENDING_STATUS\]: ORDER_STATUS\.WAITING_PAYMENT/);
    assert.match(orderModel, /status = ORDER_STATUS\.WAITING_PAYMENT/);
    assert.doesNotMatch(orderModel, /status = 'pendente'/);
    assert.doesNotMatch(orderModel, /status = 'cancelado'/);
    assert.match(paymentController, /status:\s*ORDER_STATUS\.WAITING_PAYMENT/);
    assert.match(paymentController, /OrderModel\.updateStatus\(orderId,\s*ORDER_STATUS\.PROCESSING\)/);
    assert.match(updateStatusBlock, /normalizeOrderStatus\(status\)/);
    assert.match(updateStatusBlock, /isValidOrderStatus\(normalizedStatus\)/);
    assert.match(updateStatusBlock, /OrderModel\.updateStatus\(orderId,\s*normalizedStatus\)/);
    assert.match(adminReportController, /ORDER_STATUS\.WAITING_PAYMENT/);
    assert.match(adminReportController, /LEGACY_PENDING_STATUS/);
    assert.match(adminReportController, /ORDER_STATUS\.PROCESSING/);
    assert.doesNotMatch(adminReportController, /status IN \('aguardando_pagamento', 'pendente'/);
    assert.match(emailService, /normalizeOrderStatus\(order\.status\)/);
    assert.match(emailService, /\[ORDER_STATUS\.WAITING_PAYMENT\]/);
    assert.match(emailService, /normalizedStatus === ORDER_STATUS\.CANCELED/);
    assert.match(sql, /status VARCHAR\(50\) DEFAULT 'aguardando_pagamento'/);
    assert.match(migration, /ALTER TABLE orders ALTER COLUMN status SET DEFAULT 'aguardando_pagamento'/);
    assert.match(migration, /WHERE status = 'pendente'/);
});

test('servico de status normaliza legado e valida somente estados oficiais', () => {
    const {
        ORDER_STATUS,
        ORDER_STATUS_VALUES,
        LEGACY_PENDING_STATUS,
        normalizeOrderStatus,
        isValidOrderStatus,
    } = require(path.join(backendRoot, 'src/services/orderStatusService.js'));

    assert.deepEqual(ORDER_STATUS_VALUES, [
        ORDER_STATUS.WAITING_PAYMENT,
        ORDER_STATUS.PROCESSING,
        ORDER_STATUS.SHIPPED,
        ORDER_STATUS.DELIVERED,
        ORDER_STATUS.CANCELED,
    ]);
    assert.equal(normalizeOrderStatus(LEGACY_PENDING_STATUS), ORDER_STATUS.WAITING_PAYMENT);
    assert.equal(normalizeOrderStatus(' AGUARDANDO_PAGAMENTO '), ORDER_STATUS.WAITING_PAYMENT);
    assert.equal(normalizeOrderStatus('Cancelado'), ORDER_STATUS.CANCELED);
    assert.equal(isValidOrderStatus(LEGACY_PENDING_STATUS), true);
    assert.equal(isValidOrderStatus(ORDER_STATUS.PROCESSING), true);
    assert.equal(isValidOrderStatus('pago'), false);
    assert.equal(isValidOrderStatus(''), false);
});

test('rota antiga de pedidos recalcula valores no backend', () => {
    const source = readBackendFile('src/controllers/orderController.js');
    const createBlock = extractBetween(source, /async create\(/, /async getMyOrders\(/);

    assert.doesNotMatch(createBlock, /const\s*\{[^}]*subtotal[^}]*total[^}]*\}\s*=\s*req\.body/);
    assert.match(createBlock, /orderPricingService\.createOrderWithPricing/);
    assert.match(createBlock, /couponCode:\s*couponCode \|\| coupon/);
    assert.match(createBlock, /status:\s*ORDER_STATUS\.WAITING_PAYMENT/);
    assert.doesNotMatch(createBlock, /OrderModel\.create/);
});

test('edicao de cupom atualiza validade e limite de usos', () => {
    const source = readBackendFile('src/controllers/couponController.js');
    const updateBlock = extractBetween(source, /async update\(/, /async remove\(/);

    assert.match(updateBlock, /expires_at/);
    assert.match(updateBlock, /max_uses/);
    assert.match(updateBlock, /updateData\.expires_at\s*=\s*normalizeExpiresAt\(expires_at\)/);
    assert.match(updateBlock, /updateData\.max_uses\s*=\s*normalizeMaxUses\(max_uses\)/);
});

test('checkout incrementa uso de cupom com limite dentro da transacao do pedido', () => {
    const couponModel = readBackendFile('src/models/couponModel.js');
    const orderModel = readBackendFile('src/models/orderModel.js');
    const orderPricingService = readBackendFile('src/services/orderPricingService.js');
    const orderController = readBackendFile('src/controllers/orderController.js');
    const paymentController = readBackendFile('src/controllers/paymentController.js');
    const cartController = readBackendFile('src/controllers/cartController.js');
    const migration = readBackendFile('src/config/migrations.js');
    const createOrderServiceBlock = extractBetween(orderPricingService, /async function createOrderWithPricing/, /module\.exports/);

    assert.match(couponModel, /async incrementUses\(id,\s*queryRunner = db\)/);
    assert.match(couponModel, /COALESCE\(uses_count,\s*0\) \+ 1/);
    assert.match(couponModel, /max_uses IS NULL OR COALESCE\(uses_count,\s*0\) < max_uses/);
    assert.match(orderPricingService, /id:\s*coupon\.id/);
    assert.match(createOrderServiceBlock, /await client\.query\('BEGIN'\)/);
    assert.match(createOrderServiceBlock, /calculateOrderPricing\(items,\s*couponCode,\s*\{/);
    assert.match(createOrderServiceBlock, /lockRows:\s*true/);
    assert.match(createOrderServiceBlock, /decrementCheckoutStock\(client,\s*item\)/);
    assert.match(createOrderServiceBlock, /CouponModel\.incrementUses\(pricing\.appliedCoupon\.id,\s*client\)/);
    assert.match(createOrderServiceBlock, /Cupom expirado ou limite de usos atingido/);
    assert.match(createOrderServiceBlock, /await client\.query\('COMMIT'\)/);
    assert.match(createOrderServiceBlock, /await client\.query\('ROLLBACK'\)/);
    assert.match(orderModel, /createOrderWithPricing\(\{ userId, items, couponCode, status \}\)/);
    assert.match(orderController, /orderPricingService\.createOrderWithPricing/);
    assert.match(paymentController, /orderPricingService\.createOrderWithPricing/);
    assert.match(cartController, /orderPricingService\.calculateOrderPricing/);
    assert.match(migration, /UPDATE coupons SET uses_count = 0 WHERE uses_count IS NULL/);
});

test('carrinho persistido usa endpoints autenticados e banco por usuario', () => {
    const routes = readBackendFile('src/routes/cartRoutes.js');
    const controller = readBackendFile('src/controllers/cartController.js');
    const model = readBackendFile('src/models/cartModel.js');
    const sql = readBackendFile('database.sql');
    const migration = readBackendFile('src/config/migrations.js');
    const server = readBackendFile('server.js');
    const apiJs = readWorkspaceFile('frontend/js/api.js');
    const cartJs = readWorkspaceFile('frontend/js/cart.js');
    const productJs = readWorkspaceFile('frontend/js/product.js');
    const cartPageJs = readWorkspaceFile('frontend/js/cart-page.js');
    const checkoutHtml = readWorkspaceFile('frontend/checkout.html');
    const cartHtml = readWorkspaceFile('frontend/cart.html');
    const productHtml = readWorkspaceFile('frontend/product.html');
    const commonJs = readWorkspaceFile('frontend/js/common.js');
    const loginHtml = readWorkspaceFile('frontend/login.html');
    const registerHtml = readWorkspaceFile('frontend/register.html');
    const swagger = readBackendFile('src/config/swagger.js');

    assert.match(routes, /const \{ verifyToken \} = require\('\.\.\/middlewares\/authMiddleware'\)/);
    assert.match(routes, /router\.get\('\/cart',\s*verifyToken,\s*CartController\.getCart\)/);
    assert.match(routes, /router\.put\('\/cart\/items',\s*verifyToken,\s*CartController\.upsertItem\)/);
    assert.match(routes, /router\.delete\('\/cart\/items\/:productId',\s*verifyToken,\s*CartController\.removeItem\)/);
    assert.match(routes, /router\.delete\('\/cart',\s*verifyToken,\s*CartController\.clear\)/);
    assert.match(routes, /router\.post\('\/cart',\s*CartController\.checkout\)/);

    assert.match(controller, /CartModel\.findAllByUser\(req\.user\.id\)/);
    assert.match(controller, /CartModel\.upsert/);
    assert.match(controller, /CartModel\.remove/);
    assert.match(controller, /CartModel\.clear/);
    assert.match(controller, /orderPricingService\.calculateOrderPricing/);

    assert.match(model, /assertCanStoreCartItem/);
    assert.match(model, /available_stock/);
    assert.match(model, /ON CONFLICT \(user_id, product_id, size\)/);
    assert.match(model, /getProductSalePrice/);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS cart_items/);
    assert.match(sql, /UNIQUE\(user_id,\s*product_id,\s*size\)/);
    assert.match(sql, /idx_cart_items_user_id/);
    assert.match(migration, /CREATE TABLE IF NOT EXISTS cart_items/);
    assert.match(migration, /UNIQUE\(user_id,\s*product_id,\s*size\)/);
    assert.match(server, /CREATE TABLE IF NOT EXISTS cart_items/);

    assert.match(apiJs, /getCart:\s*\(\) => API\.request\('\/cart'\)/);
    assert.match(apiJs, /upsertCartItem:\s*\(item\) => API\.request\('\/cart\/items'/);
    assert.match(apiJs, /removeCartItem:\s*\(productId,\s*size = null\)/);
    assert.match(apiJs, /clearCart:\s*\(\) => API\.request\('\/cart'/);
    assert.match(cartJs, /async syncFromServer/);
    assert.match(cartJs, /async mergeGuestCartToCurrentUser/);
    assert.match(cartJs, /pushCartItemToServer/);
    assert.match(cartJs, /async addItemAndSync/);
    assert.match(cartJs, /await pushCartItemToServer\(item,\s*\{ throwOnError: true \}\)/);
    assert.match(cartJs, /removeCartItemFromServer/);
    assert.match(cartJs, /clearServerCart/);
    assert.match(productJs, /await Cart\.addItemAndSync\(productToAdd,\s*selectedSize,\s*quantity\)/);
    assert.match(productHtml, /js\/cart\.js\?v=6/);
    assert.match(productHtml, /js\/product\.js\?v=\d+/);
    assert.match(cartHtml, /js\/cart\.js\?v=6/);
    assert.match(cartPageJs, /await Cart\.syncFromServer\(\)/);
    assert.match(checkoutHtml, /await Cart\.syncFromServer\(\)/);
    assert.match(commonJs, /Cart\.syncFromServer\(\)\.catch/);
    assert.match(loginHtml, /await Cart\.mergeGuestCartToCurrentUser\(\)/);
    assert.match(registerHtml, /await Cart\.mergeGuestCartToCurrentUser\(\)/);
    assert.match(swagger, /name: 'Carrinho'/);
    assert.match(swagger, /'\/api\/cart'/);
    assert.match(swagger, /'\/api\/cart\/items'/);
    assert.match(swagger, /'\/api\/cart\/items\/\{productId\}'/);
});

test('busca de catalogo nao filtra marca/genero/lancamento/outlet no navegador', () => {
    const source = readWorkspaceFile('frontend/js/search.js');

    assert.doesNotMatch(source, /API\.listAllProducts\(/);
    assert.doesNotMatch(source, /needsClientSideFiltering/);
    assert.doesNotMatch(source, /productMatchesState/);
    assert.match(source, /return API\.search\(/);
});

test('publico infantil nao herda produtos unissex no menu e na busca', () => {
    const productModel = readBackendFile('src/models/productModel.js');
    const productController = readBackendFile('src/controllers/productController.js');
    const commonJs = readWorkspaceFile('frontend/js/common.js');

    assert.match(productController, /gender !== 'infantil' && row\.gender === 'unissex'/);
    assert.match(productModel, /normalizedGender === 'infantil'/);
    assert.match(productModel, /LOWER\(COALESCE\(gender, 'unissex'\)\) = \$\$\{i\}/);
    assert.match(commonJs, /gender !== 'infantil' && productGender === 'unissex'/);
    assert.match(commonJs, /primeSneaker:megaMenuFacets:v4/);
});

test('cupons e administradores so podem ser alterados por superadmin', () => {
    const couponRoutes = readBackendFile('src/routes/couponRoutes.js');
    const adminRoutes = readBackendFile('src/routes/adminRoutes.js');
    const middleware = readBackendFile('src/middlewares/authMiddleware.js');

    assert.match(middleware, /function requireSuperAdmin/);
    assert.match(couponRoutes, /router\.post\('\/coupons',\s*verifyToken,\s*requireSuperAdmin,\s*CouponController\.create\)/);
    assert.match(couponRoutes, /router\.put\('\/coupons\/:id',\s*verifyToken,\s*requireSuperAdmin,\s*CouponController\.update\)/);
    assert.match(couponRoutes, /router\.delete\('\/coupons\/:id',\s*verifyToken,\s*requireSuperAdmin,\s*CouponController\.remove\)/);
    assert.match(adminRoutes, /router\.post\('\/users',\s*verifyToken,\s*requireSuperAdmin,\s*UserController\.createAdmin\)/);
    assert.match(adminRoutes, /router\.put\('\/users\/:id',\s*verifyToken,\s*requireSuperAdmin,\s*UserController\.updateAdmin\)/);
    assert.match(adminRoutes, /router\.delete\('\/users\/:id',\s*verifyToken,\s*requireSuperAdmin,\s*UserController\.deleteAdmin\)/);
});

test('auditoria administrativa existe no banco, API e painel', () => {
    const sql = readBackendFile('database.sql');
    const app = readBackendFile('src/app.js');
    const adminJs = readWorkspaceFile('frontend/js/admin.js');
    const adminHtml = readWorkspaceFile('frontend/adm.html');

    assert.match(sql, /CREATE TABLE IF NOT EXISTS admin_audit_logs/);
    assert.match(app, /app\.use\('\/api\/admin-audit-logs',\s*adminAuditLogRoutes\)/);
    assert.match(adminJs, /function loadAuditLogs/);
    assert.match(adminHtml, /data-tab="audit-logs"/);
});

test('auditoria admin tem filtros e detalhes expansíveis', () => {
    const controller = readBackendFile('src/controllers/adminAuditLogController.js');
    const model = readBackendFile('src/models/adminAuditLogModel.js');
    const adminJs = readWorkspaceFile('frontend/js/admin.js');
    const adminHtml = readWorkspaceFile('frontend/adm.html');
    const adminCss = readWorkspaceFile('frontend/css/admin-panel.css');
    const apiJs = readWorkspaceFile('frontend/js/api.js');

    assert.match(controller, /normalizeAuditDate/);
    assert.match(controller, /dateFrom:\s*normalizeAuditDate\(req\.query\.dateFrom\)/);
    assert.match(controller, /dateTo:\s*normalizeAuditDate\(req\.query\.dateTo,\s*true\)/);
    assert.match(model, /created_at >=/);
    assert.match(model, /created_at </);
    assert.match(model, /admin_name ILIKE/);
    assert.match(model, /action =/);
    assert.match(model, /entity_type ILIKE/);
    assert.match(model, /details::text ILIKE/);
    assert.match(adminHtml, /id="audit-date-from"/);
    assert.match(adminHtml, /id="audit-admin-filter"/);
    assert.match(adminHtml, /id="audit-action-filter"/);
    assert.match(adminHtml, /id="audit-target-filter"/);
    assert.match(adminJs, /function setupAdminAuditFilters/);
    assert.match(adminJs, /function getAuditFilters/);
    assert.match(adminJs, /function resetAuditFilters/);
    assert.match(adminJs, /class="audit-details"/);
    assert.match(apiJs, /listAuditLogs:\s*\(auth,\s*params = 100\)/);
    assert.match(apiJs, /new URLSearchParams/);
    assert.match(adminCss, /\.admin-audit-toolbar/);
    assert.match(adminCss, /\.audit-details pre/);
});

test('auditoria admin usa paginacao de 10 em 10', () => {
    const controller = readBackendFile('src/controllers/adminAuditLogController.js');
    const model = readBackendFile('src/models/adminAuditLogModel.js');
    const adminJs = readWorkspaceFile('frontend/js/admin.js');
    const adminHtml = readWorkspaceFile('frontend/adm.html');

    assert.match(model, /async count\(/);
    assert.match(controller, /Number\(req\.query\.limit\) \|\| 10/);
    assert.match(controller, /AdminAuditLogModel\.count\(filters\)/);
    assert.match(controller, /pagination:\s*\{/);
    assert.match(adminJs, /let _adminAuditPage = 1/);
    assert.match(adminJs, /const ADMIN_AUDIT_PER_PAGE = 10/);
    assert.match(adminJs, /API\.listAuditLogs\(getAdminAuthHeader\(\),\s*\{\s*\.\.\.getAuditFilters\(\),\s*limit:\s*ADMIN_AUDIT_PER_PAGE,\s*offset:\s*\(_adminAuditPage - 1\) \* ADMIN_AUDIT_PER_PAGE/s);
    assert.match(adminJs, /renderAdminPagination\('audit-pagination',\s*pagination,\s*loadAuditLogs\)/);
    assert.match(adminHtml, /id="audit-pagination"/);
});

test('superadmin pode criar admin normal ou outro superadmin', () => {
    const controller = readBackendFile('src/controllers/userController.js');
    const model = readBackendFile('src/models/userModel.js');
    const adminJs = readWorkspaceFile('frontend/js/admin.js');
    const adminHtml = readWorkspaceFile('frontend/adm.html');
    const server = readBackendFile('server.js');
    const createAdminBlock = extractBetween(controller, /async createAdmin\(/, /async updateAdmin\(/);

    assert.match(createAdminBlock, /role,\s*isSuperAdmin,\s*is_super_admin/);
    assert.match(createAdminBlock, /role === 'superadmin'/);
    assert.match(createAdminBlock, /const normalizedEmail = String\(email \|\| ''\)\.trim\(\)\.toLowerCase\(\)/);
    assert.match(createAdminBlock, /const existing = await UserModel\.findByEmail\(normalizedEmail\)/);
    assert.match(createAdminBlock, /UserModel\.promoteToAdmin\(existingUser\.id/);
    assert.match(createAdminBlock, /err\.code === '23505'/);
    assert.doesNotMatch(createAdminBlock, /Email ja cadastrado/);
    assert.match(createAdminBlock, /isSuperAdmin:\s*shouldCreateSuperAdmin/);
    assert.match(model, /async promoteToAdmin\(id,\s*\{\s*name,\s*password,\s*isSuperAdmin = false\s*\}/);
    assert.match(model, /is_admin = TRUE/);
    assert.match(model, /is_super_admin = CASE WHEN is_super_admin = TRUE THEN TRUE ELSE \$3 END/);
    assert.match(adminHtml, /id="a-role"/);
    assert.match(adminJs, /isSuperAdmin:\s*role === 'superadmin'/);
    assert.match(server, /'admin@tenis\.com'/);
});

test('listagem de administradores nao envia clientes comuns', () => {
    const controller = readBackendFile('src/controllers/userController.js');
    const model = readBackendFile('src/models/userModel.js');
    const listAdminsBlock = extractBetween(controller, /async listAdmins\(/, /async createAdmin\(/);

    assert.match(listAdminsBlock, /UserModel\.findAdmins\(\)/);
    assert.doesNotMatch(listAdminsBlock, /UserModel\.findAll\(\)/);
    assert.match(model, /async findAdmins\(\)/);
    assert.match(model, /WHERE is_admin = TRUE/);
});

test('superadmin pode editar administradores e superadmins com senha opcional', () => {
    const controller = readBackendFile('src/controllers/userController.js');
    const model = readBackendFile('src/models/userModel.js');
    const adminJs = readWorkspaceFile('frontend/js/admin.js');
    const adminHtml = readWorkspaceFile('frontend/adm.html');
    const updateAdminBlock = extractBetween(controller, /async updateAdmin\(/, /async deleteAdmin\(/);

    assert.match(updateAdminBlock, /UserModel\.updateAdmin\(adminId/);
    assert.match(updateAdminBlock, /adminId === Number\(req\.user\.id\) && !shouldBeSuperAdmin/);
    assert.match(updateAdminBlock, /passwordHash = await bcrypt\.hash\(password,\s*10\)/);
    assert.match(updateAdminBlock, /action:\s*'admin\.update'/);
    assert.match(model, /async updateAdmin\(id,\s*\{\s*name,\s*email,\s*password,\s*isSuperAdmin\s*\}/);
    assert.match(model, /is_super_admin = \$3/);
    assert.match(adminHtml, /id="a-id"/);
    assert.match(adminHtml, /id="admin-form-submit"/);
    assert.match(adminJs, /function openAdminEditForm\(admin\)/);
    assert.match(adminJs, /method:\s*isEditing \? 'PUT' : 'POST'/);
    assert.match(adminJs, /if \(password\) body\.password = password/);
});

test('duplicidade de email retorna mensagem limpa', () => {
    const errorMiddleware = readBackendFile('src/middlewares/errorMiddleware.js');
    const adminJs = readWorkspaceFile('frontend/js/admin.js');

    assert.match(errorMiddleware, /err\.code === '23505'/);
    assert.match(errorMiddleware, /users_email/);
    assert.match(errorMiddleware, /error:\s*'Email ja cadastrado'/);
    assert.doesNotMatch(adminJs, /setAdminFormAlert\('Erro: ' \+ err\.message\)/);
});

test('JWT nao usa segredo previsivel e Basic Auth legado fica desativado por padrao', () => {
    const middleware = readBackendFile('src/middlewares/authMiddleware.js');
    const envExample = readBackendFile('.env.example');

    assert.doesNotMatch(middleware, /JWT_SECRET\s*=\s*process\.env\.JWT_SECRET\s*\|\|/);
    assert.match(middleware, /function requireStrongJwtSecret/);
    assert.match(middleware, /const MIN_JWT_SECRET_LENGTH = 32/);
    assert.match(middleware, /WEAK_JWT_SECRETS/);
    assert.match(middleware, /'sua_chave_secreta_aqui'/);
    assert.match(middleware, /'troque_por_uma_chave_aleatoria_com_no_minimo_32_caracteres'/);
    assert.match(middleware, /lowerSecret\.includes\('troque_por'\)/);
    assert.match(middleware, /function isLocalEnvironment/);
    assert.match(middleware, /process\.env\.ENABLE_BASIC_AUTH === 'true' && isLocalEnvironment\(\)/);
    assert.match(middleware, /function requireSafeBasicAuthConfig/);
    assert.match(middleware, /Basic Auth legado so pode ser habilitado em ambiente local/);
    assert.match(middleware, /Basic Auth desabilitado ou restrito ao ambiente local/);
    assert.match(middleware, /const MIN_BASIC_AUTH_PASSWORD_LENGTH = 16/);
    assert.doesNotMatch(envExample, /JWT_SECRET=(dev_secret|sua_chave_secreta_aqui|minha_chave_super_secreta_trocar_em_producao)/);
    assert.match(envExample, /ENABLE_BASIC_AUTH=false/);
    assert.match(envExample, /so aceita Basic Auth em NODE_ENV=development\/test\/local/);
    assert.doesNotMatch(envExample, /ADMIN_PASS=admin123/);
});

test('CORS usa whitelist e Swagger nao fica publico por padrao', () => {
    const app = readBackendFile('src/app.js');
    const envExample = readBackendFile('.env.example');
    const swaggerGuardIndex = app.indexOf('if (shouldExposeApiDocs())');
    const swaggerRouteIndex = app.indexOf("app.use('/api-docs'");

    assert.doesNotMatch(app, /app\.use\(cors\(\)\)/);
    assert.match(app, /function resolveAllowedCorsOrigins/);
    assert.match(app, /function validateCorsOrigins/);
    assert.match(app, /process\.env\.CORS_ORIGINS/);
    assert.match(app, /CORS_ORIGINS nao pode usar \* ou null/);
    assert.match(app, /CORS_ORIGINS precisa ser definido em producao/);
    assert.match(app, /Origem nao permitida pelo CORS/);
    assert.match(app, /function shouldExposeApiDocs/);
    assert.match(app, /if \(isProduction\(\)\) \{\s*return false;\s*\}/);
    assert.match(app, /process\.env\.ENABLE_API_DOCS === 'true'/);
    assert.ok(swaggerGuardIndex >= 0, 'Swagger precisa estar atras de uma flag');
    assert.ok(swaggerRouteIndex > swaggerGuardIndex, 'Rota /api-docs nao pode ser registrada antes da validacao da flag');
    assert.match(envExample, /CORS_ORIGINS=http:\/\/localhost:3000,http:\/\/127\.0\.0\.1:3000/);
    assert.match(envExample, /ENABLE_API_DOCS=false/);
});

test('Swagger documenta rotas operacionais de pedidos pagamentos wishlist enderecos e admin', () => {
    const swagger = readBackendFile('src/config/swagger.js');

    ['Pedidos', 'Pagamentos', 'Wishlist', 'Enderecos', 'Admin'].forEach(tag => {
        assert.match(swagger, new RegExp(`name: '${tag}'`));
    });

    [
        'CheckoutRequest',
        'CheckoutResponse',
        'PixInfo',
        'Order',
        'OrderItem',
        'Address',
        'WishlistItem',
        'AdminSession',
        'AdminAuditLog',
    ].forEach(schema => {
        assert.match(swagger, new RegExp(`${schema}: \\{`));
    });

    [
        '/api/payments/checkout',
        '/api/payments/pix/{orderId}',
        '/api/payments/confirm',
        '/api/orders/my-orders',
        '/api/orders/{id}',
        '/api/orders/admin/all',
        '/api/orders/{id}/status',
        '/api/wishlist',
        '/api/wishlist/add',
        '/api/wishlist/check',
        '/api/wishlist/count/total',
        '/api/addresses',
        '/api/addresses/{id}',
        '/api/addresses/{id}/default',
        '/api/admin/session',
        '/api/admin/users',
        '/api/admin-reports/order-notifications',
        '/api/admin-reports/low-stock',
        '/api/admin-audit-logs',
    ].forEach(route => {
        assert.match(swagger, new RegExp(`'${route.replace(/[{}]/g, '\\$&')}'`));
    });

    assert.match(swagger, /security: \[\{ bearerAuth: \[\] \}\]/);
    assert.match(swagger, /Apenas superadmin pode consultar auditoria/);
    assert.match(swagger, /Uso restrito a administradores/);
});

test('backend envia CSP e headers de seguranca contra XSS', () => {
    const app = readBackendFile('src/app.js');
    const securityHeaderIndex = app.indexOf('app.use(securityHeaders)');
    const corsIndex = app.indexOf('app.use(cors(corsOptions()))');

    assert.match(app, /function buildContentSecurityPolicy/);
    assert.match(app, /res\.setHeader\('Content-Security-Policy',\s*buildContentSecurityPolicy\(\)\)/);
    assert.match(app, /"default-src 'self'"/);
    assert.match(app, /"object-src 'none'"/);
    assert.match(app, /"base-uri 'self'"/);
    assert.match(app, /"frame-ancestors 'none'"/);
    assert.match(app, /"connect-src 'self' https:\/\/viacep\.com\.br https:\/\/brasilapi\.com\.br"/);
    assert.match(app, /res\.setHeader\('X-Content-Type-Options',\s*'nosniff'\)/);
    assert.match(app, /res\.setHeader\('Referrer-Policy',\s*'strict-origin-when-cross-origin'\)/);
    assert.match(app, /res\.setHeader\('X-Frame-Options',\s*'DENY'\)/);
    assert.ok(securityHeaderIndex >= 0, 'securityHeaders precisa ser registrado');
    assert.ok(securityHeaderIndex < corsIndex, 'headers de seguranca devem entrar antes das rotas');
});

test('perfil pedidos e wishlist escapam dados persistidos antes de usar innerHTML', () => {
    const profile = readWorkspaceFile('frontend/profile.html');
    const orders = readWorkspaceFile('frontend/orders.html');
    const wishlist = readWorkspaceFile('frontend/wishlist.html');
    const cartPage = readWorkspaceFile('frontend/js/cart-page.js');
    const checkout = readWorkspaceFile('frontend/checkout.html');
    const common = readWorkspaceFile('frontend/js/common.js');

    assert.match(common, /function escapeHTML/);
    assert.match(common, /function escapeJSString/);
    assert.match(common, /function safeHTML/);
    assert.match(common, /function setTextContent/);
    assert.match(common, /function setSafeHTML/);

    assert.match(profile, /function safeDisplay/);
    assert.match(profile, /safeDisplay\(userData\.name\)/);
    assert.match(profile, /safeDisplay\(userData\.email\)/);
    assert.match(profile, /safeDisplay\(addr\.street/);
    assert.match(profile, /escapeHTML\(addr\.complement\)/);
    assert.match(profile, /escapeHTML\(data\.error \|\| 'Erro ao salvar perfil'\)/);
    assert.doesNotMatch(profile, /\$\{userData\.(name|email|phone|cpf)\}/);
    assert.doesNotMatch(profile, /\$\{addr\.(street|number|city|state|cep)\}/);

    assert.match(orders, /escapeHTML\(getStatusLabel\(order\.status\)\)/);
    assert.match(orders, /escapeHTML\(item\.product_name \|\| 'Produto'\)/);
    assert.match(orders, /escapeHTML\(order\.coupon_code\)/);
    assert.doesNotMatch(orders, /\$\{item\.product_name\}/);
    assert.doesNotMatch(orders, /\$\{order\.coupon_code\}/);

    assert.match(wishlist, /safeImageSrc\(product\.image_url/);
    assert.match(wishlist, /escapeAttribute\(productImage\)/);
    assert.match(wishlist, /escapeHTML\(productName\)/);
    assert.match(wishlist, /escapeHTML\(product\.category \|\| 'Sem categoria'\)/);
    assert.match(wishlist, /wishlistList\.addEventListener\('click'/);
    assert.doesNotMatch(wishlist, /onclick="addToCartFromWishlist/);
    assert.doesNotMatch(wishlist, /onclick="openRemoveFavoriteModal/);
    assert.doesNotMatch(wishlist, /\$\{product\.(name|category|image_url|stock)\}/);

    assert.match(cartPage, /function renderSafeDeliveryAddress/);
    assert.match(cartPage, /escapeHTML\(data\.logradouro/);
    assert.match(cartPage, /display\.textContent = String\(saved\.address \|\| ''\)/);
    assert.match(cartPage, /escapeHTML\(couponMessage\)/);
    assert.match(cartPage, /safeImageSrc\(item\.image_url/);
    assert.match(cartPage, /escapeHTML\(item\.name \|\| 'Produto'\)/);
    assert.match(cartPage, /escapeJSString\(item\.size \|\| ''\)/);
    assert.doesNotMatch(cartPage, /display\.innerHTML = saved\.address/);
    assert.doesNotMatch(cartPage, /\$\{item\.name\}/);
    assert.doesNotMatch(cartPage, /\$\{item\.image_url \|\|/);
    assert.doesNotMatch(cartPage, /\$\{couponMessage\}/);

    assert.match(checkout, /emailDiv\.textContent = user\.email \|\| ''/);
    assert.match(checkout, /safeImageSrc\(pixData\.qrCode/);
    assert.match(checkout, /escapeHTML\(pixCode\)/);
    assert.match(checkout, /escapeHTML\(item\.name \|\| 'Produto'\)/);
    assert.match(checkout, /escapeAttribute\(safeImageSrc\(item\.image_url/);
    assert.match(checkout, /escapeHTML\(appliedCoupon\.code\)/);
    assert.match(checkout, /escapeHTML\(err\.message\)/);
    assert.doesNotMatch(checkout, /emailDiv\.innerHTML/);
    assert.doesNotMatch(checkout, /\$\{pixCode\}/);
    assert.doesNotMatch(checkout, /\$\{item\.name\}/);
});

test('Pix usa configuracao por ambiente e nao chave fixa no codigo', () => {
    const pixService = readBackendFile('src/services/pixService.js');
    const checkout = readWorkspaceFile('frontend/checkout.html');
    const envExample = readBackendFile('.env.example');

    assert.match(pixService, /getRequiredPixEnv\('PIX_KEY'\)/);
    assert.match(pixService, /process\.env\.PIX_MERCHANT_NAME/);
    assert.match(pixService, /process\.env\.PIX_MERCHANT_CITY/);
    assert.doesNotMatch(pixService, /chave:\s*['"][0-9]{11,14}['"]/);
    assert.doesNotMatch(checkout, /pix-key-display[^<]*>\d{11,14}</);
    assert.doesNotMatch(checkout, /const key = ['"][^'"]+['"];/);
    assert.match(checkout, /pixData\.copiaECola/);
    assert.match(checkout, /function mostrarPaginaPagamentoPix/);
    assert.match(checkout, /requestAnimationFrame\(\(\) => \{/);
    assert.match(checkout, /window\.scrollTo\(\{\s*top:\s*0,\s*left:\s*0,\s*behavior:\s*'auto'\s*\}\)/);
    assert.match(envExample, /^PIX_KEY=sua_chave_pix_aqui$/m);
    assert.doesNotMatch(envExample, /PIX_KEY=\d{11,14}/);
});

test('previa PIX nao cria pedido antes da confirmacao do cliente', () => {
    const routes = readBackendFile('src/routes/paymentRoutes.js');
    const paymentController = readBackendFile('src/controllers/paymentController.js');
    const checkout = readWorkspaceFile('frontend/checkout.html');
    const previewBlock = extractBalancedBlock(paymentController, /async previewPix\(/);
    const processPaymentBlock = extractBalancedBlock(checkout, /async function processPayment\(/);
    const confirmPixBlock = extractBalancedBlock(checkout, /async function irParaWhatsAppComProvante\(/);
    const createOrderBlock = extractBalancedBlock(checkout, /async function createOrder\(/);

    assert.match(routes, /router\.post\('\/pix-preview',\s*verifyToken,\s*PaymentController\.previewPix\)/);
    assert.match(previewBlock, /orderPricingService\.calculateOrderPricing\(items,\s*couponCode\)/);
    assert.match(previewBlock, /pixService\.generateQRCode\(pricing\.total/);
    assert.doesNotMatch(previewBlock, /createOrderWithPricing|OrderModel\.create|PixTransactionModel\.create|incrementUses|decrementCheckoutStock/);
    assert.match(checkout, /fetch\('\/api\/payments\/pix-preview'/);
    assert.match(processPaymentBlock, /window\._pixData\s*=\s*await gerarPixPreviewBackend\(\)/);
    assert.doesNotMatch(processPaymentBlock, /const\s+okPix\s*=\s*await criarPedidoBackend\(\)/);
    assert.match(confirmPixBlock, /const\s+okPix\s*=\s*await criarPedidoBackend\(\)/);
    assert.match(checkout, /function sairDoPixParaHome\(\)/);
    assert.match(checkout, /window\._checkoutAddress\s*=\s*endereco/);
    assert.match(checkout, /function getCheckoutAddressForOrder\(\)/);
    assert.match(createOrderBlock, /const addressData = getCheckoutAddressForOrder\(\)/);
    assert.doesNotMatch(createOrderBlock, /document\.getElementById\('checkout-cep'\)\.value/);
});

test('home e busca exibem avaliacoes reais vindas do backend', () => {
    const productModel = readBackendFile('src/models/productModel.js');
    const commonJs = readWorkspaceFile('frontend/js/common.js');
    const homeJs = readWorkspaceFile('frontend/js/home.js');
    const searchJs = readWorkspaceFile('frontend/js/search.js');

    assert.match(productModel, /AVG\(r\.rating\)::numeric/);
    assert.match(productModel, /AS average_rating/);
    assert.match(productModel, /AS total_reviews/);
    assert.match(commonJs, /function renderProductReviewSummary/);
    assert.match(commonJs, /average_rating/);
    assert.match(commonJs, /total_reviews/);
    assert.match(homeJs, /renderProductReviewSummary\(p\)/);
    assert.match(searchJs, /renderProductReviewSummary\(p\)/);
    assert.doesNotMatch(homeJs, /Math\.random/);
    assert.doesNotMatch(searchJs, /Math\.random/);
});

test('home usa imagens reais do catalogo nos cards de categoria', () => {
    const homeHtml = readWorkspaceFile('frontend/index.html');
    const homeJs = readWorkspaceFile('frontend/js/home.js');
    const style = readWorkspaceFile('frontend/css/style.css');

    assert.match(homeHtml, /data-category-card="esportivo"/);
    assert.match(homeHtml, /data-category-card="casual"/);
    assert.match(homeHtml, /data-category-card="formal"/);
    assert.match(homeHtml, /data-category-card="trekking"/);
    assert.match(homeHtml, /js\/home\.js\?v=\d+/);
    assert.match(homeJs, /function loadHomeCategoryCards|loadHomeCategoryCards/);
    assert.match(homeJs, /API\.search\(\{[\s\S]*categoria:\s*category[\s\S]*limit:\s*12/);
    assert.match(homeJs, /String\(item\?\.gender \|\| 'unissex'\)\.toLowerCase\(\) !== 'infantil'/);
    assert.match(homeJs, /setCategoryCardImage\(card,\s*imageUrl\)/);
    assert.match(homeJs, /has-product-image/);
    assert.doesNotMatch(style, /images\.unsplash\.com\/photo-1542291026/);
    assert.doesNotMatch(style, /images\.unsplash\.com\/photo-1525966222134/);
});

test('troca de senha busca hash sem expor password no perfil publico', () => {
    const userModel = readBackendFile('src/models/userModel.js');
    const userController = readBackendFile('src/controllers/userController.js');
    const findByIdBlock = extractBetween(userModel, /async findById\(id\)/, /async findAuthById\(id\)/);
    const findAuthBlock = extractBetween(userModel, /async findAuthById\(id\)/, /async create\(/);
    const updateProfileBlock = extractBetween(userController, /async updateProfile\(/, /async getProfile\(/);

    assert.doesNotMatch(findByIdBlock, /password/);
    assert.match(findAuthBlock, /SELECT id, password FROM users WHERE id = \$1/);
    assert.doesNotMatch(userModel, /findPasswordById/);
    assert.match(updateProfileBlock, /UserModel\.findAuthById\(userId\)/);
    assert.match(updateProfileBlock, /bcrypt\.compare\(currentPassword,\s*authUser\.password\)/);
    assert.doesNotMatch(updateProfileBlock, /bcrypt\.compare\(currentPassword,\s*user\.password\)/);
});

test('pedido usa o mesmo preco promocional do carrinho para produtos outlet', () => {
    const cartController = readBackendFile('src/controllers/cartController.js');
    const orderPricingService = readBackendFile('src/services/orderPricingService.js');
    const productPricingService = readBackendFile('src/services/productPricingService.js');
    const orderLoopBlock = extractBetween(orderPricingService, /for \(const \[idx, item\] of normalizeCheckoutItems\(items\)\.entries\(\)\)/, /subtotal = Number/);

    assert.match(productPricingService, /function getProductSalePrice/);
    assert.match(productPricingService, /discount_percent/);
    assert.match(productPricingService, /Number\(\(price \* \(1 - discount \/ 100\)\)\.toFixed\(2\)\)/);
    assert.match(cartController, /orderPricingService\.calculateOrderPricing/);
    assert.doesNotMatch(cartController, /getProductSalePrice/);
    assert.doesNotMatch(cartController, /ProductModel/);
    assert.doesNotMatch(cartController, /CouponModel/);
    assert.doesNotMatch(cartController, /OrderModel/);
    assert.match(orderPricingService, /getProductSalePrice/);
    assert.match(orderLoopBlock, /const price = getProductSalePrice\(product\)/);
    assert.match(orderLoopBlock, /discount_percent: getProductDiscountPercent\(product\)/);
    assert.doesNotMatch(orderLoopBlock, /const price = Number\(product\.price\)/);
});

test('painel admin valida token no backend antes de renderizar areas sensiveis', () => {
    const app = readBackendFile('src/app.js');
    const emailService = readBackendFile('src/services/emailService.js');
    const adminRoutes = readBackendFile('src/routes/adminRoutes.js');
    const userController = readBackendFile('src/controllers/userController.js');
    const adminJs = readWorkspaceFile('frontend/js/admin.js');
    const admHtml = readWorkspaceFile('frontend/adm.html');
    const adminLoginHtml = readWorkspaceFile('frontend/admin-login.html');
    const adminHtml = readWorkspaceFile('frontend/admin.html');
    const adminIndexHtml = readWorkspaceFile('frontend/admin/index.html');
    const verifyIndex = adminJs.indexOf('await verifyAdminSession();');
    const showPanelIndex = adminJs.indexOf('showPanel();', verifyIndex);

    assert.match(app, /app\.get\(\['\/admin',\s*'\/admin\/'\]/);
    assert.match(app, /res\.redirect\(302,\s*'\/admin-login\.html'\)/);
    assert.match(adminHtml, /window\.location\.replace\('admin-login\.html'\)/);
    assert.match(adminHtml, /http-equiv="refresh" content="0; url=admin-login\.html"/);
    assert.match(adminIndexHtml, /window\.location\.replace\('\/admin-login\.html'\)/);
    assert.match(adminIndexHtml, /http-equiv="refresh" content="0; url=\/admin-login\.html"/);
    assert.doesNotMatch(adminHtml, /404|P.gina N.o Encontrada|index\.html/);
    assert.match(emailService, /const adminPanelUrl = `\$\{baseUrl\}\/admin`/);
    assert.doesNotMatch(emailService, /https:\/\/localhost:3000\/admin\.html/);
    assert.match(adminRoutes, /router\.get\('\/session',\s*verifyToken,\s*UserController\.adminSession\)/);
    assert.match(userController, /async adminSession\(/);
    assert.match(userController, /UserModel\.findById\(req\.user\.id\)/);
    assert.match(userController, /!user\.is_admin/);
    assert.match(adminJs, /function setVerifiedAdminUser/);
    assert.match(adminJs, /async function verifyAdminSession/);
    assert.match(adminJs, /API\.request\('\/admin\/session'/);
    assert.match(adminJs, /is_admin === true \|\| user\.isAdmin === true/);
    assert.ok(verifyIndex >= 0, 'painel precisa validar a sessao no backend');
    assert.ok(showPanelIndex > verifyIndex, 'showPanel precisa acontecer depois de verifyAdminSession');
    assert.doesNotMatch(adminJs, /if\s*\(!adminToken\s*\|\|\s*!adminUser\)/);
    assert.doesNotMatch(adminJs, /if\s*\(!\(user\.is_admin/);
    assert.doesNotMatch(admHtml, /if\s*\(!adminToken\s*\|\|\s*!adminUser\)/);
    assert.match(adminLoginHtml, /fetch\('\/api\/admin\/session'/);
    assert.doesNotMatch(adminLoginHtml, /adminUser\s*&&\s*adminUser\.is_admin/);
    assert.doesNotMatch(adminLoginHtml, /Notifications\.error/);
    assert.doesNotMatch(adminLoginHtml, /js\/notifications\.js/);
    assert.match(adminLoginHtml, /alert\.scrollIntoView\(\{\s*block:\s*'nearest'/);
});

test('frontend expoe aliases de URL pedidos no enunciado', () => {
    const app = readBackendFile('src/app.js');
    const productHtml = readWorkspaceFile('frontend/product.html');
    const productJs = readWorkspaceFile('frontend/js/product.js');
    const searchJs = readWorkspaceFile('frontend/js/search.js');
    const commonJs = readWorkspaceFile('frontend/js/common.js');

    assert.match(app, /app\.get\(\['\/busca',\s*'\/busca\/'\]/);
    assert.match(app, /sendFrontendPage\(res,\s*'search\.html'\)/);
    assert.match(app, /app\.get\(\['\/carrinho',\s*'\/carrinho\/'\]/);
    assert.match(app, /sendFrontendPage\(res,\s*'cart\.html'\)/);
    assert.match(app, /app\.get\(\['\/p\/:slug\/:id',\s*'\/p\/:id'\]/);
    assert.match(app, /sendFrontendPage\(res,\s*'product\.html'\)/);
    assert.match(productHtml, /<base href="\/" \/>/);
    assert.match(productJs, /function getProductIdFromUrl\(/);
    assert.match(productJs, /parts\[0\] !== 'p'/);
    assert.match(searchJs, /params\.get\('query'\)/);
    assert.match(searchJs, /params\.get\('cat'\)/);
    assert.match(commonJs, /function buildProductUrl\(/);
    assert.match(commonJs, /return `\/busca/);
    assert.match(commonJs, /href="\/carrinho"/);
});

test('painel admin nao carrega Chart.js de CDN sem pinning local', () => {
    const admHtml = readWorkspaceFile('frontend/adm.html');
    const simpleChart = readWorkspaceFile('frontend/js/simple-chart.js');
    const adminJs = readWorkspaceFile('frontend/js/admin.js');

    assert.doesNotMatch(admHtml, /https:\/\/cdn\.jsdelivr\.net\/npm\/chart\.js/);
    assert.doesNotMatch(admHtml, /<script[^>]+https?:\/\//);
    assert.match(admHtml, /<script src="js\/simple-chart\.js\?v=1"><\/script>/);
    assert.match(simpleChart, /class SimpleChart/);
    assert.match(simpleChart, /window\.Chart = SimpleChart/);
    assert.match(adminJs, /new Chart\(ctxMonthly/);
    assert.match(adminJs, /new Chart\(ctxProducts/);
});

test('admin pedidos usa paginacao de 10 em 10 no painel', () => {
    const adminJs = readWorkspaceFile('frontend/js/admin.js');
    const adminHtml = readWorkspaceFile('frontend/adm.html');
    const orderController = readBackendFile('src/controllers/orderController.js');
    const orderModel = readBackendFile('src/models/orderModel.js');

    assert.match(adminJs, /const ADMIN_ORDERS_PER_PAGE = 10/);
    assert.match(adminJs, /page:\s*String\(_adminOrdersPage\)/);
    assert.match(adminJs, /limit:\s*String\(ADMIN_ORDERS_PER_PAGE\)/);
    assert.match(adminJs, /const search = document\.getElementById\('pedidos-search'\)/);
    assert.match(adminJs, /params\.set\('q', search\)/);
    assert.match(adminJs, /function setOrderStatusFilter/);
    assert.match(adminJs, /function clearOrderFilters/);
    assert.match(adminJs, /function renderAdminOrdersPagination/);
    assert.match(adminJs, /class="admin-order-card/);
    assert.match(adminJs, /confirm-modal-details/);
    assert.match(orderController, /const q = req\.query\.q \|\| req\.query\.search \|\| ''/);
    assert.match(orderController, /OrderModel\.findAllForAdmin\(\{ status, q, page, limit \}\)/);
    assert.match(orderModel, /LOWER\(COALESCE\(u\.name/);
    assert.match(orderModel, /o\.id =/);
    assert.match(adminHtml, /id="pedidos-pagination"/);
    assert.match(adminHtml, /id="pedidos-search"/);
    assert.match(adminHtml, /admin-order-status-chips/);
});

test('admin carrega dados pesados apenas quando a aba correspondente abre', () => {
    const adminJs = readWorkspaceFile('frontend/js/admin.js');
    const adminHtml = readWorkspaceFile('frontend/adm.html');
    const showPanelBlock = extractBetween(adminJs, /function showPanel\(\)/, /function updateSizeInputsFromField/);
    const showTabBlock = extractBetween(adminJs, /function showTab\(tabName\)/, /\/\* ============================================================\s+Gerenciamento de Pedidos/);

    assert.doesNotMatch(showPanelBlock, /loadProducts\(\)/);
    assert.doesNotMatch(showPanelBlock, /loadCoupons\(\)/);
    assert.doesNotMatch(showPanelBlock, /loadNewsletterSubscribers\(\)/);
    assert.doesNotMatch(showPanelBlock, /loadDashboard\(\)/);
    assert.match(showPanelBlock, /showTab\('dashboard'\)/);
    assert.match(showPanelBlock, /loadOrderNotifications\(\{ silent: true \}\)/);
    assert.match(showPanelBlock, /setupOrderNotificationPolling\(\)/);
    assert.match(adminJs, /let _adminPanelInitialized = false/);
    assert.match(adminJs, /let _orderNotificationPollingStarted = false/);
    assert.match(adminJs, /const _adminLoadedTabs = new Set\(\)/);
    assert.match(adminJs, /function loadAdminTabOnDemand/);
    assert.match(showTabBlock, /tabName === 'products'[\s\S]*loadAdminTabOnDemand\(tabName,\s*loadProducts\)/);
    assert.match(showTabBlock, /tabName === 'coupons'[\s\S]*loadAdminTabOnDemand\(tabName,\s*loadCoupons\)/);
    assert.match(showTabBlock, /tabName === 'promocoes'[\s\S]*loadAdminTabOnDemand\(tabName,\s*loadNewsletterSubscribers\)/);
    assert.match(showTabBlock, /tabName === 'dashboard'[\s\S]*loadAdminTabOnDemand\(tabName,[\s\S]*loadDashboard/);
    assert.match(adminHtml, /<button data-tab="products"/);
    assert.match(adminHtml, /<div id="tab-products" class="is-hidden">/);
});

test('dashboard admin tem periodo, chips de status e destaque de pagamento', () => {
    const adminHtml = readWorkspaceFile('frontend/adm.html');
    const adminJs = readWorkspaceFile('frontend/js/admin.js');
    const adminReports = readBackendFile('src/controllers/adminReportController.js');
    const adminRoutes = readBackendFile('src/routes/adminReportRoutes.js');
    const reports = readBackendFile('src/controllers/reportController.js');
    const orderModel = readBackendFile('src/models/orderModel.js');

    assert.match(adminHtml, /id="dashboard-start-date"/);
    assert.match(adminHtml, /id="dashboard-end-date"/);
    assert.match(adminHtml, /data-dashboard-period="30d"/);
    assert.match(adminHtml, /id="status-chip-awaiting"/);
    assert.match(adminHtml, /id="pending-orders-section"/);
    assert.match(adminJs, /function setDashboardPeriod/);
    assert.match(adminJs, /function buildDashboardQuery/);
    assert.match(adminJs, /function renderPendingPaymentOrders/);
    assert.match(adminJs, /order-status-summary/);
    assert.match(adminReports, /getOrderStatusSummary/);
    assert.match(adminReports, /getDateRangeFromQuery/);
    assert.match(adminRoutes, /\/order-status-summary/);
    assert.match(reports, /OrderModel\.getTotalSales\(dateRange\)/);
    assert.match(orderModel, /appendDateRangeFilters/);
});

test('carrinho le cupom antes de renderizar a tela novamente', () => {
    const source = readWorkspaceFile('frontend/js/cart-page.js');
    const recalcBlock = extractBetween(source, /async function recalc\(/, /function renderPage\(/);
    const readIndex = recalcBlock.indexOf("document.getElementById('coupon-input')");
    const renderIndex = recalcBlock.indexOf('renderPage();');

    assert.notEqual(readIndex, -1);
    assert.notEqual(renderIndex, -1);
    assert.ok(readIndex < renderIndex, 'cupom precisa ser lido antes de renderPage recriar o input');
    assert.match(recalcBlock, /API\.checkout\(items,\s*couponCode\s*\|\|\s*undefined\)/);
});

test('admin produtos e cupons usam paginacao de 10 em 10', () => {
    const productController = readBackendFile('src/controllers/productController.js');
    const couponController = readBackendFile('src/controllers/couponController.js');
    const productModel = readBackendFile('src/models/productModel.js');
    const couponModel = readBackendFile('src/models/couponModel.js');
    const adminJs = readWorkspaceFile('frontend/js/admin.js');
    const adminHtml = readWorkspaceFile('frontend/adm.html');

    assert.match(productModel, /async findAllPaginated/);
    assert.match(couponModel, /async findAllPaginated/);
    assert.match(productController, /ProductModel\.findAllPaginated/);
    assert.match(couponController, /CouponModel\.findAllPaginated/);
    assert.match(adminJs, /const ADMIN_PRODUCTS_PER_PAGE = 10/);
    assert.match(adminJs, /const ADMIN_COUPONS_PER_PAGE = 10/);
    assert.match(adminJs, /API\.listAllProducts\(\{\s*page:\s*_adminProductsPage,\s*limit:\s*ADMIN_PRODUCTS_PER_PAGE/s);
    assert.match(adminJs, /API\.listCoupons\(getAdminAuthHeader\(\),\s*\{\s*page:\s*_adminCouponsPage,\s*limit:\s*ADMIN_COUPONS_PER_PAGE/s);
    assert.match(adminJs, /const allProducts = Array\.isArray\(response\) \? response : null/);
    assert.match(adminJs, /const allCoupons = Array\.isArray\(response\) \? response : null/);
    assert.match(adminJs, /allProducts\.slice\(\(_adminProductsPage - 1\) \* ADMIN_PRODUCTS_PER_PAGE/);
    assert.match(adminJs, /allCoupons\.slice\(\(_adminCouponsPage - 1\) \* ADMIN_COUPONS_PER_PAGE/);
    assert.match(adminHtml, /id="products-pagination"/);
    assert.match(adminHtml, /id="coupons-pagination"/);
});

test('estoque de produtos no admin usa soma real por tamanho', () => {
    const productModel = readBackendFile('src/models/productModel.js');
    const productController = readBackendFile('src/controllers/productController.js');
    const adminJs = readWorkspaceFile('frontend/js/admin.js');

    assert.match(productModel, /SELECT SUM\(ps\.stock\)::int/);
    assert.match(productModel, /AS stock/);
    assert.match(productModel, /NULLIF\(TRIM\(COALESCE\(products\.sizes, ''\)\), ''\) IS NULL/);
    assert.match(productController, /const totalStock = stock !== undefined \? Number\(stock\) : 0/);
    assert.match(productController, /stock:\s*totalStock/);
    assert.match(productController, /Math\.floor\(totalStock \/ sizeList\.length\)/);
    assert.match(adminJs, /stock:\s*sizeStocks\.reduce\(\(sum,\s*s\) => sum \+ s\.stock,\s*0\),/);
    assert.doesNotMatch(adminJs, /sizeStocks\.reduce\(\(sum,\s*s\) => sum \+ s\.stock,\s*0\) \|\| 10/);
});

test('admin produtos tem drawer, filtros e ordenacao server-side', () => {
    const productController = readBackendFile('src/controllers/productController.js');
    const productModel = readBackendFile('src/models/productModel.js');
    const adminJs = readWorkspaceFile('frontend/js/admin.js');
    const adminHtml = readWorkspaceFile('frontend/adm.html');
    const adminCss = readWorkspaceFile('frontend/css/admin-panel.css');

    assert.match(adminHtml, /id="admin-product-search"/);
    assert.match(adminHtml, /id="admin-product-category"/);
    assert.match(adminHtml, /id="admin-product-brand"/);
    assert.match(adminHtml, /id="admin-product-outlet"/);
    assert.match(adminHtml, /id="admin-product-launch"/);
    assert.match(adminHtml, /id="admin-product-sort"/);
    assert.match(adminHtml, /id="product-form-backdrop"/);
    assert.match(adminHtml, /admin-product-drawer/);
    assert.match(adminHtml, /admin-product-form-section/);
    assert.doesNotMatch(adminHtml, /Use o mesmo grupo/);
    assert.match(adminJs, /function getAdminProductFilters/);
    assert.match(adminJs, /\.\.\.getAdminProductFilters\(\)/);
    assert.match(adminJs, /function applyAdminProductFilters/);
    assert.match(adminJs, /function resetAdminProductFilters/);
    assert.match(adminJs, /function closeProductForm/);
    assert.match(adminCss, /\.admin-product-drawer/);
    assert.match(adminCss, /\.admin-product-form-section/);
    assert.match(productController, /query:\s*req\.query\.q \|\| req\.query\.query/);
    assert.match(productController, /sortBy:\s*req\.query\.sortBy \|\| 'recent'/);
    assert.match(productModel, /price_asc/);
    assert.match(productModel, /price_desc/);
    assert.match(productModel, /stock_asc/);
    assert.match(productModel, /stock_desc/);
});

test('produto suporta variacoes de cor agrupadas por modelo', () => {
    const productController = readBackendFile('src/controllers/productController.js');
    const productModel = readBackendFile('src/models/productModel.js');
    const validators = readBackendFile('src/utils/validators.js');
    const sql = readBackendFile('database.sql');
    const migration = readBackendFile('src/config/migrations.js');
    const server = readBackendFile('server.js');
    const adminJs = readWorkspaceFile('frontend/js/admin.js');
    const adminHtml = readWorkspaceFile('frontend/adm.html');
    const productJs = readWorkspaceFile('frontend/js/product.js');
    const style = readWorkspaceFile('frontend/css/style.css');

    assert.match(sql, /model_group VARCHAR\(120\)/);
    assert.match(sql, /idx_products_model_group_lower/);
    assert.match(migration, /ADD COLUMN IF NOT EXISTS model_group VARCHAR\(120\)/);
    assert.match(server, /ADD COLUMN IF NOT EXISTS model_group VARCHAR\(120\)/);
    assert.match(validators, /isValidModelGroup/);
    assert.match(productModel, /function getComparableModelName/);
    assert.match(productModel, /function areSameModelVariants/);
    assert.match(productModel, /async findColorVariants\(product\)/);
    assert.match(productModel, /LOWER\(TRIM\(model_group\)\) = LOWER\(TRIM\(\$\$\{params\.length\}\)\)/);
    assert.match(productModel, /LOWER\(TRIM\(name\)\) = LOWER\(TRIM\(\$\$\{nameParam\}\)\)/);
    assert.match(productModel, /lookupTerms = getModelLookupTerms\(product\)/);
    assert.match(productModel, /areSameModelVariants\(product,\s*row\)/);
    assert.match(productModel, /variantsByColor/);
    assert.doesNotMatch(productModel, /knownFamilies/);
    assert.match(productModel, /model_group/);
    assert.doesNotMatch(productModel, /catalogModelKeySql/);
    assert.doesNotMatch(productModel, /variant_rank = 1/);
    assert.match(productModel, /SELECT COUNT\(\*\) FROM products \$\{whereSql\}/);
    assert.match(productController, /product\.color_variants = await ProductModel\.findColorVariants\(product\)/);
    assert.match(productController, /function normalizeModelGroupInput/);
    assert.match(productController, /model_group:\s*normalizeModelGroupInput\(model_group,\s*name\)/);
    assert.match(productController, /data\.model_group = normalizeModelGroupInput\(req\.body\.model_group,\s*data\.name \|\| existing\.name\)/);
    assert.match(migration, /SET model_group = TRIM\(name\)/);
    assert.match(adminHtml, /id="p-model-group"/);
    assert.match(adminJs, /document\.getElementById\('p-model-group'\)\.value = p\.model_group \|\| ''/);
    assert.match(adminJs, /model_group:\s*document\.getElementById\('p-model-group'\)\.value\.trim\(\)/);
    assert.match(productJs, /function renderColorVariants/);
    assert.match(productJs, /function buildProductGalleryImages/);
    assert.match(productJs, /images\.slice\(0,\s*4\)/);
    assert.match(style, /\.pdp-gallery\.is-grid/);
    assert.match(style, /\.pdp-gallery-tile/);
    assert.match(productJs, /function openProductImageLightbox/);
    assert.match(productJs, /function toggleProductImageLightboxZoom/);
    assert.match(productJs, /data-lightbox-zoom/);
    assert.match(productJs, /transformOrigin = `\$\{x\}% \$\{y\}%`/);
    assert.match(productJs, /product-image-lightbox/);
    assert.match(productJs, /openProductImageLightbox\(Number\(tile\.dataset\.imageIndex\)/);
    assert.match(style, /\.pdp-gallery-tile::before/);
    assert.match(style, /cursor:\s*zoom-in/);
    assert.match(style, /\.product-image-lightbox/);
    assert.match(style, /\.product-image-lightbox\.is-zoomed \.product-image-lightbox-dialog img/);
    assert.match(style, /body\.product-lightbox-open/);
    assert.match(productJs, /product\?\.color_variants/);
    assert.match(productJs, /Cores e modelos/);
    assert.match(productJs, /Cor selecionada/);
    assert.match(style, /\.pdp-color-variants/);
    assert.match(style, /\.pdp-color-variant\.is-active/);
});

test('admin permite upload local de fotos de produtos', () => {
    const app = readBackendFile('src/app.js');
    const productController = readBackendFile('src/controllers/productController.js');
    const productImageModel = readBackendFile('src/models/productImageModel.js');
    const productRoutes = readBackendFile('src/routes/productRoutes.js');
    const apiJs = readWorkspaceFile('frontend/js/api.js');
    const adminJs = readWorkspaceFile('frontend/js/admin.js');
    const adminHtml = readWorkspaceFile('frontend/adm.html');
    const adminCss = readWorkspaceFile('frontend/css/admin-panel.css');
    const productFormSubmitBlock = extractBetween(adminJs, /document\.getElementById\('product-form'\)\.addEventListener\('submit'/, /document\.getElementById\('p-description'\)\?\.addEventListener/);

    assert.match(app, /express\.json\(\{\s*limit:\s*'8mb'\s*\}\)/);
    assert.match(app, /app\.use\('\/uploads',\s*express\.static\(uploadsPath\)\)/);
    assert.match(productController, /MAX_UPLOAD_IMAGE_BYTES = 5 \* 1024 \* 1024/);
    assert.match(productController, /MAX_PRODUCT_IMAGES = 4/);
    assert.match(productController, /ProductImageModel\.countByProduct/);
    assert.match(productImageModel, /async countByProduct/);
    assert.match(productController, /function parseUploadedImage/);
    assert.match(productController, /function assertImageSignature/);
    assert.match(productController, /'uploads', 'products'/);
    assert.match(productController, /await fs\.writeFile\(fullPath,\s*buffer\)/);
    assert.match(productController, /async uploadImage\(req,\s*res,\s*next\)/);
    assert.match(productRoutes, /router\.post\('\/products\/images\/upload',\s*basicAuthAdmin,\s*ProductController\.uploadImage\)/);
    assert.match(apiJs, /uploadProductImage/);
    assert.match(adminHtml, /id="p-image-file"/);
    assert.match(adminHtml, /id="gallery-new-file"/);
    assert.match(adminHtml, /id="photo-add-panel"/);
    assert.match(adminHtml, /id="product-form-alert"/);
    assert.match(adminHtml, /id="p-description"[^>]*maxlength="500"/);
    assert.match(adminHtml, /id="p-description-count"/);
    assert.doesNotMatch(adminHtml, /id="gallery-new-file"[^>]*multiple/);
    assert.match(adminJs, /function uploadLocalProductImage/);
    assert.match(adminJs, /function setProductFormAlert/);
    assert.match(adminJs, /function updateProductDescriptionCount/);
    assert.match(adminJs, /A descri\\u00e7\\u00e3o tem/);
    assert.match(adminJs, /setProductFormAlert\(err\.message/);
    assert.doesNotMatch(productFormSubmitBlock, /toast\('Erro:/);
    assert.doesNotMatch(productFormSubmitBlock, /toast\('Adicione tamanhos/);
    assert.doesNotMatch(productFormSubmitBlock, /toast\(`O produto pode ter/);
    assert.match(productFormSubmitBlock, /setProductFormAlert\('Adicione tamanhos e estoque antes de criar o produto\.'/);
    assert.match(productFormSubmitBlock, /setProductFormAlert\(`O produto pode ter no máximo/);
    assert.match(adminJs, /function clearProductPhotoState/);
    assert.match(adminJs, /mainImageInput\.value = ''/);
    assert.match(adminJs, /mainImageInput\.defaultValue = ''/);
    assert.match(adminJs, /clearProductPhotoState\(\);[\s\S]*document\.getElementById\('product-form-title'\)\.textContent = 'Cadastrar novo/);
    assert.match(adminJs, /MAX_PRODUCT_IMAGES = 4/);
    assert.match(adminJs, /function savePendingGalleryImages/);
    assert.match(adminJs, /API\.uploadProductImage/);
    assert.match(adminJs, /addProductPhotoFromCurrentInput/);
    assert.match(adminJs, /addGalleryImageFromFile/);
    assert.match(adminJs, /_isProductFormSaving/);
    assert.match(adminJs, /if \(_isProductFormSaving\) return/);
    assert.match(adminJs, /setProductFormSaving\(true\)/);
    assert.match(adminJs, /finally\s*{\s*setProductFormSaving\(false\)/);
    assert.match(adminJs, /function formatAdminCategoryLabel/);
    assert.match(adminJs, /Casual[\s\S]*Esportivo[\s\S]*Formal[\s\S]*Trekking/);
    assert.match(adminJs, /admin-product-name-cell/);
    assert.match(adminJs, /admin-category-pill/);
    assert.match(adminCss, /\.admin-image-upload-row/);
    assert.match(adminCss, /\.admin-form-feedback/);
    assert.match(adminCss, /\.admin-field-hint\.is-danger/);
    assert.match(adminCss, /\.admin-file-input/);
    assert.match(adminCss, /\.admin-product-form\.is-saving/);
    assert.match(adminCss, /#products-table \.admin-product-name[\s\S]*overflow-wrap:\s*anywhere/);
    assert.match(adminCss, /\.admin-category-casual[\s\S]*\.admin-category-esportivo[\s\S]*\.admin-category-formal[\s\S]*\.admin-category-trekking/);
});

test('exclusao de produto usa modal de confirmacao visual', () => {
    const adminJs = readWorkspaceFile('frontend/js/admin.js');
    const adminCss = readWorkspaceFile('frontend/css/admin-panel.css');
    const productModel = readBackendFile('src/models/productModel.js');
    const productController = readBackendFile('src/controllers/productController.js');
    const migration = readBackendFile('src/config/migrations.js');
    const server = readBackendFile('server.js');
    const deleteProductBlock = extractBetween(adminJs, /async function deleteProduct\(id\)/, /\/\* ============================================================\s+Promo/);

    assert.match(deleteProductBlock, /showConfirmModal\(/);
    assert.match(deleteProductBlock, /Excluir produto/);
    assert.match(deleteProductBlock, /Essa a\\u00e7\\u00e3o remove o produto do cat\\u00e1logo/);
    assert.match(deleteProductBlock, /danger:\s*true/);
    assert.doesNotMatch(deleteProductBlock, /confirm\(/);
    assert.match(deleteProductBlock, /toast\(response\.message \|\| 'Produto exclu\\u00eddo!'/);
    assert.match(productModel, /ALTER TABLE products ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP|archived_at IS NULL/);
    assert.match(productModel, /SELECT EXISTS \(SELECT 1 FROM order_items WHERE product_id = \$1\) AS has_orders/);
    assert.match(productModel, /SET archived_at = CURRENT_TIMESTAMP/);
    assert.match(productModel, /RETURNING id, TRUE AS archived/);
    assert.match(productController, /Produto arquivado e removido do catalogo/);
    assert.match(migration, /ALTER TABLE products ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP/);
    assert.match(server, /ALTER TABLE products ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP/);
    assert.match(adminCss, /\.confirm-modal-content\.is-danger-confirm h3/);
    assert.match(adminCss, /\.confirm-modal-content\.is-danger-confirm \.confirm-modal-details/);
});

test('frontend nao usa notificacoes flutuantes e bloqueia duplo clique no carrinho', () => {
    const notifications = readWorkspaceFile('frontend/js/notifications.js');
    const apiJs = readWorkspaceFile('frontend/js/api.js');
    const commonJs = readWorkspaceFile('frontend/js/common.js');
    const productJs = readWorkspaceFile('frontend/js/product.js');
    const style = readWorkspaceFile('frontend/css/style.css');

    assert.doesNotMatch(notifications, /position:\s*fixed|top:\s*90px|right:\s*20px/);
    assert.match(notifications, /document\.getElementById\('toast-container'\)\?\.remove\(\)/);
    assert.match(notifications, /id = 'site-feedback'/);
    assert.match(notifications, /site-feedback-message/);
    assert.match(apiJs, /document\.getElementById\('site-feedback'\)/);
    assert.match(commonJs, /document\.getElementById\('site-feedback'\)/);
    assert.match(productJs, /let cartActionLocked = false/);
    assert.match(productJs, /if \(cartActionLocked\) return false/);
    assert.match(productJs, /setProductActionButtonsBusy\(true\)/);
    assert.match(productJs, /releaseCartActionLock\(\)/);
    assert.match(style, /\.pdp-modern-details \.btn-buy:disabled/);
});

test('admin cupons tem drawer, validacao inline e badges de status', () => {
    const adminJs = readWorkspaceFile('frontend/js/admin.js');
    const adminHtml = readWorkspaceFile('frontend/adm.html');
    const adminCss = readWorkspaceFile('frontend/css/admin-panel.css');

    assert.match(adminHtml, /id="coupon-form-backdrop"/);
    assert.match(adminHtml, /admin-coupon-drawer/);
    assert.match(adminHtml, /onclick="openCouponCreateForm\(\)"/);
    assert.match(adminHtml, /id="c-code-error"/);
    assert.match(adminHtml, /id="c-discount-error"/);
    assert.match(adminJs, /function setupCouponFormEnhancements/);
    assert.match(adminJs, /function validateCouponForm/);
    assert.match(adminJs, /normalizeCouponCodeInput\(\)/);
    assert.match(adminJs, /coupon-status-badge/);
    assert.match(adminCss, /\.admin-coupon-drawer/);
    assert.match(adminCss, /\.admin-field-error/);
    assert.match(adminCss, /\.coupon-status-badge\.is-expired/);
});

test('promocoes newsletter envia para inscritos com preview destinatarios e confirmacao', () => {
    const adminJs = readWorkspaceFile('frontend/js/admin.js');
    const adminHtml = readWorkspaceFile('frontend/adm.html');
    const adminCss = readWorkspaceFile('frontend/css/admin-panel.css');
    const emailService = readBackendFile('src/services/emailService.js');

    assert.match(adminHtml, /id="promo-recipient-count"/);
    assert.match(adminHtml, /id="promotion-preview"/);
    assert.match(adminHtml, />Enviar para inscritos<\/button>/);
    assert.doesNotMatch(adminHtml, /promo-test-email|btn-send-promo-test|Email para teste|Enviar teste|A&ccedil;&atilde;o sens&iacute;vel|Ação sensível/);
    assert.match(adminJs, /function setupPromotionFormEnhancements/);
    assert.match(adminJs, /function updatePromotionPreview/);
    assert.doesNotMatch(adminJs, /function sendPromotionTest|btn-send-promo-test|promo-test-email/);
    assert.match(adminJs, /showConfirmModal\(/);
    assert.match(adminJs, /_newsletterActiveCount <= 0/);
    assert.match(emailService, /function escapeEmailHtml/);
    assert.match(adminCss, /\.admin-promotion-layout/);
    assert.match(adminCss, /\.admin-promotion-preview-card/);
    assert.doesNotMatch(adminCss, /admin-promotion-test-button|admin-promotion-safety/);
});

test('newsletter publica mostra confirmacao inline ao inscrever', () => {
    const indexHtml = readWorkspaceFile('frontend/index.html');
    const style = readWorkspaceFile('frontend/css/style.css');
    const newsletterRoutes = readBackendFile('src/routes/newsletterRoutes.js');
    const newsletterBlock = extractBetween(indexHtml, /async function inscreverNewsletter/, /<\/script>/);

    assert.match(indexHtml, /id="newsletter-feedback"/);
    assert.match(indexHtml, /aria-live="polite"/);
    assert.match(newsletterBlock, /already_subscribed:\s*'Inscri\\u00e7\\u00e3o j\\u00e1 feita! Voc\\u00ea j\\u00e1 receber\\u00e1 os e-mails das promo\\u00e7\\u00f5es\.'/);
    assert.match(newsletterBlock, /feedback\.textContent = messages\[data\.status\] \|\| messages\.subscribed/);
    assert.match(newsletterBlock, /feedback\.classList\.add\('is-success'\)/);
    assert.match(newsletterBlock, /feedback\.classList\.add\('is-error'\)/);
    assert.doesNotMatch(newsletterBlock, /Notifications\.(success|error)/);
    assert.match(newsletterRoutes, /SELECT id,\s*active[\s\S]*FROM newsletter_subscribers[\s\S]*WHERE email = \$1/);
    assert.match(newsletterRoutes, /status:\s*'already_subscribed'/);
    assert.match(newsletterRoutes, /Inscricao ja feita\. Voce ja recebera os emails das promocoes\./);
    assert.match(style, /\.newsletter-feedback\.is-success/);
    assert.match(style, /\.newsletter-feedback\.is-error/);
});

test('admin clientes tem busca resumo e atalho para historico de pedidos', () => {
    const adminJs = readWorkspaceFile('frontend/js/admin.js');
    const adminHtml = readWorkspaceFile('frontend/adm.html');
    const adminCss = readWorkspaceFile('frontend/css/admin-panel.css');

    assert.match(adminHtml, /id="customers-total-spent"/);
    assert.match(adminHtml, /id="customers-average-spent"/);
    assert.match(adminHtml, /id="admin-customer-search"/);
    assert.match(adminHtml, /id="admin-customer-sort"/);
    assert.match(adminHtml, /hist&oacute;rico de pedidos/);
    assert.match(adminJs, /function setupAdminCustomerFilters/);
    assert.match(adminJs, /function renderCustomerSummary/);
    assert.match(adminJs, /function renderClientesTable/);
    assert.match(adminJs, /function openCustomerOrderHistory/);
    assert.match(adminJs, /pedidos-search/);
    assert.match(adminJs, /_adminLoadedTabs\.delete\('pedidos'\)/);
    assert.match(adminCss, /\.admin-customers-toolbar/);
    assert.match(adminCss, /\.admin-client-orders-btn/);
});

test('painel admin associa labels aos campos para leitores de tela', () => {
    const adminJs = readWorkspaceFile('frontend/js/admin.js');
    const adminHtml = readWorkspaceFile('frontend/adm.html');
    const adminCss = readWorkspaceFile('frontend/css/admin-panel.css');

    assert.doesNotMatch(adminHtml, /<label\b(?![^>]*\bfor=)/);
    assert.doesNotMatch(adminJs, /<label\b(?![^>]*\bfor=)/);
    assert.match(adminHtml, /<label for="adm-email">/);
    assert.match(adminHtml, /<label for="p-name">/);
    assert.match(adminHtml, /<label for="promo-subject">/);
    assert.match(adminHtml, /<label for="audit-action-filter">/);
    assert.match(adminHtml, /role="group" aria-labelledby="product-flags-label"/);
    assert.match(adminHtml, /role="group" aria-labelledby="size-stock-label"/);
    assert.match(adminJs, /label for="\$\{escapeAttribute\(inputId\)\}"/);
    assert.match(adminCss, /\.form-group \.admin-field-label/);
});

test('painel admin tem foco visivel global para navegacao por teclado', () => {
    const adminHtml = readWorkspaceFile('frontend/adm.html');
    const adminCss = readWorkspaceFile('frontend/css/admin-panel.css');

    assert.match(adminHtml, /admin-panel\.css\?v=36/);
    assert.match(adminCss, /--admin-focus-color/);
    assert.match(adminCss, /--admin-focus-shadow/);
    assert.match(adminCss, /\.admin-sidebar button,[\s\S]*\.admin-table-wrapper,[\s\S]*\.admin-pagination button,[\s\S]*\.confirm-btn-no[\s\S]*:focus-visible/);
    assert.match(adminCss, /outline:\s*3px solid var\(--admin-focus-color\)/);
    assert.match(adminCss, /box-shadow:\s*0 0 0 6px var\(--admin-focus-shadow\)/);
    assert.match(adminCss, /\.admin-table-wrapper:focus:not\(:focus-visible\)/);
    assert.match(adminCss, /\[data-theme="dark"\]\s*\{[\s\S]*--admin-focus-color:\s*#60a5fa/);
});

test('painel admin usa paleta operacional recomendada', () => {
    const adminHtml = readWorkspaceFile('frontend/adm.html');
    const adminCss = readWorkspaceFile('frontend/css/admin-panel.css');
    const adminJs = readWorkspaceFile('frontend/js/admin.js');

    assert.match(adminHtml, /admin-panel\.css\?v=36/);
    assert.match(adminHtml, /js\/admin\.js\?v=\d+/);
    assert.match(adminJs, /primeSneaker:megaMenuFacets:v4/);
    assert.match(adminCss, /--admin-bg:\s*#F5F7FA/);
    assert.match(adminCss, /--admin-surface:\s*#FFFFFF/);
    assert.match(adminCss, /--admin-sidebar:\s*#0F172A/);
    assert.match(adminCss, /--admin-text:\s*#111827/);
    assert.match(adminCss, /--admin-muted:\s*#64748B/);
    assert.match(adminCss, /--admin-primary:\s*#2563EB/);
    assert.match(adminCss, /--admin-brand:\s*#D6B23E/);
    assert.match(adminCss, /--admin-success:\s*#15803D/);
    assert.match(adminCss, /--admin-warning:\s*#B45309/);
    assert.match(adminCss, /--admin-danger:\s*#DC2626/);
    assert.match(adminCss, /body\[data-page="admin"\][\s\S]*background:\s*var\(--admin-bg\)/);
    assert.match(adminCss, /body\[data-page="admin"\] \.admin-sidebar[\s\S]*background:\s*var\(--admin-sidebar\)/);
    assert.match(adminCss, /body\[data-page="admin"\] \.admin-sidebar button:hover,[\s\S]*background:\s*var\(--admin-primary\)/);
    assert.match(adminCss, /body\[data-page="admin"\] \.admin-dashboard-hero h2,[\s\S]*color:\s*#FFFFFF/);
    assert.match(extractBetween(adminCss, /\.admin-products-toolbar\s*\{/, /\n\}/), /grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(min\(168px,\s*100%\),\s*1fr\)\)/);
    assert.match(extractBetween(adminCss, /\.admin-audit-toolbar\s*\{/, /\n\}/), /grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(min\(168px,\s*100%\),\s*1fr\)\)/);
    assert.match(extractBetween(adminCss, /\.admin-products-toolbar-actions\s*\{/, /\n\}/), /flex-wrap:\s*wrap/);
    assert.match(extractBetween(adminCss, /\.admin-audit-toolbar-actions\s*\{/, /\n\}/), /flex-wrap:\s*wrap/);
    assert.match(adminJs, /aguardando_pagamento:[\s\S]*color:\s*'#B45309'/);
    assert.match(adminJs, /enviado:[\s\S]*color:\s*'#2563EB'/);
    assert.match(adminJs, /entregue:[\s\S]*color:\s*'#15803D'/);
    assert.doesNotMatch(adminJs, /#2196F3|#28a745|#fd7e14|#d97706/);
});

test('dourado nao e usado como texto pequeno em fundo claro', () => {
    const style = readWorkspaceFile('frontend/css/style.css');
    const cartJs = readWorkspaceFile('frontend/js/cart-page.js');
    const adminJs = readWorkspaceFile('frontend/js/admin.js');
    const indexHtml = readWorkspaceFile('frontend/index.html');
    const productHtml = readWorkspaceFile('frontend/product.html');
    const cartHtml = readWorkspaceFile('frontend/cart.html');

    assert.match(style, /--accent-contrast:\s*#111111/);
    assert.match(extractBetween(style, /\.pdp \.price\s*\{/, /\n\}/), /color:\s*var\(--accent-text\)/);
    assert.match(extractBetween(style, /\.guest-cart-total\s*\{/, /\n\}/), /color:\s*var\(--accent-text\)/);
    assert.match(extractBetween(style, /\.cart-item \.price\s*\{/, /\n\}/), /color:\s*var\(--accent-text\)/);
    assert.match(style, /\.form-footer a \{ color:\s*var\(--accent-text\); font-weight:\s*700; \}/);
    assert.match(extractBetween(style, /\.pagination button\.active\s*\{/, /\n\}/), /color:\s*var\(--accent-contrast\)/);
    assert.match(extractBetween(style, /\n\.btn-primary\s*\{/, /\n\}/), /color:\s*var\(--accent-contrast\)/);
    assert.match(extractBetween(style, /\.btn-checkout\s*\{/, /\n\}/), /color:\s*var\(--accent-contrast\)/);
    assert.match(style, /#btn-wishlist\s*\{[\s\S]*?color:\s*var\(--accent-contrast\) !important/);
    assert.doesNotMatch(cartJs, /background:\s*var\(--accent\);\s*color:\s*(white|#fff)/);
    assert.doesNotMatch(cartJs, /color:\s*var\(--accent\)/);
    assert.doesNotMatch(adminJs, /color:\s*var\(--accent\);\s*font-size/);
    assert.match(indexHtml, /css\/style\.css\?v=35/);
    assert.match(productHtml, /css\/style\.css\?v=38/);
    assert.match(cartHtml, /css\/style\.css\?v=32/);
});

test('vermelho de perigo tem contraste AA com texto branco', () => {
    const style = readWorkspaceFile('frontend/css/style.css');
    const adminCss = readWorkspaceFile('frontend/css/admin-panel.css');
    const wishlistHtml = readWorkspaceFile('frontend/wishlist.html');
    const checkoutHtml = readWorkspaceFile('frontend/checkout.html');
    const adminJs = readWorkspaceFile('frontend/js/admin.js');
    const frontendSources = [
        style,
        adminCss,
        wishlistHtml,
        checkoutHtml,
        adminJs,
        readWorkspaceFile('frontend/js/home.js'),
        readWorkspaceFile('frontend/js/product.js'),
        readWorkspaceFile('frontend/js/search.js'),
        readWorkspaceFile('frontend/js/wishlist.js'),
        readWorkspaceFile('frontend/forgot-password.html'),
    ].join('\n');

    assert.ok(contrastRatio('#DC2626', '#FFFFFF') >= 4.5);
    assert.match(style, /--danger:\s*#DC2626/);
    assert.match(adminCss, /--admin-danger-rgb:\s*220,\s*38,\s*38/);
    assert.match(extractBetween(adminCss, /\.admin-status-chip\.is-awaiting strong\s*\{/, /\n\}/), /background:\s*var\(--danger\)/);
    assert.match(extractBetween(adminCss, /#coupons-table \.btn-delete\s*\{/, /\n\}/), /background:\s*var\(--danger\)/);
    assert.match(extractBetween(adminCss, /\.admin-order-action\.is-canceled\s*\{/, /\n\}/), /background:\s*var\(--danger\)/);
    assert.doesNotMatch(frontendSources, /#e74c3c|#dc3545|#DC3545|rgba?\(231,\s*76,\s*60/i);
});

test('azul informativo tem contraste AA com texto branco', () => {
    const style = readWorkspaceFile('frontend/css/style.css');
    const adminLoginHtml = readWorkspaceFile('frontend/admin-login.html');
    const frontendSources = [
        style,
        adminLoginHtml,
    ].join('\n');

    assert.ok(contrastRatio('#1D4ED8', '#FFFFFF') >= 4.5);
    assert.match(extractBetween(style, /\.toast\.info\s*\{/, /\n\}/), /background:\s*#1D4ED8/);
    assert.match(adminLoginHtml, /--accent:\s*#1D4ED8/);
    assert.doesNotMatch(frontendSources, /#3b82f6|rgba?\(59,\s*130,\s*246/i);
});

test('recuperacao admin so redefine senha de admin ou superadmin', () => {
    const authRoutes = readWorkspaceFile('backend/src/routes/authRoutes.js');
    const authController = readWorkspaceFile('backend/src/controllers/authController.js');
    const emailService = readWorkspaceFile('backend/src/services/emailService.js');
    const userModel = readWorkspaceFile('backend/src/models/userModel.js');
    const adminLoginHtml = readWorkspaceFile('frontend/admin-login.html');
    const adminResetHtml = readWorkspaceFile('frontend/admin-reset-password.html');

    assert.match(authRoutes, /router\.post\('\/admin\/forgot-password',\s*AuthController\.forgotAdminPassword\)/);
    assert.match(authRoutes, /router\.get\('\/admin\/verify-reset-token',\s*AuthController\.verifyAdminResetToken\)/);
    assert.match(authRoutes, /router\.get\('\/admin\/verify-reset-token\/:token',\s*AuthController\.verifyAdminResetToken\)/);
    assert.match(authRoutes, /router\.post\('\/admin\/reset-password',\s*AuthController\.resetAdminPassword\)/);
    assert.match(authController, /function isAdminAccount\(user\)[\s\S]*user\.is_admin === true \|\| user\.is_super_admin === true/);
    assert.match(authController, /function normalizeResetToken\(token\)/);
    assert.match(authController, /async forgotAdminPassword\(req,\s*res,\s*next\)[\s\S]*if \(isAdminAccount\(user\)\)[\s\S]*sendAdminPasswordResetEmail\(user,\s*resetToken\)/);
    assert.match(authController, /async verifyAdminResetToken\(req,\s*res,\s*next\)[\s\S]*findAdminByResetToken\(token\)/);
    assert.match(authController, /async resetAdminPassword\(req,\s*res,\s*next\)[\s\S]*findAdminByResetToken\(token\)/);
    assert.match(userModel, /reset_token_expires = NOW\(\) \+ \(\$2::int \* INTERVAL '1 millisecond'\)/);
    assert.doesNotMatch(userModel, /new Date\(Date\.now\(\) \+ expiresIn\)/);
    assert.match(emailService, /admin-reset-password\.html\?token=\$\{encodeURIComponent\(resetToken\)\}/);
    assert.match(adminLoginHtml, /id="admin-recovery-form"/);
    assert.match(adminLoginHtml, /fetch\('\/api\/admin\/forgot-password'/);
    assert.match(adminResetHtml, /fetch\(`\/api\/admin\/verify-reset-token\?token=\$\{encodeURIComponent\(token\)\}`\)/);
    assert.match(adminResetHtml, /fetch\('\/api\/admin\/reset-password'/);
});

test('frontend esta salvo em UTF-8 sem textos quebrados', () => {
    const decoder = new TextDecoder('utf-8', { fatal: true });
    const files = listWorkspaceFiles('frontend', ['.html', '.js', '.css']);
    const suspiciousMojibake = /Ã¡|Ã©|Ã­|Ã³|Ãº|Ã£|Ãµ|Ã§|Ãª|Ã¢|Ã´|Ã‡|Ã‰|Ãš|Ã“|â€”|â€“|â€|â„¢|â˜|â­|â|ðŸ|�/;
    const brokenQuestionIcon = /\?\s+(Link|Voc(?:ê|&ecirc;)|Na|Sem|Acompanhado|Editar|Pagamento|Pedido|Frete|PIX|Como|Finalizar|Enviar|Escaneie|Copiar|Copiado|Dados|Cupom|Senha|Aguardando|Processando|<strong>)/;
    const brokenQuestionPlaceholder = /class="(?:blog-card-image|card-icon|favorite-modal-icon)">\?{1,2}<\/div>|close(?:Address|Order)Modal\(\)[^>]*>\?<\/button>|(?:erro|sucesso):\s*'\?'|textContent\s*=\s*'\?[^']*'|FRETE GRÁTIS\s*\?\?/;
    const brokenQuestionInText = /[A-Za-zÀ-ÖØ-öø-ÿ]\?[A-Za-zÀ-ÖØ-öø-ÿ]|\?s\b|\?CONES|Ol\?!/;

    for (const file of files) {
        const bytes = fs.readFileSync(file);
        const source = decoder.decode(bytes);
        assert.doesNotMatch(source, suspiciousMojibake, `Texto com mojibake em ${file}`);
        assert.doesNotMatch(source, brokenQuestionIcon, `Icone quebrado com '?' em ${file}`);
        assert.doesNotMatch(source, brokenQuestionPlaceholder, `Placeholder quebrado com '?' em ${file}`);
        source.split(/\r?\n/).forEach((line, index) => {
            const isCodeOrUrl =
                /https?:\/\//.test(line) ||
                /\?[A-Za-z0-9_-]+=/.test(line) ||
                /[.?]\?\.|[?\w]\?\?/.test(line) ||
                /\?\s*:/.test(line) ||
                /\?\s*(await|new|JSON|document|window|Number|String|Array|Date|false|true|null|undefined|[A-Za-z_$][\w$]*\.)/.test(line);
            if (!isCodeOrUrl) {
                assert.doesNotMatch(line, brokenQuestionInText, `Texto com '?' quebrado em ${file}:${index + 1}`);
            }
        });
    }
});

test('checkout aponta termos e condicoes para a pagina correta', () => {
    const checkout = readWorkspaceFile('frontend/checkout.html');

    assert.match(checkout, /href="termos-de-uso\.html"[^>]*>termos e condições<\/a>/);
    assert.doesNotMatch(checkout, /href="#"[^>]*>termos e condições<\/a>/);
});

test('admin estoque lista todos os produtos com severidade ordenacao e paginacao', () => {
    const adminReportController = readBackendFile('src/controllers/adminReportController.js');
    const productController = readBackendFile('src/controllers/productController.js');
    const productSizeModel = readBackendFile('src/models/productSizeModel.js');
    const adminJs = readWorkspaceFile('frontend/js/admin.js');
    const adminHtml = readWorkspaceFile('frontend/adm.html');
    const adminCss = readWorkspaceFile('frontend/css/admin-panel.css');

    assert.match(adminReportController, /criticalThreshold/);
    assert.match(adminReportController, /includeAll/);
    assert.match(adminReportController, /json_agg/);
    assert.match(adminReportController, /stock_by_size/);
    assert.match(adminReportController, /p\.sizes/);
    assert.match(adminReportController, /CASE\s+WHEN stock <= \$2 THEN 'critical'/);
    assert.match(adminReportController, /severity:\s*'severity_rank ASC, stock ASC, name ASC'/);
    assert.match(adminReportController, /LIMIT \$3 OFFSET \$4/);
    assert.match(adminReportController, /pagination:\s*\{/);
    assert.match(adminReportController, /severity:\s*\{/);
    assert.match(productSizeModel, /async removeSizesNotIn/);
    assert.match(productSizeModel, /DELETE FROM product_sizes/);
    assert.match(productController, /ProductSizeModel\.removeSizesNotIn\(id,\s*stocks\.map\(item => item\.size\)\)/);
    assert.match(productController, /clearProductFacetsCache\(\);/);
    assert.match(adminHtml, /id="stock-critical-count"/);
    assert.match(adminHtml, /id="stock-attention-count"/);
    assert.match(adminHtml, /id="stock-ok-count"/);
    assert.match(adminHtml, /id="admin-stock-sort"/);
    assert.match(adminHtml, /id="estoque-pagination"/);
    assert.match(adminHtml, /Por tamanho/);
    assert.match(adminHtml, /value="stock_asc">Menor estoque primeiro/);
    assert.match(adminJs, /let _adminStockPage = 1/);
    assert.match(adminJs, /const ADMIN_STOCK_PER_PAGE = 10/);
    assert.match(adminJs, /function getStockSeverityMeta/);
    assert.match(adminJs, /function renderEstoqueTable/);
    assert.match(adminJs, /function renderStockBySize/);
    assert.match(adminJs, /function hydrateStockItemsWithSizes/);
    assert.match(adminJs, /function parseAdminJsonArray/);
    assert.match(adminJs, /\/api\/products\/\$\{product\.id\}\/size-stock/);
    assert.match(adminJs, /stock_by_size/);
    assert.match(adminJs, /stock-size-pill/);
    assert.match(adminJs, /Sem tamanhos cadastrados/);
    assert.match(adminJs, /Estoque n\u00e3o separado por tamanho/);
    assert.doesNotMatch(adminJs, /Sem grade/);
    assert.match(adminJs, /function updateStockSummary/);
    assert.match(adminJs, /all:\s*'1'/);
    assert.match(adminJs, /sortBy,/);
    assert.match(adminJs, /renderAdminPagination\('estoque-pagination'/);
    assert.match(adminJs, /stock-severity-badge/);
    assert.match(adminCss, /\.admin-stock-toolbar/);
    assert.match(adminCss, /\.stock-size-list/);
    assert.match(adminCss, /\.stock-size-pill/);
    assert.match(adminCss, /\.stock-size-note/);
    assert.match(adminCss, /\.stock-size-pill\.is-untracked/);
    assert.match(adminCss, /#estoque-report-table \.stock-row\.is-ok/);
    assert.match(adminCss, /\.stock-severity-badge\.is-critical/);
    assert.match(adminCss, /\.stock-severity-badge\.is-attention/);
    assert.match(adminCss, /\.stock-severity-badge\.is-ok/);
});

test('performance publica usa imagens lazy, facets cacheadas e wishlist em lote', () => {
    const productRoutes = readBackendFile('src/routes/productRoutes.js');
    const productController = readBackendFile('src/controllers/productController.js');
    const productModel = readBackendFile('src/models/productModel.js');
    const wishlistRoutes = readBackendFile('src/routes/wishlistRoutes.js');
    const wishlistController = readBackendFile('src/controllers/wishlistController.js');
    const wishlistModel = readBackendFile('src/models/wishlistModel.js');
    const apiJs = readWorkspaceFile('frontend/js/api.js');
    const commonJs = readWorkspaceFile('frontend/js/common.js');
    const wishlistJs = readWorkspaceFile('frontend/js/wishlist.js');
    const homeJs = readWorkspaceFile('frontend/js/home.js');
    const searchJs = readWorkspaceFile('frontend/js/search.js');
    const productJs = readWorkspaceFile('frontend/js/product.js');

    assert.match(productRoutes, /router\.get\('\/products\/facets',\s*ProductController\.facets\)/);
    assert.match(productController, /PRODUCT_FACETS_CACHE_MS/);
    assert.match(productController, /ProductModel\.getMenuFacets/);
    assert.match(productController, /Cache-Control/);
    assert.match(productController, /function splitProductSizes/);
    assert.match(productController, /function sortSizes/);
    assert.match(productController, /sizes:\s*availableSizes/);
    assert.match(productModel, /async getMenuFacets/);
    assert.match(productModel, /json_agg\(ps\.size ORDER BY/);
    assert.match(productModel, /REPLACE\(ps\.size, ',', '\.'\)::numeric/);
    assert.match(productModel, /ps\.stock > 0/);
    assert.match(productModel, /EXISTS \(\s*SELECT 1\s*FROM product_sizes ps/s);
    assert.match(productModel, /ps\.size = \$\$\{i\}/);
    assert.match(productModel, /NOT EXISTS \(\s*SELECT 1\s*FROM product_sizes ps_any/s);
    assert.match(apiJs, /getProductFacets:\s*\(\) => API\.request\(`\/products\/facets\?refresh=1&ts=\$\{Date\.now\(\)\}`\)/);
    assert.match(commonJs, /MEGA_MENU_FACETS_CACHE_KEY/);
    assert.match(commonJs, /primeSneaker:megaMenuFacets:v4/);
    assert.match(commonJs, /MEGA_MENU_FACETS_CACHE_MS = 0/);
    assert.match(commonJs, /await API\.getProductFacets\(\)/);
    assert.doesNotMatch(commonJs, /fetch\('\/api\/products'\)/);
    assert.match(commonJs, /id="mega-size-grid"/);
    assert.match(commonJs, /function normalizeMenuSizes/);
    assert.match(commonJs, /function renderMegaSizeLinks/);
    assert.match(commonJs, /const sizes = Array\.isArray\(facets\.sizes\) \? facets\.sizes : \[\]/);
    assert.match(commonJs, /renderMegaSizeLinks\(sizes\)/);
    assert.doesNotMatch(commonJs, /\['34','35','36','37','38','39','40','41','42','43','44','45'\]/);
    assert.match(commonJs, /function startPagesAtTop/);
    assert.match(commonJs, /scrollRestoration = 'manual'/);
    assert.match(commonJs, /window\.location\.hash/);
    assert.match(commonJs, /window\.scrollTo\(0,\s*0\)/);

    assert.match(wishlistRoutes, /router\.get\('\/check',\s*verifyToken,\s*WishlistController\.checkManyFavorites\)/);
    assert.match(wishlistController, /async checkManyFavorites/);
    assert.match(wishlistModel, /async findFavoriteProductIds/);
    assert.match(wishlistJs, /async checkMany\(productIds = \[\]\)/);
    assert.match(homeJs, /Wishlist\.checkMany\(products\.map/);
    assert.match(searchJs, /Wishlist\.checkMany\(products\.map/);
    assert.doesNotMatch(homeJs, /await Wishlist\.isFavorite\(product\.id\)/);
    assert.doesNotMatch(searchJs, /await Wishlist\.isFavorite\(product\.id\)/);

    assert.match(homeJs, /loading="lazy" decoding="async"/);
    assert.match(searchJs, /loading="lazy" decoding="async"/);
    assert.match(productJs, /loading="lazy" decoding="async"/);
});

(async function run() {
    let passed = 0;

    for (const { name, fn } of tests) {
        try {
            await fn();
            passed++;
            console.log(`ok - ${name}`);
        } catch (err) {
            console.error(`not ok - ${name}`);
            console.error(err);
            process.exitCode = 1;
        }
    }

    console.log(`${passed}/${tests.length} testes passaram`);
})();
