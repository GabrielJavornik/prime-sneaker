const HERO_BANNER_LIMIT = 6;
const HERO_BANNER_INTERVAL_MS = 6500;
let heroBannerProducts = [];
let heroBannerIndex = 0;
let heroBannerTimer = null;

/**
 * Home - carrega o banner principal com produtos reais.
 */
(async function loadHeroBanner() {
    const track = document.getElementById('hero-banner-track');
    if (!track) return;

    try {
        const searchResult = await API.search({ limit: HERO_BANNER_LIMIT, sortBy: 'recent' });
        let products = normalizeHeroProducts(searchResult);

        if (!products.length) {
            products = normalizeHeroProducts(await API.getTopProducts(HERO_BANNER_LIMIT));
        }

        if (!products.length) {
            renderHeroBannerEmpty();
            return;
        }

        renderHeroBanner(products);
    } catch (err) {
        console.warn('Nao foi possivel carregar o banner da home:', err.message);
        renderHeroBannerEmpty();
    }
})();

function normalizeHeroProducts(response) {
    const list = Array.isArray(response) ? response : (Array.isArray(response?.items) ? response.items : []);
    return list
        .filter(product => product && product.id)
        .filter(product => safeImageSrc(product.image_url, ''))
        .slice(0, HERO_BANNER_LIMIT);
}

function renderHeroBanner(products) {
    const track = document.getElementById('hero-banner-track');
    const dots = document.getElementById('hero-banner-dots');
    const prev = document.getElementById('hero-banner-prev');
    const next = document.getElementById('hero-banner-next');

    heroBannerProducts = products;
    heroBannerIndex = 0;

    track.innerHTML = products.map((product, index) => renderHeroBannerSlide(product, index)).join('');
    dots.innerHTML = products.map((_, index) => `
        <button type="button" class="hero-banner-dot" data-hero-dot="${index}" aria-label="Ver destaque ${index + 1}"></button>
    `).join('');

    dots.querySelectorAll('[data-hero-dot]').forEach(button => {
        button.addEventListener('click', () => {
            setHeroBannerSlide(Number(button.dataset.heroDot));
            restartHeroBannerTimer();
        });
    });

    if (prev) {
        prev.disabled = products.length <= 1;
        prev.addEventListener('click', () => {
            moveHeroBannerSlide(-1);
            restartHeroBannerTimer();
        });
    }

    if (next) {
        next.disabled = products.length <= 1;
        next.addEventListener('click', () => {
            moveHeroBannerSlide(1);
            restartHeroBannerTimer();
        });
    }

    setHeroBannerSlide(0);
    restartHeroBannerTimer();
}

function renderHeroBannerSlide(product, index) {
    const img = safeImageSrc(product.image_url, 'https://via.placeholder.com/780x430?text=Prime+Sneaker');
    const name = escapeHTML(product.name || 'T\u00eanis Prime Sneaker');
    const nameAttr = escapeAttribute(product.name || 'Produto Prime Sneaker');
    const description = escapeHTML(getHeroBannerDescription(product));
    const productUrl = escapeAttribute(buildProductUrl(product));
    const theme = index % 4;

    return `
        <article class="hero-banner-slide hero-banner-theme-${theme}" data-hero-slide="${index}" aria-hidden="${index === 0 ? 'false' : 'true'}">
            <div class="hero-banner-copy">
                <h1>${name}</h1>
                <p>${description}</p>
            </div>
            <a href="${productUrl}" class="hero-banner-visual" aria-label="Ver ${nameAttr}">
                <span class="hero-banner-backdrop" aria-hidden="true"></span>
                <img src="${escapeAttribute(img)}" alt="${nameAttr}" loading="${index === 0 ? 'eager' : 'lazy'}" decoding="async" onerror="this.src='https://via.placeholder.com/780x430?text=Sem+Imagem'">
            </a>
        </article>
    `;
}

function getHeroBannerDescription(product) {
    const description = String(product?.description || '').replace(/\s+/g, ' ').trim();
    if (!description) {
        return 'Conhe\u00e7a este modelo dispon\u00edvel no cat\u00e1logo Prime Sneaker.';
    }
    return description.length > 190 ? `${description.slice(0, 187).trim()}...` : description;
}

function renderHeroBannerEmpty() {
    const track = document.getElementById('hero-banner-track');
    const dots = document.getElementById('hero-banner-dots');
    const prev = document.getElementById('hero-banner-prev');
    const next = document.getElementById('hero-banner-next');

    if (prev) prev.disabled = true;
    if (next) next.disabled = true;
    if (dots) dots.innerHTML = '';
    if (!track) return;

    track.innerHTML = `
        <article class="hero-banner-slide is-active">
            <div class="hero-banner-copy">
                <h1>Cadastre produtos para montar o banner</h1>
                <p>Assim que houver t\u00eanis com imagem no cat\u00e1logo, eles aparecem automaticamente aqui.</p>
            </div>
            <div class="hero-banner-visual" aria-hidden="true">
                <div class="hero-banner-skeleton"></div>
            </div>
        </article>
    `;
}

function setHeroBannerSlide(index) {
    if (!heroBannerProducts.length) return;
    const total = heroBannerProducts.length;
    heroBannerIndex = ((index % total) + total) % total;

    document.querySelectorAll('[data-hero-slide]').forEach(slide => {
        const isActive = Number(slide.dataset.heroSlide) === heroBannerIndex;
        slide.classList.toggle('is-active', isActive);
        slide.setAttribute('aria-hidden', String(!isActive));
    });

    document.querySelectorAll('[data-hero-dot]').forEach(dot => {
        dot.classList.toggle('is-active', Number(dot.dataset.heroDot) === heroBannerIndex);
    });
}

function moveHeroBannerSlide(direction) {
    setHeroBannerSlide(heroBannerIndex + direction);
}

function restartHeroBannerTimer() {
    if (heroBannerTimer) clearInterval(heroBannerTimer);
    if (heroBannerProducts.length <= 1) return;
    heroBannerTimer = setInterval(() => moveHeroBannerSlide(1), HERO_BANNER_INTERVAL_MS);
}

/**
 * Home - carrega 4 produtos em destaque.
 */
(async function loadHome() {
    const container = document.getElementById('top-products');
    try {
        const products = await API.getTopProducts(4);
        if (!products.length) {
            container.innerHTML = '<p class="no-results">Nenhum produto cadastrado ainda.</p>';
            return;
        }
        container.innerHTML = products.map(p => renderCard(p)).join('');
        await updateFavoriteButtons(products);
    } catch (err) {
        container.innerHTML = `<p class="no-results">Erro ao carregar: ${escapeHTML(err.message)}</p>`;
    }
})();

(async function loadHomeCategoryCards() {
    const cards = Array.from(document.querySelectorAll('[data-category-card]'));
    if (!cards.length) return;

    await Promise.all(cards.map(async card => {
        const category = card.dataset.categoryCard;
        if (!category) return;

        try {
            const result = await API.search({
                categoria: category,
                limit: 12,
                sortBy: 'recent',
            });
            const product = (result?.items || []).find(item =>
                String(item?.gender || 'unissex').toLowerCase() !== 'infantil'
            );
            const imageUrl = safeImageSrc(product?.image_url, '');
            if (!imageUrl) return;

            setCategoryCardImage(card, imageUrl);
            card.classList.add('has-product-image');
        } catch (err) {
            console.warn(`Nao foi possivel carregar imagem da categoria ${category}:`, err.message);
        }
    }));
})();

function setCategoryCardImage(card, imageUrl) {
    const safeCssUrl = String(imageUrl)
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"')
        .replace(/[\n\r\f]/g, '');

    card.style.backgroundImage = `
        linear-gradient(180deg, rgba(0, 0, 0, 0.04) 0%, rgba(0, 0, 0, 0.42) 48%, rgba(0, 0, 0, 0.84) 100%),
        url("${safeCssUrl}")
    `;
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
    return `
    <a href="${buildProductUrl(p)}" class="product-card">
      <div class="product-card-media">
        <img src="${escapeAttribute(img)}" alt="${nameAttr}" loading="lazy" decoding="async" onerror="this.src='https://via.placeholder.com/300x280?text=Sem+Imagem'">
        ${renderOutletBadge(p)}
      </div>
      <div class="info">
        <div class="category">${category}</div>
        <h3>${name}</h3>
        ${renderProductReviewSummary(p)}
        <div class="price">${renderProductPrice(p)}</div>
        <div class="btn-container">
          <button class="btn" onclick="event.stopPropagation(); window.location.href='${buildProductUrl(p)}'">Compre Agora</button>
          <button class="btn-favorite" onclick="toggleWishlist(${productId}, this); return false;">♡</button>
        </div>
      </div>
    </a>
  `;
}
