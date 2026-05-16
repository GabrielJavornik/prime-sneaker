/**
 * Simple local canvas chart renderer used by the admin dashboard.
 * It intentionally implements only the Chart API subset used in admin.js.
 */
(function () {
    function toNumber(value) {
        const number = Number(value);
        return Number.isFinite(number) ? number : 0;
    }

    function getCanvasSize(canvas) {
        const parentWidth = canvas.parentElement ? canvas.parentElement.clientWidth : 420;
        const width = Math.max(260, parentWidth - 32);
        const height = 260;
        return { width, height };
    }

    function setupCanvas(canvas) {
        const ratio = window.devicePixelRatio || 1;
        const { width, height } = getCanvasSize(canvas);

        canvas.width = Math.floor(width * ratio);
        canvas.height = Math.floor(height * ratio);
        canvas.style.width = '100%';
        canvas.style.height = `${height}px`;

        const ctx = canvas.getContext('2d');
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
        ctx.clearRect(0, 0, width, height);

        return { ctx, width, height };
    }

    function drawText(ctx, text, x, y, options = {}) {
        ctx.save();
        ctx.fillStyle = options.color || '#666';
        ctx.font = options.font || '12px Arial, sans-serif';
        ctx.textAlign = options.align || 'left';
        ctx.textBaseline = options.baseline || 'alphabetic';
        ctx.fillText(String(text), x, y);
        ctx.restore();
    }

    function drawAxes(ctx, bounds, maxValue) {
        ctx.save();
        ctx.strokeStyle = '#e5e5e5';
        ctx.lineWidth = 1;

        for (let i = 0; i <= 4; i++) {
            const y = bounds.bottom - (bounds.height * i / 4);
            ctx.beginPath();
            ctx.moveTo(bounds.left, y);
            ctx.lineTo(bounds.right, y);
            ctx.stroke();

            const label = Math.round(maxValue * i / 4).toLocaleString('pt-BR');
            drawText(ctx, label, bounds.left - 8, y + 4, { align: 'right', color: '#777' });
        }

        ctx.restore();
    }

    function drawEmpty(ctx, width, height, message) {
        drawText(ctx, message || 'Sem dados para exibir', width / 2, height / 2, {
            align: 'center',
            baseline: 'middle',
            color: '#777',
            font: '600 14px Arial, sans-serif',
        });
    }

    function normalizeDataset(config) {
        const dataset = (config.data && config.data.datasets && config.data.datasets[0]) || {};
        const labels = (config.data && config.data.labels) || [];
        const values = (dataset.data || []).map(toNumber);
        return { dataset, labels, values };
    }

    function renderLine(canvas, config) {
        const { ctx, width, height } = setupCanvas(canvas);
        const { dataset, labels, values } = normalizeDataset(config);
        if (!values.length) return drawEmpty(ctx, width, height);

        const bounds = { left: 58, right: width - 18, top: 24, bottom: height - 46 };
        bounds.width = bounds.right - bounds.left;
        bounds.height = bounds.bottom - bounds.top;
        const maxValue = Math.max(...values, 1);
        const pointGap = values.length > 1 ? bounds.width / (values.length - 1) : bounds.width;

        drawAxes(ctx, bounds, maxValue);

        ctx.save();
        ctx.strokeStyle = dataset.borderColor || '#2196F3';
        ctx.lineWidth = Number(dataset.borderWidth || 2);
        ctx.beginPath();
        values.forEach((value, index) => {
            const x = values.length > 1 ? bounds.left + index * pointGap : bounds.left + bounds.width / 2;
            const y = bounds.bottom - (value / maxValue) * bounds.height;
            if (index === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });
        ctx.stroke();

        values.forEach((value, index) => {
            const x = values.length > 1 ? bounds.left + index * pointGap : bounds.left + bounds.width / 2;
            const y = bounds.bottom - (value / maxValue) * bounds.height;
            ctx.fillStyle = dataset.borderColor || '#2196F3';
            ctx.beginPath();
            ctx.arc(x, y, 4, 0, Math.PI * 2);
            ctx.fill();
        });
        ctx.restore();

        labels.forEach((label, index) => {
            if (labels.length > 6 && index % Math.ceil(labels.length / 6) !== 0) return;
            const x = labels.length > 1 ? bounds.left + index * pointGap : bounds.left + bounds.width / 2;
            drawText(ctx, label, x, height - 18, { align: 'center', color: '#555' });
        });
    }

    function renderBar(canvas, config) {
        const { ctx, width, height } = setupCanvas(canvas);
        const { dataset, labels, values } = normalizeDataset(config);
        if (!values.length) return drawEmpty(ctx, width, height);

        const bounds = { left: 48, right: width - 18, top: 24, bottom: height - 58 };
        bounds.width = bounds.right - bounds.left;
        bounds.height = bounds.bottom - bounds.top;
        const maxValue = Math.max(...values, 1);
        const gap = 10;
        const barWidth = Math.max(12, (bounds.width - gap * (values.length - 1)) / values.length);
        const colors = Array.isArray(dataset.backgroundColor)
            ? dataset.backgroundColor
            : [dataset.backgroundColor || '#36A2EB'];

        drawAxes(ctx, bounds, maxValue);

        values.forEach((value, index) => {
            const barHeight = (value / maxValue) * bounds.height;
            const x = bounds.left + index * (barWidth + gap);
            const y = bounds.bottom - barHeight;

            ctx.save();
            ctx.fillStyle = colors[index % colors.length];
            ctx.fillRect(x, y, barWidth, barHeight);
            ctx.restore();

            const label = String(labels[index] || '');
            const shortLabel = label.length > 10 ? `${label.slice(0, 10)}...` : label;
            drawText(ctx, shortLabel, x + barWidth / 2, height - 30, { align: 'center', color: '#555' });
            drawText(ctx, value, x + barWidth / 2, y - 6, { align: 'center', color: '#333', font: '700 11px Arial, sans-serif' });
        });
    }

    class SimpleChart {
        constructor(context, config) {
            this.canvas = context && context.canvas ? context.canvas : context;
            this.config = config || {};
            this._onResize = () => this.render();
            window.addEventListener('resize', this._onResize);
            this.render();
        }

        render() {
            if (!this.canvas) return;
            if (this.config.type === 'bar') renderBar(this.canvas, this.config);
            else renderLine(this.canvas, this.config);
        }

        destroy() {
            window.removeEventListener('resize', this._onResize);
            if (!this.canvas) return;
            const ctx = this.canvas.getContext('2d');
            ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        }
    }

    window.Chart = SimpleChart;
})();
