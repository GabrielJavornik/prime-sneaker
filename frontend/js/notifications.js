const Notifications = {
    container: null,
    hideTimer: null,

    init() {
        if (!document.body) return;

        document.getElementById('toast-container')?.remove();
        this.ensureStyles();
        this.container = this.getContainer();
    },

    getHost() {
        return document.querySelector('[data-feedback-host]')
            || document.querySelector('main .container')
            || document.querySelector('main')
            || document.querySelector('.admin-content')
            || document.body;
    },

    getContainer() {
        let container = document.getElementById('site-feedback');
        const host = this.getHost();

        if (!container) {
            container = document.createElement('div');
            container.id = 'site-feedback';
            container.className = 'site-feedback';
            container.setAttribute('aria-live', 'polite');
            container.setAttribute('aria-atomic', 'true');
        }

        if (container.parentElement !== host) {
            host.prepend(container);
        }

        return container;
    },

    ensureStyles() {
        if (document.querySelector('style[data-inline-feedback]')) return;

        const style = document.createElement('style');
        style.setAttribute('data-inline-feedback', 'true');
        style.textContent = `
            .site-feedback {
                display: none;
                margin: 0 auto 1rem;
                width: min(100%, 1120px);
            }

            .site-feedback.is-visible {
                display: block;
            }

            .site-feedback-message {
                border-radius: 14px;
                border: 1px solid #dbe3ef;
                background: #f8fafc;
                color: #111827;
                padding: 0.9rem 1rem;
                font-weight: 800;
                line-height: 1.45;
            }

            .site-feedback-message.success {
                border-color: #bbf7d0;
                background: #f0fdf4;
                color: #166534;
            }

            .site-feedback-message.error {
                border-color: #fecaca;
                background: #fef2f2;
                color: #991b1b;
            }

            .site-feedback-message.warning {
                border-color: #fde68a;
                background: #fffbeb;
                color: #92400e;
            }

            .site-feedback-message.info {
                border-color: #bfdbfe;
                background: #eff6ff;
                color: #1e3a8a;
            }

            [data-theme="dark"] .site-feedback-message {
                background: #15191f;
                border-color: #273241;
                color: #f8fafc;
            }
        `;
        document.head.appendChild(style);
    },

    show(message, type = 'info', duration = 3500) {
        if (!document.body) {
            document.addEventListener('DOMContentLoaded', () => this.show(message, type, duration), { once: true });
            return;
        }

        this.init();

        const safeType = ['success', 'error', 'warning', 'info'].includes(type) ? type : 'info';
        const text = String(message || '').trim();
        if (!text) return;

        window.clearTimeout(this.hideTimer);
        this.container.innerHTML = '';
        this.container.classList.add('is-visible');

        const alert = document.createElement('div');
        alert.className = `site-feedback-message ${safeType}`;
        alert.setAttribute('role', safeType === 'error' ? 'alert' : 'status');
        alert.textContent = text;

        this.container.appendChild(alert);

        if (duration > 0) {
            this.hideTimer = window.setTimeout(() => {
                this.container.classList.remove('is-visible');
                this.container.innerHTML = '';
            }, duration);
        }
    },

    success(message, duration = 2500) {
        this.show(message, 'success', duration);
    },

    error(message, duration = 4500) {
        this.show(message, 'error', duration);
    },

    warning(message, duration = 4000) {
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
