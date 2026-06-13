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
