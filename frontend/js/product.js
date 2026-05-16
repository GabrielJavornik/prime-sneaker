/**
 * PDP - Detalhes do produto.
 * Le ?id= na URL, busca detalhes e permite escolher tamanho e adicionar ao carrinho.
 */
let currentProduct = null;
let selectedSize = null;
let sizeStockMap = {}; // { "37": 1, "38": 10, ... }
const LOW_STOCK_THRESHOLD = 5;

let currentImageIndex = 0;
let galleryImagesArray = [];

function selectThumb(el, url) {
    document.getElementById('pdp-main-img').src = url;
    document.querySelectorAll('.pdp-thumb').forEach(t => t.classList.remove('active'));
    el.classList.add('active');
    currentImageIndex = Array.from(document.querySelectorAll('.pdp-thumb')).indexOf(el);
}

function navigateGallery(direction) {
    if (galleryImagesArray.length === 0) return;

    currentImageIndex += direction;
    if (currentImageIndex < 0) currentImageIndex = galleryImagesArray.length - 1;
    if (currentImageIndex >= galleryImagesArray.length) currentImageIndex = 0;

    document.getElementById('pdp-main-img').src = galleryImagesArray[currentImageIndex];
}

(async function loadProduct() {
    const id = new URLSearchParams(window.location.search).get('id');
    const container = document.getElementById('pdp-container');

    if (!id) {
        container.innerHTML = '<div class="alert alert-error">Produto n\u00e3o especificado.</div>';
        return;
    }

    try {
        currentProduct = await API.getProduct(id);
        // Carrega estoque por tamanho (passa currentProduct)
        await loadSizeStock(id, currentProduct);
        renderPDP(currentProduct);
        loadReviews(id);
        loadRecommended(id);

        // Adicionar listener de teclado para navegação da galeria
        document.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowLeft') navigateGallery(-1);
            if (e.key === 'ArrowRight') navigateGallery(1);
        });
    } catch (err) {
        container.innerHTML = `<div class="alert alert-error">Erro: ${escapeHTML(err.message)}</div>`;
    }
})();

async function loadSizeStock(productId, product) {
    try {
        const stocks = await fetch(`/api/products/${productId}/size-stock`).then(r => r.json());

        if (Array.isArray(stocks) && stocks.length > 0) {
            stocks.forEach(item => {
                sizeStockMap[item.size] = item.stock;
            });
        } else {
            // Fallback: distribuir estoque total entre os tamanhos
            if (product && product.sizes) {
                const sizes = product.sizes.split(',').map(s => s.trim());
                const stockPerSize = Math.floor((product.stock || 25) / sizes.length);
                sizes.forEach(size => {
                    sizeStockMap[size] = stockPerSize;
                });
            }
        }
    } catch (err) {
        console.warn('Não foi possível carregar estoque por tamanho:', err);
        // Fallback em caso de erro
        if (product && product.sizes) {
            const sizes = product.sizes.split(',').map(s => s.trim());
            const stockPerSize = Math.floor((product.stock || 25) / sizes.length);
            sizes.forEach(size => {
                sizeStockMap[size] = stockPerSize;
            });
        }
    }
}

function getProductSku(product) {
    return product.sku || product.code || `PS-${String(product.id || '').padStart(4, '0')}`;
}

function getReviewCountLabel(total) {
    const count = Number(total) || 0;
    const label = count === 1 ? 'avalia\u00e7\u00e3o' : 'avalia\u00e7\u00f5es';
    return `${count} ${label}`;
}

function renderRatingStars(averageRating) {
    const rating = Math.max(0, Math.min(5, Math.round(Number(averageRating) || 0)));
    return `${'&#9733;'.repeat(rating)}${'&#9734;'.repeat(5 - rating)}`;
}

function updatePdpReviewSummary(stats = {}) {
    const stars = document.getElementById('pdp-stars-summary');
    const count = document.getElementById('pdp-review-count');

    if (stars) stars.innerHTML = renderRatingStars(stats.averageRating);
    if (count) count.textContent = getReviewCountLabel(stats.totalReviews);
}

function renderOptionThumbs(images) {
    if (!images || images.length <= 1) return '';

    return `
        <div class="pdp-options-block">
          <h3>Outras op&ccedil;&otilde;es</h3>
          <div class="pdp-option-thumbs">
            ${images.map((url, index) => `
              <button type="button"
                      class="pdp-thumb pdp-option-thumb ${index === 0 ? 'active' : ''}"
                      data-image-url="${escapeAttribute(url)}"
                      aria-label="Ver opcao ${index + 1}">
                <img src="${escapeAttribute(url)}" alt="Op\u00e7\u00e3o ${index + 1}" loading="lazy" decoding="async" onerror="this.src='https://via.placeholder.com/72?text=T%C3%AAnis'">
              </button>
            `).join('')}
          </div>
        </div>
    `;
}

function renderLowStockHint() {
    const stocks = Object.values(sizeStockMap).map(Number).filter(stock => stock > 0);
    if (stocks.length === 0) return '';
    if (Math.min(...stocks) > LOW_STOCK_THRESHOLD) return '';
    return `<div id="pdp-low-stock-hint" class="pdp-low-stock-hint">Restam poucas unidades!</div>`;
}

function renderPDP(p) {
    const container = document.getElementById('pdp-container');
    const sizes = (p.sizes || '').split(',').map(s => s.trim()).filter(Boolean);
    selectedSize = null;
    const galleryImages = p.images && p.images.length > 0
        ? p.images.map(i => safeImageSrc(i.image_url, 'https://via.placeholder.com/500?text=T%C3%AAnis'))
        : [safeImageSrc(p.image_url, 'https://via.placeholder.com/500?text=T%C3%AAnis')];
    const sku = getProductSku(p);
    const safeName = escapeHTML(p.name || 'Produto');
    const safeNameAttr = escapeAttribute(p.name || 'Produto');
    const safeSku = escapeHTML(sku);

    // Guardar as imagens globalmente para navegação
    galleryImagesArray = galleryImages;
    currentImageIndex = 0;

    document.title = `${p.name} - Prime Sneaker`;

    const galleryHtml = `
    <div class="pdp-gallery">
        <div class="pdp-main-img-wrap">
            ${galleryImages.length > 1 ? `
                <button class="pdp-nav-btn pdp-nav-prev" onclick="navigateGallery(-1)">&#10094;</button>
                <button class="pdp-nav-btn pdp-nav-next" onclick="navigateGallery(1)">&#10095;</button>
            ` : ''}
            ${renderOutletBadge(p)}
            <img id="pdp-main-img" src="${escapeAttribute(galleryImages[0])}" alt="${safeNameAttr}" loading="eager" decoding="async" fetchpriority="high" onerror="this.src='https://via.placeholder.com/500?text=Sem+Imagem'">
        </div>
    </div>`;

    container.innerHTML = `
    <div class="pdp">
      <div>
        ${galleryHtml}
      </div>
      <div class="details pdp-modern-details">
        <h1>${safeName}</h1>
        <div class="pdp-sku">${safeSku}</div>
        <div class="pdp-rating-line">
          <span class="pdp-stars" id="pdp-stars-summary">&#9734;&#9734;&#9734;&#9734;&#9734;</span>
          <span id="pdp-review-count">Carregando avalia&ccedil;&otilde;es...</span>
        </div>
        <div class="pdp-price-line">
          ${renderProductPrice(p, { suffix: ' no pix' })}
        </div>
        ${p.description ? `<p class="description">${escapeHTML(p.description)}</p>` : ''}
        ${renderOptionThumbs(galleryImages)}
        ${sizes.length ? `
          <label class="pdp-size-title">Tamanho</label>
          <div class="size-picker" id="size-picker">
            ${sizes.map(s => {
                const stock = Number(sizeStockMap[s] || 0);
                const stockClass = stock <= 0 ? 'is-empty' : stock <= LOW_STOCK_THRESHOLD ? 'is-low-stock' : '';
                return `<button type="button" class="${stockClass}" data-size="${escapeAttribute(s)}" title="Estoque: ${stock}"><span>${escapeHTML(s)}</span></button>`;
            }).join('')}
          </div>
          <div id="size-stock-info" class="size-stock-info" style="display: none;">
            Disponível: <strong id="stock-amount">0</strong> un.
          </div>
          ${renderLowStockHint()}
          <div id="size-required-warning" class="size-required-warning" hidden>
            Escolha o n\u00famero do t\u00eanis antes de adicionar ao carrinho.
          </div>
        ` : ''}
        <input type="hidden" id="qty-input" value="1" min="1" max="999">
        <div class="pdp-actions">
          <button class="btn-buy btn-buy-now" id="btn-buy-now" type="button">Compre Agora</button>
          <button class="btn-buy btn-add-cart-secondary" id="btn-add-cart" type="button">Adicionar ao Carrinho</button>
        </div>
        <div class="pdp-cep-box">
          <div class="pdp-cep-heading">
            <label for="pdp-cep-input">Insira seu CEP</label>
            <a href="https://buscacepinter.correios.com.br/app/endereco/index.php" target="_blank" rel="noopener noreferrer">N&atilde;o sei meu CEP</a>
          </div>
          <div class="pdp-cep-row">
            <input type="text" id="pdp-cep-input" maxlength="9" placeholder="00000-000">
            <button type="button" id="pdp-cep-button">Calcular</button>
          </div>
          <div id="pdp-cep-result" class="pdp-cep-result"></div>
        </div>
      </div>
    </div>
  `;

    // Handlers
    document.querySelectorAll('.pdp-option-thumb').forEach(button => {
        button.addEventListener('click', () => {
            selectThumb(button, button.dataset.imageUrl);
        });
    });

    document.querySelectorAll('#size-picker button').forEach(b => {
        b.addEventListener('click', () => {
            document.querySelectorAll('#size-picker button').forEach(x => x.classList.remove('active'));
            b.classList.add('active');
            selectedSize = b.dataset.size;
            clearRequiredSizeWarning();
            updateSizeStockInfo(selectedSize);

            // Atualizar exibição de estoque
            const stock = sizeStockMap[selectedSize] || 0;
            const stockInfo = document.getElementById('size-stock-info');
            const stockAmount = document.getElementById('stock-amount');
            if (stockInfo && stockAmount) {
                stockAmount.textContent = stock;
                stockInfo.style.display = stock === 0 ? 'none' : 'block';
                if (stock === 0) {
                    setPurchaseButtonsDisabled(true);
                } else {
                    setPurchaseButtonsDisabled(false);
                }
            }
        });
    });

    const qtyInput = document.getElementById('qty-input');
    const btnQtyMinus = document.getElementById('btn-qty-minus');
    const btnQtyPlus = document.getElementById('btn-qty-plus');

    if (btnQtyMinus) {
        btnQtyMinus.addEventListener('click', () => {
            let value = parseInt(qtyInput.value) || 1;
            if (value > 1) {
                qtyInput.value = value - 1;
            }
        });
    }

    if (btnQtyPlus) {
        btnQtyPlus.addEventListener('click', () => {
            let value = parseInt(qtyInput.value) || 1;
            const max = getQuantityLimit();
            if (value < max) {
                qtyInput.value = value + 1;
            }
        });
    }

    if (qtyInput) {
        qtyInput.addEventListener('change', () => {
            let value = parseInt(qtyInput.value) || 1;
            const max = getQuantityLimit();
            if (value < 1) qtyInput.value = 1;
            if (value > max) qtyInput.value = max;
        });
    }

    document.getElementById('btn-buy-now').addEventListener('click', () => {
        addCurrentProductToCart({ redirectToCart: true });
    });

    document.getElementById('btn-add-cart').addEventListener('click', () => {
        addCurrentProductToCart();
    });

    setupProductCepCalculator();

    const wishlistButton = document.getElementById('btn-wishlist');
    if (wishlistButton) {
        wishlistButton.addEventListener('click', async () => {
            await Wishlist.toggle(currentProduct.id);
            updateWishlistButton();
        });
        updateWishlistButton();
    }
}

function addCurrentProductToCart({ redirectToCart = false } = {}) {
    const sizes = (currentProduct?.sizes || '').split(',').map(s => s.trim()).filter(Boolean);
    const qtyInput = document.getElementById('qty-input');
    const quantity = parseInt(qtyInput?.value) || 1;

    if (sizes.length > 0 && !selectedSize) {
        showRequiredSizeWarning();
        toast('Escolha o n\u00famero do t\u00eanis antes de adicionar ao carrinho.', 'warning');
        return false;
    }

    if (selectedSize) {
        const availableStock = Number(sizeStockMap[selectedSize] || 0);
        const cartQuantity = getCartQuantityForSelection(selectedSize);
        const remainingStock = Math.max(availableStock - cartQuantity, 0);

        if (availableStock <= 0) {
            toast(`Tamanho ${selectedSize} esta esgotado`, 'error');
            return false;
        }

        if (remainingStock <= 0) {
            toast(`Voc\u00ea j\u00e1 adicionou todo o estoque dispon\u00edvel do tamanho ${selectedSize}`, 'error');
            return false;
        }

        if (quantity > remainingStock) {
            toast(`Voc\u00ea ainda pode adicionar no m\u00e1ximo ${remainingStock} un. do tamanho ${selectedSize}`, 'error');
            return false;
        }

        if (quantity > availableStock) {
            toast(`Apenas ${availableStock} un. disponiveis para o tamanho ${selectedSize}`, 'error');
            return false;
        }
    }

    Cart.addItem({
        ...currentProduct,
        price: getProductSalePrice(currentProduct),
        original_price: Number(currentProduct.price || 0),
        discount_percent: getProductDiscountPercent(currentProduct),
    }, selectedSize, quantity);

    if (redirectToCart) {
        window.location.href = 'cart.html';
        return true;
    }

    toast('Produto adicionado ao carrinho!', 'success');
    if (qtyInput) qtyInput.value = 1;
    return true;
}

function setupProductCepCalculator() {
    const input = document.getElementById('pdp-cep-input');
    const button = document.getElementById('pdp-cep-button');

    if (!input || !button) return;

    input.addEventListener('input', () => {
        let value = input.value.replace(/\D/g, '').slice(0, 8);
        if (value.length > 5) {
            value = `${value.slice(0, 5)}-${value.slice(5)}`;
        }
        input.value = value;
    });

    input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            calculateProductCep();
        }
    });

    button.addEventListener('click', calculateProductCep);
}

async function calculateProductCep() {
    const input = document.getElementById('pdp-cep-input');
    const result = document.getElementById('pdp-cep-result');
    if (!input || !result) return;

    const cep = input.value.replace(/\D/g, '');

    if (cep.length !== 8) {
        result.className = 'pdp-cep-result error';
        result.textContent = 'Digite um CEP v\u00e1lido com 8 n\u00fameros.';
        return;
    }

    result.className = 'pdp-cep-result';
    result.textContent = 'Calculando entrega...';

    try {
        const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
        const data = await response.json();

        if (data.erro) {
            result.className = 'pdp-cep-result error';
            result.textContent = 'CEP n\u00e3o encontrado.';
            return;
        }

        result.className = 'pdp-cep-result success';
        result.innerHTML = `Entrega gr\u00e1tis para <strong>${escapeHTML(data.localidade)}/${escapeHTML(data.uf)}</strong>. Prazo estimado: 5 a 12 dias \u00fateis.`;
    } catch (err) {
        result.className = 'pdp-cep-result error';
        result.textContent = 'N\u00e3o foi poss\u00edvel calcular agora. Tente novamente.';
    }
}

function showRequiredSizeWarning() {
    const picker = document.getElementById('size-picker');
    const warning = document.getElementById('size-required-warning');

    if (warning) {
        warning.hidden = false;
    }

    if (picker) {
        picker.classList.remove('needs-selection');
        void picker.offsetWidth;
        picker.classList.add('needs-selection');
        picker.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}

function clearRequiredSizeWarning() {
    const picker = document.getElementById('size-picker');
    const warning = document.getElementById('size-required-warning');

    if (warning) {
        warning.hidden = true;
    }

    if (picker) {
        picker.classList.remove('needs-selection');
    }
}

function setPurchaseButtonsDisabled(disabled) {
    ['btn-buy-now', 'btn-add-cart'].forEach(id => {
        const button = document.getElementById(id);
        if (!button) return;
        button.disabled = disabled;
        button.style.opacity = disabled ? '0.5' : '1';
        button.style.cursor = disabled ? 'not-allowed' : 'pointer';
    });
}

function getQuantityLimit() {
    if (!selectedSize) return 999;
    const stock = Number(sizeStockMap[selectedSize] || 0);
    const remaining = stock - getCartQuantityForSelection(selectedSize);
    return Math.max(remaining, 1);
}

function getCartQuantityForSelection(size) {
    if (!currentProduct || typeof Cart === 'undefined') return 0;
    return Cart.getItems()
        .filter(item => item.productId === currentProduct.id && (item.size || null) === (size || null))
        .reduce((sum, item) => sum + Number(item.quantity || 0), 0);
}

function updateSizeStockInfo(size) {
    const stock = Number(sizeStockMap[size] || 0);
    const stockInfo = document.getElementById('size-stock-info');
    const addButton = document.getElementById('btn-add-cart');
    const qtyInput = document.getElementById('qty-input');
    const lowHint = document.getElementById('pdp-low-stock-hint');

    if (!stockInfo || !addButton || !qtyInput) return;

    stockInfo.className = 'size-stock-info';
    stockInfo.style.display = 'none';
    if (lowHint) lowHint.style.display = 'none';

    if (stock <= 0) {
        stockInfo.classList.add('empty');
        stockInfo.innerHTML = `<strong>Tamanho ${escapeHTML(size)} esgotado.</strong> Escolha outro tamanho para continuar.`;
        stockInfo.style.display = 'block';
        setPurchaseButtonsDisabled(true);
        qtyInput.max = 1;
        qtyInput.value = 1;
        return;
    }

    setPurchaseButtonsDisabled(false);
    qtyInput.max = stock;

    if ((parseInt(qtyInput.value) || 1) > stock) {
        qtyInput.value = stock;
    }

    if (stock <= LOW_STOCK_THRESHOLD) {
        if (lowHint) {
            lowHint.style.display = 'block';
            lowHint.textContent = 'Restam poucas unidades!';
        }
        return;
    }
}

async function updateWishlistButton() {
    const btn = document.getElementById('btn-wishlist');
    if (!btn) return;

    const isFav = await Wishlist.isFavorite(currentProduct.id);
    btn.innerHTML = isFav ? '&#9829;' : '&#9825;';
    btn.style.color = isFav ? 'var(--danger)' : '#999';
}

async function loadRecommended(productId) {
    const container = document.getElementById('recommended-container');

    try {
        const response = await fetch(`/api/products/${productId}/recommended`);
        if (!response.ok) throw new Error('Erro ao carregar produtos recomendados');

        const products = await response.json();

        if (products.length === 0) {
            document.getElementById('recommended-section').style.display = 'none';
            return;
        }

        const html = products
            .map(
                p => {
                    const productId = Number(p.id) || 0;
                    const img = safeImageSrc(p.image_url, 'https://via.placeholder.com/300');
                    const name = escapeHTML(p.name || 'Produto');
                    const nameAttr = escapeAttribute(p.name || 'Produto');
                    const category = escapeHTML(p.category || '-');

                    return `
                    <div class="product-card">
                        <div class="product-card-media">
                            <img src="${escapeAttribute(img)}" alt="${nameAttr}" loading="lazy" decoding="async" onerror="this.src='https://via.placeholder.com/300'">
                            ${renderOutletBadge(p)}
                        </div>
                        <div class="product-info">
                            <h3>${name}</h3>
                            <p class="category">${category}</p>
                            <div class="product-footer">
                                <span class="price">${renderProductPrice(p)}</span>
                                <a href="product.html?id=${productId}" class="btn-small">Ver</a>
                            </div>
                        </div>
                    </div>
                `;
                }
            )
            .join('');

        container.innerHTML = html;
    } catch (err) {
        console.error('Erro:', err);
        document.getElementById('recommended-section').style.display = 'none';
    }
}

async function loadReviews(productId) {
    const container = document.getElementById('reviews-container');

    try {
        const response = await fetch(`/api/products/${productId}/reviews`);
        if (!response.ok) throw new Error('Erro ao carregar avaliações');

        const data = await response.json();
        const reviews = data.reviews || [];
        const stats = data.stats || { averageRating: 0, totalReviews: 0 };
        const user = getLoggedUser();
        updatePdpReviewSummary(stats);

        let html = `
            <div style="background: #f9f9f9; padding: 1rem; border-radius: 4px; margin-bottom: 1.5rem;">
                <div style="display: flex; align-items: center; gap: 1rem; margin-bottom: 1rem;">
                    <span style="font-size: 2rem; font-weight: 600;">${Number(stats.averageRating || 0).toFixed(1)}</span>
                    <div>
                        <div style="color: var(--accent-text-strong); font-size: 1.2rem;">${renderRatingStars(stats.averageRating)}</div>
                        <p style="margin: 0; color: var(--muted); font-size: 0.9rem;">${getReviewCountLabel(stats.totalReviews)}</p>
                    </div>
                </div>

                ${user ? `
                    <form id="review-form" style="border-top: 1px solid #ddd; padding-top: 1rem;">
                        <h4 style="margin-top: 0;">Deixe sua avaliação</h4>
                        <div style="margin-bottom: 1rem;">
                            <label>Nota:</label>
                            <div id="rating-picker" style="display: flex; gap: 0.5rem; font-size: 1.5rem; margin-top: 0.5rem;">
                                ${[1, 2, 3, 4, 5].map(n => `<span class="star" data-rating="${n}" style="cursor: pointer; color: var(--border);">★</span>`).join('')}
                            </div>
                            <input type="hidden" id="rating-value" value="0" required />
                        </div>
                        <div style="margin-bottom: 1rem;">
                            <label>Comentário (opcional):</label>
                            <textarea id="comment" style="width: 100%; padding: 0.5rem; border: 1px solid #ddd; border-radius: 4px; min-height: 80px; font-family: inherit;"></textarea>
                        </div>
                        <button type="submit" class="btn-primary">Enviar Avaliação</button>
                    </form>
                ` : `
                    <p style="color: var(--muted);">
                        <a href="login.html">Faça login</a> para deixar uma avaliação
                    </p>
                `}
            </div>

            ${reviews.length > 0 ? `
                <div style="border-top: 1px solid #ddd; padding-top: 1rem;">
                    <h4>Avaliações Recentes</h4>
                    ${reviews.map(r => `
                        <div style="padding: 1rem; border-bottom: 1px solid #f0f0f0;">
                            <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
                                <strong>${escapeHTML(r.user_name || 'Cliente')}</strong>
                                <span style="color: var(--accent-text-strong);">${renderRatingStars(r.rating)}</span>
                            </div>
                            ${r.comment ? `<p style="margin: 0; color: var(--text);">${escapeHTML(r.comment)}</p>` : ''}
                            <p style="margin: 0.5rem 0 0; font-size: 0.85rem; color: var(--muted);">${new Date(r.created_at).toLocaleDateString('pt-BR')}</p>
                        </div>
                    `).join('')}
                </div>
            ` : `
                <p style="text-align: center; color: var(--muted);">Nenhuma avaliação ainda. Seja o primeiro!</p>
            `}
        `;

        container.innerHTML = html;

        if (user) {
            const ratingPicker = document.getElementById('rating-picker');
            const ratingValue = document.getElementById('rating-value');
            const stars = ratingPicker.querySelectorAll('.star');

            stars.forEach(star => {
                star.addEventListener('click', () => {
                    const rating = parseInt(star.dataset.rating);
                    ratingValue.value = rating;
                    stars.forEach((s, idx) => {
                        s.style.color = idx < rating ? 'var(--accent-text-strong)' : 'var(--border)';
                    });
                });

                star.addEventListener('mouseover', () => {
                    const rating = parseInt(star.dataset.rating);
                    stars.forEach((s, idx) => {
                        s.style.color = idx < rating ? 'var(--accent-text-strong)' : 'var(--border)';
                    });
                });
            });

            ratingPicker.addEventListener('mouseout', () => {
                const rating = parseInt(ratingValue.value);
                stars.forEach((s, idx) => {
                    s.style.color = idx < rating ? 'var(--accent-text-strong)' : 'var(--border)';
                });
            });

            document.getElementById('review-form').addEventListener('submit', async (e) => {
                e.preventDefault();
                const rating = parseInt(ratingValue.value);
                const comment = document.getElementById('comment').value;
                const token = sessionStorage.getItem('token');

                if (rating === 0) {
                    toast('Selecione uma nota', 'error');
                    return;
                }

                try {
                    const response = await fetch(`/api/products/${productId}/reviews`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${token}`,
                        },
                        body: JSON.stringify({ rating, comment }),
                    });

                    if (response.ok) {
                        toast('Avaliação enviada com sucesso!', 'success');
                        loadReviews(productId);
                    } else {
                        toast('Erro ao enviar avaliação', 'error');
                    }
                } catch (err) {
                    toast('Erro: ' + err.message, 'error');
                }
            });
        }
    } catch (err) {
        updatePdpReviewSummary({ averageRating: 0, totalReviews: 0 });
        document.getElementById('reviews-container').innerHTML = `<div class="alert alert-error">Erro ao carregar avaliações</div>`;
    }
}
