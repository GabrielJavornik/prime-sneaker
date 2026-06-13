/**
 * Wrapper para chamadas a API.
 * Baseado na mesma origem (o Express serve o frontend).
 */
const API_BASE = '/api';

const API = {
    async request(endpoint, options = {}) {
        const opts = {
            ...options,
            headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
        };
        if (opts.body && typeof opts.body !== 'string') {
            opts.body = JSON.stringify(opts.body);
        }
        // Anexa token JWT se existir
        const token = sessionStorage.getItem('token');
        if (token && !opts.headers.Authorization) {
            opts.headers.Authorization = `Bearer ${token}`;
        }
        const res = await fetch(API_BASE + endpoint, opts);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            throw new Error(data.error || `Erro HTTP ${res.status}`);
        }
        return data;
    },

    // Produtos
    getTopProducts: (n = 4) => API.request(`/products/top?n=${n}`),
    getProductFacets: () => API.request(`/products/facets?refresh=1&ts=${Date.now()}`),
    getProduct: (id) => API.request(`/product/${id}`),
    search: (params) => {
        const qs = new URLSearchParams();
        Object.entries(params || {}).forEach(([k, v]) => {
            if (v !== undefined && v !== '' && v !== null) qs.set(k, v);
        });
        return API.request(`/search?${qs.toString()}`);
    },
    listAllProducts: (params = null) => {
        if (!params) return API.request('/products');
        const qs = new URLSearchParams();
        Object.entries(params || {}).forEach(([k, v]) => {
            if (v !== undefined && v !== '' && v !== null) qs.set(k, v);
        });
        return API.request(`/products?${qs.toString()}`);
    },

    // Admin
    createProduct: (data, auth) => API.request('/products', {
        method: 'POST', body: data, headers: auth ? { Authorization: auth } : {},
    }),
    updateProduct: (id, data, auth) => API.request(`/product/${id}`, {
        method: 'PUT', body: data, headers: auth ? { Authorization: auth } : {},
    }),
    deleteProduct: (id, auth) => API.request(`/product/${id}`, {
        method: 'DELETE', headers: auth ? { Authorization: auth } : {},
    }),
    uploadProductImage: (data, auth) => API.request('/products/images/upload', {
        method: 'POST', body: data, headers: auth ? { Authorization: auth } : {},
    }),

    // Cupons
    listCoupons: (auth, params = null) => API.request(`/coupons${params ? `?${new URLSearchParams(params).toString()}` : ''}`, {
        headers: auth ? { Authorization: auth } : {},
    }),
    createCoupon: (data, auth) => API.request('/coupons', {
        method: 'POST', body: data, headers: auth ? { Authorization: auth } : {},
    }),
    updateCoupon: (id, data, auth) => API.request(`/coupons/${id}`, {
        method: 'PUT', body: data, headers: auth ? { Authorization: auth } : {},
    }),
    deleteCoupon: (id, auth) => API.request(`/coupons/${id}`, {
        method: 'DELETE', headers: auth ? { Authorization: auth } : {},
    }),

    listNewsletterSubscribers: (auth) => API.request('/newsletter/subscribers', {
        headers: auth ? { Authorization: auth } : {},
    }),
    sendNewsletterPromotion: (data, auth) => API.request('/newsletter/promotion', {
        method: 'POST',
        body: data,
        headers: auth ? { Authorization: auth } : {},
    }),
    sendNewsletterPromotionTest: (data, auth) => API.request('/newsletter/promotion/test', {
        method: 'POST',
        body: data,
        headers: auth ? { Authorization: auth } : {},
    }),
    listAuditLogs: (auth, params = 100) => {
        const queryParams = typeof params === 'number' ? { limit: params } : (params || {});
        const qs = new URLSearchParams();
        Object.entries(queryParams).forEach(([key, value]) => {
            if (value !== undefined && value !== null && value !== '') qs.set(key, value);
        });
        return API.request(`/admin-audit-logs?${qs.toString()}`, {
            headers: auth ? { Authorization: auth } : {},
        });
    },

    // Carrinho
    getCart: () => API.request('/cart'),
    upsertCartItem: (item) => API.request('/cart/items', {
        method: 'PUT',
        body: item,
    }),
    removeCartItem: (productId, size = null) => {
        const qs = size ? `?size=${encodeURIComponent(size)}` : '';
        return API.request(`/cart/items/${productId}${qs}`, { method: 'DELETE' });
    },
    clearCart: () => API.request('/cart', { method: 'DELETE' }),
    checkout: (items, coupon) => API.request('/cart', {
        method: 'POST',
        body: { items, coupon },
    }),

    // Auth
    login: (email, password) => API.request('/login', {
        method: 'POST',
        body: { email, password },
    }),
    register: (name, email, password, phone = '') => API.request('/register', {
        method: 'POST',
        body: { name, email, password, phone },
    }),
};

/* ============================================================
   Toast
   ============================================================ */
function toast(message, type = 'info', timeout = 3000) {
    if (typeof Notifications !== 'undefined') {
        const safeType = ['success', 'error', 'warning', 'info'].includes(type) ? type : 'info';
        Notifications[safeType](message, timeout);
        return;
    }

    const host = document.querySelector('main') || document.body;
    let container = document.getElementById('site-feedback');
    if (!container) {
        container = document.createElement('div');
        container.id = 'site-feedback';
        container.className = 'site-feedback is-visible';
        host.prepend(container);
    }
    container.textContent = String(message || '');
    if (timeout > 0) {
        setTimeout(() => {
            container.textContent = '';
            container.classList.remove('is-visible');
        }, timeout);
    }
}

/* ============================================================
   Formata dinheiro em BRL
   ============================================================ */
function formatBRL(value) {
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL',
    }).format(Number(value || 0));
}

/* ============================================================
   Atualiza contador do carrinho no header
   ============================================================ */
function updateCartBadge() {
    const cart = Cart.getItems();
    const count = cart.reduce((sum, it) => sum + it.quantity, 0);
    document.querySelectorAll('.cart-badge').forEach(el => {
        el.textContent = count;
        el.style.display = count > 0 ? 'inline-block' : 'none';
    });
}
