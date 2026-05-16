const CouponModel = require('../models/couponModel');
const { logAdminAction } = require('../services/auditService');

function normalizeActive(value, fallback = true) {
    if (value === undefined) return fallback;
    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        return normalized === 'true' || normalized === '1' || normalized === 'yes';
    }
    return Boolean(value);
}

function normalizeExpiresAt(value) {
    if (value === undefined) return undefined;
    if (value === null || value === '') return null;

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        const err = new Error('Validade invalida');
        err.status = 400;
        throw err;
    }

    return value;
}

function normalizeMaxUses(value) {
    if (value === undefined) return undefined;
    if (value === null || value === '') return null;

    const maxUses = Number(value);
    if (!Number.isInteger(maxUses) || maxUses < 1) {
        const err = new Error('Limite de usos deve ser inteiro maior que zero');
        err.status = 400;
        throw err;
    }

    return maxUses;
}

const CouponController = {
    async list(req, res, next) {
        try {
            if (req.query.page || req.query.limit) {
                const page = Math.max(Number(req.query.page) || 1, 1);
                const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 100);
                const result = await CouponModel.findAllPaginated({ page, limit });
                return res.status(200).json(result);
            }

            const coupons = await CouponModel.findAll();
            res.status(200).json(coupons);
        } catch (err) {
            next(err);
        }
    },

    async create(req, res, next) {
        try {
            const { code, discount_percent, min_value, active, expires_at, max_uses } = req.body;

            if (!code || typeof code !== 'string' || code.trim().length === 0) {
                return res.status(400).json({
                    error: 'Codigo do cupom obrigatorio',
                    status: 400,
                });
            }

            // Aceita tanto int como string numerica do formulario (ex.: "10")
            const discountNum = Number(discount_percent);
            if (!Number.isFinite(discountNum) || !Number.isInteger(discountNum) || discountNum < 1 || discountNum > 100) {
                return res.status(400).json({
                    error: 'Desconto deve ser numero inteiro entre 1 e 100',
                    status: 400,
                });
            }

            const minValue = min_value != null && min_value !== '' ? Number(min_value) : 0;
            if (!Number.isFinite(minValue) || minValue < 0) {
                return res.status(400).json({
                    error: 'Valor minimo nao pode ser negativo',
                    status: 400,
                });
            }

            // Normaliza campos opcionais: string vazia vira null
            const expiresAt = normalizeExpiresAt(expires_at) ?? null;
            const maxUses = normalizeMaxUses(max_uses) ?? null;

            const coupon = await CouponModel.create({
                code: code.toUpperCase().trim(),
                discount_percent: discountNum,
                min_value: minValue,
                active: normalizeActive(active, true),
                expires_at: expiresAt,
                max_uses: maxUses,
            });

            await logAdminAction(req, {
                action: 'coupon.create',
                entityType: 'coupon',
                entityId: coupon.id,
                details: {
                    code: coupon.code,
                    discount_percent: coupon.discount_percent,
                    min_value: coupon.min_value,
                    active: coupon.active,
                    expires_at: coupon.expires_at,
                    max_uses: coupon.max_uses,
                },
            });

            res.status(201).json(coupon);
        } catch (err) {
            if (err.code === '23505') {
                return res.status(400).json({ error: 'Codigo de cupom ja existe', status: 400 });
            }
            next(err);
        }
    },

    async update(req, res, next) {
        try {
            const id = parseInt(req.params.id);
            if (!Number.isInteger(id) || id < 1) {
                return res.status(400).json({ error: 'ID invalido', status: 400 });
            }

            const coupon = await CouponModel.findById(id);
            if (!coupon) {
                return res.status(404).json({ error: 'Cupom nao encontrado', status: 404 });
            }

            const { code, discount_percent, min_value, active, expires_at, max_uses } = req.body;
            const updateData = {};

            if (code !== undefined) {
                if (typeof code !== 'string' || code.trim().length === 0) {
                    return res.status(400).json({ error: 'Codigo invalido', status: 400 });
                }
                updateData.code = code.toUpperCase().trim();
            }

            if (discount_percent !== undefined) {
                const discountNum = Number(discount_percent);
                if (!Number.isFinite(discountNum) || !Number.isInteger(discountNum) || discountNum < 1 || discountNum > 100) {
                    return res.status(400).json({
                        error: 'Desconto deve ser numero inteiro entre 1 e 100',
                        status: 400,
                    });
                }
                updateData.discount_percent = discountNum;
            }

            if (min_value !== undefined) {
                const minVal = min_value != null && min_value !== '' ? Number(min_value) : 0;
                if (!Number.isFinite(minVal) || minVal < 0) {
                    return res.status(400).json({
                        error: 'Valor minimo nao pode ser negativo',
                        status: 400,
                    });
                }
                updateData.min_value = minVal;
            }

            if (active !== undefined) {
                updateData.active = normalizeActive(active, coupon.active);
            }

            if (expires_at !== undefined) {
                updateData.expires_at = normalizeExpiresAt(expires_at);
            }

            if (max_uses !== undefined) {
                updateData.max_uses = normalizeMaxUses(max_uses);
            }

            const updated = await CouponModel.update(id, updateData);
            await logAdminAction(req, {
                action: 'coupon.update',
                entityType: 'coupon',
                entityId: id,
                details: {
                    before: coupon,
                    after: updated,
                    changedFields: Object.keys(updateData),
                },
            });
            res.status(200).json(updated);
        } catch (err) {
            if (err.code === '23505') {
                return res.status(400).json({ error: 'Codigo de cupom ja existe', status: 400 });
            }
            next(err);
        }
    },

    async remove(req, res, next) {
        try {
            const id = parseInt(req.params.id);
            if (!Number.isInteger(id) || id < 1) {
                return res.status(400).json({ error: 'ID invalido', status: 400 });
            }

            const coupon = await CouponModel.findById(id);
            if (!coupon) {
                return res.status(404).json({ error: 'Cupom nao encontrado', status: 404 });
            }

            const removed = await CouponModel.delete(id);
            await logAdminAction(req, {
                action: 'coupon.delete',
                entityType: 'coupon',
                entityId: removed.id,
                details: {
                    code: coupon.code,
                    discount_percent: coupon.discount_percent,
                },
            });
            res.status(200).json({ message: 'Cupom removido', id: removed.id });
        } catch (err) {
            next(err);
        }
    },
};

module.exports = CouponController;
