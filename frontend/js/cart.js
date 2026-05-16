/**
 * Carrinho Inteligente - persistido em LocalStorage.
 * Key por usuario: 'tenis_cart_user_<id>' ou 'tenis_cart_guest'
 * Estrutura: [{ productId, name, image_url, price, size, quantity }]
 */
const CART_KEY = 'tenis_cart';
const GUEST_CART_KEY = `${CART_KEY}_guest`;

function getCartStorageKey() {
    try {
        const rawUser = sessionStorage.getItem('user');
        const user = rawUser ? JSON.parse(rawUser) : null;
        if (user && user.id) return `${CART_KEY}_user_${user.id}`;
    } catch (_) {}
    return `${CART_KEY}_guest`;
}

function getCartItemsByKey(key) {
    try {
        return JSON.parse(localStorage.getItem(key)) || [];
    } catch {
        return [];
    }
}

function saveCartItemsByKey(key, items) {
    localStorage.setItem(key, JSON.stringify(items));
}

function mergeCartItemLists(baseItems, incomingItems) {
    const merged = [...baseItems];

    incomingItems.forEach(item => {
        const existing = merged.find(existingItem =>
            String(existingItem.productId) === String(item.productId) &&
            (existingItem.size || null) === (item.size || null)
        );

        if (existing) {
            existing.quantity = Math.max(1, Number(existing.quantity || 0) + Number(item.quantity || 1));
        } else {
            merged.push({
                productId: item.productId,
                name: item.name,
                image_url: item.image_url,
                price: Number(item.price),
                original_price: Number(item.original_price || item.price),
                discount_percent: Number(item.discount_percent || 0),
                size: item.size || null,
                quantity: Math.max(1, Number(item.quantity || 1)),
            });
        }
    });

    return merged;
}

const Cart = {
    getItems() {
        try {
            return JSON.parse(localStorage.getItem(getCartStorageKey())) || [];
        } catch {
            return [];
        }
    },

    saveItems(items) {
        localStorage.setItem(getCartStorageKey(), JSON.stringify(items));
    },

    mergeGuestCartToCurrentUser() {
        const userCartKey = getCartStorageKey();
        if (userCartKey === GUEST_CART_KEY) return 0;

        const guestItems = getCartItemsByKey(GUEST_CART_KEY);
        if (!guestItems.length) return 0;

        const userItems = getCartItemsByKey(userCartKey);
        const mergedItems = mergeCartItemLists(userItems, guestItems);

        saveCartItemsByKey(userCartKey, mergedItems);
        localStorage.removeItem(GUEST_CART_KEY);
        updateCartBadge();

        return guestItems.length;
    },

    addItem(product, size = null, quantity = 1) {
        const items = this.getItems();
        const existing = items.find(
            it => it.productId === product.id && it.size === size
        );
        if (existing) {
            existing.quantity += quantity;
            existing.price = Number(product.price);
            existing.original_price = Number(product.original_price || product.price);
            existing.discount_percent = Number(product.discount_percent || 0);
        } else {
            items.push({
                productId: product.id,
                name: product.name,
                image_url: product.image_url,
                price: Number(product.price),
                original_price: Number(product.original_price || product.price),
                discount_percent: Number(product.discount_percent || 0),
                size,
                quantity,
            });
        }
        this.saveItems(items);
        updateCartBadge();
    },

    updateQuantity(productId, size, quantity) {
        const items = this.getItems();
        const it = items.find(i => i.productId === productId && i.size === size);
        if (it) {
            it.quantity = Math.max(1, quantity);
            this.saveItems(items);
            updateCartBadge();
        }
    },

    removeItem(productId, size) {
        const items = this.getItems().filter(
            i => !(i.productId === productId && i.size === size)
        );
        this.saveItems(items);
        updateCartBadge();
    },

    clear() {
        localStorage.removeItem(getCartStorageKey());
        updateCartBadge();
    },

    /**
     * Converte para o formato enviado a API /cart
     */
    toApiPayload() {
        return this.getItems().map(i => ({
            productId: i.productId,
            quantity: i.quantity,
            size: i.size,
        }));
    },
};
