/**
 * Busca/Listagem - le URLSearchParams, aplica filtros e pagina.
 */
const state = {
    q: '',
    categoria: '',
    brand: '',
    gender: '',
    launch: '',
    outlet: '',
    tamanho: '',
    minPrice: '',
    maxPrice: '',
    sortBy: 'recent',
    page: 1,
    limit: 9,
};

function readFromUrl() {
    const params = new URLSearchParams(window.location.search);
    state.q = params.get('q') || '';
    state.categoria = params.get('categoria') || '';
    state.brand = params.get('brand') || params.get('marca') || '';
    state.gender = params.get('gender') || params.get('genero') || '';
    state.launch = params.get('launch') || params.get('lancamento') || '';
    state.outlet = params.get('outlet') || '';
    state.tamanho = params.get('tamanho') || '';
    state.minPrice = params.get('minPrice') || '';
    state.maxPrice = params.get('maxPrice') || '';
    state.sortBy = params.get('sortBy') || 'recent';
    state.page = parseInt(params.get('page')) || 1;
    document.getElementById('f-q').value = state.q;
    document.getElementById('f-categoria').value = state.categoria;
    document.getElementById('f-brand').value = state.brand;
    document.getElementById('f-gender').value = state.gender;
    document.getElementById('f-feature').value = state.launch ? 'launch' : state.outlet ? 'outlet' : '';
    document.getElementById('f-tamanho').value = state.tamanho;
    document.getElementById('f-min').value = state.minPrice;
    document.getElementById('f-max').value = state.maxPrice;
    document.getElementById('sort-select').value = state.sortBy;

    if (state.q) {
        document.getElementById('page-title').textContent = `Resultados para "${state.q}"`;
    } else if (state.launch) {
        document.getElementById('page-title').textContent = state.brand ? `Lançamentos ${state.brand}` : 'Lançamentos';
    } else if (state.outlet) {
        document.getElementById('page-title').textContent = state.brand ? `Outlet ${state.brand}` : 'Outlet';
    } else if (state.brand) {
        document.getElementById('page-title').textContent = `Marca: ${state.brand}`;
    } else if (state.gender) {
        const genderLabels = { masculino: 'Masculino', feminino: 'Feminino', infantil: 'Infantil' };
        document.getElementById('page-title').textContent = `Tênis ${genderLabels[state.gender] || state.gender}`;
    } else if (state.categoria) {
        document.getElementById('page-title').textContent = `Categoria: ${state.categoria}`;
    }
}

function updateUrl() {
    const params = new URLSearchParams();
    Object.entries(state).forEach(([k, v]) => {
        if (v && v !== '' && !(k === 'page' && v === 1)) params.set(k, v);
    });
    window.history.replaceState({}, '', 'search.html?' + params.toString());
}

function getSortOrder(sortBy) {
    return sortBy === 'price_low' || sortBy === 'name' ? 'ASC' : 'DESC';
}

async function fetchResults() {
    return API.search({
        ...state,
        marca: state.brand,
        genero: state.gender,
        lancamento: state.launch,
        sortOrder: getSortOrder(state.sortBy),
    });
}

async function loadResults() {
    const container = document.getElementById('results');
    const pagEl = document.getElementById('pagination');
    const meta = document.getElementById('result-meta');

    container.innerHTML = '<div class="loading">Carregando...</div>';
    pagEl.innerHTML = '';

    try {
        const resp = await fetchResults();
        const { items, pagination } = resp;

        if (!items.length) {
            container.innerHTML = '<p class="no-results">Nenhum produto encontrado com esses filtros.</p>';
            meta.textContent = '0 produtos';
            return;
        }

        meta.textContent = `${pagination.total} produto(s) encontrado(s)`;
        container.innerHTML = items.map(p => renderCard(p)).join('');
        renderPagination(pagination);
        await updateFavoriteButtons(items);
    } catch (err) {
        container.innerHTML = `<p class="no-results">Erro: ${escapeHTML(err.message)}</p>`;
    }
}

async function updateFavoriteButtons(products) {
    const user = getLoggedUser();
    if (!user) return;

    const favoriteIds = await Wishlist.checkMany(products.map(product => product.id));
    for (const product of products) {
        const productId = Number(product.id) || 0;
        const isFav = favoriteIds.has(productId);
        const button = document.querySelector(`[data-wishlist-product-id="${productId}"]`)
            || document.querySelector(`button[onclick*="toggleWishlist(${productId}"]`);
        if (button && isFav) {
            button.textContent = '❤️';
            button.style.color = 'var(--danger)';
        }
    }
}

function renderCard(p) {
    const productId = Number(p.id) || 0;
    const img = safeImageSrc(p.image_url, 'https://via.placeholder.com/300x280?text=T%C3%AAnis');
    const name = escapeHTML(p.name || 'Produto');
    const nameAttr = escapeAttribute(p.name || 'Produto');
    const category = escapeHTML(p.category || 'T\u00eanis');
    const rating = 4.5;
    const reviews = Math.floor(Math.random() * 100) + 30;
    return `
    <a href="product.html?id=${productId}" class="product-card">
      <div class="product-card-media">
        <img src="${escapeAttribute(img)}" alt="${nameAttr}" loading="lazy" decoding="async" onerror="this.src='https://via.placeholder.com/300x280?text=Sem+Imagem'">
        ${renderOutletBadge(p)}
      </div>
      <div class="info">
        <div class="category">${category}</div>
        <h3>${name}</h3>
        <div class="rating">⭐⭐⭐⭐⭐ (${reviews} avaliações)</div>
        <div class="price">${renderProductPrice(p)}</div>
        <div class="btn-container">
          <button class="btn" onclick="event.stopPropagation(); window.location.href='product.html?id=${productId}'">Compre Agora</button>
          <button class="btn-favorite" data-wishlist-product-id="${productId}" onclick="toggleWishlist(${productId}, this); return false;">♡</button>
        </div>
      </div>
    </a>`;
}

function renderPagination(p) {
    const { page, totalPages } = p;
    if (totalPages <= 1) return;
    const pagEl = document.getElementById('pagination');
    const btns = [];
    btns.push(`<button ${page <= 1 ? 'disabled' : ''} onclick="changePage(${page - 1})">&lt;</button>`);
    for (let i = 1; i <= totalPages; i++) {
        btns.push(`<button class="${i === page ? 'active' : ''}" onclick="changePage(${i})">${i}</button>`);
    }
    btns.push(`<button ${page >= totalPages ? 'disabled' : ''} onclick="changePage(${page + 1})">&gt;</button>`);
    pagEl.innerHTML = btns.join('');
}

function changePage(n) {
    state.page = n;
    updateUrl();
    loadResults();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

document.addEventListener('DOMContentLoaded', () => {
    readFromUrl();
    loadResults();

    document.getElementById('filter-form').addEventListener('submit', (e) => {
        e.preventDefault();
        state.q = document.getElementById('f-q').value.trim();
        state.categoria = document.getElementById('f-categoria').value;
        state.brand = document.getElementById('f-brand').value.trim();
        state.gender = document.getElementById('f-gender').value;
        const feature = document.getElementById('f-feature').value;
        state.launch = feature === 'launch' ? '1' : '';
        state.outlet = feature === 'outlet' ? '1' : '';
        state.tamanho = document.getElementById('f-tamanho').value;
        state.minPrice = document.getElementById('f-min').value;
        state.maxPrice = document.getElementById('f-max').value;
        state.page = 1;
        updateUrl();
        loadResults();
    });

    document.getElementById('sort-select').addEventListener('change', (e) => {
        state.sortBy = e.target.value;
        state.page = 1;
        updateUrl();
        loadResults();
    });

    document.getElementById('btn-clear').addEventListener('click', () => {
        document.getElementById('filter-form').reset();
        Object.assign(state, {
            q: '',
            categoria: '',
            brand: '',
            gender: '',
            launch: '',
            outlet: '',
            tamanho: '',
            minPrice: '',
            maxPrice: '',
            sortBy: 'recent',
            page: 1,
        });
        document.getElementById('sort-select').value = 'recent';
        updateUrl();
        loadResults();
    });
});
