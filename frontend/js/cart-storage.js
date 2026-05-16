const CartStorage = {
    KEY: 'prime_sneaker_cart',

    get() {
        try {
            const data = localStorage.getItem(this.KEY);
            return data ? JSON.parse(data) : [];
        } catch (err) {
            console.error('Erro ao recuperar carrinho:', err);
            return [];
        }
    },

    save(items) {
        try {
            localStorage.setItem(this.KEY, JSON.stringify(items));
        } catch (err) {
            console.error('Erro ao salvar carrinho:', err);
        }
    },

    add(product) {
        const items = this.get();
        const exists = items.find(item => item.productId === product.productId && item.size === (product.size || null));

        if (exists) {
            exists.quantity = Math.min(exists.quantity + (product.quantity || 1), 9999);
            exists.price = product.price;
            exists.original_price = product.original_price || product.price;
            exists.discount_percent = product.discount_percent || 0;
        } else {
            items.push({
                productId: product.productId,
                name: product.name,
                price: product.price,
                original_price: product.original_price || product.price,
                discount_percent: product.discount_percent || 0,
                image_url: product.image_url,
                size: product.size || null,
                quantity: product.quantity || 1,
            });
        }

        this.save(items);
        return items;
    },

    remove(productId, size) {
        const items = this.get();
        const filtered = items.filter(item => !(item.productId === productId && item.size === (size || null)));
        this.save(filtered);
        return filtered;
    },

    updateQuantity(productId, size, quantity) {
        const items = this.get();
        const item = items.find(i => i.productId === productId && i.size === (size || null));

        if (item) {
            if (quantity <= 0) {
                return this.remove(productId, size);
            }
            item.quantity = Math.min(quantity, 9999);
            this.save(items);
        }

        return items;
    },

    clear() {
        localStorage.removeItem(this.KEY);
    },

    getCount() {
        return this.get().length;
    },

    getTotal() {
        return this.get().reduce((sum, item) => sum + (item.price * item.quantity), 0);
    },
};
