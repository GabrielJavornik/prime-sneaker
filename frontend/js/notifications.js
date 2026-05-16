const Notifications = {
    container: null,

    init() {
        if (this.container && document.body.contains(this.container)) return;

        const existingContainer =
            document.getElementById('toast-container') ||
            document.getElementById('notifications-container');

        if (existingContainer) {
            existingContainer.id = 'toast-container';
            this.container = existingContainer;
        } else {
            this.container = document.createElement('div');
            this.container.id = 'toast-container';
            document.body.appendChild(this.container);
        }

        this.container.setAttribute('aria-live', 'polite');
        this.container.setAttribute('aria-atomic', 'false');
        this.ensureStyles();
    },

    ensureStyles() {
        if (document.querySelector('style[data-notifications]')) return;

        const style = document.createElement('style');
        style.setAttribute('data-notifications', 'true');
        style.textContent = `
            #toast-container {
                position: fixed;
                top: 90px;
                right: 20px;
                z-index: 9999;
                display: flex;
                flex-direction: column;
                gap: 10px;
                max-width: min(380px, calc(100vw - 32px));
                pointer-events: none;
            }

            .toast {
                display: flex;
                align-items: center;
                gap: 12px;
                padding: 1rem 1.1rem;
                border-radius: 14px;
                color: #fff;
                font-weight: 700;
                line-height: 1.35;
                box-shadow: 0 18px 40px rgba(0, 0, 0, 0.22);
                border: 1px solid rgba(255, 255, 255, 0.18);
                animation: slideIn 0.25s ease-out;
                pointer-events: auto;
            }

            .toast.success { background: linear-gradient(135deg, #16a34a, #15803d); }
            .toast.error { background: linear-gradient(135deg, #ef4444, #b91c1c); }
            .toast.warning { background: linear-gradient(135deg, #f59e0b, #b45309); }
            .toast.info { background: linear-gradient(135deg, #2563eb, #1d4ed8); }

            .toast-icon {
                width: 28px;
                height: 28px;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                flex: 0 0 auto;
                border-radius: 999px;
                background: rgba(255, 255, 255, 0.18);
                font-size: 0.8rem;
                font-weight: 900;
            }

            .toast-message { flex: 1; }

            .toast-close {
                width: 28px;
                height: 28px;
                border: 0;
                border-radius: 999px;
                color: #fff;
                background: rgba(255, 255, 255, 0.16);
                cursor: pointer;
                font-size: 1rem;
                line-height: 1;
            }

            .toast-close:hover { background: rgba(255, 255, 255, 0.28); }
            .toast-leaving { animation: slideOut 0.18s ease-in forwards; }

            @media (max-width: 640px) {
                #toast-container {
                    top: 78px;
                    right: 12px;
                    left: 12px;
                    max-width: none;
                }
            }

            @keyframes slideIn {
                from { transform: translateX(32px); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }

            @keyframes slideOut {
                from { transform: translateX(0); opacity: 1; }
                to { transform: translateX(32px); opacity: 0; }
            }
        `;
        document.head.appendChild(style);
    },

    show(message, type = 'success', duration = 3000) {
        if (!document.body) {
            document.addEventListener('DOMContentLoaded', () => this.show(message, type, duration), { once: true });
            return;
        }

        this.init();

        const safeType = ['success', 'error', 'warning', 'info'].includes(type) ? type : 'info';
        const toast = document.createElement('div');
        const icon = document.createElement('span');
        const text = document.createElement('span');
        const closeButton = document.createElement('button');

        const icons = {
            success: 'OK',
            error: '!',
            warning: '!',
            info: 'i',
        };

        toast.className = `toast ${safeType}`;
        toast.setAttribute('role', safeType === 'error' ? 'alert' : 'status');

        icon.className = 'toast-icon';
        icon.textContent = icons[safeType];

        text.className = 'toast-message';
        text.textContent = String(message || '');

        closeButton.type = 'button';
        closeButton.className = 'toast-close';
        closeButton.setAttribute('aria-label', 'Fechar notificacao');
        closeButton.textContent = 'x';

        const removeToast = () => {
            if (!toast.isConnected) return;
            toast.classList.add('toast-leaving');
            setTimeout(() => toast.remove(), 180);
        };

        closeButton.addEventListener('click', removeToast);
        toast.append(icon, text, closeButton);
        this.container.appendChild(toast);

        if (duration > 0) {
            setTimeout(removeToast, duration);
        }
    },

    success(message, duration = 3000) {
        this.show(message, 'success', duration);
    },

    error(message, duration = 4000) {
        this.show(message, 'error', duration);
    },

    warning(message, duration = 3500) {
        this.show(message, 'warning', duration);
    },

    info(message, duration = 3000) {
        this.show(message, 'info', duration);
    },
};

document.addEventListener('DOMContentLoaded', () => {
    Notifications.init();
});

window.Notifications = Notifications;
