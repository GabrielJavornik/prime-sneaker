const Wishlist = {
    _favoriteCache: new Map(),

    _cacheKey(productId) {
        const user = getLoggedUser();
        return `${user?.id || 'guest'}:${Number(productId) || 0}`;
    },

    _getCached(productId) {
        const key = this._cacheKey(productId);
        return this._favoriteCache.has(key) ? this._favoriteCache.get(key) : undefined;
    },

    _setCached(productId, value) {
        this._favoriteCache.set(this._cacheKey(productId), !!value);
    },

    async add(productId) {
        const user = getLoggedUser();
        if (!user) {
            Notifications.warning('Faça login para adicionar aos favoritos');
            window.location.href = 'login.html';
            return;
        }

        try {
            const token = sessionStorage.getItem('token');
            const response = await fetch('/api/wishlist/add', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify({ productId }),
            });

            if (response.ok) {
                this._setCached(productId, true);
                Notifications.success('Adicionado aos favoritos!');
                return true;
            } else {
                Notifications.error('Erro ao adicionar aos favoritos');
                return false;
            }
        } catch (err) {
            Notifications.error('Erro: ' + err.message);
            return false;
        }
    },

    async remove(productId) {
        try {
            const token = sessionStorage.getItem('token');
            const response = await fetch(`/api/wishlist/${productId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${token}`,
                },
            });

            if (response.ok) {
                this._setCached(productId, false);
                Notifications.success('Removido dos favoritos');
                return true;
            } else {
                Notifications.error('Erro ao remover');
                return false;
            }
        } catch (err) {
            Notifications.error('Erro: ' + err.message);
            return false;
        }
    },

    async toggle(productId) {
        const isFav = await this.isFavorite(productId);
        if (isFav) {
            const removed = await this.remove(productId);
            return removed ? false : isFav;
        } else {
            const added = await this.add(productId);
            return added ? true : isFav;
        }
    },

    async isFavorite(productId) {
        const user = getLoggedUser();
        if (!user) return false;

        const cached = this._getCached(productId);
        if (cached !== undefined) return cached;

        try {
            const token = sessionStorage.getItem('token');
            const response = await fetch(`/api/wishlist/check/${productId}`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                },
            });

            if (response.ok) {
                const data = await response.json();
                this._setCached(productId, data.isFavorite);
                return data.isFavorite;
            }
            return false;
        } catch (err) {
            return false;
        }
    },

    async checkMany(productIds = []) {
        const user = getLoggedUser();
        if (!user) return new Set();

        const ids = [...new Set(productIds
            .map(id => Number(id))
            .filter(id => Number.isInteger(id) && id > 0))];

        if (!ids.length) return new Set();

        const missing = [];
        ids.forEach(id => {
            if (this._getCached(id) === undefined) missing.push(id);
        });

        if (missing.length) {
            try {
                const token = sessionStorage.getItem('token');
                const response = await fetch(`/api/wishlist/check?ids=${missing.join(',')}`, {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                    },
                });

                if (response.ok) {
                    const data = await response.json();
                    const favoriteIds = new Set((data.favoriteIds || []).map(id => Number(id)));
                    missing.forEach(id => this._setCached(id, favoriteIds.has(id)));
                }
            } catch (_) {}
        }

        return new Set(ids.filter(id => this._getCached(id) === true));
    },

    async getList(page = 1, limit = 10) {
        const user = getLoggedUser();
        if (!user) return null;

        try {
            const token = sessionStorage.getItem('token');
            const response = await fetch(`/api/wishlist?page=${page}&limit=${limit}`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                },
            });

            if (response.ok) {
                return await response.json();
            }
            return null;
        } catch (err) {
            console.error('Erro ao carregar wishlist:', err);
            return null;
        }
    },

    async getCount() {
        const user = getLoggedUser();
        if (!user) return 0;

        try {
            const token = sessionStorage.getItem('token');
            const response = await fetch('/api/wishlist/count/total', {
                headers: {
                    'Authorization': `Bearer ${token}`,
                },
            });

            if (response.ok) {
                const data = await response.json();
                return data.count;
            }
            return 0;
        } catch (err) {
            return 0;
        }
    },

    renderHeartButton(productId, isFavorite = false) {
        return `
            <button
                class="wishlist-heart"
                onclick="toggleWishlist(${productId})"
                style="
                    background: none;
                    border: none;
                    font-size: 1.5rem;
                    cursor: pointer;
                    color: ${isFavorite ? 'var(--danger)' : '#ccc'};
                    transition: color 0.3s;
                    padding: 0.5rem;
                "
                title="${isFavorite ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}"
            >
                ${isFavorite ? '❤️' : '🤍'}
            </button>
        `;
    },
};

async function toggleWishlist(productId, buttonElement) {
    const isFav = await Wishlist.toggle(productId);
    if (buttonElement) {
        buttonElement.textContent = isFav ? '❤️' : '♡';
        buttonElement.style.color = isFav ? 'var(--danger)' : '#ccc';
    }
}
