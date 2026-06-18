const orderPricingService = require('../services/orderPricingService');
const CartModel = require('../models/cartModel');

function summarizePersistedCart(items) {
    return {
        items,
        count: items.reduce((sum, item) => sum + Number(item.quantity || 0), 0),
        subtotal: Number(items.reduce((sum, item) => sum + Number(item.lineTotal || 0), 0).toFixed(2)),
    };
}

const CartController = {
    async getCart(req, res, next) {
        try {
            const items = await CartModel.findAllByUser(req.user.id);
            res.status(200).json(summarizePersistedCart(items));
        } catch (err) {
            next(err);
        }
    },

    async upsertItem(req, res, next) {
        try {
            const { productId, product_id, id, size, quantity } = req.body || {};
            const items = await CartModel.upsert({
                userId: req.user.id,
                productId: productId || product_id || id,
                size,
                quantity,
            });

            res.status(200).json(summarizePersistedCart(items));
        } catch (err) {
            next(err);
        }
    },

    async removeItem(req, res, next) {
        try {
            const items = await CartModel.remove({
                userId: req.user.id,
                productId: req.params.productId,
                size: req.query.size,
            });

            res.status(200).json(summarizePersistedCart(items));
        } catch (err) {
            next(err);
        }
    },

    async clear(req, res, next) {
        try {
            const items = await CartModel.clear(req.user.id);
            res.status(200).json(summarizePersistedCart(items));
        } catch (err) {
            next(err);
        }
    },

    async checkout(req, res, next) {
        try {
            const { items = [], coupon, cep, postalCode, shippingCep } = req.body;
            const pricing = await orderPricingService.calculateOrderPricing(items, coupon, {
                cep: cep || postalCode || shippingCep,
            });

            res.status(200).json({
                items: pricing.items,
                subtotal: pricing.subtotal,
                shipping: pricing.shipping,
                shippingRegion: pricing.shippingRegion,
                discount: pricing.discount,
                coupon: pricing.appliedCoupon ? {
                    code: pricing.appliedCoupon.code,
                    discount_percent: pricing.appliedCoupon.discount_percent,
                } : null,
                total: pricing.total,
                order: null,
            });
        } catch (err) {
            next(err);
        }
    },
};

module.exports = CartController;
