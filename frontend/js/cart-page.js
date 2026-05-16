/**
 * Pagina do carrinho.
 *  - Lista itens a partir do LocalStorage
 *  - Busca CEP via ViaCEP (https://viacep.com.br)
 *  - Envia POST /cart e atualiza o resumo (subtotal, frete, desconto, total)
 */
let summary = {
    items: [],
    subtotal: 0,
    shipping: 0,
    discount: 0,
    total: 0,
    coupon: null,
};
let couponMessage = '';
let couponDraft = '';

// Controle de CEP validado antes do checkout
let cepValidado = false;
const CEP_STORAGE_KEY = 'cep_entrega';

// Dados do perfil necessarios pro checkout
let perfilUsuario = null;
let perfilCarregado = false;
const stockCache = {};

function renderSafeDeliveryAddress(data = {}) {
    const street = escapeHTML(data.logradouro || '');
    const district = data.bairro ? ` - ${escapeHTML(data.bairro)}` : '';
    const city = escapeHTML(data.localidade || '');
    const state = escapeHTML(data.uf || '');

    return `
      <strong>Entrega em:</strong><br>
      ${street}${district}<br>
      ${city}/${state}
    `;
}

async function carregarPerfilUsuario() {
    const user = getLoggedUser();
    if (!user) {
        perfilCarregado = true;
        return;
    }
    try {
        const token = sessionStorage.getItem('token');
        const resp = await fetch('/api/users/profile', {
            headers: { 'Authorization': `Bearer ${token}` },
        });
        if (resp.ok) {
            perfilUsuario = await resp.json();
        }
    } catch (err) {
        console.warn('Nao foi possivel carregar perfil:', err);
    } finally {
        perfilCarregado = true;
        atualizarBotaoFinalizar();
    }
}

function dadosFaltando() {
    const faltando = [];
    if (!cepValidado) faltando.push('CEP');
    return faltando;
}

function buildLocalCartSummary(items = Cart.getItems()) {
    const subtotal = items.reduce((sum, item) => {
        return sum + (Number(item.price) * Number(item.quantity || 1));
    }, 0);

    return {
        items,
        subtotal,
        shipping: 0,
        discount: 0,
        total: subtotal,
        coupon: null,
    };
}

async function recalc() {
    const items = Cart.toApiPayload();
    const couponInput = document.getElementById('coupon-input');
    const couponCode = couponInput ? couponInput.value.trim() : couponDraft;
    couponDraft = couponCode;

    if (items.length === 0) {
        summary = { items: [], subtotal: 0, shipping: 0, discount: 0, total: 0, coupon: null };
        renderPage();
        return;
    }
    summary = buildLocalCartSummary();
    renderPage();

    try {
        const resp = await API.checkout(items, couponCode || undefined);
        summary = resp;
        couponDraft = resp.coupon ? resp.coupon.code : '';
        couponMessage = '';
        renderPage();
    } catch (err) {
        const msg = err.message || '';
        const isCouponError = msg.toLowerCase().includes('cupom');
        couponMessage = isCouponError ? msg : '';
        toast(isCouponError ? msg : 'N\u00e3o foi poss\u00edvel atualizar o carrinho', 'error');
        // Ainda renderiza sem o cupom se o erro foi de cupom
        if (isCouponError) {
            const resp = await API.checkout(items).catch(() => null);
            if (resp) { summary = resp; renderPage(); }
        } else {
            summary = buildLocalCartSummary();
            renderPage();
        }
    }
}

function renderPage() {
    const container = document.getElementById('cart-container');
    const items = Cart.getItems();
    const user = getLoggedUser();

    if (items.length === 0) {
        container.innerHTML = `
      <div class="empty-cart">
        <h3 style="margin-bottom: 1rem;">Seu carrinho est\u00e1 vazio</h3>
        <p>Que tal adicionar alguns t\u00eanis incr\u00edveis?</p>
        <a href="search.html" class="btn-primary" style="display: inline-block; width: auto; padding: 0.7rem 2rem; margin-top: 1rem; text-decoration: none;">Ver Cat\u00e1logo</a>
      </div>
    `;
        return;
    }

    if (!user) {
        container.innerHTML = `
    <div class="cart-layout cart-guest-layout">
      <div class="cart-items cart-guest-items">
        ${items.map(renderGuestCartItem).join('')}
      </div>
      <aside class="cart-summary cart-guest-summary">
        <div class="cart-login-card" style="background: #fff3cd; padding: 1rem; border-radius: 8px; margin-bottom: 1.5rem; border: 1px solid #ffc107;">
          <h3 style="margin-top: 0; color: #856404;">Faça Login para Continuar</h3>
          <p style="color: #856404; margin-bottom: 1rem;">Você precisa estar logado para finalizar a compra.</p>
          <a href="login.html" class="btn-primary" style="display: block; padding: 0.8rem; margin-bottom: 0.5rem; text-align: center; text-decoration: none; background: #ffc107; color: #000; font-weight: 600;">Entrar</a>
          <a href="register.html" class="btn-primary" style="display: block; padding: 0.8rem; text-align: center; text-decoration: none; background: var(--success); color: white; font-weight: 600;">Criar Conta</a>
          <p style="margin-top: 1rem; font-size: 0.85rem; color: #856404; margin-bottom: 0;">
            Seus itens estão salvos e estarão aqui quando você fizer login
          </p>
        </div>

        <h3>Resumo</h3>
        <div class="summary-row">
          <span>Subtotal:</span>
          <span>${formatBRL(summary.subtotal)}</span>
        </div>
        <div class="summary-row">
          <span>Frete:</span>
          <span>${summary.shipping === 0 ? 'GRATIS' : formatBRL(summary.shipping)}</span>
        </div>
        ${summary.subtotal > 0 && summary.subtotal < 200 ? `
          <div style="font-size: 0.8rem; color: var(--warning); margin-bottom: 0.5rem;">
            Faltam ${formatBRL(200 - summary.subtotal)} para frete gr\u00e1tis!
          </div>
        ` : ''}
        ${summary.discount > 0 ? `
          <div class="summary-row" style="color: var(--success);">
            <span>Desconto (${escapeHTML(summary.coupon.code)} -${escapeHTML(summary.coupon.discount_percent)}%):</span>
            <span>- ${formatBRL(summary.discount)}</span>
          </div>
        ` : ''}
        <div class="summary-row total">
          <span>Total:</span>
          <span>${formatBRL(summary.total)}</span>
        </div>
      </aside>
    </div>
  `;
        return;
    }

    container.innerHTML = `
    <div class="cart-layout">
      <div class="cart-items">
        <table style="width: 100%; border-collapse: collapse;">
          <thead>
            <tr style="border-bottom: 2px solid var(--border);">
              <th style="text-align: left; padding: 1rem; font-weight: 700; color: var(--primary);">PRODUTO</th>
              <th style="text-align: center; padding: 1rem; font-weight: 700; color: var(--primary);">PREÇO</th>
              <th style="text-align: center; padding: 1rem; font-weight: 700; color: var(--primary);">QUANTIDADE</th>
              <th style="text-align: right; padding: 1rem; font-weight: 700; color: var(--primary);">SUBTOTAL</th>
            </tr>
          </thead>
          <tbody>
            ${items.map(renderCartItemTable).join('')}
          </tbody>
        </table>

        <div style="margin-top: 2rem; padding-top: 2rem; border-top: 2px solid var(--border); display: flex; gap: 1rem;">
          <input type="text" id="coupon-input" placeholder="Código do cupom" value="${typeof escapeAttribute === 'function' ? escapeAttribute(couponDraft || (summary.coupon ? summary.coupon.code : '')) : (couponDraft || (summary.coupon ? summary.coupon.code : ''))}" style="flex: 1; padding: 0.8rem; border: 1px solid var(--border); border-radius: 4px; font-size: 1rem;">
          <button type="button" onclick="recalc()" style="background: var(--accent); color: var(--accent-contrast); border: none; padding: 0.8rem 1.5rem; border-radius: 4px; font-weight: 700; cursor: pointer;">Aplicar Cupom</button>
        </div>
        <div id="coupon-feedback" style="color: var(--danger); font-size: 0.9rem; margin-top: 0.6rem; display: ${couponMessage ? 'block' : 'none'};">
          ${escapeHTML(couponMessage)}
        </div>
      </div>

      <aside class="cart-summary">
        <h3 style="font-size: 1.2rem; font-weight: 700; margin-bottom: 1.5rem; text-align: center; border-bottom: none;">TOTAL NO CARRINHO</h3>

        <div class="summary-row" style="font-size: 0.95rem;">
          <span>Subtotal</span>
          <span>${formatBRL(summary.subtotal)}</span>
        </div>

        <div class="summary-row" style="font-size: 0.95rem; margin-bottom: 1rem;">
          <span>Frete</span>
          <span>${summary.shipping === 0 ? 'GRÁTIS 🎁' : formatBRL(summary.shipping)}</span>
        </div>

        ${summary.subtotal > 0 && summary.subtotal < 200 ? `
          <div style="background: #fff3cd; padding: 0.8rem; border-radius: 4px; font-size: 0.85rem; color: #856404; margin-bottom: 1rem; text-align: center;">
            Faltam ${formatBRL(200 - summary.subtotal)} para frete grátis!
          </div>
        ` : ''}

        ${summary.discount > 0 ? `
          <div class="summary-row" style="color: var(--success); font-size: 0.95rem; margin-bottom: 1rem;">
            <span>Desconto</span>
            <span>- ${formatBRL(summary.discount)}</span>
          </div>
        ` : ''}

        <div style="padding: 1rem; margin-bottom: 1rem; background: #f0f0f0; border-radius: 4px;">
          <p style="font-size: 0.8rem; color: var(--muted); margin-bottom: 0.5rem;">ENDEREÇO DE ENTREGA</p>
          <div id="address-display" style="font-size: 0.9rem; color: var(--primary); margin-bottom: 0.5rem; line-height: 1.4;">
            Selecione um CEP para ver o endereço
          </div>
          <button type="button" onclick="document.getElementById('cep-input').focus()" style="background: transparent; color: var(--accent-text); border: none; cursor: pointer; font-size: 0.85rem; text-decoration: underline; font-weight: 700;">Mudar endereço</button>
        </div>

        <div class="cep-box" style="margin-bottom: 1.5rem;">
          <label style="display: block; font-size: 0.85rem; font-weight: 600; margin-bottom: 0.5rem;">CEP de entrega <span style="color: var(--danger);">*</span></label>
          <div class="input-row" style="display: flex; gap: 0.5rem;">
            <input type="text" id="cep-input" placeholder="00000-000" maxlength="9" style="flex: 1; padding: 0.7rem; border: 1px solid var(--border); border-radius: 4px; font-size: 0.95rem;">
            <button type="button" onclick="buscarCep()" style="background: var(--accent); color: var(--accent-contrast); border: none; padding: 0.7rem 1rem; border-radius: 4px; cursor: pointer; font-weight: 700;">OK</button>
          </div>
          <div id="cep-warning" style="color: var(--danger); font-size: 0.8rem; margin-top: 0.4rem; display: none;">
            Informe seu CEP para continuar.
          </div>
        </div>

        <div style="border-top: 2px solid var(--accent); padding-top: 1rem; margin-bottom: 1.5rem;">
          <div class="summary-row" style="font-size: 1.1rem; font-weight: 700;">
            <span>Total</span>
            <span>${formatBRL(summary.total)}</span>
          </div>
        </div>

        <button id="btn-finalizar" class="btn-checkout" onclick="finalizar()" disabled
            style="width: 100%; padding: 1rem; background: var(--success); color: white; border: none; border-radius: 4px; font-weight: 700; font-size: 1rem; cursor: not-allowed; opacity: 0.6;">
            CONTINUAR PARA FINALIZAÇÃO
        </button>
        <p id="cep-hint" style="text-align: center; font-size: 0.8rem; color: var(--muted); margin-top: 1rem;">
            Informe o CEP para habilitar o checkout
        </p>
      </aside>
    </div>
  `;

    // Mascara simples para CEP
    const cepInput = document.getElementById('cep-input');
    if (cepInput) {
        cepInput.addEventListener('input', (e) => {
            let v = e.target.value.replace(/\D/g, '');
            if (v.length > 5) v = v.substring(0, 5) + '-' + v.substring(5, 8);
            e.target.value = v;
            // Invalida CEP validado se usuario alterar o campo
            cepValidado = false;
            atualizarBotaoFinalizar();
        });
        cepInput.addEventListener('blur', () => {
            const cep = cepInput.value.replace(/\D/g, '');
            if (cep.length === 8) buscarCep();
        });

        // Restaura CEP previamente validado, se houver
        try {
            const saved = JSON.parse(localStorage.getItem(CEP_STORAGE_KEY) || 'null');
            if (saved && saved.cep && saved.address) {
                cepInput.value = saved.cep;
                const display = document.getElementById('address-display');
                if (display) {
                    if (saved.data && typeof saved.data === 'object') {
                        display.innerHTML = renderSafeDeliveryAddress(saved.data);
                    } else {
                        display.textContent = String(saved.address || '');
                    }
                }
                cepValidado = true;
                atualizarBotaoFinalizar();
            }
        } catch (_) {}
    }

    atualizarBotaoFinalizar();
}

function atualizarBotaoFinalizar() {
    const btn = document.getElementById('btn-finalizar');
    const hint = document.getElementById('cep-hint');
    if (!btn) return;

    const faltando = dadosFaltando();

    if (faltando.length === 0) {
        btn.disabled = false;
        btn.style.opacity = '1';
        btn.style.cursor = 'pointer';
        if (hint) hint.style.display = 'none';
    } else {
        btn.disabled = true;
        btn.style.opacity = '0.6';
        btn.style.cursor = 'not-allowed';
        if (hint) {
            hint.style.display = 'block';
            // Monta mensagem com o que falta
            const faltamPerfil = faltando.filter(f => f !== 'CEP');
            const partes = [];
            if (faltando.includes('CEP')) partes.push('informe o CEP');
            if (faltamPerfil.length) {
                partes.push(
                    `preencha ${faltamPerfil.join(' e ')} em <a href="profile.html?tab=detalhes" style="color: var(--accent-text); font-weight: 700;">Meu Perfil</a>`
                );
            }
            hint.innerHTML = `Para finalizar, ${partes.join(' e ')}.`;
        }
    }
}

function renderCartItemTable(item) {
    const productId = Number(item.productId) || 0;
    const safeName = escapeHTML(item.name || 'Produto');
    const safeNameAttr = escapeAttribute(item.name || 'Produto');
    const safeSize = item.size ? escapeHTML(item.size) : '';
    const safeSizeJs = escapeJSString(item.size || '');
    const imageSrc = safeImageSrc(item.image_url || '', 'https://via.placeholder.com/80');
    const priceHtml = Number(item.discount_percent || 0) > 0 && Number(item.original_price || 0) > Number(item.price || 0)
        ? `<span style="display:block; color: var(--muted); text-decoration: line-through; font-size: 0.82rem;">${formatBRL(item.original_price)}</span><strong>${formatBRL(item.price)}</strong>`
        : formatBRL(item.price);
    return `
    <tr style="border-bottom: 1px solid var(--border);">
      <td style="padding: 1rem; display: flex; gap: 1rem; align-items: flex-start;">
        <img src="${escapeAttribute(imageSrc)}" alt="${safeNameAttr}" loading="lazy" decoding="async" style="width: 80px; height: 80px; object-fit: cover; border-radius: 4px;">
        <div>
          <div style="font-weight: 600; margin-bottom: 0.3rem;">${safeName}</div>
          ${item.size ? `<div style="font-size: 0.85rem; color: var(--muted); margin-bottom: 0.3rem;">Tamanho: ${safeSize}</div>` : ''}
          <div style="margin-top: 0.5rem;">
            <button onclick="removeItem(${productId}, '${safeSizeJs}')" style="background: none; border: none; color: var(--danger); cursor: pointer; font-size: 0.85rem; text-decoration: underline;">Remover</button>
          </div>
        </div>
      </td>
      <td style="padding: 1rem; text-align: center; font-weight: 600;">${priceHtml}</td>
      <td style="padding: 1rem; text-align: center;">
        <div style="display: flex; gap: 0.3rem; justify-content: center; align-items: center;">
          <button onclick="changeQty(${productId}, '${safeSizeJs}', -1)" style="background: var(--border); border: none; width: 28px; height: 28px; border-radius: 4px; cursor: pointer; font-weight: bold;">−</button>
          <span style="width: 30px; text-align: center;">${item.quantity}</span>
          <button onclick="changeQty(${productId}, '${safeSizeJs}', 1)" style="background: var(--border); border: none; width: 28px; height: 28px; border-radius: 4px; cursor: pointer; font-weight: bold;">+</button>
        </div>
      </td>
      <td style="padding: 1rem; text-align: right; font-weight: 700; color: var(--accent-text);">${formatBRL(item.price * item.quantity)}</td>
    </tr>
  `;
}

function renderGuestCartItem(item) {
    const productId = Number(item.productId) || 0;
    const safeName = escapeHTML(item.name || 'Produto');
    const safeNameAttr = escapeAttribute(item.name || 'Produto');
    const safeSize = item.size ? escapeHTML(item.size) : '';
    const safeSizeJs = escapeJSString(item.size || '');
    const imageSrc = safeImageSrc(item.image_url || '', 'https://via.placeholder.com/110');
    const priceHtml = Number(item.discount_percent || 0) > 0 && Number(item.original_price || 0) > Number(item.price || 0)
        ? `<span style="display:block; color: var(--muted); text-decoration: line-through; font-size: 0.82rem;">${formatBRL(item.original_price)}</span><strong>${formatBRL(item.price)}</strong>`
        : formatBRL(item.price);
    return `
    <article class="guest-cart-item">
      <img src="${escapeAttribute(imageSrc)}" alt="${safeNameAttr}" loading="lazy" decoding="async">
      <div class="guest-cart-info">
        <div class="guest-cart-name">${safeName}</div>
        ${item.size ? `<div class="guest-cart-size">Tamanho: ${safeSize}</div>` : ''}
        <button class="guest-cart-remove" onclick="removeItem(${productId}, '${safeSizeJs}')">Remover</button>
      </div>
      <div class="guest-cart-controls">
        <div class="guest-cart-price">${priceHtml}</div>
        <div class="guest-cart-qty">
          <button onclick="changeQty(${productId}, '${safeSizeJs}', -1)">-</button>
          <span>${item.quantity}</span>
          <button onclick="changeQty(${productId}, '${safeSizeJs}', 1)">+</button>
        </div>
      </div>
      <div class="guest-cart-total">${formatBRL(item.price * item.quantity)}</div>
    </article>
  `;
}

function renderCartItem(item) {
    return renderCartItemTable(item);
}

async function getAvailableStock(productId, size) {
    const cacheKey = `${productId}:${size || ''}`;
    if (stockCache[cacheKey] !== undefined) return stockCache[cacheKey];

    if (size) {
        const response = await fetch(`/api/products/${productId}/size-stock`);
        if (!response.ok) throw new Error('N\u00e3o foi poss\u00edvel verificar o estoque');
        const stocks = await response.json();
        const itemStock = stocks.find(item => String(item.size) === String(size));
        const available = Number(itemStock ? itemStock.stock : 0);
        stockCache[cacheKey] = available;
        return available;
    }

    const product = await API.getProduct(productId);
    const available = Number(product.stock || 0);
    stockCache[cacheKey] = available;
    return available;
}

async function changeQty(productId, size, delta) {
    const items = Cart.getItems();
    const it = items.find(i => i.productId === productId && (i.size || '') === size);
    if (!it) return;
    const newQty = Math.max(1, it.quantity + delta);
    if (delta > 0) {
        try {
            const availableStock = await getAvailableStock(productId, it.size || '');
            if (newQty > availableStock) {
                toast(`Estoque m\u00e1ximo dispon\u00edvel: ${availableStock} unidade(s).`, 'error');
                return;
            }
        } catch (err) {
            toast(err.message || 'N\u00e3o foi poss\u00edvel verificar o estoque', 'error');
            return;
        }
    }
    Cart.updateQuantity(productId, it.size, newQty);
    recalc();
}

function removeItem(productId, size) {
    const items = Cart.getItems();
    const it = items.find(i => i.productId === productId && (i.size || '') === size);
    if (!it) return;
    Cart.removeItem(productId, it.size);
    recalc();
}

/**
 * Integracao ViaCEP - https://viacep.com.br/ws/{cep}/json/
 */
async function buscarCep() {
    const cepInput = document.getElementById('cep-input');
    const display = document.getElementById('address-display');
    const cep = cepInput.value.replace(/\D/g, '');
    if (cep.length !== 8) {
        display.textContent = 'CEP deve ter 8 digitos.';
        cepValidado = false;
        atualizarBotaoFinalizar();
        return;
    }
    display.textContent = 'Buscando...';
    try {
        const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
        const data = await res.json();
        if (data.erro) {
            display.textContent = 'CEP n\u00e3o encontrado.';
            cepValidado = false;
            atualizarBotaoFinalizar();
            return;
        }
        const addressHtml = renderSafeDeliveryAddress(data);
        display.innerHTML = addressHtml;
        cepValidado = true;
        try {
            localStorage.setItem(CEP_STORAGE_KEY, JSON.stringify({
                cep: cepInput.value,
                address: display.textContent,
                data,
            }));
        } catch (_) {}
        atualizarBotaoFinalizar();
    } catch (err) {
        display.textContent = 'Erro ao buscar CEP.';
        cepValidado = false;
        atualizarBotaoFinalizar();
    }
}

function finalizar() {
    if (Cart.getItems().length === 0) return;
    const user = getLoggedUser();
    if (!user) {
        toast('Faça login para continuar', 'warning');
        window.location.href = 'login.html';
        return;
    }

    // Persistir o cupom aplicado para o checkout.html usar ao criar o pedido.
    // Sem isso, o checkout recalcula com desconto = 0 e perde o cupom.
    try {
        if (summary && summary.coupon && summary.coupon.code) {
            localStorage.setItem('applied_coupon', summary.coupon.code);
        } else {
            localStorage.removeItem('applied_coupon');
        }
    } catch (_) {}

    const faltando = dadosFaltando();
    if (faltando.length > 0) {
        // Destaca o que falta
        if (faltando.includes('CEP')) {
            const warning = document.getElementById('cep-warning');
            if (warning) warning.style.display = 'block';
            const cepInput = document.getElementById('cep-input');
            if (cepInput) {
                cepInput.focus();
                cepInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }

        const msg = `Para finalizar a compra, preencha: ${faltando.join(', ')}.`;
        if (typeof Notifications !== 'undefined') {
            Notifications.error(msg);
        } else if (typeof toast === 'function') {
            toast(msg, 'error');
        } else {
            alert(msg);
        }

        // Se faltar dado do perfil, oferece redirecionar
        const faltamPerfil = faltando.filter(f => f !== 'CEP');
        if (faltamPerfil.length > 0) {
            if (confirm(
                `Seu perfil esta incompleto. Precisamos de: ${faltamPerfil.join(', ')}.\n\n` +
                'Deseja ir para "Meu Perfil" para preencher agora?'
            )) {
                window.location.href = 'profile.html?tab=detalhes';
            }
        }
        return;
    }

    window.location.href = 'checkout.html';
}

document.addEventListener('DOMContentLoaded', () => {
    carregarPerfilUsuario();
    recalc();
});
