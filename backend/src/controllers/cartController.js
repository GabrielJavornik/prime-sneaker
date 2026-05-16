const orderPricingService = require('../services/orderPricingService');

const CartController = {
    async checkout(req, res, next) {
        try {
            const { items = [], coupon } = req.body;
            const pricing = await orderPricingService.calculateOrderPricing(items, coupon);

            res.status(200).json({
                items: pricing.items,
                subtotal: pricing.subtotal,
                shipping: pricing.shipping,
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
