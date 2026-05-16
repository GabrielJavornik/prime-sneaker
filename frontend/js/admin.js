/**
 * Admin.js - gerencia login admin, CRUD de produtos e cupons.
 * Autenticação: usa JWT em sessionStorage e valida a sessão no backend antes de renderizar.
 */
let _adminProductsById = new Map();
let _adminCouponsById = new Map();
let _adminProductsPage = 1;
let _adminCouponsPage = 1;
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
        sessionStorage.removeItem('primeSneaker:megaMenuFacets:v1');
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
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color: var(--muted);">Nenhum produto encontrado com esses filtros.</td></tr>';
            renderAdminPagination('products-pagination', pagination, loadProducts);
            return;
        }
        _adminProductsById = new Map(products.map(p => [String(p.id), p]));
        tbody.innerHTML = products.map(p => {
            const productId = Number(p.id) || 0;
            const img = safeImageSrc(p.image_url, 'https://via.placeholder.com/50');
            const name = escapeHTML(p.name || 'Produto');
            const nameAttr = escapeAttribute(p.name || 'Produto');
            const category = escapeHTML(p.category || '-');
            const brand = escapeHTML(p.brand || '-');
            const gender = escapeHTML(p.gender || 'unissex');
            const stock = Number(p.stock || 0);

            return `
      <tr>
        <td><img src="${escapeAttribute(img)}" alt="${nameAttr}" loading="lazy" decoding="async"></td>
        <td>${name}</td>
        <td>${category}</td>
        <td>
          <strong>${brand}</strong>
          <div style="font-size: 0.78rem; color: var(--muted);">${gender}${getAdminProductFlag(p, ['is_launch', 'launch', 'lancamento', 'isLaunch']) ? ' \u00b7 Lan\u00e7amento' : ''}${(getAdminProductFlag(p, ['is_outlet', 'outlet', 'isOutlet']) || getAdminDiscountPercent(p) > 0) ? ' \u00b7 Outlet' : ''}</div>
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

function scrollToProductForm() {
    document.getElementById('p-name')?.focus();
}

function closeProductForm() {
    resetProductForm({ hide: true });
}

function openProductCreateForm() {
    resetProductForm({ hide: false });
    document.getElementById('product-form-title').textContent = 'Cadastrar novo t\u00eanis';
    const galleryManager = document.getElementById('gallery-manager');
    if (galleryManager) galleryManager.style.display = 'none';
    setProductFormVisible(true);
    scrollToProductForm();
}

async function editProduct(p) {
    setProductFormVisible(true);
    document.getElementById('product-id').value = p.id;
    document.getElementById('p-name').value = p.name;
    document.getElementById('p-price').value = p.price;
    document.getElementById('p-discount').value = getAdminDiscountPercent(p) || '';
    document.getElementById('p-description').value = p.description || '';
    document.getElementById('p-image').value = p.image_url || '';
    document.getElementById('p-sizes').value = p.sizes || '';
    document.getElementById('p-color').value = p.color || '';
    document.getElementById('p-category').value = p.category || 'casual';
    document.getElementById('p-brand').value = p.brand || '';
    document.getElementById('p-gender').value = p.gender || 'unissex';
    document.getElementById('p-launch').checked = getAdminProductFlag(p, ['is_launch', 'launch', 'lancamento', 'isLaunch']);
    document.getElementById('p-outlet').checked = getAdminProductFlag(p, ['is_outlet', 'outlet', 'isOutlet']);
    document.getElementById('product-form-title').textContent = `Editando produto #${p.id}`;
    updateDiscountPreview();

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
    document.getElementById('product-form').reset();
    document.getElementById('product-id').value = '';
    document.getElementById('product-form-title').textContent = 'Cadastrar novo t\u00eanis';
    updateDiscountPreview();
    const galleryManager = document.getElementById('gallery-manager');
    if (galleryManager) galleryManager.style.display = 'none';
    const galleryList = document.getElementById('gallery-images-list');
    if (galleryList) galleryList.innerHTML = '';
    const galleryUrl = document.getElementById('gallery-new-url');
    if (galleryUrl) galleryUrl.value = '';
    const sizeStockContainer = document.getElementById('size-stock-inputs');
    if (sizeStockContainer) {
        sizeStockContainer.innerHTML = '<p style="color: var(--muted); font-size: 0.9rem;">Digite tamanhos acima para configurar estoque de cada um.</p>';
    }
    if (shouldHide) setProductFormVisible(false);
}

document.getElementById('product-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('product-id').value;
    const sizeStocks = [];
    document.querySelectorAll('.size-stock-input').forEach(input => {
        const size = input.dataset.size;
        const stock = Number(input.value) || 0;
        sizeStocks.push({ size, stock });
    });

    // Validar que ha estoque por tamanho ao criar novo produto
    if (!id && sizeStocks.length === 0) {
        toast('Adicione tamanhos e estoque antes de criar o produto', 'error');
        return;
    }

    const isLaunch = document.getElementById('p-launch').checked;
    const discountPercent = Number(document.getElementById('p-discount').value || 0);
    const isOutlet = document.getElementById('p-outlet').checked || discountPercent > 0;
    const data = {
        name: document.getElementById('p-name').value,
        price: Number(document.getElementById('p-price').value),
        description: document.getElementById('p-description').value,
        image_url: document.getElementById('p-image').value,
        sizes: document.getElementById('p-sizes').value,
        color: document.getElementById('p-color').value,
        category: document.getElementById('p-category').value,
        brand: document.getElementById('p-brand').value.trim(),
        gender: document.getElementById('p-gender').value,
        is_launch: isLaunch,
        is_outlet: isOutlet,
        launch: isLaunch,
        outlet: isOutlet,
        discount_percent: discountPercent,
        outlet_discount_percent: discountPercent,
        stock: sizeStocks.reduce((sum, s) => sum + s.stock, 0) || 10, // Total dos tamanhos
    };
    const auth = getAdminAuthHeader();
    try {
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
            await API.createProduct(data, auth);
            toast('Produto cadastrado!', 'success');
        }
        resetProductForm();
        clearPublicMenuFacetsCache();
        markAdminTabStale('dashboard', 'estoque');
        loadProducts();
    } catch (err) {
        toast('Erro: ' + err.message, 'error');
    }
});

async function deleteProduct(id) {
    if (!confirm('Deseja realmente excluir este produto?')) return;
    try {
        await API.deleteProduct(id, getAdminAuthHeader());
        toast('Produto exclu\u00eddo!', 'success');
        clearPublicMenuFacetsCache();
        markAdminTabStale('dashboard', 'estoque');
        loadProducts();
    } catch (err) {
        toast('Erro: ' + err.message, 'error');
    }
}

/* ============================================================
   Promoções / Newsletter
   ============================================================ */
async function loadNewsletterSubscribers() {
    const tbody = document.querySelector('#newsletter-table tbody');
    const countEl = document.getElementById('newsletter-count');
    const recipientCountEl = document.getElementById('promo-recipient-count');
    if (!tbody || !countEl) return;

    try {
        const subscribers = await API.listNewsletterSubscribers(getAdminAuthHeader());
        const activeCount = subscribers.filter(sub => sub.active).length;
        _newsletterActiveCount = activeCount;
        countEl.textContent = activeCount;
        if (recipientCountEl) recipientCountEl.textContent = activeCount;
        updatePromotionPreview();

        if (!subscribers.length) {
            tbody.innerHTML = '<tr><td colspan="3" style="color: var(--muted); text-align: center;">Nenhum inscrito ainda.</td></tr>';
            return;
        }

        tbody.innerHTML = subscribers.map(sub => {
            const created = sub.created_at ? new Date(sub.created_at).toLocaleDateString('pt-BR') : '-';
            const status = sub.active
                ? '<span style="color: var(--success); font-weight: 700;">Ativo</span>'
                : '<span style="color: var(--muted);">Inativo</span>';

            return `
                <tr>
                    <td><strong>${escapeHTML(sub.email)}</strong></td>
                    <td>${status}</td>
                    <td>${created}</td>
                </tr>
            `;
        }).join('');
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="3" style="color: var(--danger);">Erro ao carregar inscritos: ${escapeHTML(err.message)}</td></tr>`;
        toast('Erro ao carregar inscritos: ' + err.message, 'error');
    }
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
    } else if (!document.querySelector('.admin-products-form-card.is-visible, .admin-coupon-drawer.is-visible')) {
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
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color: var(--muted);">Nenhum cupom cadastrado.</td></tr>';
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
        <td><span class="coupon-code-pill">${escapeHTML(c.code)}</span></td>
        <td>${c.discount_percent}%</td>
        <td>R$ ${minVal.toFixed(2)}</td>
        <td><small>${expires}</small></td>
        <td><small>${uses}</small></td>
        <td><span class="coupon-status-badge ${status.className}">${escapeHTML(status.label)}</span></td>
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

    if (!confirm('Excluir este cupom?')) return;
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
                const created = order.created_at
                    ? new Date(order.created_at).toLocaleDateString('pt-BR')
                    : '-';
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
                        <td>${new Date(tx.created_at).toLocaleDateString('pt-BR')}</td>
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
    } else {
        window.location.href = whatsappUrl;
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

function renderAdminOrderCard(order) {
    const meta = ORDER_STATUS_META[order.status] || ORDER_STATUS_META.pendente;
    const actions = nextActionsForStatus(order.status);
    const orderId = Number(order.id) || 0;
    const customerName = escapeHTML(order.customer_name || 'Sem nome');
    const customerEmail = escapeHTML(order.customer_email || '-');
    const customerPhone = escapeHTML(order.customer_phone || '');
    const actionsHtml = actions.length === 0
        ? '<span class="admin-order-no-actions">Sem a\u00e7\u00f5es dispon\u00edveis</span>'
        : actions.map(a => `
            <button type="button"
                    class="admin-order-action ${ORDER_STATUS_META[a.to]?.className || ''}"
                    onclick="changeOrderStatus(${orderId}, '${a.to}')">
                ${a.label}
            </button>
        `).join('');

    const created = order.created_at
        ? new Date(order.created_at).toLocaleDateString('pt-BR') + ' ' + new Date(order.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
        : '-';

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
        <div class="confirm-modal-content">
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
    showConfirmModal(
        `Voc\u00ea vai alterar o pedido <strong>#${orderId}</strong> para <strong>${label}</strong>.`,
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
            title: 'Alterar status do pedido',
            confirmLabel: `Confirmar ${label}`,
            details: `
                <div><span>De</span><strong>${escapeHTML(previousLabel)}</strong></div>
                <div><span>Para</span><strong>${escapeHTML(label)}</strong></div>
                ${newStatus === 'cancelado' ? '<small>Ao cancelar, o WhatsApp do cliente ser&aacute; aberto para contato.</small>' : ''}
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
            <strong style="display: block; margin-bottom: 0.4rem;">Itens do pedido:</strong>
            <div class="admin-table-wrapper" style="--admin-table-min-width: 640px;">
            <table style="width: 100%; border-collapse: collapse; font-size: 0.85rem;">
                <thead>
                    <tr style="background: var(--bg-soft, #f7f7f7);">
                        <th style="padding: 0.4rem; text-align: left;">Produto</th>
                        <th style="padding: 0.4rem; text-align: center;">Tamanho</th>
                        <th style="padding: 0.4rem; text-align: center;">Qtd</th>
                        <th style="padding: 0.4rem; text-align: right;">Pre\u00e7o</th>
                        <th style="padding: 0.4rem; text-align: right;">Subtotal</th>
                    </tr>
                </thead>
                <tbody>
                    ${items.map(it => `
                        <tr>
                            <td style="padding: 0.4rem; border-bottom: 1px solid #eee;">${escapeHTML(it.product_name || '-')}</td>
                            <td style="padding: 0.4rem; border-bottom: 1px solid #eee; text-align: center;">${escapeHTML(it.size || '-')}</td>
                            <td style="padding: 0.4rem; border-bottom: 1px solid #eee; text-align: center;">${Number(it.quantity) || 0}</td>
                            <td style="padding: 0.4rem; border-bottom: 1px solid #eee; text-align: right;">${formatBRL(it.product_price)}</td>
                            <td style="padding: 0.4rem; border-bottom: 1px solid #eee; text-align: right;"><strong>${formatBRL(it.line_total)}</strong></td>
                        </tr>
                    `).join('')}
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
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--muted); padding: 1rem;">Nenhum cliente encontrado com esse filtro.</td></tr>';
        return;
    }

    tbody.innerHTML = customers.map(client => {
        const orders = Number(client.total_orders || 0);
        const spent = Number(client.total_spent || 0);
        const lastOrder = client.last_order_date ? new Date(client.last_order_date).toLocaleDateString('pt-BR') : 'Nunca';
        const email = client.email || '';

        return `
            <tr>
                <td>
                    <strong>${escapeHTML(client.name || '-')}</strong>
                    ${orders > 0 ? '<span class="admin-client-badge">Cliente comprador</span>' : ''}
                </td>
                <td>${escapeHTML(email || '-')}</td>
                <td>${escapeHTML(client.phone || 'N/A')}</td>
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
    if (sort) sort.addEventListener('change', renderEstoqueTable);
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
    const sort = document.getElementById('admin-stock-sort')?.value || 'stock_asc';
    const items = [..._adminLowStockItemsCache];

    items.sort((a, b) => {
        if (sort === 'severity') {
            const rankDiff = getStockSeverityMeta(a.stock).rank - getStockSeverityMeta(b.stock).rank;
            if (rankDiff !== 0) return rankDiff;
            return Number(a.stock || 0) - Number(b.stock || 0);
        }
        if (sort === 'stock_desc') {
            return Number(b.stock || 0) - Number(a.stock || 0);
        }
        if (sort === 'name_asc') {
            return String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR');
        }
        return Number(a.stock || 0) - Number(b.stock || 0);
    });

    return items;
}

function renderEstoqueTable() {
    const estoqueTable = document.getElementById('estoque-table');
    if (!estoqueTable) return;

    const items = getSortedLowStockItems();
    if (!items.length) {
        estoqueTable.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--success); padding: 1rem;">Nenhum produto em estado cr\u00edtico ou de aten\u00e7\u00e3o.</td></tr>';
        return;
    }

    estoqueTable.innerHTML = items.map(product => {
        const meta = getStockSeverityMeta(product.stock);
        return `
            <tr class="stock-row ${meta.className}">
                <td><strong>${escapeHTML(product.name || '-')}</strong></td>
                <td>${escapeHTML(product.category || '-')}</td>
                <td>${formatBRL(product.price)}</td>
                <td><span class="stock-quantity ${meta.className}">${Number(product.stock || 0)}</span></td>
                <td><span class="stock-severity-badge ${meta.className}">${escapeHTML(meta.label)}</span></td>
            </tr>
        `;
    }).join('');
}

async function loadEstoqueReport() {
    const estoqueTable = document.getElementById('estoque-table');
    if (!estoqueTable) return;
    try {
        const auth = getAdminAuthHeader();
        const response = await API.request('/admin-reports/low-stock?threshold=10', {
            method: 'GET',
            headers: auth ? { Authorization: auth } : {},
        });

        _adminLowStockItemsCache = Array.isArray(response.items) ? response.items : [];
        updateStockSummary(response.severity || {}, _adminLowStockItemsCache);

        if (!response.items || response.items.length === 0) {
            renderEstoqueTable();
            return;
        }

        renderEstoqueTable();
    } catch (err) {
        estoqueTable.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--danger); padding: 1rem;">Erro: ${escapeHTML(err.message)}</td></tr>`;
        toast('Erro ao carregar relat\u00f3rio de estoque: ' + err.message, 'error');
    }
}

async function confirmPixPayment(orderId) {
    if (!confirm('Confirmar pagamento PIX deste pedido?')) return;
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
        loadOrderNotifications({ silent: true });
        loadDashboard();
    } catch (err) {
        toast('Erro: ' + err.message, 'error');
    }
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
        field.addEventListener('change', () => loadAuditLogs());
    });

    ['audit-admin-filter', 'audit-target-filter'].forEach(id => {
        const field = document.getElementById(id);
        if (!field) return;
        field.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                loadAuditLogs();
            }
        });
    });
}

function getAuditFilters() {
    return {
        limit: 120,
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
    loadAuditLogs();
}

function formatAuditDetailsJson(details = {}) {
    if (!details || typeof details !== 'object') return '-';
    try {
        return JSON.stringify(details, null, 2);
    } catch (_) {
        return String(details);
    }
}

async function loadAuditLogs() {
    const tbody = document.querySelector('#audit-logs-table tbody');
    if (!tbody) return;

    if (!isSuperAdminLogged()) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color: var(--danger);">Acesso restrito ao superadmin.</td></tr>';
        return;
    }

    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color: var(--muted);">Carregando auditoria...</td></tr>';

    try {
        const response = await API.listAuditLogs(getAdminAuthHeader(), getAuditFilters());
        const logs = response.items || [];

        if (logs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color: var(--muted);">Nenhum registro encontrado para os filtros atuais.</td></tr>';
            return;
        }

        tbody.innerHTML = logs.map(log => {
            const created = log.created_at
                ? new Date(log.created_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
                : '-';
            const admin = log.admin_name || log.admin_email || 'Admin';
            const target = `${log.entity_type || '-'}${log.entity_id ? ` #${log.entity_id}` : ''}`;
            const details = summarizeAuditDetails(log.details);
            const detailJson = formatAuditDetailsJson(log.details);

            return `
                <tr>
                    <td>${created}</td>
                    <td>
                        <strong>${escapeHTML(admin)}</strong>
                        ${log.admin_email ? `<div style="color: var(--muted); font-size: 0.8rem;">${escapeHTML(log.admin_email)}</div>` : ''}
                    </td>
                    <td>${escapeHTML(formatAuditAction(log.action))}</td>
                    <td>${escapeHTML(target)}</td>
                    <td>
                        <details class="audit-details">
                            <summary>${escapeHTML(details)}</summary>
                            <pre>${escapeHTML(detailJson)}</pre>
                        </details>
                    </td>
                </tr>
            `;
        }).join('');
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color: var(--danger);">Erro: ${escapeHTML(err.message)}</td></tr>`;
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

        tbody.innerHTML = adminUsers.map(admin => `
            <tr>
                <td>${escapeHTML(admin.name || '-')}${admin.is_super_admin ? '<div style="color: var(--accent-text); font-size: 0.78rem; font-weight: 800; margin-top: 0.2rem;">Superadmin</div>' : ''}</td>
                <td>${escapeHTML(admin.email || '-')}</td>
                <td>${new Date(admin.created_at).toLocaleDateString('pt-BR')}</td>
                <td class="actions-col">
                    ${admin.is_super_admin ? '<span style="color: var(--muted); font-size: 0.9rem;">Protegido</span>' : admin.id !== getLoggedAdminId() ? `
                        <button class="btn-icon btn-delete admin-remove-btn" type="button" data-admin-id="${Number(admin.id) || 0}" data-admin-name="${escapeAttribute(admin.name || '')}">Remover</button>
                    ` : '<span style="color: var(--muted); font-size: 0.9rem;">(voc\u00ea)</span>'}
                </td>
            </tr>
        `).join('');
        tbody.querySelectorAll('.admin-remove-btn').forEach(button => {
            button.addEventListener('click', () => removeAdmin(Number(button.dataset.adminId), button.dataset.adminName || ''));
        });
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color: var(--danger);">Erro: ${escapeHTML(err.message)}</td></tr>`;
        toast('Erro ao carregar administradores: ' + err.message, 'error');
    }
}

function getLoggedAdminId() {
    return getLoggedAdminUser()?.id || null;
}

function resetAdminForm() {
    document.getElementById('admin-form').reset();
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

    const name = document.getElementById('a-name').value;
    const email = document.getElementById('a-email').value;
    const role = document.getElementById('a-role')?.value || 'admin';
    const password = document.getElementById('a-password').value;
    const passwordConfirm = document.getElementById('a-password-confirm').value;

    if (password !== passwordConfirm) {
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

    const passwordError = getStrongPasswordError(password);
    if (passwordError) {
        setAdminFormAlert(passwordError);
        return;
    }

    const auth = getAdminAuthHeader();

    try {
        await API.request('/admin/users', {
            method: 'POST',
            headers: auth ? { Authorization: auth } : {},
            body: { name, email, password, role, isSuperAdmin: role === 'superadmin' },
        });
        toast(role === 'superadmin' ? 'Superadmin adicionado com sucesso!' : 'Administrador adicionado com sucesso!', 'success');
        resetAdminForm();
        loadAdmins();
    } catch (err) {
        setAdminFormAlert('Erro: ' + err.message);
    }
}

async function removeAdmin(adminId, adminName) {
    if (!isSuperAdminLogged()) {
        toast('Somente o superadmin pode remover administradores', 'error');
        return;
    }

    if (!confirm(`Remover administrador "${adminName}"?`)) return;

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
async function loadGalleryImages(productId) {
    window._editingProductId = productId;
    try {
        const response = await fetch(`/api/products/${productId}/images`);
        if (!response.ok) throw new Error(`Erro ${response.status}`);
        const images = await response.json();
        renderGalleryImages(images);
    } catch (err) {
        console.error('Erro ao carregar galeria:', err);
        toast('Erro ao carregar galeria: ' + err.message, 'error');
    }
}

function renderGalleryImages(images) {
    const list = document.getElementById('gallery-images-list');
    if (!images || !images.length) {
        list.innerHTML = '<span style="color:var(--muted);font-size:0.85rem;">Nenhuma foto na galeria.</span>';
        return;
    }
    list.innerHTML = images.map(img => `
        <div style="position:relative;">
            <img src="${escapeAttribute(safeImageSrc(img.image_url, 'https://via.placeholder.com/80'))}" loading="lazy" decoding="async" style="width:80px;height:80px;object-fit:cover;border-radius:6px;" />
            <button type="button" onclick="removeGalleryImage(${Number(img.id) || 0})"
                style="position:absolute;top:-6px;right:-6px;background:var(--danger);color:#fff;border:none;border-radius:50%;width:20px;height:20px;cursor:pointer;font-size:12px;font-weight:bold;" aria-label="Remover imagem">X</button>
        </div>
    `).join('');
}

async function addGalleryImage() {
    const url = document.getElementById('gallery-new-url').value.trim();
    if (!url) {
        toast('Digite a URL da imagem', 'warning');
        return;
    }
    try {
        const auth = getAdminAuthHeader();
        const response = await fetch(`/api/products/${window._editingProductId}/images`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(auth && { 'Authorization': auth })
            },
            body: JSON.stringify({ image_url: url })
        });
        if (!response.ok) throw new Error(`Erro ${response.status}`);
        document.getElementById('gallery-new-url').value = '';
        loadGalleryImages(window._editingProductId);
        toast('Foto adicionada!', 'success');
    } catch (err) {
        console.error('Erro ao adicionar foto:', err);
        toast('Erro ao adicionar foto: ' + err.message, 'error');
    }
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
