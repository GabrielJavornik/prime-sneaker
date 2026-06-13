/**
 * Carrinho hibrido.
 * - Visitante: localStorage.
 * - Usuario logado: banco via GET /cart, PUT /cart/items e DELETE /cart/items/:productId.
 *
 * Estrutura local/cache: [{ productId, name, image_url, price, size, quantity }]
 */
const CART_KEY = 'tenis_cart';
const GUEST_CART_KEY = `${CART_KEY}_guest`;

function getCurrentCartUser() {
    try {
        const rawUser = sessionStorage.getItem('user');
        return rawUser ? JSON.parse(rawUser) : null;
    } catch (_) {
        return null;
    }
}

function isCartUserLogged() {
    const user = getCurrentCartUser();
    return Boolean(user && user.id && sessionStorage.getItem('token'));
}

function canUseCartApi() {
    return isCartUserLogged()
        && typeof API !== 'undefined'
        && typeof API.getCart === 'function'
        && typeof API.upsertCartItem === 'function';
}

function getCartStorageKey() {
    const user = getCurrentCartUser();
    if (user && user.id) return `${CART_KEY}_user_${user.id}`;
    return GUEST_CART_KEY;
}

function getCartItemsByKey(key) {
    try {
        return JSON.parse(localStorage.getItem(key)) || [];
    } catch {
        return [];
    }
}

function saveCartItemsByKey(key, items) {
    localStorage.setItem(key, JSON.stringify(normalizeCartItems(items)));
}

function refreshCartBadge() {
    if (typeof updateCartBadge === 'function') updateCartBadge();
}

function normalizeCartItem(item) {
    const productId = Number(item?.productId || item?.product_id || item?.id);
    if (!Number.isInteger(productId) || productId < 1) return null;

    const price = Number(item.price || 0);
    const quantity = Math.max(1, Number(item.quantity || 1));

    return {
        productId,
        name: item.name || item.product_name || 'Produto',
        image_url: item.image_url || item.image || '',
        price,
        original_price: Number(item.original_price || price),
        discount_percent: Number(item.discount_percent || 0),
        size: item.size || null,
        quantity,
    };
}

function normalizeCartItems(items) {
    return (Array.isArray(items) ? items : [])
        .map(normalizeCartItem)
        .filter(Boolean);
}

function isSameCartItem(left, right) {
    return String(left.productId) === String(right.productId)
        && String(left.size || '') === String(right.size || '');
}

function mergeCartItemLists(baseItems, incomingItems) {
    const merged = normalizeCartItems(baseItems);

    normalizeCartItems(incomingItems).forEach(item => {
        const existing = merged.find(existingItem => isSameCartItem(existingItem, item));

        if (existing) {
            existing.quantity = Math.max(1, Number(existing.quantity || 0) + Number(item.quantity || 1));
            existing.price = Number(item.price || existing.price || 0);
            existing.original_price = Number(item.original_price || existing.original_price || existing.price || 0);
            existing.discount_percent = Number(item.discount_percent || existing.discount_percent || 0);
        } else {
            merged.push(item);
        }
    });

    return merged;
}

function saveServerCartResponse(response) {
    const items = normalizeCartItems(response?.items || []);
    saveCartItemsByKey(getCartStorageKey(), items);
    refreshCartBadge();
    return items;
}

async function pushCartItemToServer(item, options = {}) {
    const { throwOnError = false } = options;
    if (!canUseCartApi()) return null;

    try {
        const response = await API.upsertCartItem({
            productId: item.productId,
            size: item.size || null,
            quantity: item.quantity,
        });
        return saveServerCartResponse(response);
    } catch (err) {
        console.warn('[cart] Nao foi possivel sincronizar item:', err.message);
        if (throwOnError) throw err;
        return null;
    }
}

async function removeCartItemFromServer(productId, size) {
    if (!canUseCartApi() || typeof API.removeCartItem !== 'function') return;

    try {
        const response = await API.removeCartItem(productId, size || null);
        saveServerCartResponse(response);
    } catch (err) {
        console.warn('[cart] Nao foi possivel remover item no servidor:', err.message);
    }
}

async function clearServerCart() {
    if (!canUseCartApi() || typeof API.clearCart !== 'function') return;

    try {
        const response = await API.clearCart();
        saveServerCartResponse(response);
    } catch (err) {
        console.warn('[cart] Nao foi possivel limpar carrinho no servidor:', err.message);
    }
}

const Cart = {
    _serverSyncPromise: null,
    _lastLocalMutationAt: 0,

    getItems() {
        return getCartItemsByKey(getCartStorageKey());
    },

    saveItems(items) {
        saveCartItemsByKey(getCartStorageKey(), items);
    },

    async syncFromServer(force = false) {
        if (!canUseCartApi()) {
            refreshCartBadge();
            return this.getItems();
        }

        if (this._serverSyncPromise && !force) {
            return this._serverSyncPromise;
        }

        const syncStartedAt = Date.now();
        this._serverSyncPromise = API.getCart()
            .then(response => {
                if (this._lastLocalMutationAt > syncStartedAt) {
                    return this.getItems();
                }
                return saveServerCartResponse(response);
            })
            .catch(err => {
                console.warn('[cart] Nao foi possivel carregar carrinho do servidor:', err.message);
                return this.getItems();
            })
            .finally(() => {
                this._serverSyncPromise = null;
            });

        return this._serverSyncPromise;
    },

    async mergeGuestCartToCurrentUser() {
        const userCartKey = getCartStorageKey();
        if (userCartKey === GUEST_CART_KEY) return 0;

        const guestItems = getCartItemsByKey(GUEST_CART_KEY);
        if (!guestItems.length) {
            await this.syncFromServer();
            return 0;
        }

        let serverItems = [];
        if (canUseCartApi()) {
            try {
                const response = await API.getCart();
                serverItems = normalizeCartItems(response.items || []);
            } catch (err) {
                console.warn('[cart] Nao foi possivel buscar carrinho antes do merge:', err.message);
            }
        }

        const localUserItems = getCartItemsByKey(userCartKey);
        const baseItems = serverItems.length ? serverItems : localUserItems;
        const mergedItems = mergeCartItemLists(baseItems, guestItems);

        saveCartItemsByKey(userCartKey, mergedItems);
        localStorage.removeItem(GUEST_CART_KEY);
        this._lastLocalMutationAt = Date.now();
        refreshCartBadge();

        if (canUseCartApi()) {
            for (const item of mergedItems) {
                await pushCartItemToServer(item);
            }
            await this.syncFromServer(true);
        }

        return guestItems.length;
    },

    addItem(product, size = null, quantity = 1, options = {}) {
        const normalizedProduct = normalizeCartItem({
            productId: product.id || product.productId || product.product_id,
            name: product.name,
            image_url: product.image_url,
            price: product.price,
            original_price: product.original_price || product.price,
            discount_percent: product.discount_percent || 0,
            size,
            quantity,
        });

        if (!normalizedProduct) return null;

        const items = this.getItems();
        const existing = items.find(item => isSameCartItem(item, normalizedProduct));
        let itemToSync = normalizedProduct;

        if (existing) {
            existing.quantity = Number(existing.quantity || 0) + normalizedProduct.quantity;
            existing.name = normalizedProduct.name;
            existing.image_url = normalizedProduct.image_url;
            existing.price = normalizedProduct.price;
            existing.original_price = normalizedProduct.original_price;
            existing.discount_percent = normalizedProduct.discount_percent;
            itemToSync = existing;
        } else {
            items.push(normalizedProduct);
        }

        this.saveItems(items);
        this._lastLocalMutationAt = Date.now();
        refreshCartBadge();

        if (options.sync !== false) {
            pushCartItemToServer(itemToSync);
        }

        return itemToSync;
    },

    async addItemAndSync(product, size = null, quantity = 1) {
        const item = this.addItem(product, size, quantity, { sync: false });
        if (!item) return false;

        if (canUseCartApi()) {
            await pushCartItemToServer(item, { throwOnError: true });
            await this.syncFromServer(true);
        }

        return true;
    },

    updateQuantity(productId, size, quantity) {
        const items = this.getItems();
        const item = items.find(current => String(current.productId) === String(productId)
            && String(current.size || '') === String(size || ''));

        if (item) {
            item.quantity = Math.max(1, Number(quantity || 1));
            this.saveItems(items);
            this._lastLocalMutationAt = Date.now();
            refreshCartBadge();
            pushCartItemToServer(item);
        }
    },

    removeItem(productId, size) {
        const items = this.getItems().filter(item => !(String(item.productId) === String(productId)
            && String(item.size || '') === String(size || '')));

        this.saveItems(items);
        this._lastLocalMutationAt = Date.now();
        refreshCartBadge();
        removeCartItemFromServer(productId, size);
    },

    clear() {
        localStorage.removeItem(getCartStorageKey());
        this._lastLocalMutationAt = Date.now();
        refreshCartBadge();
        clearServerCart();
    },

    /**
     * Converte para o formato enviado a API /cart.
     */
    toApiPayload() {
        return this.getItems().map(item => ({
            productId: item.productId,
            quantity: item.quantity,
            size: item.size,
        }));
    },
};
