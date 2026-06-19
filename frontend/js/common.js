/**
 * Funcoes compartilhadas - renderiza header e footer
 * para manter consistencia sem duplicar HTML.
 */
(function clearLegacyPersistentUserSession() {
    try {
        if (!sessionStorage.getItem('token')) {
            localStorage.removeItem('token');
            localStorage.removeItem('user');
        }
    } catch (_) {}
})();

(function startPagesAtTop() {
    function shouldKeepAnchorPosition() {
        return Boolean(window.location.hash);
    }

    function forceTop() {
        if (shouldKeepAnchorPosition()) return;
        window.scrollTo(0, 0);
        if (document.documentElement) document.documentElement.scrollTop = 0;
        if (document.body) document.body.scrollTop = 0;
    }

    try {
        if ('scrollRestoration' in window.history) {
            window.history.scrollRestoration = 'manual';
        }
    } catch (_) {}

    forceTop();
    window.addEventListener('pageshow', () => requestAnimationFrame(forceTop));
    document.addEventListener('DOMContentLoaded', () => requestAnimationFrame(forceTop));
    window.addEventListener('load', () => setTimeout(forceTop, 0));
})();

function escapeHTML(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
    }[char]));
}

function escapeAttribute(value) {
    return escapeHTML(value);
}

function escapeJSString(value) {
    return String(value ?? '')
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "\\'")
        .replace(/"/g, '\\"')
        .replace(/\r/g, '\\r')
        .replace(/\n/g, '\\n')
        .replace(/\u2028/g, '\\u2028')
        .replace(/\u2029/g, '\\u2029');
}

function safeHTML(strings, ...values) {
    return strings.reduce((html, chunk, index) => {
        const value = index < values.length ? escapeHTML(values[index]) : '';
        return html + chunk + value;
    }, '');
}

function setTextContent(target, value) {
    const element = typeof target === 'string' ? document.querySelector(target) : target;
    if (element) element.textContent = value ?? '';
}

function setSafeHTML(target, html) {
    const element = typeof target === 'string' ? document.querySelector(target) : target;
    if (element) element.innerHTML = String(html || '');
}

function getStrongPasswordError(password) {
    const value = String(password || '');
    const normalized = value.toLowerCase();
    const digitsOnly = value.replace(/\D/g, '');
    const lettersOnly = normalized.replace(/[^a-z]/g, '');
    const commonPasswords = new Set([
        '123456',
        '1234567',
        '12345678',
        '123456789',
        '1234567890',
        '111111',
        '000000',
        'qwerty',
        'qwerty123',
        'senha',
        'senha123',
        'password',
        'password123',
        'admin',
        'admin123',
        'prime123',
        'tenis123',
    ]);

    function hasSequential(text, sequence) {
        if (text.length < 6) return false;
        return sequence.includes(text) || sequence.split('').reverse().join('').includes(text);
    }

    if (value.length < 8) return 'Senha fraca. Use no minimo 8 caracteres, com letras e numeros.';
    if (!/[a-zA-Z]/.test(value) || !/\d/.test(value)) return 'Senha fraca. Use letras e numeros.';
    if (/^(.)\1+$/.test(value)) return 'Senha fraca. Evite repetir o mesmo caractere.';
    if (commonPasswords.has(normalized)) return 'Senha muito simples. Evite senhas obvias como 123456.';
    if (hasSequential(digitsOnly, '0123456789') || hasSequential(lettersOnly, 'abcdefghijklmnopqrstuvwxyz')) {
        return 'Senha fraca. Evite sequencias como 123456 ou abcdef.';
    }

    return null;
}

function safeImageSrc(value, fallback = 'https://via.placeholder.com/300?text=Imagem') {
    const raw = String(value || '').trim();
    if (!raw) return fallback;

    const compact = raw.replace(/\s+/g, '').toLowerCase();
    if (compact.startsWith('javascript:') || compact.startsWith('vbscript:')) return fallback;
    if (compact.startsWith('data:') && !compact.startsWith('data:image/png;base64,')
        && !compact.startsWith('data:image/jpeg;base64,')
        && !compact.startsWith('data:image/jpg;base64,')
        && !compact.startsWith('data:image/gif;base64,')
        && !compact.startsWith('data:image/webp;base64,')) {
        return fallback;
    }

    return raw;
}

function getLoggedUser() {
    try {
        const raw = sessionStorage.getItem('user');
        return raw ? JSON.parse(raw) : null;
    } catch (_) {
        return null;
    }
}

function clearSharedCheckoutState() {
    try {
        [
            'cep_entrega',
            'cep_entrega_guest',
            'endereco_salvo',
            'applied_coupon',
            'pending_order',
        ].forEach(key => localStorage.removeItem(key));
        window._checkoutAddress = null;
    } catch (_) {}
}

function getAdminUser() {
    try {
        // A sessão admin fica em sessionStorage — expira ao fechar o navegador
        // ou reiniciar o PC, o que exige novo login.
        const raw = sessionStorage.getItem('adminUser');
        return raw ? JSON.parse(raw) : null;
    } catch (_) {
        return null;
    }
}

function logout() {
    // Só remover a sessão do usuário NORMAL. A sessão admin
    // (`adminToken`/`adminUser`) é independente e tem seu próprio
    // logout em `logoutAdmin()`.
    sessionStorage.removeItem('token');
    sessionStorage.removeItem('user');
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    clearSharedCheckoutState();
    window.location.replace('index.html');
}

function isAdminPage() {
    return document.body && document.body.dataset.page === 'admin';
}

function renderAdminHeader() {
    const admin = getAdminUser();
    const firstName = escapeHTML(admin ? ((admin.name || '').split(' ')[0] || 'Admin') : 'Admin');
    const isDark = getTheme() === 'dark';

    return `
    <header class="site-header admin-site-header">
      <div class="header-inner">
        <a href="adm.html" class="logo"><img src="images/logo.png" alt="Prime Sneaker" class="logo-img" /></a>
        <nav class="main-nav">
          <a href="adm.html">Painel Admin</a>
          <button type="button"
                  id="admin-theme-toggle"
                  class="admin-theme-toggle"
                  aria-pressed="${isDark ? 'true' : 'false'}"
                  aria-label="${isDark ? 'Ativar modo claro' : 'Ativar modo escuro'}"
                  onclick="toggleAdminTheme()">
            <span class="admin-theme-toggle__track" aria-hidden="true">
              <span class="admin-theme-toggle__thumb"></span>
            </span>
            <span class="admin-theme-toggle__text">${isDark ? 'Modo claro' : 'Modo escuro'}</span>
          </button>
          <div class="user-menu-container admin-menu-container">
            <button class="user-greet" onclick="toggleUserMenu(event)">Admin: ${firstName}</button>
            <div class="user-dropdown" id="user-dropdown">
              <a href="adm.html">&Aacute;rea administrativa</a>
              <hr style="margin: 0.5rem 0; border: none; border-top: 1px solid #e5e5e5;">
              <a href="#" onclick="logoutAdmin(); return false;">Sair</a>
            </div>
          </div>
        </nav>
      </div>
    </header>
  `;
}

function renderHeader(activePage) {
    if (isAdminPage()) {
        return renderAdminHeader();
    }

    const user = getLoggedUser();

    // Blocos dinamicos conforme o estado de login
    let authLinks = '';
    let adminLink = '';

    if (user) {
        const firstName = escapeHTML((user.name || '').split(' ')[0] || 'Conta');
        authLinks = `
          <div class="user-menu-container">
            <button class="user-greet" onclick="toggleUserMenu(event)">
              <span class="user-greet-icon" aria-hidden="true">&#128100;</span>
              <span>Ol&aacute;, ${firstName}</span>
            </button>
            <div class="user-dropdown" id="user-dropdown">
              <a href="profile.html">Painel</a>
              <a href="orders.html">Pedidos</a>
              <a href="profile.html?tab=enderecos">Endere&ccedil;os</a>
              <a href="profile.html?tab=detalhes">Detalhes da conta</a>
              <a href="wishlist.html">Lista de Desejos</a>
              <hr style="margin: 0.5rem 0; border: none; border-top: 1px solid #e5e5e5;">
              <a href="#" onclick="logout(); return false;">Sair</a>
            </div>
          </div>
        `;
    } else {
        authLinks = `
          <a href="login.html">Entrar</a>
        `;
    }

    return `
    <header class="site-header">
      <div class="header-inner">
        <a href="index.html" class="logo"><img src="images/logo.png" alt="Prime Sneaker" class="logo-img" /></a>
        <form class="header-search" onsubmit="goToSearch(event)">
          <input type="text" id="header-search-input" placeholder="Buscar t&ecirc;nis..." />
          <button type="submit">Buscar</button>
        </form>
        <nav class="main-nav">
          ${authLinks}
          <a href="/carrinho" class="cart-link" aria-label="Abrir carrinho">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 16 16"><path d="M0 1.5A.5.5 0 0 1 .5 1H2a.5.5 0 0 1 .485.379L2.89 3H14.5a.5.5 0 0 1 .491.592l-1.5 8A.5.5 0 0 1 13 12H4a.5.5 0 0 1-.491-.408L2.01 3.607 1.61 2H.5a.5.5 0 0 1-.5-.5M5 12a2 2 0 1 0 0 4 2 2 0 0 0 0-4m7 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4m-7 1a1 1 0 1 1 0 2 1 1 0 0 1 0-2m7 0a1 1 0 1 1 0 2 1 1 0 0 1 0-2"/></svg>
            <span class="cart-badge">0</span>
          </a>
        </nav>
      </div>
      <nav class="store-mega-nav" aria-label="Menu da loja">
        <div class="mega-shell">
          <div class="mega-item">
            <a class="mega-trigger" href="/busca?launch=1">Lan&ccedil;amentos</a>
            <div class="mega-panel mega-panel-feature">
              <div class="mega-feature-card">
                <span class="mega-kicker">Novidades</span>
                <h3>Drops</h3>
                <p>Confira em primeira m&atilde;o os modelos que acabaram de entrar no nosso cat&aacute;logo.</p>
                <a class="mega-cta" href="/busca?launch=1">Ver lan&ccedil;amentos</a>
              </div>
              <div class="mega-column">
                <h4>Marcas com novidades</h4>
                <div class="mega-link-list" id="mega-launch-brands">
                  <a href="/busca?launch=1">Todos os lan&ccedil;amentos</a>
                </div>
              </div>
              <div class="mega-column">
                <h4>Comprar por p&uacute;blico</h4>
                <a href="/busca?launch=1&gender=masculino">Masculino</a>
                <a href="/busca?launch=1&gender=feminino">Feminino</a>
                <a href="/busca?launch=1&gender=infantil">Infantil</a>
              </div>
            </div>
          </div>
          <div class="mega-item">
            <a class="mega-trigger" href="/busca">T&ecirc;nis</a>
            <div class="mega-panel mega-panel-shop">
              <div class="mega-column">
                <h4>Masculino</h4>
                <div id="mega-men-brands">
                  <a href="/busca?gender=masculino">Todos em masculino</a>
                </div>
              </div>
              <div class="mega-column">
                <h4>Feminino</h4>
                <div id="mega-women-brands">
                  <a href="/busca?gender=feminino">Todos em feminino</a>
                </div>
              </div>
              <div class="mega-column">
                <h4>Infantil</h4>
                <div id="mega-kids-brands">
                  <a href="/busca?gender=infantil">Todos em infantil</a>
                </div>
              </div>
              <div class="mega-column mega-size-column">
                <h4>Tamanho de t&ecirc;nis</h4>
                <div class="mega-size-grid" id="mega-size-grid">
                  <span class="mega-empty-link">Carregando tamanhos...</span>
                </div>
              </div>
            </div>
          </div>
          <div class="mega-item">
            <a class="mega-trigger" href="/busca">Marca</a>
            <div class="mega-panel mega-panel-brands">
              <div class="mega-feature-card mega-feature-card-light">
                <span class="mega-kicker">Marcas</span>
                <h3>As melhores marcas</h3>
                <p>Descubra nossa sele&ccedil;&atilde;o premium das marcas mais ic&ocirc;nicas e desejadas do mercado.</p>
                <a class="mega-cta" href="/busca">Ver cat&aacute;logo</a>
              </div>
              <div class="mega-column">
                <h4>Marcas dispon&iacute;veis</h4>
                <div class="mega-link-list" id="mega-brand-list">
                  <a href="/busca">Todas as marcas</a>
                </div>
              </div>
              <div class="mega-column">
                <h4>Destaques</h4>
                <div id="mega-brand-launches">
                  <a href="/busca?launch=1">Marcas com lan&ccedil;amento</a>
                </div>
                <div id="mega-brand-outlet" class="mega-mini-group">
                  <a href="/busca?outlet=1">Marcas no outlet</a>
                </div>
              </div>
            </div>
          </div>
          <div class="mega-item">
            <a class="mega-trigger is-outlet" href="/busca?outlet=1">Outlet</a>
            <div class="mega-panel mega-panel-feature">
              <div class="mega-feature-card mega-feature-card-outlet">
                <span class="mega-kicker">Outlet</span>
                <h3>Outlet</h3>
                <p>&Uacute;ltimos pares e oportunidades &uacute;nicas com pre&ccedil;os que n&atilde;o v&atilde;o durar muito tempo.</p>
                <a class="mega-cta" href="/busca?outlet=1">Ver outlet</a>
              </div>
              <div class="mega-column">
                <h4>Ofertas por marca</h4>
                <div class="mega-link-list" id="mega-outlet-brands">
                  <a href="/busca?outlet=1">Todos no outlet</a>
                </div>
              </div>
              <div class="mega-column">
                <h4>Filtrar outlet</h4>
                <a href="/busca?outlet=1&gender=masculino">Masculino</a>
                <a href="/busca?outlet=1&gender=feminino">Feminino</a>
                <a href="/busca?outlet=1&gender=infantil">Infantil</a>
              </div>
            </div>
          </div>
        </div>
      </nav>
    </header>
  `;
}

function normalizeMenuBrand(product) {
    const fromBrand = (product.brand || '').trim();
    if (fromBrand) return fromBrand;
    return String(product.name || '').trim().split(/\s+/)[0] || '';
}

function uniqueSorted(values) {
    return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

const FALLBACK_MENU_BRANDS = ['Nike', 'Jordan', 'Adidas', 'New Balance', 'Vans', 'Puma', 'ASICS', 'Mizuno'];
const MEGA_MENU_FACETS_CACHE_KEY = 'primeSneaker:megaMenuFacets:v4';
const MEGA_MENU_FACETS_CACHE_MS = 0;

function isTruthyMenuFlag(value) {
    return value === true || value === 'true' || value === '1' || value === 1 || value === 't' || value === 'yes';
}

function productHasMenuFlag(product, fields) {
    return fields.some(field => isTruthyMenuFlag(product[field]));
}

function getProductDiscountPercent(product) {
    const discount = Number(product?.discount_percent || product?.outlet_discount_percent || 0);
    if (!Number.isFinite(discount)) return 0;
    return Math.max(0, Math.min(99, discount));
}

function isOutletProduct(product) {
    return productHasMenuFlag(product || {}, ['is_outlet', 'outlet', 'isOutlet'])
        || getProductDiscountPercent(product) > 0;
}

function getProductSalePrice(product) {
    const price = Number(product?.price || 0);
    const discount = getProductDiscountPercent(product);
    if (!isOutletProduct(product) || discount <= 0) return price;
    return Number((price * (1 - discount / 100)).toFixed(2));
}

function hasOutletDiscount(product) {
    return getProductDiscountPercent(product) > 0;
}

function renderOutletBadge(product) {
    if (!hasOutletDiscount(product)) return '';
    return `<span class="outlet-discount-badge">-${Math.round(getProductDiscountPercent(product))}%</span>`;
}

function renderProductPrice(product, options = {}) {
    const originalPrice = Number(product?.price || 0);
    const salePrice = getProductSalePrice(product);
    const suffix = escapeHTML(options.suffix || '');

    if (!hasOutletDiscount(product)) {
        return `<div class="product-price-block"><span class="product-price-current">${formatBRL(originalPrice)}${suffix}</span></div>`;
    }

    return `
        <div class="product-price-block is-outlet-price">
            <span class="product-price-old">${formatBRL(originalPrice)}</span>
            <span class="product-price-current">${formatBRL(salePrice)}${suffix}</span>
        </div>
    `;
}

function getProductReviewStats(product) {
    const average = Number(product?.average_rating ?? product?.averageRating ?? 0);
    const total = Number(product?.total_reviews ?? product?.totalReviews ?? 0);

    return {
        averageRating: Number.isFinite(average) ? Math.max(0, Math.min(5, average)) : 0,
        totalReviews: Number.isFinite(total) ? Math.max(0, Math.trunc(total)) : 0,
    };
}

function renderProductRatingStars(averageRating) {
    const rating = Math.max(0, Math.min(5, Math.round(Number(averageRating) || 0)));
    return `${'&#9733;'.repeat(rating)}${'&#9734;'.repeat(5 - rating)}`;
}

function renderProductReviewSummary(product) {
    const { averageRating, totalReviews } = getProductReviewStats(product);
    const reviewLabel = totalReviews === 1 ? 'avalia\u00e7\u00e3o' : 'avalia\u00e7\u00f5es';
    const averageLabel = totalReviews > 0 ? `${averageRating.toFixed(1)} - ` : '';
    const accessibleLabel = `${averageRating.toFixed(1)} de 5 em ${totalReviews} ${reviewLabel}`;

    return `
        <div class="rating" aria-label="${escapeAttribute(accessibleLabel)}">
            <span aria-hidden="true">${renderProductRatingStars(averageRating)}</span>
            <span>${averageLabel}${totalReviews} ${reviewLabel}</span>
        </div>
    `;
}

function slugifyProductName(value) {
    const slug = String(value || 'produto')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    return slug || 'produto';
}

function buildProductUrl(productOrId, fallbackName = 'produto') {
    const product = typeof productOrId === 'object' && productOrId !== null ? productOrId : null;
    const id = product ? product.id : productOrId;
    const slug = slugifyProductName(product ? product.name : fallbackName);
    return `/p/${slug}/${encodeURIComponent(id)}`;
}

function buildSearchUrl(params = {}) {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
            qs.set(key, value);
        }
    });
    return `/busca${qs.toString() ? `?${qs.toString()}` : ''}`;
}

function renderMegaBrandLinks(containerId, brands, params = {}, allLabel = '', options = {}) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const { allowFallback = true, emptyLabel = 'Nenhuma marca cadastrada ainda' } = options;
    const normalizedBrands = Array.isArray(brands)
        ? uniqueSorted(brands.map(brand => String(brand || '').trim()))
        : [];
    const list = normalizedBrands.length ? normalizedBrands : (allowFallback ? FALLBACK_MENU_BRANDS : []);
    const allLink = allLabel
        ? `<a class="mega-all-link" href="${buildSearchUrl(params)}">${escapeHTML(allLabel)}</a>`
        : '';

    if (!list.length) {
        container.innerHTML = allLink + `<span class="mega-empty-link">${escapeHTML(emptyLabel)}</span>`;
        return;
    }

    container.innerHTML = allLink + list.map(brand =>
        `<a href="${buildSearchUrl({ ...params, brand })}">${escapeHTML(brand)}</a>`
    ).join('');
}

function normalizeMenuSizes(sizes) {
    return [...new Set((Array.isArray(sizes) ? sizes : [])
        .map(size => String(size || '').trim())
        .filter(Boolean))]
        .sort((a, b) => {
            const numericA = Number(a.replace(',', '.'));
            const numericB = Number(b.replace(',', '.'));
            if (Number.isFinite(numericA) && Number.isFinite(numericB)) {
                return numericA - numericB;
            }
            return a.localeCompare(b, 'pt-BR', { numeric: true });
        });
}

function renderMegaSizeLinks(sizes = []) {
    const container = document.getElementById('mega-size-grid');
    if (!container) return;

    const list = normalizeMenuSizes(sizes);
    if (!list.length) {
        container.innerHTML = '<span class="mega-empty-link">Nenhum tamanho cadastrado</span>';
        return;
    }

    container.innerHTML = list.map(size =>
        `<a href="${buildSearchUrl({ tamanho: size })}">${escapeHTML(size)}</a>`
    ).join('');
}

function brandsByGender(products, gender) {
    return uniqueSorted(products
        .filter(product => {
            const productGender = String(product.gender || 'unissex').toLowerCase();
            return productGender === gender || (gender !== 'infantil' && productGender === 'unissex');
        })
        .map(normalizeMenuBrand));
}

function readCachedMegaMenuFacets() {
    if (MEGA_MENU_FACETS_CACHE_MS <= 0) {
        try {
            sessionStorage.removeItem(MEGA_MENU_FACETS_CACHE_KEY);
        } catch (_) {}
        return null;
    }

    try {
        const raw = sessionStorage.getItem(MEGA_MENU_FACETS_CACHE_KEY);
        if (!raw) return null;

        const cached = JSON.parse(raw);
        if (!cached || !cached.data || Number(cached.expiresAt || 0) < Date.now()) {
            sessionStorage.removeItem(MEGA_MENU_FACETS_CACHE_KEY);
            return null;
        }

        return cached.data;
    } catch (_) {
        return null;
    }
}

function writeCachedMegaMenuFacets(data) {
    if (MEGA_MENU_FACETS_CACHE_MS <= 0) return;

    try {
        sessionStorage.setItem(MEGA_MENU_FACETS_CACHE_KEY, JSON.stringify({
            expiresAt: Date.now() + MEGA_MENU_FACETS_CACHE_MS,
            data,
        }));
    } catch (_) {}
}

async function getMegaMenuFacets() {
    const cached = readCachedMegaMenuFacets();
    if (cached) return cached;

    const facets = typeof API !== 'undefined' && API.getProductFacets
        ? await API.getProductFacets()
        : await fetch(`/api/products/facets?refresh=1&ts=${Date.now()}`).then(response => {
            if (!response.ok) throw new Error('N\u00e3o foi poss\u00edvel carregar o menu');
            return response.json();
        });

    writeCachedMegaMenuFacets(facets);
    return facets;
}

async function hydrateMegaMenu() {
    if (isAdminPage()) return;

    try {
        const facets = await getMegaMenuFacets();
        const brands = Array.isArray(facets.brands) ? facets.brands : [];
        const launchBrands = Array.isArray(facets.launchBrands) ? facets.launchBrands : [];
        const outletBrands = Array.isArray(facets.outletBrands) ? facets.outletBrands : [];
        const byGender = facets.byGender || {};
        const sizes = Array.isArray(facets.sizes) ? facets.sizes : [];

        renderMegaBrandLinks('mega-men-brands', Array.isArray(byGender.masculino) ? byGender.masculino : [], { gender: 'masculino' }, 'Todos em masculino');
        renderMegaBrandLinks('mega-women-brands', Array.isArray(byGender.feminino) ? byGender.feminino : [], { gender: 'feminino' }, 'Todos em feminino');
        renderMegaBrandLinks('mega-kids-brands', Array.isArray(byGender.infantil) ? byGender.infantil : [], { gender: 'infantil' }, 'Todos em infantil');
        renderMegaSizeLinks(sizes);
        renderMegaBrandLinks('mega-brand-list', brands, {}, 'Todas as marcas');
        renderMegaBrandLinks('mega-launch-brands', launchBrands, { launch: '1' }, 'Todos os lan\u00e7amentos', {
            allowFallback: false,
            emptyLabel: 'Nenhum produto marcado como lan\u00e7amento',
        });
        renderMegaBrandLinks('mega-brand-launches', launchBrands, { launch: '1' }, 'Com lan\u00e7amento', {
            allowFallback: false,
            emptyLabel: 'Sem lan\u00e7amentos marcados',
        });
        renderMegaBrandLinks('mega-brand-outlet', outletBrands, { outlet: '1' }, 'No outlet', {
            allowFallback: false,
            emptyLabel: 'Sem outlet marcado',
        });
        renderMegaBrandLinks('mega-outlet-brands', outletBrands, { outlet: '1' }, 'Todos no outlet', {
            allowFallback: false,
            emptyLabel: 'Nenhum produto marcado como outlet',
        });
    } catch (_) {
        renderMegaBrandLinks('mega-men-brands', [], { gender: 'masculino' }, 'Todos em masculino');
        renderMegaBrandLinks('mega-women-brands', [], { gender: 'feminino' }, 'Todos em feminino');
        renderMegaBrandLinks('mega-kids-brands', [], { gender: 'infantil' }, 'Todos em infantil');
        renderMegaSizeLinks([]);
        renderMegaBrandLinks('mega-brand-list', [], {}, 'Todas as marcas');
        renderMegaBrandLinks('mega-launch-brands', [], { launch: '1' }, 'Todos os lan\u00e7amentos', {
            allowFallback: false,
            emptyLabel: 'N\u00e3o foi poss\u00edvel carregar os lan\u00e7amentos',
        });
        renderMegaBrandLinks('mega-brand-launches', [], { launch: '1' }, 'Com lan\u00e7amento', {
            allowFallback: false,
            emptyLabel: 'N\u00e3o foi poss\u00edvel carregar',
        });
        renderMegaBrandLinks('mega-brand-outlet', [], { outlet: '1' }, 'No outlet', {
            allowFallback: false,
            emptyLabel: 'N\u00e3o foi poss\u00edvel carregar',
        });
        renderMegaBrandLinks('mega-outlet-brands', [], { outlet: '1' }, 'Todos no outlet', {
            allowFallback: false,
            emptyLabel: 'N\u00e3o foi poss\u00edvel carregar o outlet',
        });
    }
}

function renderFooter() {
    return `
    <footer class="site-footer">
      <div class="footer-content">
        <div class="footer-section">
          <h3>Sobre Nós</h3>
          <ul>
            <li><a href="nossa-historia.html">Nossa História</a></li>
            <li><a href="/busca">Loja Online</a></li>
            <li><a href="blog.html">Blog</a></li>
          </ul>
        </div>
        <div class="footer-section">
          <h3>Política</h3>
          <ul>
            <li><a href="privacidade.html">Privacidade</a></li>
            <li><a href="termos-de-uso.html">Termos de Uso</a></li>
            <li><a href="devolucao.html">Devolu&ccedil;&atilde;o</a></li>
            <li><a href="envio.html">Envio</a></li>
          </ul>
        </div>
        <div class="footer-section">
          <h3>Contato</h3>
          <ul>
            <li><a href="#">📞 (54) 99202-6684</a></li>
            <li><a href="#">📧 contato@primesneaker.com</a></li>
            <li><a href="#">📍 Erechim - RS</a></li>
          </ul>
        </div>
        <div class="footer-section">
          <h3>Redes Sociais</h3>
          <ul>
            <li><a href="https://instagram.com" target="_blank" style="display: flex; align-items: center; gap: 0.5rem;"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 16 16"><path d="M8 0C5.829 0 5.556.01 4.703.048 3.85.088 3.269.222 2.76.42a3.9 3.9 0 0 0-1.417.923A3.9 3.9 0 0 0 .42 2.76C.222 3.268.087 3.85.048 4.7.01 5.555 0 5.827 0 8.001c0 2.172.01 2.444.048 3.297.04.852.174 1.433.372 1.942.205.526.478.972.923 1.417.444.445.89.719 1.416.923.51.198 1.09.333 1.942.372C5.555 15.99 5.827 16 8 16s2.444-.01 3.298-.048c.851-.04 1.434-.174 1.943-.372a3.9 3.9 0 0 0 1.416-.923c.445-.445.718-.891.923-1.417.197-.509.332-1.09.372-1.942C15.99 10.445 16 10.173 16 8s-.01-2.445-.048-3.299c-.04-.851-.175-1.433-.372-1.941a3.9 3.9 0 0 0-.923-1.417A3.9 3.9 0 0 0 13.24.42c-.51-.198-1.092-.333-1.943-.372C10.443.01 10.172 0 7.998 0zm-.717 1.442h.718c2.136 0 2.389.007 3.232.046.78.035 1.204.166 1.486.275.373.145.64.319.92.599s.453.546.598.92c.11.281.24.705.275 1.485.039.843.047 1.096.047 3.231s-.008 2.389-.047 3.232c-.035.78-.166 1.203-.275 1.485a2.5 2.5 0 0 1-.599.919c-.28.28-.546.453-.92.598-.28.11-.704.24-1.485.276-.843.038-1.096.047-3.232.047s-2.39-.009-3.233-.047c-.78-.036-1.203-.166-1.485-.276a2.5 2.5 0 0 1-.92-.598 2.5 2.5 0 0 1-.6-.92c-.109-.281-.24-.705-.275-1.485-.038-.843-.046-1.096-.046-3.233s.008-2.388.046-3.231c.036-.78.166-1.204.276-1.486.145-.373.319-.64.599-.92s.546-.453.92-.598c.282-.11.705-.24 1.485-.276.738-.034 1.024-.044 2.515-.045zm4.988 1.328a.96.96 0 1 0 0 1.92.96.96 0 0 0 0-1.92m-4.27 1.122a4.109 4.109 0 1 0 0 8.217 4.109 4.109 0 0 0 0-8.217m0 1.441a2.667 2.667 0 1 1 0 5.334 2.667 2.667 0 0 1 0-5.334"/></svg> Instagram</a></li>
            <li><a href="https://x.com" target="_blank">𝕏 X (Twitter)</a></li>
            <li><a href="https://wa.me/5554992026684" target="_blank" style="display: flex; align-items: center; gap: 0.5rem;"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="#25D366" viewBox="0 0 16 16"><path d="M13.601 2.326A7.85 7.85 0 0 0 7.994 0C3.627 0 .068 3.558.064 7.926c0 1.399.366 2.76 1.057 3.965L0 16l4.204-1.102a7.9 7.9 0 0 0 3.79.965h.004c4.368 0 7.926-3.558 7.93-7.93A7.9 7.9 0 0 0 13.6 2.326zM7.994 14.521a6.6 6.6 0 0 1-3.356-.92l-.24-.144-2.494.654.666-2.433-.156-.251a6.56 6.56 0 0 1-1.007-3.505c0-3.626 2.957-6.584 6.591-6.584a6.56 6.56 0 0 1 4.66 1.931 6.56 6.56 0 0 1 1.928 4.66c-.004 3.639-2.961 6.592-6.592 6.592m3.615-4.934c-.197-.099-1.17-.578-1.353-.646-.182-.065-.315-.099-.445.099-.133.197-.513.646-.627.775-.114.133-.232.148-.43.05-.197-.1-.836-.308-1.592-.985-.59-.525-.985-1.175-1.103-1.372-.114-.198-.011-.304.088-.403.087-.088.197-.232.296-.346.1-.114.133-.198.198-.33.065-.134.034-.248-.015-.347-.05-.099-.445-1.076-.612-1.47-.16-.389-.323-.335-.445-.34-.114-.007-.247-.007-.38-.007a.73.73 0 0 0-.529.247c-.182.198-.691.677-.691 1.654s.71 1.916.81 2.049c.098.133 1.394 2.132 3.383 2.992.47.205.84.326 1.129.418.475.152.904.129 1.246.08.38-.058 1.171-.48 1.338-.943.164-.464.164-.86.114-.943-.049-.084-.182-.133-.38-.232"/></svg> WhatsApp</a></li>
          </ul>
        </div>
      </div>
      <div class="footer-bottom">
        <p>&copy; ${new Date().getFullYear()} Prime Sneaker. Todos os direitos reservados. | Desenvolvido por Gabriel</p>
      </div>
    </footer>
  `;
}

function goToSearch(e) {
    e.preventDefault();
    const q = document.getElementById('header-search-input').value.trim();
    window.location.href = '/busca' + (q ? `?query=${encodeURIComponent(q)}` : '');
}

function toggleUserMenu(e) {
    e.preventDefault();
    const dropdown = document.getElementById('user-dropdown');
    if (dropdown) {
        dropdown.classList.toggle('show');
    }
}

document.addEventListener('click', (e) => {
    const dropdown = document.getElementById('user-dropdown');
    const userMenu = document.querySelector('.user-menu-container');
    if (dropdown && userMenu && !userMenu.contains(e.target)) {
        dropdown.classList.remove('show');
    }
});

function updateCartBadge() {
    if (isAdminPage() || typeof Cart === 'undefined') return;

    const items = Cart.getItems();
    const count = items.reduce((sum, item) => sum + Number(item.quantity || 1), 0);
    const badge = document.querySelector('.cart-badge');
    if (badge) {
        if (count > 0) {
            badge.textContent = count;
            badge.style.display = 'flex';
        } else {
            badge.style.display = 'none';
        }
    }
}

function toast(message, type = 'info', duration = 3000) {
    if (typeof Notifications !== 'undefined') {
        const safeType = ['success', 'error', 'warning', 'info'].includes(type) ? type : 'info';
        Notifications[safeType](message, duration);
        return;
    }

    const host = document.querySelector('main') || document.body;
    if (!host) return;

    let container = document.getElementById('site-feedback');
    if (!container) {
        container = document.createElement('div');
        container.id = 'site-feedback';
        container.className = 'site-feedback';
        host.prepend(container);
    }

    container.classList.add('is-visible');
    container.textContent = String(message || '');
    if (duration > 0) {
        setTimeout(() => {
            container.classList.remove('is-visible');
            container.textContent = '';
        }, duration);
    }
}

// Injeta favicon em todas as paginas (evita editar cada HTML).
// Roda o quanto antes — nao depende do DOM estar pronto.
(function injectFavicon() {
    if (document.querySelector('link[rel="icon"]')) return;
    const link = document.createElement('link');
    link.rel = 'icon';
    link.type = 'image/png';
    link.href = 'images/logo.png';
    (document.head || document.documentElement).appendChild(link);
})();

// Aplica o tema ANTES do DOM renderizar para evitar flash branco
// quando o usuario tem dark mode ativo. Roda imediatamente, nao espera
// DOMContentLoaded.
(function applyTheme() {
    try {
        const tema = localStorage.getItem('theme') || 'light';
        if (tema === 'dark') {
            document.documentElement.setAttribute('data-theme', 'dark');
        }
    } catch (_) { /* localStorage indisponivel — ignora */ }
})();

function getTheme() {
    return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
}

function toggleTheme() {
    const novo = getTheme() === 'dark' ? 'light' : 'dark';
    if (novo === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
    } else {
        document.documentElement.removeAttribute('data-theme');
    }
    try { localStorage.setItem('theme', novo); } catch (_) {}
    // Atualiza icone do botao
    const btn = document.querySelector('.theme-toggle');
    if (btn) {
        btn.innerHTML = novo === 'dark' ? '☀️' : '🌙';
        btn.setAttribute('aria-label', novo === 'dark' ? 'Trocar para tema claro' : 'Trocar para tema escuro');
        btn.title = novo === 'dark' ? 'Tema claro' : 'Tema escuro';
    }
}

// Injeta o botao de toggle no header. Como o header e gerado dinamicamente,
// este metodo roda apos renderHeader() para inserir o botao na posicao certa.
function injectThemeToggle() {
    if (isAdminPage()) return;
    const nav = document.querySelector('.main-nav');
    if (!nav || nav.querySelector('.theme-toggle')) return;

    const isDark = getTheme() === 'dark';
    const btn = document.createElement('button');
    btn.className = 'theme-toggle';
    btn.type = 'button';
    btn.innerHTML = isDark ? '☀️' : '🌙';
    btn.setAttribute('aria-label', isDark ? 'Trocar para tema claro' : 'Trocar para tema escuro');
    btn.title = isDark ? 'Tema claro' : 'Tema escuro';
    btn.onclick = toggleTheme;

    nav.appendChild(btn);
}

// Botao flutuante de WhatsApp — facilita contato direto sem
// precisar abrir o rodape. Aparece em toda pagina publica
// (oculto na area admin).
function injectWhatsAppButton() {
    if (isAdminPage()) return;
    if (document.querySelector('.whatsapp-float')) return;

    const numero = '5554992026684'; // mesmo numero do rodape
    const mensagem = encodeURIComponent('Olá! Tenho uma dúvida sobre os produtos da Prime Sneaker.');

    const wrapper = document.createElement('a');
    wrapper.href = `https://wa.me/${numero}?text=${mensagem}`;
    wrapper.target = '_blank';
    wrapper.rel = 'noopener noreferrer';
    wrapper.className = 'whatsapp-float';
    wrapper.setAttribute('aria-label', 'Fale conosco no WhatsApp');
    wrapper.innerHTML = `
        <span class="whatsapp-tooltip">Fale conosco</span>
        <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" fill="white" viewBox="0 0 16 16">
            <path d="M13.601 2.326A7.85 7.85 0 0 0 7.994 0C3.627 0 .068 3.558.064 7.926c0 1.399.366 2.76 1.057 3.965L0 16l4.204-1.102a7.9 7.9 0 0 0 3.79.965h.004c4.368 0 7.926-3.558 7.93-7.93A7.9 7.9 0 0 0 13.6 2.326zM7.994 14.521a6.6 6.6 0 0 1-3.356-.92l-.24-.144-2.494.654.666-2.433-.156-.251a6.56 6.56 0 0 1-1.007-3.505c0-3.626 2.957-6.584 6.591-6.584a6.56 6.56 0 0 1 4.66 1.931 6.56 6.56 0 0 1 1.928 4.66c-.004 3.639-2.961 6.592-6.592 6.592m3.615-4.934c-.197-.099-1.17-.578-1.353-.646-.182-.065-.315-.099-.445.099-.133.197-.513.646-.627.775-.114.133-.232.148-.43.05-.197-.1-.836-.308-1.592-.985-.59-.525-.985-1.175-1.103-1.372-.114-.198-.011-.304.088-.403.087-.088.197-.232.296-.346.1-.114.133-.198.198-.33.065-.134.034-.248-.015-.347-.05-.099-.445-1.076-.612-1.47-.16-.389-.323-.335-.445-.34-.114-.007-.247-.007-.38-.007a.73.73 0 0 0-.529.247c-.182.198-.691.677-.691 1.654s.71 1.916.81 2.049c.098.133 1.394 2.132 3.383 2.992.47.205.84.326 1.129.418.475.152.904.129 1.246.08.38-.058 1.171-.48 1.338-.943.164-.464.164-.86.114-.943-.049-.084-.182-.133-.38-.232"/>
        </svg>
    `;
    document.body.appendChild(wrapper);
}

// Injeta header/footer em placeholders ao carregar a pagina
document.addEventListener('DOMContentLoaded', () => {
    const h = document.getElementById('header-placeholder');
    const f = document.getElementById('footer-placeholder');
    if (h) h.outerHTML = isAdminPage() ? renderAdminHeader() : renderHeader();
    if (f) f.outerHTML = isAdminPage() ? '' : renderFooter();
    updateCartBadge();
    if (!isAdminPage() && typeof Cart !== 'undefined' && typeof Cart.syncFromServer === 'function') {
        Cart.syncFromServer().catch(() => {});
    }
    injectWhatsAppButton();
    injectThemeToggle();
    hydrateMegaMenu();
});
