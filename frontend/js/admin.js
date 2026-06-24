/**
 * Admin.js - gerencia login admin, CRUD de produtos e cupons.
 * Autenticação: usa JWT em sessionStorage e valida a sessão no backend antes de renderizar.
 */
let _adminProductsById = new Map();
let _adminCouponsById = new Map();
let _adminProductsPage = 1;
let _adminCouponsPage = 1;
let _adminAuditPage = 1;
let _adminStockPage = 1;
let _verifiedAdminUser = null;
let _adminPanelInitialized = false;
let _couponFormEnhancementsReady = false;
let _promotionFormEnhancementsReady = false;
let _newsletterActiveCount = 0;
let _adminCustomersCache = [];
let _adminCustomerFiltersReady = false;
let _adminLowStockItemsCache = [];
let _adminStockFiltersReady = false;
let _adminAuditFiltersReady = false;
let _orderNotificationPollingStarted = false;
const _adminLoadedTabs = new Set();
const ADMIN_PRODUCTS_PER_PAGE = 10;
const ADMIN_COUPONS_PER_PAGE = 10;
const ADMIN_AUDIT_PER_PAGE = 10;
const ADMIN_STOCK_PER_PAGE = 10;
const MAX_PRODUCT_IMAGES = 4;
let _currentGalleryImages = [];
let _isProductFormSaving = false;
const ADMIN_TIME_ZONE = 'America/Sao_Paulo';

function updateAdminThemeToggle() {
    const button = document.getElementById('admin-theme-toggle');
    if (!button) return;

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const text = button.querySelector('.admin-theme-toggle__text');
    button.setAttribute('aria-pressed', isDark ? 'true' : 'false');
    button.setAttribute('aria-label', isDark ? 'Ativar modo claro' : 'Ativar modo escuro');
    if (text) text.textContent = isDark ? 'Modo claro' : 'Modo escuro';
}

function toggleAdminTheme() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const nextTheme = isDark ? 'light' : 'dark';

    if (nextTheme === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
    } else {
        document.documentElement.removeAttribute('data-theme');
    }

    try {
        localStorage.setItem('theme', nextTheme);
    } catch (_) {}

    updateAdminThemeToggle();
}

document.addEventListener('DOMContentLoaded', updateAdminThemeToggle);

function isTimestampWithExplicitZone(value) {
    return /([zZ]|[+-]\d{2}:?\d{2})$/.test(String(value || '').trim());
}

function formatAdminDateTime(value) {
    if (!value) return '-';

    const text = String(value).trim();
    const localMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})/);
    if (localMatch && !isTimestampWithExplicitZone(text)) {
        const [, year, month, day, hour, minute] = localMatch;
        return `${day}/${month}/${year} ${hour}:${minute}`;
    }

    const date = new Date(text);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleString('pt-BR', {
        dateStyle: 'short',
        timeStyle: 'short',
        timeZone: ADMIN_TIME_ZONE,
    });
}

function formatAdminDate(value) {
    if (!value) return '-';

    const text = String(value).trim();
    const localMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (localMatch && !isTimestampWithExplicitZone(text)) {
        const [, year, month, day] = localMatch;
        return `${day}/${month}/${year}`;
    }

    const date = new Date(text);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleDateString('pt-BR', { timeZone: ADMIN_TIME_ZONE });
}

function getAdminAuthHeader() {
    const adminToken = sessionStorage.getItem('adminToken');
    if (adminToken) return `Bearer ${adminToken}`;
    return null;
}

function isAdminLogged() {
    return !!sessionStorage.getItem('adminToken');
}

function getLoggedAdminUser() {
    if (_verifiedAdminUser) return _verifiedAdminUser;

    const raw = sessionStorage.getItem('adminUser');
    if (!raw) return null;

    try {
        return JSON.parse(raw);
    } catch (err) {
        return null;
    }
}

function clearAdminSession() {
    _verifiedAdminUser = null;
    _adminLoadedTabs.clear();
    sessionStorage.removeItem('adminToken');
    sessionStorage.removeItem('adminUser');
    sessionStorage.removeItem('adminAuth');
    localStorage.removeItem('adminToken');
    localStorage.removeItem('adminUser');
    localStorage.removeItem('adminAuth');
}

function setVerifiedAdminUser(user) {
    _verifiedAdminUser = user;
    sessionStorage.setItem('adminUser', JSON.stringify(user));
    return user;
}

async function verifyAdminSession() {
    const auth = getAdminAuthHeader();
    if (!auth) {
        throw new Error('Sess\u00e3o admin ausente');
    }

    const user = await API.request('/admin/session', {
        headers: { Authorization: auth },
    });

    if (!(user && (user.is_admin === true || user.isAdmin === true))) {
        throw new Error('Essa sess\u00e3o n\u00e3o tem permiss\u00e3o de administrador');
    }

    return setVerifiedAdminUser(user);
}

function isSuperAdminLogged() {
    const user = getLoggedAdminUser();
    return !!(user && (user.is_super_admin || user.isSuperAdmin));
}

function applySuperAdminUi() {
    const isSuperAdmin = isSuperAdminLogged();

    document.querySelectorAll('[data-superadmin-only="true"]').forEach(el => {
        el.style.display = isSuperAdmin ? '' : 'none';
    });

    const couponEditor = document.getElementById('coupon-editor-card');
    if (couponEditor) couponEditor.style.display = isSuperAdmin ? '' : 'none';

    const couponNotice = document.getElementById('coupon-superadmin-notice');
    if (couponNotice) couponNotice.style.display = isSuperAdmin ? 'none' : 'block';
}

function finishAdminBoot() {
    if (document.body) {
        document.body.classList.remove('admin-booting');
        document.body.classList.add('admin-ready');
    }
}

function showLogin() {
    document.getElementById('admin-login').style.display = 'block';
    document.getElementById('admin-panel').style.display = 'none';
    finishAdminBoot();
}

function renderAdminPagination(containerId, pagination = {}, onPageChange) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const currentPage = Number(pagination.page || 1);
    const totalPages = Math.max(1, Number(pagination.totalPages || 1));
    const total = Number(pagination.total || 0);

    if (totalPages <= 1) {
        container.innerHTML = total > 0
            ? `<div class="page-summary">${total} registro(s) encontrado(s)</div>`
            : '';
        return;
    }

    const pages = [];
    const start = Math.max(1, currentPage - 2);
    const end = Math.min(totalPages, currentPage + 2);

    if (start > 1) {
        pages.push(1);
        if (start > 2) pages.push('...');
    }

    for (let page = start; page <= end; page++) {
        pages.push(page);
    }

    if (end < totalPages) {
        if (end < totalPages - 1) pages.push('...');
        pages.push(totalPages);
    }

    const pageButtons = pages.map(page => {
        if (page === '...') {
            return '<span style="color: var(--muted); padding: 0 0.25rem;">...</span>';
        }

        return `
            <button type="button"
                    class="${page === currentPage ? 'active' : ''}"
                    data-page="${page}"
                    aria-label="Ir para p\u00e1gina ${page}">
                ${page}
            </button>
        `;
    }).join('');

    container.innerHTML = `
        <button type="button" data-page="${currentPage - 1}" ${currentPage <= 1 ? 'disabled' : ''}>\u2039</button>
        ${pageButtons}
        <button type="button" data-page="${currentPage + 1}" ${currentPage >= totalPages ? 'disabled' : ''}>\u203a</button>
        <div class="page-summary">P\u00e1gina ${currentPage} de ${totalPages} \u00b7 ${total} registro(s)</div>
    `;

    container.querySelectorAll('button[data-page]').forEach(button => {
        button.addEventListener('click', () => {
            const page = Number(button.dataset.page);
            if (Number.isInteger(page) && page >= 1 && page <= totalPages) {
                onPageChange(page);
            }
        });
    });
}

function markAdminTabStale(...tabNames) {
    tabNames.forEach(tabName => _adminLoadedTabs.delete(tabName));
}

function clearPublicMenuFacetsCache() {
    try {
        [
            'primeSneaker:megaMenuFacets:v1',
            'primeSneaker:megaMenuFacets:v2',
            'primeSneaker:megaMenuFacets:v3',
            'primeSneaker:megaMenuFacets:v4',
        ].forEach(key => sessionStorage.removeItem(key));
    } catch (_) {}
}

function loadAdminTabOnDemand(tabName, loader) {
    if (_adminLoadedTabs.has(tabName)) return;
    _adminLoadedTabs.add(tabName);

    Promise.resolve(loader()).catch(() => {
        _adminLoadedTabs.delete(tabName);
    });
}

function showPanel() {
    document.getElementById('admin-login').style.display = 'none';
    document.getElementById('admin-panel').style.display = 'block';
    finishAdminBoot();

    if (_adminPanelInitialized) return;
    _adminPanelInitialized = true;

    const sizeStockContainer = document.getElementById('size-stock-inputs');
    if (sizeStockContainer) {
        sizeStockContainer.innerHTML = '<p style="color: var(--muted); font-size: 0.9rem;">Digite tamanhos acima para configurar estoque de cada um.</p>';
    }

    applySuperAdminUi();

    // Adicionar listener para atualizar inputs de tamanho quando digitam nos tamanhos
    const sizeInput = document.getElementById('p-sizes');
    if (sizeInput) {
        sizeInput.addEventListener('input', updateSizeInputsFromField);
    }
    const priceInput = document.getElementById('p-price');
    const discountInput = document.getElementById('p-discount');
    if (priceInput) priceInput.addEventListener('input', updateDiscountPreview);
    if (discountInput) {
        discountInput.addEventListener('input', () => {
            const outletInput = document.getElementById('p-outlet');
            if (outletInput && Number(discountInput.value || 0) > 0) {
                outletInput.checked = true;
            }
            updateDiscountPreview();
        });
    }
    setupAdminProductFilters();
    setupAdminOrderFilters();
    setupCouponFormEnhancements();
    setupPromotionFormEnhancements();
    setupAdminCustomerFilters();
    setupAdminStockFilters();
    setupAdminAuditFilters();

    setDashboardPeriod('all', { reload: false });
    showTab('dashboard');
    loadOrderNotifications({ silent: true });
    setupOrderNotificationPolling();
}

function updateSizeInputsFromField() {
    const sizeString = document.getElementById('p-sizes').value;
    const sizes = sizeString.split(',').map(s => s.trim()).filter(Boolean);
    const container = document.getElementById('size-stock-inputs');

    if (sizes.length === 0) {
        container.innerHTML = '<p style="color: var(--muted); font-size: 0.9rem;">Digite tamanhos acima para configurar estoque de cada um.</p>';
        return;
    }

    container.innerHTML = sizes.map(size => {
        const inputId = `size-stock-${String(size).replace(/[^a-zA-Z0-9_-]/g, '-')}`;
        return `
        <div style="display: flex; flex-direction: column; gap: 0.3rem;">
            <label for="${escapeAttribute(inputId)}" style="font-size: 0.85rem; font-weight: 500;">Tamanho ${escapeHTML(size)}</label>
            <input type="number"
                   id="${escapeAttribute(inputId)}"
                   class="size-stock-input"
                   data-size="${escapeAttribute(size)}"
                   value="0"
                   min="0"
                   max="9999"
                   style="padding: 0.5rem; border: 1px solid #ddd; border-radius: 4px; font-size: 0.9rem;">
        </div>
    `;
    }).join('');
}

function logoutAdmin() {
    _verifiedAdminUser = null;
    // Só remover dados da sessão ADMIN. Não mexer na sessão do usuário normal,
    // para que as duas contas permaneçam independentes.
    sessionStorage.removeItem('adminToken');
    sessionStorage.removeItem('adminUser');
    sessionStorage.removeItem('adminAuth');
    // Remover também de localStorage por segurança (caso tenha sobrado de versão antiga)
    localStorage.removeItem('adminToken');
    localStorage.removeItem('adminUser');
    localStorage.removeItem('adminAuth');
    toast('Sess\u00e3o encerrada', 'info');
    // Voltar para a tela de login admin para que seja necessário reautenticar.
    window.location.href = 'admin-login.html';
}

document.getElementById('admin-login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('adm-email').value;
    const password = document.getElementById('adm-password').value;
    try {
        const resp = await API.login(email, password);
        if (!resp.user.is_admin) {
            throw new Error('Essa conta n\u00e3o tem permiss\u00e3o de admin');
        }
        // Salvar somente a sessão ADMIN, sem sobrescrever a sessão do
        // usuário normal (`user`/`token`). Isso evita que o nome do admin
        // apareça no header das páginas comuns.
        sessionStorage.setItem('adminToken', resp.token);
        sessionStorage.setItem('adminUser', JSON.stringify(resp.user));
        await verifyAdminSession();
        showPanel();
        if (typeof updateAdminName === 'function') {
            updateAdminName();
        }
    } catch (err) {
        document.getElementById('alert-area').innerHTML =
            `<div class="alert alert-error">${escapeHTML(err.message)}</div>`;
    }
});

/* ============================================================
   Produtos CRUD
   ============================================================ */
function getAdminProductFilters() {
    return {
        q: document.getElementById('admin-product-search')?.value.trim() || '',
        category: document.getElementById('admin-product-category')?.value || '',
        brand: document.getElementById('admin-product-brand')?.value.trim() || '',
        outlet: document.getElementById('admin-product-outlet')?.value || '',
        launch: document.getElementById('admin-product-launch')?.value || '',
        sortBy: document.getElementById('admin-product-sort')?.value || 'recent',
    };
}

function setupAdminProductFilters() {
    const searchInput = document.getElementById('admin-product-search');
    const brandInput = document.getElementById('admin-product-brand');
    const submitOnEnter = (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            applyAdminProductFilters();
        }
    };

    searchInput?.addEventListener('keydown', submitOnEnter);
    brandInput?.addEventListener('keydown', submitOnEnter);

    [
        'admin-product-category',
        'admin-product-outlet',
        'admin-product-launch',
        'admin-product-sort',
    ].forEach(id => {
        document.getElementById(id)?.addEventListener('change', () => loadProducts({ resetPage: true }));
    });
}

function applyAdminProductFilters() {
    loadProducts({ resetPage: true });
}

function resetAdminProductFilters() {
    [
        'admin-product-search',
        'admin-product-category',
        'admin-product-brand',
        'admin-product-outlet',
        'admin-product-launch',
    ].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    const sort = document.getElementById('admin-product-sort');
    if (sort) sort.value = 'recent';
    loadProducts({ resetPage: true });
}

async function loadProducts(options = {}) {
    if (typeof options === 'number') {
        _adminProductsPage = Math.max(1, options);
    } else if (options.resetPage) {
        _adminProductsPage = 1;
    } else if (options.page) {
        _adminProductsPage = Math.max(1, Number(options.page) || 1);
    }

    try {
        const response = await API.listAllProducts({
            page: _adminProductsPage,
            limit: ADMIN_PRODUCTS_PER_PAGE,
            ...getAdminProductFilters(),
        });
        const allProducts = Array.isArray(response) ? response : null;
        const pagination = allProducts
            ? {
                page: _adminProductsPage,
                limit: ADMIN_PRODUCTS_PER_PAGE,
                total: allProducts.length,
                totalPages: Math.ceil(allProducts.length / ADMIN_PRODUCTS_PER_PAGE),
            }
            : (response.pagination || {});
        const products = allProducts
            ? allProducts.slice((_adminProductsPage - 1) * ADMIN_PRODUCTS_PER_PAGE, _adminProductsPage * ADMIN_PRODUCTS_PER_PAGE)
            : (response.items || []);
        const tbody = document.querySelector('#products-table tbody');
        if (!products.length) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color: var(--muted);">Nenhum produto encontrado com esses filtros.</td></tr>';
            renderAdminPagination('products-pagination', pagination, loadProducts);
            return;
        }
        _adminProductsById = new Map(products.map(p => [String(p.id), p]));
        tbody.innerHTML = products.map(p => {
            const productId = Number(p.id) || 0;
            const img = safeImageSrc(p.image_url, 'https://via.placeholder.com/50');
            const name = escapeHTML(p.name || 'Produto');
            const nameAttr = escapeAttribute(p.name || 'Produto');
            const categoryLabel = escapeHTML(formatAdminCategoryLabel(p.category));
            const categoryClass = escapeAttribute(normalizeAdminCategoryKey(p.category));
            const brand = escapeHTML(p.brand || '-');
            const gender = escapeHTML(p.gender || 'unissex');
            const color = escapeHTML(p.color || '-');
            const modelGroup = escapeHTML(p.model_group || '');
            const stock = Number(p.stock || 0);

            return `
      <tr>
        <td class="admin-product-name-cell">
          <div class="admin-product-identity">
            <img src="${escapeAttribute(img)}" alt="${nameAttr}" loading="lazy" decoding="async">
            <div>
              <strong class="admin-product-name">${name}</strong>
              <div class="admin-product-row-meta">Cor: ${color}${modelGroup ? ` \u00b7 Grupo: ${modelGroup}` : ''}</div>
            </div>
          </div>
        </td>
        <td class="admin-product-category-cell"><span class="admin-category-pill admin-category-${categoryClass}">${categoryLabel}</span></td>
        <td>
          <strong class="admin-table-main-text">${brand}</strong>
          <div class="admin-table-muted-line">${gender}${getAdminProductFlag(p, ['is_launch', 'launch', 'lancamento', 'isLaunch']) ? ' \u00b7 Lan\u00e7amento' : ''}${(getAdminProductFlag(p, ['is_outlet', 'outlet', 'isOutlet']) || getAdminDiscountPercent(p) > 0) ? ' \u00b7 Outlet' : ''}</div>
        </td>
        <td>${getAdminDiscountPercent(p) > 0
            ? `<span style="display:block; color: var(--muted); text-decoration: line-through; font-size: 0.78rem;">${formatBRL(p.price)}</span><strong>${formatBRL(getAdminOutletPrice(p))}</strong><span style="display:block; color: var(--success); font-size: 0.76rem;">-${getAdminDiscountPercent(p)}%</span>`
            : formatBRL(p.price)}</td>
        <td>${stock}</td>
        <td>
          <div class="actions-col">
            <button class="btn-icon btn-edit" type="button" data-product-id="${productId}">Editar</button>
            <button class="btn-icon btn-delete" type="button" data-product-id="${productId}">Excluir</button>
          </div>
        </td>
      </tr>
    `;
        }).join('');

        tbody.querySelectorAll('.btn-edit[data-product-id]').forEach(button => {
            button.addEventListener('click', () => {
                const product = _adminProductsById.get(String(button.dataset.productId));
                if (product) editProduct(product);
            });
        });
        tbody.querySelectorAll('.btn-delete[data-product-id]').forEach(button => {
            button.addEventListener('click', () => deleteProduct(Number(button.dataset.productId)));
        });
        renderAdminPagination('products-pagination', pagination, loadProducts);
    } catch (err) {
        toast('Erro ao carregar produtos: ' + err.message, 'error');
    }
}

function isTruthyAdminFlag(value) {
    return value === true || value === 'true' || value === '1' || value === 1 || value === 't' || value === 'yes';
}

function normalizeAdminCategoryKey(category) {
    const raw = String(category || '').trim().toLowerCase();
    if (!raw) return 'sem-categoria';
    return raw
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9_-]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'sem-categoria';
}

function formatAdminCategoryLabel(category) {
    const labels = {
        casual: 'Casual',
        esportivo: 'Esportivo',
        formal: 'Formal',
        trekking: 'Trekking',
    };
    return labels[normalizeAdminCategoryKey(category)] || String(category || '-').trim() || '-';
}

function getAdminProductFlag(product, fields) {
    return fields.some(field => isTruthyAdminFlag(product[field]));
}

function getAdminDiscountPercent(product) {
    return Math.max(0, Math.min(99, Number(product.discount_percent || product.outlet_discount_percent || 0)));
}

function getAdminOutletPrice(product) {
    const price = Number(product.price || 0);
    const discount = getAdminDiscountPercent(product);
    if (discount <= 0) return price;
    return Number((price * (1 - discount / 100)).toFixed(2));
}

function updateDiscountPreview() {
    const preview = document.getElementById('p-discount-preview');
    if (!preview) return;

    const price = Number(document.getElementById('p-price')?.value || 0);
    const discount = Math.max(0, Math.min(99, Number(document.getElementById('p-discount')?.value || 0)));

    if (!price || discount <= 0) {
        preview.textContent = 'Sem desconto aplicado.';
        preview.style.color = 'var(--muted)';
        return;
    }

    const finalPrice = Number((price * (1 - discount / 100)).toFixed(2));
    preview.innerHTML = `No outlet: <strong>${formatBRL(finalPrice)}</strong> <span style="text-decoration:line-through;">${formatBRL(price)}</span>`;
    preview.style.color = 'var(--success)';
}

function setProductFormVisible(visible) {
    const formCard = document.getElementById('product-form-card');
    const backdrop = document.getElementById('product-form-backdrop');
    if (!formCard) return;
    formCard.classList.toggle('is-visible', Boolean(visible));
    formCard.setAttribute('aria-hidden', visible ? 'false' : 'true');
    backdrop?.classList.toggle('is-visible', Boolean(visible));
    document.body?.classList.toggle('admin-drawer-open', Boolean(visible));
}

function setProductFormSaving(isSaving) {
    _isProductFormSaving = Boolean(isSaving);
    const form = document.getElementById('product-form');
    if (!form) return;

    form.classList.toggle('is-saving', _isProductFormSaving);
    const submitButton = form.querySelector('button[type="submit"]');
    if (submitButton && !submitButton.dataset.originalText) {
        submitButton.dataset.originalText = submitButton.textContent.trim() || 'Salvar';
    }

    form.querySelectorAll('input, select, textarea, button').forEach(control => {
        if (_isProductFormSaving) {
            if (!control.disabled) {
                control.dataset.productSaveLock = '1';
                control.disabled = true;
            }
            return;
        }

        if (control.dataset.productSaveLock === '1') {
            control.disabled = false;
            delete control.dataset.productSaveLock;
        }
    });

    if (submitButton) {
        submitButton.textContent = _isProductFormSaving
            ? 'Salvando...'
            : (submitButton.dataset.originalText || 'Salvar');
    }

    document.querySelectorAll('label[for="gallery-new-file"], label[for="p-image-file"]').forEach(label => {
        label.classList.toggle('is-disabled', _isProductFormSaving);
        label.setAttribute('aria-disabled', _isProductFormSaving ? 'true' : 'false');
    });
}

function setProductFormAlert(message = '', type = 'error') {
    const alert = document.getElementById('product-form-alert');
    if (!alert) return;

    alert.className = 'admin-form-feedback';
    alert.textContent = '';

    if (!message) return;

    alert.textContent = String(message);
    alert.classList.add(type === 'success' ? 'is-success' : 'is-error', 'is-visible');
    alert.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function updateProductDescriptionCount() {
    const textarea = document.getElementById('p-description');
    const counter = document.getElementById('p-description-count');
    if (!textarea || !counter) return;

    const count = textarea.value.length;
    counter.textContent = `${count}/500 caracteres`;
    counter.classList.toggle('is-danger', count > 500);
}

function scrollToProductForm() {
    document.getElementById('p-name')?.focus();
}

function clearProductPhotoState() {
    const mainImageInput = document.getElementById('p-image');
    const mainFileInput = document.getElementById('p-image-file');
    const galleryUrlInput = document.getElementById('gallery-new-url');
    const galleryFileInput = document.getElementById('gallery-new-file');

    if (mainImageInput) {
        mainImageInput.value = '';
        mainImageInput.defaultValue = '';
    }
    if (mainFileInput) mainFileInput.value = '';
    if (galleryUrlInput) galleryUrlInput.value = '';
    if (galleryFileInput) galleryFileInput.value = '';

    _currentGalleryImages = [];
    updateSelectedFileLabel('p-image-file', 'p-image-file-count');
    updateSelectedFileLabel('gallery-new-file', 'gallery-file-count');
}

function closeProductForm() {
    resetProductForm({ hide: true });
}

function openProductCreateForm() {
    resetProductForm({ hide: false });
    clearProductPhotoState();
    setProductFormAlert('');
    document.getElementById('product-form-title').textContent = 'Cadastrar novo t\u00eanis';
    const galleryManager = document.getElementById('gallery-manager');
    if (galleryManager) galleryManager.style.display = 'block';
    window._editingProductId = null;
    renderGalleryImages([]);
    setProductFormVisible(true);
    scrollToProductForm();
}

async function editProduct(p) {
    setProductFormVisible(true);
    setProductFormAlert('');
    document.getElementById('product-id').value = p.id;
    document.getElementById('p-name').value = p.name;
    document.getElementById('p-price').value = p.price;
    document.getElementById('p-discount').value = getAdminDiscountPercent(p) || '';
    document.getElementById('p-description').value = p.description || '';
    document.getElementById('p-image').value = p.image_url || '';
    document.getElementById('p-sizes').value = p.sizes || '';
    document.getElementById('p-color').value = p.color || '';
    document.getElementById('p-model-group').value = p.model_group || '';
    document.getElementById('p-category').value = p.category || 'casual';
    document.getElementById('p-brand').value = p.brand || '';
    document.getElementById('p-gender').value = p.gender || 'unissex';
    document.getElementById('p-launch').checked = getAdminProductFlag(p, ['is_launch', 'launch', 'lancamento', 'isLaunch']);
    document.getElementById('p-outlet').checked = getAdminProductFlag(p, ['is_outlet', 'outlet', 'isOutlet']);
    document.getElementById('product-form-title').textContent = `Editando produto #${p.id}`;
    updateDiscountPreview();
    updateProductDescriptionCount();
    _currentGalleryImages = [];
    renderGalleryImages([]);

    // Carregar estoque por tamanho
    loadSizeStockInputs(p.id, p.sizes);

    // Mostrar gerenciador de galeria e carregar imagens
    document.getElementById('gallery-manager').style.display = 'block';
    loadGalleryImages(p.id);

    scrollToProductForm();
}

async function loadSizeStockInputs(productId, sizeString) {
    const container = document.getElementById('size-stock-inputs');
    if (!container) return;

    container.innerHTML = '<p style="color: var(--muted); font-size: 0.9rem;">Carregando...</p>';

    try {
        const stocks = await fetch(`/api/products/${productId}/size-stock`).then(r => r.json());
        const sizes = (sizeString || '').split(',').map(s => s.trim()).filter(Boolean);

        if (sizes.length === 0) {
            container.innerHTML = '<p style="color: var(--muted); font-size: 0.9rem;">Nenhum tamanho cadastrado.</p>';
            return;
        }

        const stockMap = {};
        if (Array.isArray(stocks)) {
            stocks.forEach(item => {
                stockMap[item.size] = item.stock;
            });
        }

        container.innerHTML = sizes.map(size => {
            const currentStock = stockMap[size] || 0;
            const inputId = `size-stock-${String(size).replace(/[^a-zA-Z0-9_-]/g, '-')}`;
            return `
                <div style="display: flex; flex-direction: column; gap: 0.3rem;">
                    <label for="${escapeAttribute(inputId)}" style="font-size: 0.85rem; font-weight: 500;">Tamanho ${escapeHTML(size)}</label>
                    <input type="number"
                           id="${escapeAttribute(inputId)}"
                           class="size-stock-input"
                           data-size="${escapeAttribute(size)}"
                           value="${Number(currentStock) || 0}"
                           min="0"
                           max="9999"
                           style="padding: 0.5rem; border: 1px solid #ddd; border-radius: 4px; font-size: 0.9rem;">
                </div>
            `;
        }).join('');
    } catch (err) {
        container.innerHTML = `<p style="color: var(--danger); font-size: 0.9rem;">Erro ao carregar estoque: ${escapeHTML(err.message)}</p>`;
    }
}

function resetProductForm(options = {}) {
    const shouldHide = options.hide !== false;
    setProductFormSaving(false);
    document.getElementById('product-form').reset();
    document.getElementById('product-id').value = '';
    document.getElementById('product-form-title').textContent = 'Cadastrar novo t\u00eanis';
    clearProductPhotoState();
    setProductFormAlert('');
    setUploadStatus('p-image-upload-status', 'Voc\u00ea pode colar um link ou enviar PNG, JPG, WEBP ou GIF at\u00e9 5MB.');
    setUploadStatus('gallery-upload-status', 'Adicione de 1 a 4 fotos. A primeira foto ser\u00e1 a principal do produto.');
    updateDiscountPreview();
    updateProductDescriptionCount();
    window._editingProductId = null;
    const galleryManager = document.getElementById('gallery-manager');
    if (galleryManager) galleryManager.style.display = 'none';
    const galleryList = document.getElementById('gallery-images-list');
    if (galleryList) galleryList.innerHTML = '';
    const sizeStockContainer = document.getElementById('size-stock-inputs');
    if (sizeStockContainer) {
        sizeStockContainer.innerHTML = '<p style="color: var(--muted); font-size: 0.9rem;">Digite tamanhos acima para configurar estoque de cada um.</p>';
    }
    if (shouldHide) setProductFormVisible(false);
}

document.getElementById('product-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (_isProductFormSaving) return;
    setProductFormAlert('');

    const descriptionValue = document.getElementById('p-description')?.value || '';
    updateProductDescriptionCount();
    if (descriptionValue.trim().length > 500) {
        setProductFormAlert(`A descri\u00e7\u00e3o tem ${descriptionValue.trim().length} caracteres. O limite \u00e9 500. Reduza o texto para salvar.`);
        return;
    }

    setProductFormSaving(true);

    try {
    const id = document.getElementById('product-id').value;
    const sizeStocks = [];
    document.querySelectorAll('.size-stock-input').forEach(input => {
        const size = input.dataset.size;
        const stock = Number(input.value) || 0;
        sizeStocks.push({ size, stock });
    });

    // Validar que ha estoque por tamanho ao criar novo produto
    if (!id && sizeStocks.length === 0) {
        setProductFormAlert('Adicione tamanhos e estoque antes de criar o produto.');
        return;
    }

    const isLaunch = document.getElementById('p-launch').checked;
    const discountPercent = Number(document.getElementById('p-discount').value || 0);
    const isOutlet = document.getElementById('p-outlet').checked || discountPercent > 0;
    const pendingGalleryImages = !id
        ? _currentGalleryImages
            .filter(img => img && img._pending && String(img.image_url || '').trim())
            .map(img => ({ ...img, image_url: String(img.image_url || '').trim() }))
        : [];
    const data = {
        name: document.getElementById('p-name').value,
        price: Number(document.getElementById('p-price').value),
        description: document.getElementById('p-description').value,
        image_url: document.getElementById('p-image').value.trim(),
        sizes: document.getElementById('p-sizes').value,
        color: document.getElementById('p-color').value,
        model_group: document.getElementById('p-model-group').value.trim(),
        category: document.getElementById('p-category').value,
        brand: document.getElementById('p-brand').value.trim(),
        gender: document.getElementById('p-gender').value,
        is_launch: isLaunch,
        is_outlet: isOutlet,
        launch: isLaunch,
        outlet: isOutlet,
        discount_percent: discountPercent,
        outlet_discount_percent: discountPercent,
        stock: sizeStocks.reduce((sum, s) => sum + s.stock, 0),
    };
    const galleryImagesToSave = [...pendingGalleryImages];
    if (!data.image_url && galleryImagesToSave.length) {
        data.image_url = galleryImagesToSave.shift().image_url;
        document.getElementById('p-image').value = data.image_url;
    }

    if (!data.image_url && id && _currentGalleryImages.length) {
        data.image_url = String(_currentGalleryImages[0]?.image_url || '').trim();
        document.getElementById('p-image').value = data.image_url;
    }

    const totalImages = (data.image_url ? 1 : 0) + galleryImagesToSave.length;
    if (totalImages > MAX_PRODUCT_IMAGES) {
        setProductFormAlert(`O produto pode ter no máximo ${MAX_PRODUCT_IMAGES} imagens.`);
        return;
    }

    const auth = getAdminAuthHeader();
        if (id) {
            await API.updateProduct(id, data, auth);

            // Salvar estoque por tamanho se estiver editando
            if (sizeStocks.length > 0) {
                try {
                    await API.request(`/products/${id}/size-stock`, {
                        method: 'POST',
                        headers: auth ? { Authorization: auth } : {},
                        body: { stocks: sizeStocks },
                    });
                } catch (err) {
                    console.warn('Erro ao salvar estoque por tamanho:', err.message);
                }
            }

            toast('Produto atualizado!', 'success');
        } else {
            const createdProduct = await API.createProduct(data, auth);
            if (createdProduct?.id && sizeStocks.length > 0) {
                try {
                    await API.request(`/products/${createdProduct.id}/size-stock`, {
                        method: 'POST',
                        headers: auth ? { Authorization: auth } : {},
                        body: { stocks: sizeStocks },
                    });
                } catch (err) {
                    console.warn('Erro ao salvar estoque por tamanho:', err.message);
                }
            }
            if (createdProduct?.id && galleryImagesToSave.length) {
                await savePendingGalleryImages(createdProduct.id, galleryImagesToSave);
            }
            toast('Produto cadastrado!', 'success');
        }
        resetProductForm();
        clearPublicMenuFacetsCache();
        markAdminTabStale('dashboard', 'estoque');
        loadProducts();
    } catch (err) {
        setProductFormAlert(err.message || 'Erro ao salvar produto. Verifique os campos e tente novamente.');
    } finally {
        setProductFormSaving(false);
    }
});

document.getElementById('p-description')?.addEventListener('input', () => {
    updateProductDescriptionCount();
    const textarea = document.getElementById('p-description');
    if (textarea && textarea.value.trim().length <= 500) {
        setProductFormAlert('');
    }
});

document.getElementById('p-image-file')?.addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    updateSelectedFileLabel('p-image-file', 'p-image-file-count');

    try {
        setUploadStatus('p-image-upload-status', 'Enviando imagem...', 'muted');
        const uploaded = await uploadLocalProductImage(file);
        document.getElementById('p-image').value = uploaded.image_url || uploaded.url;
        setUploadStatus('p-image-upload-status', 'Foto enviada. Ela sera usada como imagem principal.', 'success');
        renderGalleryImages(_currentGalleryImages);
    } catch (err) {
        setUploadStatus('p-image-upload-status', err.message, 'error');
    } finally {
        event.target.value = '';
        updateSelectedFileLabel('p-image-file', 'p-image-file-count');
    }
});

document.getElementById('p-image')?.addEventListener('input', () => {
    renderGalleryImages(_currentGalleryImages);
});

document.getElementById('gallery-new-file')?.addEventListener('change', () => {
    updateSelectedFileLabel('gallery-new-file', 'gallery-file-count');
});

async function deleteProduct(id) {
    const product = _adminProductsById.get(String(id)) || {};
    const productName = product.name || 'este produto';
    const details = `
        <div><span>Produto</span><strong>${escapeHTML(productName)}</strong></div>
        <div><span>Categoria</span><strong>${escapeHTML(formatAdminCategoryLabel(product.category))}</strong></div>
        <div><span>Estoque atual</span><strong>${Number(product.stock || 0)} unidade(s)</strong></div>
    `;

    showConfirmModal(
        'Essa a\u00e7\u00e3o remove o produto do cat\u00e1logo e n\u00e3o pode ser desfeita pelo painel.',
        async () => {
            try {
                const response = await API.deleteProduct(id, getAdminAuthHeader());
                toast(response.message || 'Produto exclu\u00eddo!', 'success');
                clearPublicMenuFacetsCache();
                markAdminTabStale('dashboard', 'estoque');
                loadProducts();
            } catch (err) {
                toast('Erro: ' + err.message, 'error');
            }
        },
        {
            title: `Excluir ${productName}?`,
            confirmLabel: 'Excluir produto',
            details,
            danger: true,
        }
    );
}

/* ============================================================
   Promoções / Newsletter
   ============================================================ */
async function loadNewsletterSubscribers() {
    const tbody = document.querySelector('#newsletter-table tbody');
    const countEl = document.getElementById('newsletter-count');
    const recipientCountEl = document.getElementById('promo-recipient-count');
    const tableCountEl = document.getElementById('newsletter-table-count');
    if (!countEl && !recipientCountEl && !tbody) return;

    try {
        const subscribers = await API.listNewsletterSubscribers(getAdminAuthHeader());
        const activeCount = subscribers.filter(sub => sub.active).length;
        _newsletterActiveCount = activeCount;
        if (countEl) countEl.textContent = activeCount;
        if (recipientCountEl) recipientCountEl.textContent = activeCount;
        if (tableCountEl) tableCountEl.textContent = subscribers.length;
        updatePromotionPreview();

        if (!tbody) return;

        if (!subscribers.length) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="4">
                        <div class="newsletter-empty-state">
                            <strong>Nenhum inscrito ainda</strong>
                            <span>Os e-mails cadastrados na newsletter aparecer&atilde;o aqui.</span>
                        </div>
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = subscribers.map(sub => {
            const created = formatAdminDate(sub.created_at);
            const status = sub.active
                ? '<span class="newsletter-status-badge is-active">Recebe</span>'
                : '<span class="newsletter-status-badge is-paused">Pausado</span>';
            const nextActive = sub.active ? 'false' : 'true';
            const actionLabel = sub.active ? 'Não receber' : 'Receber';
            const actionClass = sub.active ? 'is-danger' : 'is-success';

            return `
                <tr class="newsletter-subscriber-row">
                    <td>
                        <div class="newsletter-email-cell">
                            <span class="newsletter-avatar">${escapeHTML(String(sub.email || '?').charAt(0).toUpperCase())}</span>
                            <strong>${escapeHTML(sub.email)}</strong>
                        </div>
                    </td>
                    <td>${status}</td>
                    <td>${created}</td>
                    <td>
                        <button
                            type="button"
                            class="newsletter-action-btn ${actionClass}"
                            onclick="toggleNewsletterSubscriber(${Number(sub.id)}, ${nextActive})"
                        >
                            ${actionLabel}
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
    } catch (err) {
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="4" style="color: var(--danger);">Erro ao carregar inscritos: ${escapeHTML(err.message)}</td></tr>`;
        }
        toast('Erro ao carregar inscritos: ' + err.message, 'error');
    }
}

async function toggleNewsletterSubscriber(id, active) {
    try {
        await API.updateNewsletterSubscriber(id, { active }, getAdminAuthHeader());
        await loadNewsletterSubscribers();
    } catch (err) {
        toast('Erro ao atualizar inscrito: ' + err.message, 'error');
    }
}

function setUploadStatus(elementId, message, type = 'muted') {
    const el = document.getElementById(elementId);
    if (!el) return;
    el.textContent = message;
    el.classList.remove('is-success', 'is-error');
    if (type === 'success') el.classList.add('is-success');
    if (type === 'error') el.classList.add('is-error');
}

function updateSelectedFileLabel(inputId, labelId, emptyText = 'Nenhuma foto selecionada') {
    const input = document.getElementById(inputId);
    const label = document.getElementById(labelId);
    if (!input || !label) return;

    const files = Array.from(input.files || []);
    if (!files.length) {
        label.textContent = emptyText;
        return;
    }

    label.textContent = files.length === 1
        ? files[0].name
        : `${files.length} fotos selecionadas`;
}

function readImageFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('Nao foi possivel ler a imagem.'));
        reader.readAsDataURL(file);
    });
}

function validateLocalImageFile(file) {
    if (!file) throw new Error('Selecione uma foto.');
    const allowedTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
    if (!allowedTypes.includes(file.type)) {
        throw new Error('Use uma imagem PNG, JPG, WEBP ou GIF.');
    }
    if (file.size > 5 * 1024 * 1024) {
        throw new Error('Imagem muito grande. Limite maximo: 5MB.');
    }
}

async function uploadLocalProductImage(file) {
    validateLocalImageFile(file);
    const image = await readImageFileAsDataUrl(file);
    return API.uploadProductImage({
        image,
        file_name: file.name,
    }, getAdminAuthHeader());
}

function getPromotionPayload() {
    const couponInput = document.getElementById('promo-coupon');
    if (couponInput) {
        couponInput.value = couponInput.value.trim().toUpperCase();
    }

    return {
        subject: document.getElementById('promo-subject')?.value.trim() || '',
        title: document.getElementById('promo-title')?.value.trim() || '',
        message: document.getElementById('promo-message')?.value.trim() || '',
        couponCode: couponInput?.value || '',
    };
}

function validatePromotionPayload(payload) {
    if (!payload.subject || !payload.title || !payload.message) {
        toast('Preencha assunto, t\u00edtulo e mensagem', 'error');
        return false;
    }
    return true;
}

function updatePromotionPreview() {
    const payload = getPromotionPayload();
    const subjectEl = document.getElementById('promo-preview-subject');
    const titleEl = document.getElementById('promo-preview-title');
    const messageEl = document.getElementById('promo-preview-message');
    const couponEl = document.getElementById('promo-preview-coupon');
    const recipientCountEl = document.getElementById('promo-recipient-count');

    if (subjectEl) subjectEl.textContent = payload.subject || 'Assunto do email';
    if (titleEl) titleEl.textContent = payload.title || 'T\u00edtulo da promo\u00e7\u00e3o';
    if (messageEl) messageEl.textContent = payload.message || 'A mensagem aparecer\u00e1 aqui enquanto voc\u00ea digita.';
    if (recipientCountEl) recipientCountEl.textContent = _newsletterActiveCount;

    if (couponEl) {
        couponEl.textContent = payload.couponCode ? `Cupom exclusivo: ${payload.couponCode}` : '';
        couponEl.classList.toggle('is-hidden', !payload.couponCode);
    }
}

function setupPromotionFormEnhancements() {
    if (_promotionFormEnhancementsReady) return;
    const form = document.getElementById('promotion-form');
    if (!form) return;
    _promotionFormEnhancementsReady = true;

    ['promo-subject', 'promo-title', 'promo-message', 'promo-coupon'].forEach(fieldId => {
        const field = document.getElementById(fieldId);
        if (!field) return;
        field.addEventListener('input', updatePromotionPreview);
        field.addEventListener('change', updatePromotionPreview);
    });

    updatePromotionPreview();
}

async function sendPromotionToSubscribers(form, submitButton, originalText, payload) {
    if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = 'Enviando promo\u00e7\u00e3o...';
    }

    try {
        const result = await API.sendNewsletterPromotion(payload, getAdminAuthHeader());
        toast(`Promo\u00e7\u00e3o enviada para ${result.sent} inscrito(s).`, 'success');
        form.reset();
        updatePromotionPreview();
        loadNewsletterSubscribers();
    } catch (err) {
        toast('Erro ao enviar promo\u00e7\u00e3o: ' + err.message, 'error');
    } finally {
        if (submitButton) {
            submitButton.disabled = false;
            submitButton.textContent = originalText;
        }
    }
}

document.getElementById('promotion-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const submitButton = form.querySelector('button[type="submit"]');
    const originalText = submitButton ? submitButton.textContent : '';

    const payload = getPromotionPayload();
    if (!validatePromotionPayload(payload)) return;

    if (_newsletterActiveCount <= 0) {
        toast('Nenhum inscrito ativo para receber a promo\u00e7\u00e3o', 'warning');
        return;
    }

    showConfirmModal(
        'Essa promo\u00e7\u00e3o ser\u00e1 enviada para todos os inscritos ativos da newsletter.',
        () => sendPromotionToSubscribers(form, submitButton, originalText, payload),
        {
            title: 'Confirmar envio de promo\u00e7\u00e3o',
            confirmLabel: 'Enviar agora',
            details: `
                <div><span>Destinat\u00e1rios</span><strong>${_newsletterActiveCount}</strong></div>
                <div><span>Assunto</span><strong>${escapeHTML(payload.subject)}</strong></div>
                <div><span>Cupom</span><strong>${escapeHTML(payload.couponCode || 'Sem cupom')}</strong></div>
            `,
        }
    );
});

/* ============================================================
   Cupons CRUD
   ============================================================ */
const COUPON_FIELD_ERROR_IDS = {
    'c-code': 'c-code-error',
    'c-discount': 'c-discount-error',
    'c-min-value': 'c-min-value-error',
    'c-expires-at': 'c-expires-at-error',
    'c-max-uses': 'c-max-uses-error',
};

function normalizeCouponCode(value) {
    return String(value || '').normalize('NFKC').toUpperCase().replace(/\s+/g, '');
}

function normalizeCouponCodeInput() {
    const codeInput = document.getElementById('c-code');
    if (!codeInput) return '';
    codeInput.value = normalizeCouponCode(codeInput.value);
    return codeInput.value;
}

function setCouponFieldError(fieldId, message, options = {}) {
    const field = document.getElementById(fieldId);
    const error = document.getElementById(COUPON_FIELD_ERROR_IDS[fieldId]);
    const group = field ? field.closest('.form-group') : null;
    const shouldShow = options.show || (group && group.classList.contains('has-error'));

    if (error) {
        error.textContent = message || '';
        error.classList.toggle('is-visible', Boolean(message && shouldShow));
    }
    if (group) {
        group.classList.toggle('has-error', Boolean(message && shouldShow));
    }
}

function clearCouponValidation() {
    Object.keys(COUPON_FIELD_ERROR_IDS).forEach(fieldId => {
        setCouponFieldError(fieldId, '', { show: true });
    });
}

function validateCouponForm(options = {}) {
    const show = options.show !== false;
    let isValid = true;
    const code = normalizeCouponCodeInput();
    const discountValue = document.getElementById('c-discount')?.value || '';
    const minValue = document.getElementById('c-min-value')?.value || '';
    const expiresAt = document.getElementById('c-expires-at')?.value || '';
    const maxUsesValue = document.getElementById('c-max-uses')?.value || '';
    const discount = Number(discountValue);
    const min = Number(minValue || 0);
    const maxUses = Number(maxUsesValue);

    if (!code) {
        setCouponFieldError('c-code', 'Informe um c\u00f3digo para o cupom.', { show });
        isValid = false;
    } else {
        setCouponFieldError('c-code', '', { show });
    }

    if (!discountValue || Number.isNaN(discount) || discount < 1 || discount > 100) {
        setCouponFieldError('c-discount', 'Use um desconto entre 1% e 100%.', { show });
        isValid = false;
    } else {
        setCouponFieldError('c-discount', '', { show });
    }

    if (minValue !== '' && (Number.isNaN(min) || min < 0)) {
        setCouponFieldError('c-min-value', 'O valor m\u00ednimo n\u00e3o pode ser negativo.', { show });
        isValid = false;
    } else {
        setCouponFieldError('c-min-value', '', { show });
    }

    if (expiresAt && Number.isNaN(new Date(`${expiresAt}T00:00:00`).getTime())) {
        setCouponFieldError('c-expires-at', 'Informe uma data v\u00e1lida.', { show });
        isValid = false;
    } else {
        setCouponFieldError('c-expires-at', '', { show });
    }

    if (maxUsesValue && (!Number.isInteger(maxUses) || maxUses < 1)) {
        setCouponFieldError('c-max-uses', 'Use um limite inteiro maior que zero.', { show });
        isValid = false;
    } else {
        setCouponFieldError('c-max-uses', '', { show });
    }

    return isValid;
}

function setupCouponFormEnhancements() {
    if (_couponFormEnhancementsReady) return;
    const form = document.getElementById('coupon-form');
    const codeInput = document.getElementById('c-code');
    if (!form || !codeInput) return;
    _couponFormEnhancementsReady = true;

    codeInput.addEventListener('input', () => {
        const cursor = codeInput.selectionStart;
        const oldLength = codeInput.value.length;
        const normalized = normalizeCouponCode(codeInput.value);
        if (codeInput.value !== normalized) {
            codeInput.value = normalized;
            const nextCursor = Math.max(0, (cursor || normalized.length) + (normalized.length - oldLength));
            try {
                codeInput.setSelectionRange(nextCursor, nextCursor);
            } catch (_) {}
        }
        validateCouponForm({ show: false });
    });

    ['c-discount', 'c-min-value', 'c-expires-at', 'c-max-uses', 'c-active'].forEach(fieldId => {
        const field = document.getElementById(fieldId);
        if (!field) return;
        field.addEventListener('input', () => validateCouponForm({ show: false }));
        field.addEventListener('change', () => validateCouponForm({ show: false }));
    });
}

function setCouponFormVisible(visible) {
    const card = document.getElementById('coupon-editor-card');
    const backdrop = document.getElementById('coupon-form-backdrop');
    if (!card) return;

    if (visible && !isSuperAdminLogged()) {
        toast('Somente o superadmin pode gerenciar cupons', 'warning');
        return;
    }

    card.classList.toggle('is-visible', visible);
    card.setAttribute('aria-hidden', visible ? 'false' : 'true');
    if (backdrop) backdrop.classList.toggle('is-visible', visible);

    if (visible) {
        document.body?.classList.add('admin-drawer-open');
    } else if (!document.querySelector('.admin-products-form-card.is-visible, .admin-coupon-drawer.is-visible, .admin-admin-drawer.is-visible')) {
        document.body?.classList.remove('admin-drawer-open');
    }
}

function openCouponCreateForm() {
    if (!isSuperAdminLogged()) {
        toast('Somente o superadmin pode criar cupons', 'error');
        return;
    }
    resetCouponForm({ hide: false });
    document.getElementById('coupon-form-title').textContent = 'Criar novo cupom';
    setCouponFormVisible(true);
    setTimeout(() => document.getElementById('c-code')?.focus(), 60);
}

function closeCouponForm() {
    resetCouponForm({ hide: true });
}

function getCouponExpirationDate(coupon) {
    if (!coupon || !coupon.expires_at) return null;
    const match = String(coupon.expires_at).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
        return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 23, 59, 59, 999);
    }
    const expiresAt = new Date(coupon.expires_at);
    if (Number.isNaN(expiresAt.getTime())) return null;
    expiresAt.setHours(23, 59, 59, 999);
    return expiresAt;
}

function formatCouponExpiration(value) {
    if (!value) return 'Sem prazo';
    const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) return `${match[3]}/${match[2]}/${match[1]}`;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'Data inv\u00e1lida' : date.toLocaleDateString('pt-BR');
}

function getCouponStatusMeta(coupon) {
    const usesCount = Number(coupon.uses_count || 0);
    const usageLimitReached = coupon.max_uses ? usesCount >= Number(coupon.max_uses) : false;
    const expiresAt = getCouponExpirationDate(coupon);
    const expired = expiresAt ? expiresAt.getTime() < Date.now() : false;

    if (!coupon.active) {
        return { label: 'Inativo', className: 'is-inactive' };
    }
    if (expired) {
        return { label: 'Expirado', className: 'is-expired' };
    }
    if (usageLimitReached) {
        return { label: 'Esgotado', className: 'is-exhausted' };
    }
    return { label: 'Ativo', className: 'is-active' };
}

async function loadCoupons(options = {}) {
    if (typeof options === 'number') {
        _adminCouponsPage = Math.max(1, options);
    } else if (options.resetPage) {
        _adminCouponsPage = 1;
    } else if (options.page) {
        _adminCouponsPage = Math.max(1, Number(options.page) || 1);
    }

    try {
        const response = await API.listCoupons(getAdminAuthHeader(), {
            page: _adminCouponsPage,
            limit: ADMIN_COUPONS_PER_PAGE,
        });
        const allCoupons = Array.isArray(response) ? response : null;
        const pagination = allCoupons
            ? {
                page: _adminCouponsPage,
                limit: ADMIN_COUPONS_PER_PAGE,
                total: allCoupons.length,
                totalPages: Math.ceil(allCoupons.length / ADMIN_COUPONS_PER_PAGE),
            }
            : (response.pagination || {});
        const coupons = allCoupons
            ? allCoupons.slice((_adminCouponsPage - 1) * ADMIN_COUPONS_PER_PAGE, _adminCouponsPage * ADMIN_COUPONS_PER_PAGE)
            : (response.items || []);
        const tbody = document.querySelector('#coupons-table tbody');
        const canManageCoupons = isSuperAdminLogged();
        if (!coupons.length) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color: var(--muted);">Nenhum cupom cadastrado.</td></tr>';
            renderAdminPagination('coupons-pagination', pagination, loadCoupons);
            return;
        }
        _adminCouponsById = new Map(coupons.map(c => [String(c.id), c]));
        tbody.innerHTML = coupons.map(c => {
            const expires = formatCouponExpiration(c.expires_at);
            const usesCount = c.uses_count || 0;
            const uses = c.max_uses ? `${usesCount}/${c.max_uses}` : `${usesCount}/(ilimitado)`;
            const minVal = Number(c.min_value || 0);
            const status = getCouponStatusMeta(c);

            return `
      <tr>
        <td>
          <span class="coupon-code-pill">${escapeHTML(c.code)}</span>
          <div class="admin-table-muted-line"><span class="coupon-status-badge ${status.className}">${escapeHTML(status.label)}</span></div>
        </td>
        <td>
          <strong>${c.discount_percent}% de desconto</strong>
          <div class="admin-table-muted-line">M&iacute;nimo: R$ ${minVal.toFixed(2)}</div>
        </td>
        <td>
          <strong>${expires}</strong>
          <div class="admin-table-muted-line">Usos: ${uses}</div>
        </td>
        <td class="actions-col">
          ${canManageCoupons ? `
            <button class="btn-icon btn-edit" onclick="editCoupon('${c.id}')">Editar</button>
            <button class="btn-icon btn-delete" onclick="deleteCoupon('${c.id}')">Excluir</button>
          ` : '<span style="color: var(--muted); font-size: 0.85rem;">Somente superadmin</span>'}
        </td>
      </tr>
    `;
        }).join('');
        renderAdminPagination('coupons-pagination', pagination, loadCoupons);
    } catch (err) {
        toast('Erro ao carregar cupons: ' + err.message, 'error');
    }
}

document.getElementById('coupon-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!isSuperAdminLogged()) {
        toast('Somente o superadmin pode criar ou atualizar cupons', 'error');
        return;
    }
    if (!validateCouponForm({ show: true })) {
        toast('Revise os campos destacados antes de salvar o cupom', 'warning');
        return;
    }
    const id = document.getElementById('c-id').value;
    const code = normalizeCouponCodeInput();
    const discount_percent = Number(document.getElementById('c-discount').value);
    const min_value = Number(document.getElementById('c-min-value').value) || 0;
    const active = document.getElementById('c-active').value === 'true';
    const expires_at = document.getElementById('c-expires-at').value || null;
    const max_uses = document.getElementById('c-max-uses').value ? Number(document.getElementById('c-max-uses').value) : null;

    try {
        if (id) {
            // Editar
            await API.updateCoupon(id, { code, discount_percent, min_value, active, expires_at, max_uses }, getAdminAuthHeader());
            toast('Cupom atualizado!', 'success');
        } else {
            // Criar
            await API.createCoupon({ code, discount_percent, min_value, active, expires_at, max_uses }, getAdminAuthHeader());
            toast('Cupom criado!', 'success');
        }
        closeCouponForm();
        markAdminTabStale('dashboard');
        loadCoupons();
    } catch (err) {
        toast('Erro: ' + err.message, 'error');
    }
});

function resetCouponForm(options = {}) {
    const form = document.getElementById('coupon-form');
    if (form) form.reset();
    document.getElementById('c-id').value = '';
    document.getElementById('coupon-form-title').textContent = 'Criar novo cupom';
    clearCouponValidation();
    if (options.hide !== false) {
        setCouponFormVisible(false);
    }
}

async function editCoupon(id) {
    if (!isSuperAdminLogged()) {
        toast('Somente o superadmin pode editar cupons', 'error');
        return;
    }

    try {
        const coupon = _adminCouponsById.get(String(id));
        if (!coupon) return;

        document.getElementById('c-id').value = coupon.id;
        document.getElementById('c-code').value = coupon.code;
        document.getElementById('c-discount').value = coupon.discount_percent;
        document.getElementById('c-min-value').value = coupon.min_value || 0;
        document.getElementById('c-active').value = coupon.active ? 'true' : 'false';
        document.getElementById('c-expires-at').value = '';
        if (coupon.expires_at) {
            const match = String(coupon.expires_at).match(/^(\d{4}-\d{2}-\d{2})/);
            const date = match ? match[1] : new Date(coupon.expires_at).toISOString().split('T')[0];
            document.getElementById('c-expires-at').value = date;
        }
        document.getElementById('c-max-uses').value = coupon.max_uses || '';
        document.getElementById('coupon-form-title').textContent = `Editar cupom: ${coupon.code} (${coupon.uses_count} usos)`;

        clearCouponValidation();
        setCouponFormVisible(true);
        setTimeout(() => document.getElementById('c-code')?.focus(), 60);
    } catch (err) {
        toast('Erro: ' + err.message, 'error');
    }
}

async function deleteCoupon(id) {
    if (!isSuperAdminLogged()) {
        toast('Somente o superadmin pode excluir cupons', 'error');
        return;
    }

    const coupon = _adminCouponsById.get(String(id));
    const couponCode = coupon?.code || `#${id}`;
    const status = coupon ? getCouponStatusMeta(coupon) : null;
    const validity = coupon?.expires_at
        ? formatAdminDate(coupon.expires_at)
        : 'Sem prazo';
    const uses = coupon
        ? `${Number(coupon.uses_count || 0)}/${coupon.max_uses ? Number(coupon.max_uses) : 'ilimitado'}`
        : '-';

    showConfirmModal(
        `Tem certeza que deseja excluir o cupom ${escapeHTML(couponCode)}?`,
        () => confirmDeleteCoupon(id),
        {
            title: 'Excluir cupom',
            confirmLabel: 'Excluir cupom',
            danger: true,
            details: `
                <div><span>Código</span><strong>${escapeHTML(couponCode)}</strong></div>
                ${coupon ? `<div><span>Desconto</span><strong>${escapeHTML(coupon.discount_percent)}%</strong></div>` : ''}
                ${status ? `<div><span>Status</span><strong>${escapeHTML(status.label)}</strong></div>` : ''}
                <div><span>Validade</span><strong>${escapeHTML(validity)}</strong></div>
                <div><span>Usos</span><strong>${escapeHTML(uses)}</strong></div>
            `,
        }
    );
}

async function confirmDeleteCoupon(id) {
    try {
        await API.deleteCoupon(id, getAdminAuthHeader());
        toast('Cupom exclu\u00eddo!', 'success');
        markAdminTabStale('dashboard');
        loadCoupons();
    } catch (err) {
        toast('Erro: ' + err.message, 'error');
    }
}

/* ============================================================
   Dashboard - Gráficos e Relatórios
   ============================================================ */
let _orderNotificationTimer = null;

function ensureOrderNotificationBadgeElements() {
    document.getElementById('pending-orders-badge')?.classList.add('admin-notification-badge');
    const pedidosButton = document.querySelector('.admin-sidebar button[data-tab="pedidos"]');
    if (pedidosButton && !document.getElementById('order-notifications-badge')) {
        const badge = document.createElement('span');
        badge.id = 'order-notifications-badge';
        badge.className = 'admin-notification-badge';
        badge.textContent = '0';
        pedidosButton.appendChild(badge);
    }
}

function setupOrderNotificationPolling() {
    if (_orderNotificationPollingStarted) return;
    _orderNotificationPollingStarted = true;

    if (_orderNotificationTimer) return;
    _orderNotificationTimer = setInterval(() => loadOrderNotifications({ silent: true }), 45000);
}

function pluralizeOrderLabel(count) {
    return Number(count) === 1 ? 'pedido' : 'pedidos';
}

function buildOrderNotificationSummary(counts = {}) {
    const parts = [];
    const awaitingPayment = Number(counts.awaiting_payment || 0);
    const paymentConfirmed = Number(counts.payment_confirmed || 0);

    if (awaitingPayment > 0) {
        parts.push(`${awaitingPayment} ${pluralizeOrderLabel(awaitingPayment)} aguardando pagamento`);
    }
    if (paymentConfirmed > 0) {
        parts.push(`${paymentConfirmed} com pagamento confirmado para enviar/atualizar`);
    }

    return parts.join(' \u00b7 ');
}

function renderDashboardAttention({ notificationData, lowStockResponse, pixResponse } = {}) {
    const counts = getActionableOrderNotificationCounts(notificationData || {});
    const actionTotal = counts.awaiting_payment + counts.payment_confirmed;
    const lowStockItems = Array.isArray(lowStockResponse?.items) ? lowStockResponse.items : [];
    const pixTransactions = Array.isArray(pixResponse?.transactions) ? pixResponse.transactions : [];

    setTextContent('#dash-action-orders', actionTotal > 99 ? '99+' : String(actionTotal));
    setTextContent('#dash-processing-orders', counts.payment_confirmed > 99 ? '99+' : String(counts.payment_confirmed));
    setTextContent('#dash-low-stock', lowStockItems.length > 99 ? '99+' : String(lowStockItems.length));
    setTextContent('#dash-recent-sales', pixTransactions.length > 99 ? '99+' : String(pixTransactions.length));

    const orderText = document.getElementById('dash-action-orders-text');
    if (orderText) {
        const summary = buildOrderNotificationSummary(counts);
        orderText.innerHTML = summary || 'Nenhum pedido aguardando a&ccedil;&atilde;o.';
    }

    const lowStockPreview = document.getElementById('dashboard-low-stock-list');
    if (!lowStockPreview) return;

    if (!lowStockItems.length) {
        lowStockPreview.innerHTML = '<p style="color: var(--success); margin: 0;">Nenhum produto em estoque cr&iacute;tico.</p>';
        return;
    }

    lowStockPreview.innerHTML = lowStockItems.slice(0, 5).map(product => `
        <div class="dashboard-low-stock-item">
            <strong>${escapeHTML(product.name || 'Produto')}</strong>
            <span>${Number(product.stock || 0)} un.</span>
        </div>
    `).join('') + (lowStockItems.length > 5
        ? `<button type="button" onclick="showTab('estoque')" style="align-self: flex-start; border: 0; border-radius: 999px; background: #111; color: #fff; padding: 0.6rem 0.9rem; font-weight: 800; cursor: pointer;">Ver mais ${lowStockItems.length - 5}</button>`
        : '');
}

function getActionableOrderNotificationCounts(data = {}) {
    let awaitingPayment = Number(data.counts?.awaiting_payment || 0);
    let paymentConfirmed = Number(data.counts?.payment_confirmed || 0);

    if ((awaitingPayment + paymentConfirmed) === 0 && Array.isArray(data.items)) {
        data.items.forEach(order => {
            if (order.status === 'aguardando_pagamento' || order.status === 'pendente') {
                awaitingPayment++;
            } else if (order.status === 'processando') {
                paymentConfirmed++;
            }
        });
    }

    return {
        awaiting_payment: awaitingPayment,
        payment_confirmed: paymentConfirmed,
    };
}

function updateOrderNotificationUi(data = {}) {
    ensureOrderNotificationBadgeElements();

    const counts = getActionableOrderNotificationCounts(data);
    const total = counts.awaiting_payment + counts.payment_confirmed;
    const badges = [
        document.getElementById('pending-orders-badge'),
        document.getElementById('order-notifications-badge'),
    ].filter(Boolean);

    badges.forEach(badge => {
        badge.textContent = total > 99 ? '99+' : String(total);
        badge.style.display = total > 0 ? 'inline-flex' : 'none';
    });

    const alert = document.getElementById('admin-order-notification');
    if (!alert) return;

    if (total <= 0) {
        alert.style.display = 'none';
        alert.innerHTML = '';
        return;
    }

    const summary = buildOrderNotificationSummary(counts);
    alert.style.display = 'flex';
    alert.innerHTML = `
        <div>
            <strong>${total} ${pluralizeOrderLabel(total)} precisam de aten&ccedil;&atilde;o</strong>
            <span>${summary || 'Revise os pedidos recentes para manter tudo atualizado.'}</span>
        </div>
        <button type="button" onclick="openOrderNotifications()">Ver pedidos</button>
    `;
}

function openOrderNotifications() {
    const filter = document.getElementById('pedidos-filter');
    if (filter) filter.value = '';
    showTab('pedidos');
}

async function loadOrderNotifications({ silent = false, dateScoped = false, updateUi = true } = {}) {
    try {
        const auth = getAdminAuthHeader();
        const data = await API.request('/admin-reports/order-notifications' + (dateScoped ? buildDashboardQuery() : ''), {
            method: 'GET',
            headers: auth ? { Authorization: auth } : {},
        });
        if (updateUi) updateOrderNotificationUi(data);
        return data;
    } catch (err) {
        if (!silent) {
            console.warn('Erro ao carregar notifica\u00e7\u00f5es de pedidos:', err.message);
        }
        return null;
    }
}

let monthlyChart, productsChart;
let _dashboardPeriod = { preset: 'all', startDate: '', endDate: '' };

function toDashboardInputDate(date) {
    const local = new Date(date.getTime() - (date.getTimezoneOffset() * 60000));
    return local.toISOString().slice(0, 10);
}

function getDashboardPeriodRange(preset) {
    const today = new Date();
    const start = new Date(today);

    if (preset === 'today') {
        return { startDate: toDashboardInputDate(today), endDate: toDashboardInputDate(today) };
    }

    if (preset === '7d') {
        start.setDate(today.getDate() - 6);
        return { startDate: toDashboardInputDate(start), endDate: toDashboardInputDate(today) };
    }

    if (preset === 'year') {
        start.setMonth(0, 1);
        return { startDate: toDashboardInputDate(start), endDate: toDashboardInputDate(today) };
    }

    if (preset === 'all') {
        return { startDate: '', endDate: '' };
    }

    start.setDate(today.getDate() - 29);
    return { startDate: toDashboardInputDate(start), endDate: toDashboardInputDate(today) };
}

function syncDashboardPeriodInputs() {
    const startInput = document.getElementById('dashboard-start-date');
    const endInput = document.getElementById('dashboard-end-date');
    if (startInput) startInput.value = _dashboardPeriod.startDate || '';
    if (endInput) endInput.value = _dashboardPeriod.endDate || '';

    document.querySelectorAll('[data-dashboard-period]').forEach(button => {
        button.classList.toggle('active', button.dataset.dashboardPeriod === _dashboardPeriod.preset);
    });
}

function setDashboardPeriod(preset = '30d', options = {}) {
    _dashboardPeriod = {
        preset,
        ...getDashboardPeriodRange(preset),
    };
    syncDashboardPeriodInputs();

    if (options.reload !== false && _adminPanelInitialized) {
        loadDashboard();
    }
}

function applyDashboardCustomPeriod() {
    const startDate = document.getElementById('dashboard-start-date')?.value || '';
    const endDate = document.getElementById('dashboard-end-date')?.value || '';

    if (startDate && endDate && startDate > endDate) {
        toast('A data inicial n\u00e3o pode ser maior que a data final.', 'warning');
        return;
    }

    _dashboardPeriod = { preset: 'custom', startDate, endDate };
    syncDashboardPeriodInputs();
    loadDashboard();
}

function buildDashboardQuery(extra = {}) {
    const params = new URLSearchParams(extra);
    if (_dashboardPeriod.startDate) params.set('startDate', _dashboardPeriod.startDate);
    if (_dashboardPeriod.endDate) params.set('endDate', _dashboardPeriod.endDate);
    const query = params.toString();
    return query ? `?${query}` : '';
}

function setDashboardStatusCounts(summary = {}) {
    setTextContent('#status-chip-awaiting', Number(summary.awaiting_payment || 0));
    setTextContent('#status-chip-processing', Number(summary.processing || 0));
    setTextContent('#status-chip-shipped', Number(summary.shipped || 0));
    setTextContent('#status-chip-delivered', Number(summary.delivered || 0));
    setTextContent('#status-chip-canceled', Number(summary.canceled || 0));
}

function openDashboardStatusOrders(status) {
    const filter = document.getElementById('pedidos-filter');
    if (filter) filter.value = status || '';
    syncOrderStatusChips();
    showTab('pedidos');
    loadAllOrders({ resetPage: true });
}

function renderPendingPaymentOrders(pendingResponse = {}) {
    const pendingContainer = document.getElementById('pending-orders-list');
    if (!pendingContainer) return;

    const items = Array.isArray(pendingResponse.items) ? pendingResponse.items : [];
    if (!items.length) {
        pendingContainer.innerHTML = '<p style="color: var(--muted); margin: 0;">Nenhum pedido aguardando pagamento neste per&iacute;odo.</p>';
        return;
    }

    pendingContainer.innerHTML = `
        <div class="admin-pending-order-list">
            ${items.slice(0, 6).map(order => {
                const orderId = Number(order.id) || 0;
                const created = formatAdminDate(order.created_at);
                return `
                    <div class="admin-pending-order-card">
                        <div>
                            <strong>Pedido #${orderId} - ${escapeHTML(order.name || 'Cliente')}</strong>
                            <div class="admin-pending-order-meta">
                                <span>${formatBRL(order.total)}</span>
                                <span>${Number(order.item_count || 0)} item(ns)</span>
                                <span>Criado em ${created}</span>
                            </div>
                        </div>
                        <div class="admin-pending-order-actions">
                            <button type="button" class="confirm-payment" onclick="confirmPixPayment(${orderId})">Confirmar pagamento</button>
                            <button type="button" class="view-order" onclick="openDashboardStatusOrders('aguardando_pagamento')">Ver fila</button>
                        </div>
                    </div>
                `;
            }).join('')}
        </div>
    `;
}

async function loadDashboard() {
    try {
        const auth = getAdminAuthHeader();
        syncDashboardPeriodInputs();
        const fullReport = await API.request('/reports/full' + buildDashboardQuery(), {
            method: 'GET',
            headers: auth ? { Authorization: auth } : {},
        });

        // Carregar pedidos pendentes
        const pendingResponse = await API.request('/admin-reports/pending-orders' + buildDashboardQuery(), {
            method: 'GET',
            headers: auth ? { Authorization: auth } : {},
        });

        // Carregar transações PIX
        const pixResponse = await API.request('/admin-reports/pix-transactions' + buildDashboardQuery({ limit: 10 }), {
            method: 'GET',
            headers: auth ? { Authorization: auth } : {},
        });

        const lowStockResponse = await API.request('/admin-reports/low-stock?threshold=10', {
            method: 'GET',
            headers: auth ? { Authorization: auth } : {},
        });

        const statusSummary = await API.request('/admin-reports/order-status-summary' + buildDashboardQuery(), {
            method: 'GET',
            headers: auth ? { Authorization: auth } : {},
        });

        // Atualizar cards
        document.getElementById('total-sales').textContent = formatBRL(fullReport.summary.totalSales);
        document.getElementById('total-orders').textContent = fullReport.summary.totalOrders;
        document.getElementById('avg-ticket').textContent = formatBRL(fullReport.summary.averageTicket);

        const notificationData = await loadOrderNotifications({ silent: true, dateScoped: true, updateUi: false });
        renderDashboardAttention({ notificationData, lowStockResponse, pixResponse });
        setDashboardStatusCounts(statusSummary);

        // Renderizar lista de pedidos pendentes
        renderPendingPaymentOrders(pendingResponse);

        // Renderizar histórico de transações PIX
        const pixTable = document.getElementById('pix-transactions-table');
        if (pixTable) {
            if (pixResponse.transactions && pixResponse.transactions.length > 0) {
                pixTable.innerHTML = pixResponse.transactions.map(tx => `
                    <tr>
                        <td>#${tx.order_id}</td>
                        <td>${escapeHTML(tx.name || '-')}</td>
                        <td>${formatBRL(tx.amount)}</td>
                        <td><span style="background: ${tx.status === 'confirmed' ? 'var(--success)' : 'var(--warning)'}; color: white; padding: 0.25rem 0.5rem; border-radius: 3px;">${escapeHTML(tx.status)}</span></td>
                        <td>${formatAdminDate(tx.created_at)}</td>
                    </tr>
                `).join('');
            } else {
                pixTable.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--muted); padding: 1rem;">Nenhuma transa\u00e7\u00e3o registrada.</td></tr>';
            }
        }

        // Gráfico de vendas por mês
        const monthlyLabels = fullReport.monthlySales.map(m => {
            const date = new Date(m.month);
            return date.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
        });
        const monthlySales = fullReport.monthlySales.map(m => m.totalSales);

        const ctxMonthly = document.getElementById('chart-monthly').getContext('2d');
        if (monthlyChart) monthlyChart.destroy();
        monthlyChart = new Chart(ctxMonthly, {
            type: 'line',
            data: {
                labels: monthlyLabels,
                datasets: [{
                    label: 'Vendas (R$)',
                    data: monthlySales,
                    borderColor: '#2563EB',
                    backgroundColor: 'rgba(37, 99, 235, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4,
                }],
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: { position: 'top' },
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: { callback: v => 'R$ ' + v.toLocaleString('pt-BR') },
                    },
                },
            },
        });

        // Gráfico de produtos mais vendidos
        const topProducts = fullReport.topProducts.slice(0, 8);
        const productLabels = topProducts.map(p => p.name.substring(0, 15));
        const productSold = topProducts.map(p => p.totalSold);

        const ctxProducts = document.getElementById('chart-products').getContext('2d');
        if (productsChart) productsChart.destroy();
        productsChart = new Chart(ctxProducts, {
            type: 'bar',
            data: {
                labels: productLabels,
                datasets: [{
                    label: 'Unidades Vendidas',
                    data: productSold,
                    backgroundColor: [
                        '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0',
                        '#9966FF', '#FF9F40', '#FF6384', '#C9CBCF',
                    ],
                    borderRadius: 4,
                }],
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                indexAxis: 'x',
                plugins: { legend: { position: 'top' } },
                scales: { y: { beginAtZero: true } },
            },
        });
    } catch (err) {
        toast('Erro ao carregar dashboard: ' + err.message, 'error');
    }
}

function showTab(tabName) {
    if ((tabName === 'admins' || tabName === 'audit-logs') && !isSuperAdminLogged()) {
        toast('Essa \u00e1rea \u00e9 exclusiva do superadmin', 'warning');
        tabName = 'dashboard';
    }

    document.querySelectorAll('.admin-content > div').forEach(el => el.style.display = 'none');
    const tabEl = document.getElementById('tab-' + tabName);
    if (!tabEl) return;
    tabEl.style.display = 'block';
    document.querySelectorAll('.admin-sidebar button').forEach(b => b.classList.remove('active'));
    document.querySelector(`[data-tab="${tabName}"]`)?.classList.add('active');

    if (tabName === 'dashboard') {
        loadAdminTabOnDemand(tabName, () => setTimeout(loadDashboard, 100));
    } else if (tabName === 'products') {
        loadAdminTabOnDemand(tabName, loadProducts);
    } else if (tabName === 'coupons') {
        loadAdminTabOnDemand(tabName, loadCoupons);
    } else if (tabName === 'clientes') {
        loadAdminTabOnDemand(tabName, loadClientesReport);
    } else if (tabName === 'estoque') {
        loadAdminTabOnDemand(tabName, loadEstoqueReport);
    } else if (tabName === 'pedidos') {
        loadAdminTabOnDemand(tabName, loadAllOrders);
    } else if (tabName === 'admins') {
        loadAdminTabOnDemand(tabName, loadAdmins);
    } else if (tabName === 'audit-logs') {
        loadAdminTabOnDemand(tabName, loadAuditLogs);
    } else if (tabName === 'promocoes') {
        loadAdminTabOnDemand(tabName, loadNewsletterSubscribers);
    }
}

/* ============================================================
   Gerenciamento de Pedidos (admin)
   ============================================================ */
const ORDER_STATUS_META = {
    aguardando_pagamento: { label: 'Aguardando Pagamento', color: '#B45309', bg: '#FEF3C7', className: 'is-awaiting' },
    processando:          { label: 'Processando',           color: '#B45309', bg: '#FFF7ED', className: 'is-processing' },
    enviado:              { label: 'Enviado',               color: '#2563EB', bg: '#DBEAFE', className: 'is-shipped' },
    entregue:             { label: 'Entregue',              color: '#15803D', bg: '#DCFCE7', className: 'is-delivered' },
    cancelado:            { label: 'Cancelado',             color: '#DC2626', bg: '#FEE2E2', className: 'is-canceled' },
    pendente:             { label: 'Aguardando Pagamento',  color: '#64748B', bg: '#E2E8F0', className: 'is-awaiting' },
};

function nextActionsForStatus(status) {
    // Retorna os próximos status possíveis para aquele pedido
    switch (status) {
        case 'aguardando_pagamento':
            return [
                { to: 'processando', label: 'Confirmar pagamento', color: '#15803D' },
                { to: 'cancelado',   label: 'Cancelar',            color: '#DC2626' },
            ];
        case 'processando':
            return [
                { to: 'enviado',   label: 'Marcar como enviado', color: '#2563EB' },
                { to: 'cancelado', label: 'Cancelar',            color: '#DC2626' },
            ];
        case 'enviado':
            return [
                { to: 'entregue', label: 'Marcar como entregue', color: '#15803D' },
            ];
        case 'entregue':
            return []; // finalizado
        case 'cancelado':
            return []; // finalizado
        default:
            return [
                { to: 'processando', label: 'Marcar como processando', color: '#B45309' },
                { to: 'cancelado',   label: 'Cancelar',    color: '#DC2626' },
            ];
    }
}

function renderAdminOrderActionButton(orderId, action) {
    const metaClass = ORDER_STATUS_META[action.to]?.className || '';
    const riskClass = action.to === 'cancelado'
        ? 'is-danger-action'
        : action.to === 'processando'
            ? 'is-confirm-action'
            : '';

    return `
        <button type="button"
                class="admin-order-action ${metaClass} ${riskClass}"
                onclick="changeOrderStatus(${orderId}, '${action.to}')">
            ${escapeHTML(action.label)}
        </button>
    `;
}

function renderAdminOrderActions(orderId, actions) {
    if (!actions.length) {
        return '<span class="admin-order-no-actions">Sem a\u00e7\u00f5es dispon\u00edveis</span>';
    }

    const cancelAction = actions.find(action => action.to === 'cancelado');
    const mainActions = actions.filter(action => action.to !== 'cancelado');

    return `
        <div class="admin-order-action-stack">
            ${mainActions.length ? `
                <div class="admin-order-safe-actions">
                    ${mainActions.map(action => renderAdminOrderActionButton(orderId, action)).join('')}
                </div>
            ` : ''}
            ${cancelAction ? `
                <div class="admin-order-danger-zone">
                    ${renderAdminOrderActionButton(orderId, cancelAction)}
                </div>
            ` : ''}
        </div>
    `;
}

function getOrderStatusConfirmationCopy(orderId, newStatus, label) {
    if (newStatus === 'processando') {
        return {
            title: `Confirmar pagamento do pedido #${orderId}?`,
            message: 'Confirme somente se o valor PIX realmente entrou na conta. Depois disso, o pedido vai para preparo.',
            confirmLabel: 'Sim, pagamento recebido',
            danger: false,
            warning: 'Essa a\u00e7\u00e3o altera o status e libera a opera\u00e7\u00e3o do pedido.',
        };
    }

    if (newStatus === 'cancelado') {
        return {
            title: `Cancelar pedido #${orderId}?`,
            message: 'Essa a\u00e7\u00e3o marca o pedido como cancelado e abre o WhatsApp do cliente para contato.',
            confirmLabel: 'Sim, cancelar pedido',
            danger: true,
            warning: 'Confira o pedido antes de cancelar. Pedidos cancelados n\u00e3o entram mais no fluxo de preparo.',
        };
    }

    return {
        title: 'Alterar status do pedido',
        message: `Voc\u00ea vai alterar o pedido <strong>#${orderId}</strong> para <strong>${escapeHTML(label)}</strong>.`,
        confirmLabel: `Confirmar ${label}`,
        danger: false,
        warning: '',
    };
}

// Cache dos pedidos carregados, para atualizar cards individuais
// sem precisar refazer o fetch de toda a lista a cada troca de status.
let _adminOrdersCache = [];
let _adminOrdersPage = 1;
const ADMIN_ORDERS_PER_PAGE = 10;

function setupAdminOrderFilters() {
    const searchInput = document.getElementById('pedidos-search');
    searchInput?.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            applyOrderSearch();
        }
    });
    syncOrderStatusChips();
}

function syncOrderStatusChips() {
    const activeStatus = document.getElementById('pedidos-filter')?.value || '';
    document.querySelectorAll('[data-order-status]').forEach(chip => {
        chip.classList.toggle('active', chip.dataset.orderStatus === activeStatus);
    });
}

function setOrderStatusFilter(status = '') {
    const filter = document.getElementById('pedidos-filter');
    if (filter) filter.value = status;
    syncOrderStatusChips();
    loadAllOrders({ resetPage: true });
}

function applyOrderSearch() {
    loadAllOrders({ resetPage: true });
}

function clearOrderFilters() {
    const search = document.getElementById('pedidos-search');
    const filter = document.getElementById('pedidos-filter');
    if (search) search.value = '';
    if (filter) filter.value = '';
    syncOrderStatusChips();
    loadAllOrders({ resetPage: true });
}

function normalizeBrazilianWhatsAppPhone(phone) {
    const digits = String(phone || '').replace(/\D/g, '').replace(/^0+/, '');

    if (digits.startsWith('55') && digits.length >= 12) {
        return digits;
    }

    if (digits.length >= 10 && digits.length <= 11) {
        return `55${digits}`;
    }

    return '';
}

function buildCancelledOrderWhatsAppMessage(order) {
    const customerName = order.customer_name || 'cliente';
    const orderId = order.id || order.order_id || '';
    const total = order.total ? ` no valor de ${formatBRL(order.total)}` : '';

    return [
        `Ol\u00e1, ${customerName}! Aqui \u00e9 da Prime Sneaker.`,
        `Estamos entrando em contato sobre o pedido #${orderId}${total}, que foi cancelado.`,
        'Se quiser, podemos te ajudar por aqui com qualquer d\u00favida ou pr\u00f3ximo passo.'
    ].join(' ');
}

function openCancelledOrderWhatsApp(order) {
    const phone = normalizeBrazilianWhatsAppPhone(order.customer_phone || order.phone || order.user_phone);

    if (!phone) {
        toast('Pedido cancelado, mas o cliente n\u00e3o tem telefone cadastrado.', 'warning');
        return;
    }

    const message = encodeURIComponent(buildCancelledOrderWhatsAppMessage(order));
    const whatsappUrl = `https://wa.me/${phone}?text=${message}`;
    const opened = window.open(whatsappUrl, '_blank');

    if (opened) {
        opened.opener = null;
        opened.focus();
    } else {
        if (typeof copyTextWithFeedback === 'function') {
            copyTextWithFeedback(whatsappUrl, 'Link do WhatsApp copiado. Abra em uma nova guia.');
        } else {
            toast('Permita pop-ups para abrir o WhatsApp em outra guia.', 'warning');
        }
    }
}

async function loadAllOrders(options = {}) {
    if (typeof options === 'number') {
        _adminOrdersPage = Math.max(1, options);
    } else if (options.resetPage) {
        _adminOrdersPage = 1;
    } else if (options.page) {
        _adminOrdersPage = Math.max(1, Number(options.page) || 1);
    }

    const container = document.getElementById('pedidos-list');
    const paginationContainer = document.getElementById('pedidos-pagination');
    if (!container) return;
    // Só mostrar "Carregando..." se não tiver nada renderizado ainda,
    // para não piscar a lista inteira a cada atualização.
    if (!container.querySelector('[id^="order-card-"]')) {
        container.innerHTML = '<p style="color: var(--muted);">Carregando pedidos...</p>';
    }
    try {
        const auth = getAdminAuthHeader();
        const filter = document.getElementById('pedidos-filter')?.value || '';
        const search = document.getElementById('pedidos-search')?.value.trim() || '';
        const params = new URLSearchParams({
            page: String(_adminOrdersPage),
            limit: String(ADMIN_ORDERS_PER_PAGE),
        });
        if (filter) params.set('status', filter);
        if (search) params.set('q', search);
        const response = await API.request('/orders/admin/all?' + params.toString(), {
            method: 'GET',
            headers: auth ? { Authorization: auth } : {},
        });

        _adminOrdersCache = response.items || [];
        syncOrderStatusChips();
        loadOrderNotifications({ silent: true });

        if (_adminOrdersCache.length === 0) {
            container.innerHTML = '<p style="color: var(--muted);">Nenhum pedido encontrado.</p>';
            if (paginationContainer) paginationContainer.innerHTML = '';
            return;
        }

        container.innerHTML = _adminOrdersCache.map(renderAdminOrderCard).join('');
        renderAdminOrdersPagination(response.pagination || {});
    } catch (err) {
        container.innerHTML = `<p style="color: var(--danger);">Erro ao carregar pedidos: ${escapeHTML(err.message)}</p>`;
        if (paginationContainer) paginationContainer.innerHTML = '';
        toast('Erro ao carregar pedidos: ' + err.message, 'error');
    }
}

function renderAdminOrdersPagination(pagination = {}) {
    const container = document.getElementById('pedidos-pagination');
    if (!container) return;

    const currentPage = Number(pagination.page || _adminOrdersPage || 1);
    const totalPages = Math.max(1, Number(pagination.totalPages || 1));
    const total = Number(pagination.total || 0);

    _adminOrdersPage = currentPage;

    if (totalPages <= 1) {
        container.innerHTML = total > 0
            ? `<div class="page-summary">${total} pedido(s) encontrado(s)</div>`
            : '';
        return;
    }

    const pages = [];
    const start = Math.max(1, currentPage - 2);
    const end = Math.min(totalPages, currentPage + 2);

    if (start > 1) {
        pages.push(1);
        if (start > 2) pages.push('...');
    }

    for (let page = start; page <= end; page++) {
        pages.push(page);
    }

    if (end < totalPages) {
        if (end < totalPages - 1) pages.push('...');
        pages.push(totalPages);
    }

    const pageButtons = pages.map(page => {
        if (page === '...') {
            return '<span style="color: var(--muted); padding: 0 0.25rem;">...</span>';
        }

        return `
            <button type="button"
                    class="${page === currentPage ? 'active' : ''}"
                    onclick="loadAllOrders(${page})"
                    aria-label="Ir para p\u00e1gina ${page}">
                ${page}
            </button>
        `;
    }).join('');

    container.innerHTML = `
        <button type="button" onclick="loadAllOrders(${currentPage - 1})" ${currentPage <= 1 ? 'disabled' : ''}>\u2039</button>
        ${pageButtons}
        <button type="button" onclick="loadAllOrders(${currentPage + 1})" ${currentPage >= totalPages ? 'disabled' : ''}>\u203a</button>
        <div class="page-summary">P\u00e1gina ${currentPage} de ${totalPages} \u00b7 ${total} pedido(s)</div>
    `;
}

function normalizeAdminOrderAddress(order = {}) {
    let raw = order.shipping_address || order.shippingAddress || {};
    if (typeof raw === 'string') {
        try {
            raw = JSON.parse(raw);
        } catch (err) {
            raw = {};
        }
    }

    const city = raw.cidade || raw.city || '';
    const state = raw.estado || raw.state || raw.uf || '';

    return {
        cep: raw.cep || raw.postalCode || raw.shippingCep || '',
        rua: raw.rua || raw.street || raw.address || '',
        numero: raw.numero || raw.number || '',
        complemento: raw.complemento || raw.complement || '',
        bairro: raw.bairro || raw.neighborhood || '',
        cidade: city && state && !String(city).includes(state) ? `${city}/${state}` : city || state,
    };
}

function hasAdminOrderAddress(address) {
    return Object.values(address || {}).some(value => String(value || '').trim());
}

function formatAdminOrderAddressLine(address) {
    const street = [address.rua, address.numero].filter(Boolean).join(', ');
    return [
        address.cep ? `CEP ${address.cep}` : '',
        street,
        address.complemento ? `Complemento: ${address.complemento}` : '',
        address.bairro,
        address.cidade,
    ].filter(Boolean).join(' · ');
}

function renderAdminOrderAddressSummary(order) {
    const address = normalizeAdminOrderAddress(order);
    if (!hasAdminOrderAddress(address)) {
        return '<br><strong>Entrega:</strong> <span class="admin-order-address-summary is-empty">Endereço não informado neste pedido</span>';
    }

    return `<br><strong>Entrega:</strong> <span class="admin-order-address-summary">${escapeHTML(formatAdminOrderAddressLine(address))}</span>`;
}

function renderAdminOrderAddressBlock(order) {
    const address = normalizeAdminOrderAddress(order);
    if (!hasAdminOrderAddress(address)) {
        return `
            <div class="admin-order-address-card is-empty">
                <strong>Endereço de entrega</strong>
                <span>Endereço não informado neste pedido.</span>
            </div>
        `;
    }

    const fields = [
        ['CEP', address.cep],
        ['Rua', [address.rua, address.numero].filter(Boolean).join(', ')],
        ['Bairro', address.bairro],
        ['Cidade/UF', address.cidade],
        ['Complemento', address.complemento],
    ].filter(([, value]) => String(value || '').trim());

    return `
        <div class="admin-order-address-card">
            <strong>Endereço de entrega</strong>
            <div class="admin-order-address-grid">
                ${fields.map(([label, value]) => `
                    <div>
                        <span>${escapeHTML(label)}</span>
                        <b>${escapeHTML(value)}</b>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}

function renderAdminOrderCard(order) {
    const meta = ORDER_STATUS_META[order.status] || ORDER_STATUS_META.pendente;
    const actions = nextActionsForStatus(order.status);
    const orderId = Number(order.id) || 0;
    const customerName = escapeHTML(order.customer_name || 'Sem nome');
    const customerEmail = escapeHTML(order.customer_email || '-');
    const customerPhone = escapeHTML(order.customer_phone || '');
    const actionsHtml = renderAdminOrderActions(orderId, actions);

    const created = formatAdminDateTime(order.created_at);

    return `
        <div id="order-card-${orderId}" class="admin-order-card ${meta.className || ''}">
            <div class="admin-order-card-main">
                <div class="admin-order-info">
                    <div class="admin-order-title-row">
                        <strong>Pedido #${orderId}</strong>
                        <span class="admin-order-status ${meta.className || ''}">
                            ${meta.label}
                        </span>
                    </div>
                    <div class="admin-order-copy">
                        <strong>Cliente:</strong> ${customerName}
                        <span style="color: var(--muted);"> &lt;${customerEmail}&gt;</span>
                        ${order.customer_phone ? `<br><strong>Telefone:</strong> ${customerPhone}` : ''}
                        <br><strong>Itens:</strong> ${order.item_count || 0}
                        | <strong>Total:</strong> ${formatBRL(order.total)}
                        ${renderAdminOrderAddressSummary(order)}
                        <br><small style="color: var(--muted);">Criado em ${created}</small>
                    </div>
                </div>
                <div class="admin-order-actions">
                    <div class="admin-order-quick-actions">${actionsHtml}</div>
                    <button type="button" class="admin-order-detail-button" onclick="viewOrderDetail(${orderId})">
                        Ver itens
                    </button>
                </div>
            </div>
            <div id="order-detail-${orderId}" class="admin-order-detail"></div>
        </div>
    `;
}

function showConfirmModal(message, onConfirm, options = {}) {
    const modal = document.createElement('div');
    modal.className = 'confirm-modal';
    modal.innerHTML = `
        <div class="confirm-modal-content ${options.danger ? 'is-danger-confirm' : ''}">
            <h3>${escapeHTML(options.title || 'Confirmar a\u00e7\u00e3o')}</h3>
            <p>${message}</p>
            ${options.details ? `<div class="confirm-modal-details">${options.details}</div>` : ''}
            <div class="confirm-modal-buttons">
                <button type="button" class="confirm-btn-yes">${escapeHTML(options.confirmLabel || 'Confirmar')}</button>
                <button type="button" class="confirm-btn-no">Cancelar</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    // Ligar handlers via addEventListener em vez de inline onclick="".
    // O inline quebrava porque o corpo da função passada em `onConfirm`
    // contém aspas duplas, fechando o atributo HTML antes da hora.
    const btnYes = modal.querySelector('.confirm-btn-yes');
    const btnNo = modal.querySelector('.confirm-btn-no');
    btnYes.addEventListener('click', () => {
        modal.remove();
        try {
            if (typeof onConfirm === 'function') onConfirm();
        } catch (err) {
            console.error('Erro no callback de confirma\u00e7\u00e3o:', err);
        }
    });
    btnNo.addEventListener('click', () => modal.remove());
}

async function changeOrderStatus(orderId, newStatus) {
    const cachedBeforeModal = _adminOrdersCache.find(o => o.id === orderId);
    const previousLabel = ORDER_STATUS_META[cachedBeforeModal?.status]?.label || 'Status atual';
    const label = ORDER_STATUS_META[newStatus]?.label || newStatus;
    const confirmation = getOrderStatusConfirmationCopy(orderId, newStatus, label);

    showConfirmModal(
        confirmation.message,
        async function() {
            // Guardar status anterior para possível rollback
            const cached = _adminOrdersCache.find(o => o.id === orderId);
            const orderBeforeUpdate = cached ? { ...cached } : null;
            const previousStatus = cached ? cached.status : null;
            const filterEl = document.getElementById('pedidos-filter');
            const activeFilter = filterEl ? filterEl.value : '';

            // Atualização OTIMISTA: mexer imediatamente no card antes
            // mesmo da resposta do servidor, para evitar o delay percebido.
            if (cached) {
                cached.status = newStatus;
                const card = document.getElementById(`order-card-${orderId}`);
                if (card) {
                    // Se há filtro e o novo status não casa mais, remover da lista.
                    if (activeFilter && activeFilter !== newStatus) {
                        card.remove();
                        _adminOrdersCache = _adminOrdersCache.filter(o => o.id !== orderId);
                        const container = document.getElementById('pedidos-list');
                        if (container && _adminOrdersCache.length === 0) {
                            container.innerHTML = '<p style="color: var(--muted);">Nenhum pedido encontrado.</p>';
                        }
                    } else {
                        card.outerHTML = renderAdminOrderCard(cached);
                    }
                }
            }

            try {
                const auth = getAdminAuthHeader();
                const updatedOrder = await API.request(`/orders/${orderId}/status`, {
                    method: 'PATCH',
                    headers: auth ? { Authorization: auth } : {},
                    body: { status: newStatus },
                });
                toast(`Pedido #${orderId} atualizado para "${label}"`, 'success');
                markAdminTabStale('dashboard');
                loadOrderNotifications({ silent: true });

                if (newStatus === 'cancelado') {
                    openCancelledOrderWhatsApp({
                        ...(orderBeforeUpdate || {}),
                        ...(cached || {}),
                        ...(updatedOrder || {}),
                        id: orderId,
                    });
                }
            } catch (err) {
                // Reverter a mudança otimista se a API falhar
                if (cached && previousStatus !== null) {
                    cached.status = previousStatus;
                    const card = document.getElementById(`order-card-${orderId}`);
                    if (card) card.outerHTML = renderAdminOrderCard(cached);
                }
                toast('Erro: ' + err.message, 'error');
                // Em caso de erro, recarregar tudo para ficar consistente
                loadAllOrders();
            }
        },
        {
            title: confirmation.title,
            confirmLabel: confirmation.confirmLabel,
            danger: confirmation.danger,
            details: `
                <div><span>De</span><strong>${escapeHTML(previousLabel)}</strong></div>
                <div><span>Para</span><strong>${escapeHTML(label)}</strong></div>
                ${confirmation.warning ? `<small>${escapeHTML(confirmation.warning)}</small>` : ''}
            `,
        }
    );
}

async function viewOrderDetail(orderId) {
    const box = document.getElementById(`order-detail-${orderId}`);
    if (!box) return;
    if (box.style.display === 'block') {
        box.style.display = 'none';
        return;
    }
    box.style.display = 'block';
    box.innerHTML = '<small style="color: var(--muted);">Carregando itens...</small>';
    try {
        const auth = getAdminAuthHeader();
        const order = await API.request(`/orders/${orderId}`, {
            method: 'GET',
            headers: auth ? { Authorization: auth } : {},
        });
        const items = order.items || [];
        if (items.length === 0) {
            box.innerHTML = '<small style="color: var(--muted);">Nenhum item encontrado.</small>';
            return;
        }
        box.innerHTML = `
            ${renderAdminOrderAddressBlock(order)}
            <strong class="admin-order-detail-title">Itens do pedido:</strong>
            <div class="admin-table-wrapper admin-order-items-wrapper" style="--admin-table-min-width: 760px;">
            <table class="admin-order-items-table">
                <thead>
                    <tr>
                        <th>Produto comprado</th>
                        <th>Detalhes</th>
                        <th>Qtd</th>
                        <th>Pre\u00e7o</th>
                        <th>Subtotal</th>
                    </tr>
                </thead>
                <tbody>
                    ${items.map(it => {
                        const productName = it.product_name || '-';
                        const imageUrl = safeImageSrc(it.image_url, 'https://via.placeholder.com/96?text=Produto');
                        const details = [
                            it.brand ? `Marca: ${it.brand}` : '',
                            it.color ? `Cor: ${it.color}` : '',
                            it.size ? `Tamanho: ${it.size}` : '',
                            it.product_id ? `Produto #${it.product_id}` : '',
                        ].filter(Boolean);

                        return `
                            <tr>
                                <td>
                                    <div class="admin-order-item-product">
                                        <img src="${escapeAttribute(imageUrl)}"
                                             alt="${escapeAttribute(productName)}"
                                             loading="lazy"
                                             decoding="async">
                                        <div>
                                            <strong>${escapeHTML(productName)}</strong>
                                            ${it.color ? `<span>Cor selecionada: ${escapeHTML(it.color)}</span>` : ''}
                                        </div>
                                    </div>
                                </td>
                                <td>
                                    <div class="admin-order-item-details">
                                        ${details.length
                                            ? details.map(detail => `<span>${escapeHTML(detail)}</span>`).join('')
                                            : '<span>Sem detalhes adicionais</span>'}
                                    </div>
                                </td>
                                <td class="admin-order-item-center">${Number(it.quantity) || 0}</td>
                                <td class="admin-order-item-money">${formatBRL(it.product_price)}</td>
                                <td class="admin-order-item-money"><strong>${formatBRL(it.line_total)}</strong></td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
            </div>
        `;
    } catch (err) {
        box.innerHTML = `<small style="color: var(--danger);">Erro: ${escapeHTML(err.message)}</small>`;
    }
}

async function loadClientesReport() {
    const tbody = document.getElementById('clientes-table');
    if (!tbody) return;
    try {
        const auth = getAdminAuthHeader();
        const response = await API.request('/admin-reports/customers', {
            method: 'GET',
            headers: auth ? { Authorization: auth } : {},
        });

        if (!Array.isArray(response) || response.length === 0) {
            _adminCustomersCache = [];
            renderCustomerSummary([]);
            tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--muted); padding: 1rem;">Nenhum cliente cadastrado.</td></tr>';
            return;
        }

        _adminCustomersCache = response;
        renderCustomerSummary(response);
        renderClientesTable();
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--danger); padding: 1rem;">Erro: ${escapeHTML(err.message)}</td></tr>`;
        toast('Erro ao carregar relat\u00f3rio de clientes: ' + err.message, 'error');
    }
}

function setupAdminCustomerFilters() {
    if (_adminCustomerFiltersReady) return;
    _adminCustomerFiltersReady = true;

    const search = document.getElementById('admin-customer-search');
    const sort = document.getElementById('admin-customer-sort');
    if (search) search.addEventListener('input', renderClientesTable);
    if (sort) sort.addEventListener('change', renderClientesTable);
}

function getFilteredAdminCustomers() {
    const query = (document.getElementById('admin-customer-search')?.value || '').trim().toLowerCase();
    const sort = document.getElementById('admin-customer-sort')?.value || 'spent_desc';
    let customers = [..._adminCustomersCache];

    if (query) {
        customers = customers.filter(client => {
            const haystack = [
                client.name,
                client.email,
                client.phone,
            ].map(value => String(value || '').toLowerCase()).join(' ');
            return haystack.includes(query);
        });
    }

    customers.sort((a, b) => {
        if (sort === 'orders_desc') {
            return Number(b.total_orders || 0) - Number(a.total_orders || 0);
        }
        if (sort === 'recent_desc') {
            return new Date(b.last_order_date || 0).getTime() - new Date(a.last_order_date || 0).getTime();
        }
        if (sort === 'name_asc') {
            return String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR');
        }
        return Number(b.total_spent || 0) - Number(a.total_spent || 0);
    });

    return customers;
}

function renderCustomerSummary(customers = []) {
    const totalCustomers = customers.length;
    const customersWithOrders = customers.filter(client => Number(client.total_orders || 0) > 0).length;
    const totalSpent = customers.reduce((sum, client) => sum + Number(client.total_spent || 0), 0);
    const averageSpent = customersWithOrders > 0 ? totalSpent / customersWithOrders : 0;

    const setText = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    };

    setText('customers-total', totalCustomers);
    setText('customers-with-orders', customersWithOrders);
    setText('customers-total-spent', formatBRL(totalSpent));
    setText('customers-average-spent', formatBRL(averageSpent));
}

function renderClientesTable() {
    const tbody = document.getElementById('clientes-table');
    if (!tbody) return;

    const customers = getFilteredAdminCustomers();
    if (!customers.length) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--muted); padding: 1rem;">Nenhum cliente encontrado com esse filtro.</td></tr>';
        return;
    }

    tbody.innerHTML = customers.map(client => {
        const orders = Number(client.total_orders || 0);
        const spent = Number(client.total_spent || 0);
        const lastOrder = client.last_order_date ? formatAdminDate(client.last_order_date) : 'Nunca';
        const email = client.email || '';

        return `
            <tr>
                <td>
                    <strong>${escapeHTML(client.name || '-')}</strong>
                    <div class="admin-table-muted-line">${escapeHTML(email || '-')}</div>
                    <div class="admin-table-muted-line">${escapeHTML(client.phone || 'Sem telefone')}</div>
                    ${orders > 0 ? '<span class="admin-client-badge">Cliente comprador</span>' : ''}
                </td>
                <td>${orders}</td>
                <td><strong>${formatBRL(spent)}</strong></td>
                <td>${lastOrder}</td>
                <td>
                    <button type="button" class="admin-client-orders-btn" data-client-email="${escapeAttribute(email)}" data-client-name="${escapeAttribute(client.name || 'Cliente')}">
                        Ver pedidos
                    </button>
                </td>
            </tr>
        `;
    }).join('');

    tbody.querySelectorAll('.admin-client-orders-btn').forEach(button => {
        button.addEventListener('click', () => {
            openCustomerOrderHistory(button.dataset.clientEmail || '', button.dataset.clientName || 'Cliente');
        });
    });
}

function resetCustomerFilters() {
    const search = document.getElementById('admin-customer-search');
    const sort = document.getElementById('admin-customer-sort');
    if (search) search.value = '';
    if (sort) sort.value = 'spent_desc';
    renderClientesTable();
}

function openCustomerOrderHistory(email, name) {
    const orderSearch = document.getElementById('pedidos-search');
    const orderStatus = document.getElementById('pedidos-filter');

    if (orderSearch) orderSearch.value = email || name || '';
    if (orderStatus) orderStatus.value = '';

    _adminLoadedTabs.delete('pedidos');
    showTab('pedidos');
    toast(`Hist\u00f3rico de pedidos filtrado para ${name || email || 'cliente'}`, 'info');
}

function getStockSeverityMeta(stock) {
    const amount = Number(stock || 0);
    if (amount <= 5) {
        return { label: 'Cr\u00edtico', className: 'is-critical', rank: 0 };
    }
    if (amount <= 10) {
        return { label: 'Aten\u00e7\u00e3o', className: 'is-attention', rank: 1 };
    }
    return { label: 'OK', className: 'is-ok', rank: 2 };
}

function setupAdminStockFilters() {
    if (_adminStockFiltersReady) return;
    _adminStockFiltersReady = true;

    const sort = document.getElementById('admin-stock-sort');
    if (sort) sort.addEventListener('change', () => loadEstoqueReport({ resetPage: true }));
}

function updateStockSummary(severity = {}, items = []) {
    const fallback = items.reduce((acc, item) => {
        const meta = getStockSeverityMeta(item.stock);
        if (meta.className === 'is-critical') acc.critical += 1;
        else if (meta.className === 'is-attention') acc.attention += 1;
        else acc.ok += 1;
        return acc;
    }, { critical: 0, attention: 0, ok: 0 });

    const counts = {
        critical: Number(severity.critical ?? fallback.critical ?? 0),
        attention: Number(severity.attention ?? fallback.attention ?? 0),
        ok: Number(severity.ok ?? fallback.ok ?? 0),
    };

    const setText = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    };

    setText('stock-critical-count', counts.critical);
    setText('stock-attention-count', counts.attention);
    setText('stock-ok-count', counts.ok);
}

function getSortedLowStockItems() {
    return [..._adminLowStockItemsCache];
}

function parseAdminJsonArray(value) {
    if (Array.isArray(value)) return value;
    if (typeof value !== 'string') return [];

    try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
        return [];
    }
}

function getProductStockBySize(product = {}) {
    const cachedProduct = _adminProductsById.get(String(product.id || '')) || {};
    const rawSizes = [
        ...parseAdminJsonArray(product.stock_by_size),
        ...parseAdminJsonArray(product.stockBySize),
        ...parseAdminJsonArray(product.size_stock),
        ...parseAdminJsonArray(product.sizeStock),
        ...parseAdminJsonArray(cachedProduct.stock_by_size),
        ...parseAdminJsonArray(cachedProduct.stockBySize),
    ];

    const trackedSizes = rawSizes
        .map(item => ({
            size: String(item.size ?? item.tamanho ?? '').trim(),
            stock: Number(item.stock ?? item.quantity ?? item.quantidade ?? 0),
            tracked: true,
        }))
        .filter(item => item.size)
        .sort((a, b) => {
            const aNumber = Number(a.size.replace(',', '.'));
            const bNumber = Number(b.size.replace(',', '.'));
            if (Number.isFinite(aNumber) && Number.isFinite(bNumber)) return aNumber - bNumber;
            return a.size.localeCompare(b.size, 'pt-BR', { numeric: true });
        });

    if (trackedSizes.length) return trackedSizes;

    return String(product.sizes || cachedProduct.sizes || '')
        .split(',')
        .map(size => size.trim())
        .filter(Boolean)
        .sort((a, b) => {
            const aNumber = Number(a.replace(',', '.'));
            const bNumber = Number(b.replace(',', '.'));
            if (Number.isFinite(aNumber) && Number.isFinite(bNumber)) return aNumber - bNumber;
            return a.localeCompare(b, 'pt-BR', { numeric: true });
        })
        .map(size => ({ size, stock: null, tracked: false }));
}

async function hydrateStockItemsWithSizes(items = []) {
    await Promise.all(items.map(async product => {
        const cachedProduct = _adminProductsById.get(String(product.id || '')) || {};
        if (!product.sizes && cachedProduct.sizes) {
            product.sizes = cachedProduct.sizes;
        }

        if (getProductStockBySize(product).some(item => item.tracked) || !product.id) {
            return;
        }

        try {
            const stocks = await fetch(`/api/products/${product.id}/size-stock`).then(response => response.json());
            if (Array.isArray(stocks) && stocks.length) {
                product.stock_by_size = stocks;
                if (!product.sizes) {
                    product.sizes = stocks.map(item => item.size).filter(Boolean).join(',');
                }
            }
        } catch (err) {
            console.warn('Erro ao carregar estoque por tamanho:', err.message);
        }
    }));

    return items;
}

function renderStockBySize(product = {}) {
    const sizes = getProductStockBySize(product);
    if (!sizes.length) {
        return '<span class="stock-size-empty">Sem tamanhos cadastrados</span>';
    }

    const hasTrackedStock = sizes.some(item => item.tracked);

    return `
        <div class="stock-size-list" aria-label="Estoque por tamanho">
            ${sizes.map(item => {
                const meta = item.tracked ? getStockSeverityMeta(item.stock) : { className: 'is-untracked' };
                return `
                    <span class="stock-size-pill ${meta.className}" title="${item.tracked ? `Tamanho ${escapeAttribute(item.size)} com ${item.stock} unidade(s)` : `Tamanho ${escapeAttribute(item.size)} sem estoque separado`}">
                        <strong>${escapeHTML(item.size)}</strong>
                        ${item.tracked ? `<span>${item.stock}</span>` : ''}
                    </span>
                `;
            }).join('')}
            ${hasTrackedStock ? '' : '<small class="stock-size-note">Estoque não separado por tamanho</small>'}
        </div>
    `;
}

function renderEstoqueTable() {
    const estoqueTable = document.getElementById('estoque-table');
    if (!estoqueTable) return;

    const items = getSortedLowStockItems();
    if (!items.length) {
        estoqueTable.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--muted); padding: 1rem;">Nenhum produto encontrado no estoque.</td></tr>';
        return;
    }

    estoqueTable.innerHTML = items.map(product => {
        const meta = getStockSeverityMeta(product.stock);
        return `
            <tr class="stock-row ${meta.className}">
                <td><strong>${escapeHTML(product.name || '-')}</strong></td>
                <td><span class="admin-category-pill admin-category-${escapeAttribute(normalizeAdminCategoryKey(product.category))}">${escapeHTML(formatAdminCategoryLabel(product.category))}</span></td>
                <td>${formatBRL(product.price)}</td>
                <td><span class="stock-quantity ${meta.className}">${Number(product.stock || 0)}</span></td>
                <td>${renderStockBySize(product)}</td>
                <td><span class="stock-severity-badge ${meta.className}">${escapeHTML(meta.label)}</span></td>
            </tr>
        `;
    }).join('');
}

async function loadEstoqueReport(pageOrOptions = null) {
    const estoqueTable = document.getElementById('estoque-table');
    const paginationContainer = document.getElementById('estoque-pagination');
    if (!estoqueTable) return;

    if (typeof pageOrOptions === 'number') {
        _adminStockPage = Math.max(1, pageOrOptions);
    } else if (pageOrOptions?.resetPage) {
        _adminStockPage = 1;
    } else if (pageOrOptions?.page) {
        _adminStockPage = Math.max(1, Number(pageOrOptions.page) || 1);
    }

    try {
        const auth = getAdminAuthHeader();
        const sortBy = document.getElementById('admin-stock-sort')?.value || 'severity';
        const qs = new URLSearchParams({
            threshold: '10',
            criticalThreshold: '5',
            all: '1',
            page: String(_adminStockPage),
            limit: String(ADMIN_STOCK_PER_PAGE),
            sortBy,
        });
        estoqueTable.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--muted); padding: 1rem;">Carregando estoque...</td></tr>';
        if (paginationContainer) paginationContainer.innerHTML = '';

        const response = await API.request(`/admin-reports/low-stock?${qs.toString()}`, {
            method: 'GET',
            headers: auth ? { Authorization: auth } : {},
        });

        _adminLowStockItemsCache = await hydrateStockItemsWithSizes(Array.isArray(response.items) ? response.items : []);
        updateStockSummary(response.severity || {}, _adminLowStockItemsCache);
        _adminStockPage = Number(response.pagination?.page || _adminStockPage);

        if (!response.items || response.items.length === 0) {
            renderEstoqueTable();
            renderAdminPagination('estoque-pagination', response.pagination || {
                page: _adminStockPage,
                limit: ADMIN_STOCK_PER_PAGE,
                total: 0,
                totalPages: 1,
            }, loadEstoqueReport);
            return;
        }

        renderEstoqueTable();
        renderAdminPagination('estoque-pagination', response.pagination || {
            page: _adminStockPage,
            limit: ADMIN_STOCK_PER_PAGE,
            total: _adminLowStockItemsCache.length,
            totalPages: 1,
        }, loadEstoqueReport);
    } catch (err) {
        estoqueTable.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--danger); padding: 1rem;">Erro: ${escapeHTML(err.message)}</td></tr>`;
        if (paginationContainer) paginationContainer.innerHTML = '';
        toast('Erro ao carregar relat\u00f3rio de estoque: ' + err.message, 'error');
    }
}

async function confirmPixPayment(orderId) {
    const confirmation = getOrderStatusConfirmationCopy(orderId, 'processando', ORDER_STATUS_META.processando.label);
    showConfirmModal(
        confirmation.message,
        async () => {
            try {
                const auth = getAdminAuthHeader();
                const response = await fetch(`/api/orders/${orderId}/status`, {
                    method: 'PATCH',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': auth,
                    },
                    body: JSON.stringify({ status: 'processando' }),
                });

                if (!response.ok) throw new Error('Erro ao confirmar');
                toast('Pagamento confirmado!', 'success');
                markAdminTabStale('pedidos');
                loadOrderNotifications({ silent: true });
                loadDashboard();
            } catch (err) {
                toast('Erro: ' + err.message, 'error');
            }
        },
        {
            title: confirmation.title,
            confirmLabel: confirmation.confirmLabel,
            details: `
                <div><span>De</span><strong>Aguardando Pagamento</strong></div>
                <div><span>Para</span><strong>Processando</strong></div>
                <small>${escapeHTML(confirmation.warning)}</small>
            `,
        }
    );
}

/* ============================================================
   Auditoria do Superadmin
   ============================================================ */
function formatAuditAction(action) {
    const labels = {
        'product.create': 'Produto criado',
        'product.update': 'Produto atualizado',
        'product.delete': 'Produto exclu\u00eddo',
        'product.stock.update': 'Estoque atualizado',
        'product.image.add': 'Imagem adicionada',
        'product.image.delete': 'Imagem removida',
        'coupon.create': 'Cupom criado',
        'coupon.update': 'Cupom atualizado',
        'coupon.delete': 'Cupom exclu\u00eddo',
        'admin.create': 'Admin criado',
        'admin.delete': 'Admin removido',
        'order.status.update': 'Status do pedido',
        'order.delete': 'Pedido exclu\u00eddo',
        'payment.confirm': 'Pagamento confirmado',
        'newsletter.promotion.test': 'Promo\u00e7\u00e3o teste',
        'newsletter.promotion.send': 'Promo\u00e7\u00e3o enviada',
    };

    return labels[action] || action;
}

function summarizeAuditDetails(details = {}) {
    if (!details || typeof details !== 'object') return '-';

    if (details.changedFields && Array.isArray(details.changedFields)) {
        return `Campos: ${details.changedFields.join(', ') || '-'}`;
    }

    if (details.code) return `Cupom ${details.code}`;
    if (details.name) return details.name;
    if (details.product) return details.product;
    if (details.previousStatus || details.newStatus) {
        return `${details.previousStatus || '-'} -> ${details.newStatus || '-'}`;
    }
    if (details.subject) return `Email: ${details.subject}`;

    return JSON.stringify(details).slice(0, 140);
}

function setupAdminAuditFilters() {
    if (_adminAuditFiltersReady) return;
    _adminAuditFiltersReady = true;

    ['audit-date-from', 'audit-date-to', 'audit-admin-filter', 'audit-action-filter', 'audit-target-filter'].forEach(id => {
        const field = document.getElementById(id);
        if (!field) return;
        field.addEventListener('change', () => loadAuditLogs({ resetPage: true }));
    });

    ['audit-admin-filter', 'audit-target-filter'].forEach(id => {
        const field = document.getElementById(id);
        if (!field) return;
        field.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                loadAuditLogs({ resetPage: true });
            }
        });
    });
}

function getAuditFilters() {
    return {
        dateFrom: document.getElementById('audit-date-from')?.value || '',
        dateTo: document.getElementById('audit-date-to')?.value || '',
        admin: document.getElementById('audit-admin-filter')?.value.trim() || '',
        action: document.getElementById('audit-action-filter')?.value || '',
        target: document.getElementById('audit-target-filter')?.value.trim() || '',
    };
}

function resetAuditFilters() {
    ['audit-date-from', 'audit-date-to', 'audit-admin-filter', 'audit-action-filter', 'audit-target-filter'].forEach(id => {
        const field = document.getElementById(id);
        if (field) field.value = '';
    });
    loadAuditLogs({ resetPage: true });
}

function formatAuditDetailsJson(details = {}) {
    if (!details || typeof details !== 'object') return '-';
    try {
        return JSON.stringify(details, null, 2);
    } catch (_) {
        return String(details);
    }
}

async function loadAuditLogs(pageOrOptions = null) {
    const tbody = document.querySelector('#audit-logs-table tbody');
    const paginationContainer = document.getElementById('audit-pagination');
    if (!tbody) return;

    if (typeof pageOrOptions === 'number') {
        _adminAuditPage = Math.max(1, pageOrOptions);
    } else if (pageOrOptions?.resetPage) {
        _adminAuditPage = 1;
    } else if (pageOrOptions?.page) {
        _adminAuditPage = Math.max(1, Number(pageOrOptions.page) || 1);
    }

    if (!isSuperAdminLogged()) {
        tbody.innerHTML = '<tr><td colspan="3" style="text-align:center; color: var(--danger);">Acesso restrito ao superadmin.</td></tr>';
        if (paginationContainer) paginationContainer.innerHTML = '';
        return;
    }

    tbody.innerHTML = '<tr><td colspan="3" style="text-align:center; color: var(--muted);">Carregando auditoria...</td></tr>';
    if (paginationContainer) paginationContainer.innerHTML = '';

    try {
        const response = await API.listAuditLogs(getAdminAuthHeader(), {
            ...getAuditFilters(),
            limit: ADMIN_AUDIT_PER_PAGE,
            offset: (_adminAuditPage - 1) * ADMIN_AUDIT_PER_PAGE,
        });
        const logs = response.items || [];
        const pagination = response.pagination || {
            page: _adminAuditPage,
            limit: ADMIN_AUDIT_PER_PAGE,
            total: logs.length,
            totalPages: 1,
        };

        if (logs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="3" style="text-align:center; color: var(--muted);">Nenhum registro encontrado para os filtros atuais.</td></tr>';
            renderAdminPagination('audit-pagination', pagination, loadAuditLogs);
            return;
        }

        _adminAuditPage = Number(pagination.page || _adminAuditPage);

        tbody.innerHTML = logs.map(log => {
            const created = formatAdminDateTime(log.created_at);
            const admin = log.admin_name || log.admin_email || 'Admin';
            const target = `${log.entity_type || '-'}${log.entity_id ? ` #${log.entity_id}` : ''}`;
            const details = summarizeAuditDetails(log.details);
            const detailJson = formatAuditDetailsJson(log.details);

            return `
                <tr>
                    <td>
                        <strong>${escapeHTML(admin)}</strong>
                        <div class="admin-table-muted-line">${escapeHTML(created)}</div>
                        ${log.admin_email ? `<div style="color: var(--muted); font-size: 0.8rem;">${escapeHTML(log.admin_email)}</div>` : ''}
                    </td>
                    <td>
                        <strong>${escapeHTML(formatAuditAction(log.action))}</strong>
                        <div class="admin-table-muted-line">${escapeHTML(target)}</div>
                    </td>
                    <td>
                        <details class="audit-details">
                            <summary>${escapeHTML(details)}</summary>
                            <pre>${escapeHTML(detailJson)}</pre>
                        </details>
                    </td>
                </tr>
            `;
        }).join('');

        renderAdminPagination('audit-pagination', pagination, loadAuditLogs);
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="3" style="text-align:center; color: var(--danger);">Erro: ${escapeHTML(err.message)}</td></tr>`;
        if (paginationContainer) paginationContainer.innerHTML = '';
        toast('Erro ao carregar auditoria: ' + err.message, 'error');
    }
}

/* ============================================================
   Gerenciamento de Administradores
   ============================================================ */
async function loadAdmins() {
    const tbody = document.querySelector('#admins-table tbody');
    if (!tbody) return;
    if (!isSuperAdminLogged()) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color: var(--danger);">Acesso restrito ao superadmin.</td></tr>';
        return;
    }

    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color: var(--muted);">Carregando...</td></tr>';

    try {
        const auth = getAdminAuthHeader();
        const response = await API.request('/admin/users', {
            method: 'GET',
            headers: auth ? { Authorization: auth } : {},
        });

        const admins = Array.isArray(response) ? response : response.items || [];
        const adminUsers = admins.filter(u => u.is_admin);

        if (adminUsers.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color: var(--muted);">Nenhum administrador cadastrado.</td></tr>';
            return;
        }

        const loggedAdminId = Number(getLoggedAdminId());
        tbody.innerHTML = adminUsers.map(admin => {
            const adminId = Number(admin.id) || 0;
            const isCurrentAdmin = adminId === loggedAdminId;
            return `
            <tr>
                <td>
                    ${escapeHTML(admin.name || '-')}
                    <div class="admin-access-summary">
                        <span class="${admin.is_super_admin ? 'is-superadmin' : ''}">${admin.is_super_admin ? 'Superadmin' : 'Administrador'}</span>
                        ${isCurrentAdmin ? '<span class="is-current-admin">Você</span>' : ''}
                    </div>
                </td>
                <td>${escapeHTML(admin.email || '-')}</td>
                <td>${formatAdminDate(admin.created_at)}</td>
                <td class="actions-col">
                    <button class="btn-icon btn-edit admin-edit-btn" type="button" data-admin-id="${adminId}">Editar</button>
                    ${!admin.is_super_admin && !isCurrentAdmin ? `
                        <button class="btn-icon btn-delete admin-remove-btn" type="button" data-admin-id="${adminId}">Remover</button>
                    ` : ''}
                </td>
            </tr>
        `;
        }).join('');
        tbody.querySelectorAll('.admin-edit-btn').forEach(button => {
            button.addEventListener('click', () => {
                const admin = adminUsers.find(item => Number(item.id) === Number(button.dataset.adminId));
                if (admin) openAdminEditForm(admin);
            });
        });
        tbody.querySelectorAll('.admin-remove-btn').forEach(button => {
            button.addEventListener('click', () => {
                const admin = adminUsers.find(item => Number(item.id) === Number(button.dataset.adminId));
                if (admin) removeAdmin(admin);
            });
        });
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color: var(--danger);">Erro: ${escapeHTML(err.message)}</td></tr>`;
        toast('Erro ao carregar administradores: ' + err.message, 'error');
    }
}

function getLoggedAdminId() {
    return getLoggedAdminUser()?.id || null;
}

function setAdminFormVisible(visible) {
    const card = document.getElementById('admin-editor-card');
    const backdrop = document.getElementById('admin-form-backdrop');
    if (!card) return;

    if (visible && !isSuperAdminLogged()) {
        toast('Somente o superadmin pode adicionar administradores', 'warning');
        return;
    }

    card.classList.toggle('is-visible', Boolean(visible));
    card.setAttribute('aria-hidden', visible ? 'false' : 'true');
    backdrop?.classList.toggle('is-visible', Boolean(visible));

    if (visible) {
        document.body?.classList.add('admin-drawer-open');
    } else if (!document.querySelector('.admin-products-form-card.is-visible, .admin-coupon-drawer.is-visible, .admin-admin-drawer.is-visible')) {
        document.body?.classList.remove('admin-drawer-open');
    }
}

function openAdminCreateForm() {
    if (!isSuperAdminLogged()) {
        toast('Somente o superadmin pode adicionar administradores', 'error');
        return;
    }
    resetAdminForm();
    setAdminFormVisible(true);
    setTimeout(() => document.getElementById('a-name')?.focus(), 60);
}

function openAdminEditForm(admin) {
    if (!isSuperAdminLogged()) {
        toast('Somente o superadmin pode editar administradores', 'error');
        return;
    }

    resetAdminForm();

    const adminId = Number(admin?.id);
    if (!adminId) {
        toast('Administrador inválido', 'error');
        return;
    }

    document.getElementById('a-id').value = String(adminId);
    document.getElementById('a-name').value = admin.name || '';
    document.getElementById('a-email').value = admin.email || '';
    document.getElementById('a-role').value = admin.is_super_admin ? 'superadmin' : 'admin';

    const editingOwnAccount = adminId === Number(getLoggedAdminId());
    const roleInput = document.getElementById('a-role');
    roleInput.disabled = editingOwnAccount;
    roleInput.title = editingOwnAccount
        ? 'Seu próprio acesso deve permanecer como superadmin.'
        : '';

    document.getElementById('admin-editor-title').textContent = 'Editar administrador';
    document.getElementById('admin-form-submit').textContent = 'Salvar alterações';
    document.getElementById('a-password-label').textContent = 'Nova senha';
    document.getElementById('a-password-confirm-label').textContent = 'Confirmar nova senha';
    document.getElementById('a-password-help').classList.remove('is-hidden');

    const passwordInput = document.getElementById('a-password');
    const passwordConfirmInput = document.getElementById('a-password-confirm');
    passwordInput.required = false;
    passwordConfirmInput.required = false;

    setAdminFormVisible(true);
    setTimeout(() => document.getElementById('a-name')?.focus(), 60);
}

function closeAdminForm() {
    resetAdminForm();
    setAdminFormVisible(false);
}

function resetAdminForm() {
    const form = document.getElementById('admin-form');
    if (!form) return;

    form.reset();
    document.getElementById('a-id').value = '';
    document.getElementById('a-role').disabled = false;
    document.getElementById('a-role').title = '';
    document.getElementById('admin-editor-title').textContent = 'Novo administrador';
    document.getElementById('admin-form-submit').textContent = 'Adicionar Admin';
    document.getElementById('a-password-label').textContent = 'Senha';
    document.getElementById('a-password-confirm-label').textContent = 'Confirmar senha';
    document.getElementById('a-password-help').classList.add('is-hidden');

    const passwordInput = document.getElementById('a-password');
    const passwordConfirmInput = document.getElementById('a-password-confirm');
    passwordInput.required = true;
    passwordConfirmInput.required = true;
    setAdminFormAlert('');
}

function setAdminFormAlert(message, type = 'error') {
    const alert = document.getElementById('admin-form-alert');
    if (!alert) return;
    if (!message) {
        alert.innerHTML = '';
        return;
    }
    alert.innerHTML = `<div class="alert alert-${type}">${escapeHTML(message)}</div>`;
}

async function createAdmin(e) {
    e.preventDefault();
    setAdminFormAlert('');

    if (!isSuperAdminLogged()) {
        setAdminFormAlert('Somente o superadmin pode adicionar administradores');
        return;
    }

    const adminId = Number(document.getElementById('a-id').value) || null;
    const isEditing = Boolean(adminId);
    const name = document.getElementById('a-name').value.trim();
    const email = document.getElementById('a-email').value.trim().toLowerCase();
    const role = document.getElementById('a-role')?.value || 'admin';
    const password = document.getElementById('a-password').value;
    const passwordConfirm = document.getElementById('a-password-confirm').value;

    if ((password || passwordConfirm) && password !== passwordConfirm) {
        setAdminFormAlert('As senhas não correspondem');
        return;
    }

    if (!name || name.trim().length < 3) {
        setAdminFormAlert('Nome deve ter pelo menos 3 caracteres');
        return;
    }

    if (!email || !email.includes('@')) {
        setAdminFormAlert('Email inválido');
        return;
    }

    if (!isEditing || password) {
        const passwordError = getStrongPasswordError(password);
        if (passwordError) {
            setAdminFormAlert(passwordError);
            return;
        }
    }

    const auth = getAdminAuthHeader();
    const body = {
        name,
        email,
        role,
        isSuperAdmin: role === 'superadmin',
    };
    if (password) body.password = password;

    try {
        const response = await API.request(isEditing ? `/admin/users/${adminId}` : '/admin/users', {
            method: isEditing ? 'PUT' : 'POST',
            headers: auth ? { Authorization: auth } : {},
            body,
        });

        if (isEditing && adminId === Number(getLoggedAdminId()) && response.user) {
            setVerifiedAdminUser(response.user);
            document.querySelector('.admin-menu-container')?.remove();
            if (typeof updateAdminName === 'function') updateAdminName();
            applySuperAdminUi();
        }

        toast(
            response.message || (
                isEditing
                    ? 'Administrador atualizado com sucesso!'
                    : role === 'superadmin'
                        ? 'Superadmin adicionado com sucesso!'
                        : 'Administrador adicionado com sucesso!'
            ),
            'success'
        );
        closeAdminForm();
        loadAdmins();
    } catch (err) {
        setAdminFormAlert(err.message || 'Nao foi possivel salvar o administrador');
    }
}

async function removeAdmin(admin) {
    if (!isSuperAdminLogged()) {
        toast('Somente o superadmin pode remover administradores', 'error');
        return;
    }

    const adminId = Number(admin?.id);
    if (!adminId) {
        toast('Administrador inválido', 'error');
        return;
    }

    const adminName = admin.name || 'Administrador';
    const accessType = admin.is_super_admin ? 'Superadmin' : 'Administrador';
    showConfirmModal(
        `Tem certeza que deseja remover ${escapeHTML(adminName)} do painel administrativo?`,
        () => confirmRemoveAdmin(adminId),
        {
            title: 'Remover administrador',
            confirmLabel: 'Remover acesso',
            danger: true,
            details: `
                <div><span>Nome</span><strong>${escapeHTML(adminName)}</strong></div>
                <div><span>E-mail</span><strong>${escapeHTML(admin.email || '-')}</strong></div>
                <div><span>Acesso</span><strong>${escapeHTML(accessType)}</strong></div>
                <div><span>Cadastrado em</span><strong>${escapeHTML(formatAdminDate(admin.created_at))}</strong></div>
            `,
        }
    );
}

async function confirmRemoveAdmin(adminId) {
    const auth = getAdminAuthHeader();
    try {
        await API.request(`/admin/users/${adminId}`, {
            method: 'DELETE',
            headers: auth ? { Authorization: auth } : {},
        });
        toast('Administrador removido com sucesso!', 'success');
        loadAdmins();
    } catch (err) {
        toast('Erro ao remover administrador: ' + err.message, 'error');
    }
}

/* ============================================================
   Inicializa
   ============================================================ */
// Proteger acesso ao admin imediatamente
(function() {
    // A sessão do usuário normal (`user`) e a sessão de admin (`adminUser`)
    // são TOTALMENTE independentes. Não usamos `user` para validar acesso
    // ao admin, assim as duas contas podem coexistir sem se sobrescrever.
    const adminToken = sessionStorage.getItem('adminToken');
    // Sem token nao ha o que validar no backend.
    if (!adminToken) {
        document.addEventListener('DOMContentLoaded', () => {
            showLogin();
        });
        return;
    }

    // A permissao real sera validada via /api/me antes de mostrar o painel.
    document.addEventListener('DOMContentLoaded', async () => {
        try {
            await verifyAdminSession();
        } catch (err) {
            clearAdminSession();
            console.error('Validacao de admin no backend falhou:', err);
            window.location.replace('admin-login.html');
            return;
        }

        showPanel();

        if (typeof updateAdminName === 'function') {
            updateAdminName();
        }

        // Adicionar listener para form de admin
        setTimeout(() => {
            const adminForm = document.getElementById('admin-form');
            if (adminForm) {
                adminForm.addEventListener('submit', (e) => {
                    createAdmin(e);
                });
            }
        }, 500);
    });
})();

// Funções da galeria de imagens
function getMainProductImageValue() {
    return document.getElementById('p-image')?.value.trim() || '';
}

function setMainProductImageValue(imageUrl) {
    const input = document.getElementById('p-image');
    if (input) input.value = String(imageUrl || '').trim();
}

function getGalleryImageTotal(images = _currentGalleryImages) {
    const mainImageCount = getMainProductImageValue() ? 1 : 0;
    return mainImageCount + (Array.isArray(images) ? images.length : 0);
}

function getRemainingGallerySlots(images = _currentGalleryImages) {
    return Math.max(0, MAX_PRODUCT_IMAGES - getGalleryImageTotal(images));
}

function getGallerySummaryText(images = _currentGalleryImages) {
    const mainImageCount = getMainProductImageValue() ? 1 : 0;
    const extraCount = Array.isArray(images) ? images.length : 0;
    const total = mainImageCount + extraCount;
    return `${total}/${MAX_PRODUCT_IMAGES} imagens no total (${mainImageCount ? '1 principal' : 'sem principal'} + ${extraCount} extra${extraCount === 1 ? '' : 's'})`;
}

function setGalleryInputsDisabled(disabled) {
    const galleryUrl = document.getElementById('gallery-new-url');
    const galleryFile = document.getElementById('gallery-new-file');
    const addUrlButton = document.querySelector('button[onclick="addGalleryImage()"]');
    const addFileButton = document.querySelector('button[onclick="addGalleryImageFromFile()"]');
    const addUnifiedButton = document.querySelector('button[onclick="addProductPhotoFromCurrentInput()"]');
    const galleryFileLabel = document.querySelector('label[for="gallery-new-file"]');

    if (galleryUrl) galleryUrl.disabled = disabled;
    if (galleryFile) galleryFile.disabled = disabled;
    if (addUrlButton) addUrlButton.disabled = disabled;
    if (addFileButton) addFileButton.disabled = disabled;
    if (addUnifiedButton) addUnifiedButton.disabled = disabled;
    if (galleryFileLabel) {
        galleryFileLabel.classList.toggle('is-disabled', disabled);
        galleryFileLabel.setAttribute('aria-disabled', disabled ? 'true' : 'false');
    }
}

function clearPhotoPicker() {
    const galleryUrl = document.getElementById('gallery-new-url');
    const galleryFile = document.getElementById('gallery-new-file');
    if (galleryUrl) galleryUrl.value = '';
    if (galleryFile) galleryFile.value = '';
    updateSelectedFileLabel('gallery-new-file', 'gallery-file-count');
}

async function readGalleryApiResponse(response) {
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(data.error || `Erro ${response.status}`);
    }
    return data;
}

async function postGalleryImage(productId, imageUrl) {
    const auth = getAdminAuthHeader();
    const response = await fetch(`/api/products/${productId}/images`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...(auth && { 'Authorization': auth })
        },
        body: JSON.stringify({ image_url: imageUrl })
    });
    return readGalleryApiResponse(response);
}

async function savePendingGalleryImages(productId, pendingImages) {
    const urls = (pendingImages || [])
        .map(img => String(img.image_url || '').trim())
        .filter(Boolean);

    for (const url of urls) {
        await postGalleryImage(productId, url);
    }
}

async function loadGalleryImages(productId) {
    window._editingProductId = productId;
    try {
        const response = await fetch(`/api/products/${productId}/images`);
        if (!response.ok) throw new Error(`Erro ${response.status}`);
        const images = await response.json();
        _currentGalleryImages = Array.isArray(images) ? images : [];
        renderGalleryImages(images);
    } catch (err) {
        console.error('Erro ao carregar galeria:', err);
        setProductFormAlert('Erro ao carregar galeria: ' + err.message);
        setUploadStatus('gallery-upload-status', 'Erro ao carregar galeria: ' + err.message, 'error');
    }
}

function renderGalleryImages(images) {
    const list = document.getElementById('gallery-images-list');
    if (!list) return;

    _currentGalleryImages = Array.isArray(images) ? images : [];
    const mainImageUrl = getMainProductImageValue();
    const remaining = getRemainingGallerySlots(_currentGalleryImages);
    const summary = `
        <div class="admin-gallery-summary">
            <strong>${escapeHTML(getGallerySummaryText(_currentGalleryImages))}</strong>
            <span>${remaining > 0 ? `Ainda cabe${remaining === 1 ? '' : 'm'} ${remaining} foto${remaining === 1 ? '' : 's'}.` : 'Limite de 4 imagens atingido.'}</span>
        </div>
    `;

    setGalleryInputsDisabled(remaining <= 0);

    const cards = [];
    if (mainImageUrl) {
        const imageUrl = safeImageSrc(mainImageUrl, 'https://via.placeholder.com/120');
        cards.push(`
        <div class="admin-gallery-thumb">
            <span class="admin-gallery-thumb-badge">Principal</span>
            <img src="${escapeAttribute(imageUrl)}" loading="lazy" decoding="async" alt="Foto principal" />
            <button type="button" onclick="removeMainProductImage()" aria-label="Remover imagem principal">X</button>
        </div>
    `);
    }

    _currentGalleryImages.forEach((img, index) => {
        const imageUrl = safeImageSrc(img.image_url, 'https://via.placeholder.com/120');
        const removeAction = img._pending
            ? `removePendingGalleryImage(${index})`
            : `removeGalleryImage(${Number(img.id) || 0})`;
        cards.push(`
        <div class="admin-gallery-thumb">
            <span class="admin-gallery-thumb-badge">Extra</span>
            <img src="${escapeAttribute(imageUrl)}" loading="lazy" decoding="async" alt="Foto extra ${index + 1}" />
            <button type="button" onclick="${removeAction}" aria-label="Remover imagem">X</button>
        </div>
    `);
    });

    if (!cards.length) {
        list.innerHTML = summary + '<span class="admin-gallery-empty">Nenhuma foto adicionada ainda.</span>';
        return;
    }

    list.innerHTML = summary + cards.join('');
}

async function addProductPhotoFromCurrentInput() {
    const input = document.getElementById('gallery-new-file');
    if (input?.files?.length) {
        await addGalleryImageFromFile();
        return;
    }

    await addGalleryImage();
}

async function addGalleryImage() {
    const url = document.getElementById('gallery-new-url').value.trim();
    if (!url) {
        setUploadStatus('gallery-upload-status', 'Digite a URL da imagem ou escolha uma foto do PC.', 'error');
        return;
    }
    if (getRemainingGallerySlots() <= 0) {
        setUploadStatus('gallery-upload-status', `Limite de ${MAX_PRODUCT_IMAGES} imagens por produto atingido.`, 'error');
        return;
    }

    try {
        if (!getMainProductImageValue()) {
            setMainProductImageValue(url);
            clearPhotoPicker();
            renderGalleryImages(_currentGalleryImages);
            setUploadStatus('gallery-upload-status', 'Foto principal adicionada. Adicione outra foto se quiser.', 'success');
            return;
        }

        if (!window._editingProductId) {
            _currentGalleryImages.push({ image_url: url, _pending: true });
            renderGalleryImages(_currentGalleryImages);
            clearPhotoPicker();
            setUploadStatus('gallery-upload-status', 'Foto adicionada. Ela sera salva junto com o produto.', 'success');
            return;
        }

        await postGalleryImage(window._editingProductId, url);
        clearPhotoPicker();
        loadGalleryImages(window._editingProductId);
        setUploadStatus('gallery-upload-status', 'Foto adicionada na galeria.', 'success');
    } catch (err) {
        console.error('Erro ao adicionar foto:', err);
        setUploadStatus('gallery-upload-status', 'Erro ao adicionar foto: ' + err.message, 'error');
    }
}

async function addGalleryImageFromFile() {
    const input = document.getElementById('gallery-new-file');
    const files = Array.from(input?.files || []);
    if (!files.length) {
        setUploadStatus('gallery-upload-status', 'Escolha uma foto do PC.', 'error');
        return;
    }

    const remaining = getRemainingGallerySlots();
    if (remaining <= 0) {
        setUploadStatus('gallery-upload-status', `Limite de ${MAX_PRODUCT_IMAGES} imagens por produto atingido.`, 'error');
        if (input) input.value = '';
        updateSelectedFileLabel('gallery-new-file', 'gallery-file-count');
        return;
    }
    if (files.length > remaining) {
        setUploadStatus('gallery-upload-status', `Você ainda pode adicionar no máximo ${remaining} foto${remaining === 1 ? '' : 's'}.`, 'error');
        if (input) input.value = '';
        updateSelectedFileLabel('gallery-new-file', 'gallery-file-count');
        return;
    }

    try {
        setUploadStatus('gallery-upload-status', `Enviando ${files.length} foto${files.length === 1 ? '' : 's'} da galeria...`, 'muted');

        for (const file of files) {
            const uploaded = await uploadLocalProductImage(file);
            const imageUrl = uploaded.image_url || uploaded.url;

            if (!getMainProductImageValue()) {
                setMainProductImageValue(imageUrl);
                renderGalleryImages(_currentGalleryImages);
            } else if (!window._editingProductId) {
                _currentGalleryImages.push({ image_url: imageUrl, _pending: true });
                renderGalleryImages(_currentGalleryImages);
            } else {
                await postGalleryImage(window._editingProductId, imageUrl);
            }
        }

        clearPhotoPicker();
        if (window._editingProductId) {
            loadGalleryImages(window._editingProductId);
        }
        setUploadStatus('gallery-upload-status', `${files.length} foto${files.length === 1 ? '' : 's'} adicionada${files.length === 1 ? '' : 's'} na galeria.`, 'success');
    } catch (err) {
        console.error('Erro ao adicionar foto local:', err);
        setUploadStatus('gallery-upload-status', err.message, 'error');
        updateSelectedFileLabel('gallery-new-file', 'gallery-file-count');
    }
}

function removePendingGalleryImage(index) {
    _currentGalleryImages.splice(index, 1);
    renderGalleryImages(_currentGalleryImages);
    setUploadStatus('gallery-upload-status', 'Foto removida da lista antes de salvar.', 'success');
}

function removeMainProductImage() {
    setMainProductImageValue('');
    renderGalleryImages(_currentGalleryImages);
    setUploadStatus('gallery-upload-status', 'Foto principal removida. A pr\u00f3xima foto adicionada vira principal.', 'success');
}

async function removeGalleryImage(imageId) {
    if (!confirm('Remover esta imagem?')) return;
    try {
        const auth = getAdminAuthHeader();
        const response = await fetch(`/api/products/images/${imageId}`, {
            method: 'DELETE',
            headers: auth ? { 'Authorization': auth } : {}
        });
        if (!response.ok) throw new Error(`Erro ${response.status}`);
        loadGalleryImages(window._editingProductId);
        toast('Foto removida!', 'success');
    } catch (err) {
        console.error('Erro ao remover foto:', err);
        toast('Erro ao remover foto: ' + err.message, 'error');
    }
}
