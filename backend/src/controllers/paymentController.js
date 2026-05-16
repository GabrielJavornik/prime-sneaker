const OrderModel = require('../models/orderModel');
const PixTransactionModel = require('../models/pixTransactionModel');
const orderPricingService = require('../services/orderPricingService');
const pixService = require('../services/pixService');
const { logAdminAction } = require('../services/auditService');
const { ORDER_STATUS } = require('../services/orderStatusService');

const PaymentController = {
    async checkout(req, res, next) {
        try {
            const { couponCode, items } = req.body;
            const userId = req.user.id;

            if (!items || !Array.isArray(items) || items.length === 0) {
                return res.status(400).json({ error: 'Sem itens no pedido' });
            }

            const { order, pricing } = await orderPricingService.createOrderWithPricing({
                userId,
                items,
                couponCode,
                status: ORDER_STATUS.WAITING_PAYMENT,
            });

            try {
                await PixTransactionModel.create({
                    orderId: order.id,
                    userId,
                    amount: Number(order.total) || 0,
                    status: 'pending',
                });
            } catch (pixErr) {
                console.error('Erro ao registrar transacao PIX:', pixErr.message);
            }

            res.status(201).json({
                orderId: order.id,
                subtotal: order.subtotal,
                shipping: order.shipping,
                discount: order.discount,
                total: order.total,
                coupon: pricing.appliedCoupon ? {
                    code: pricing.appliedCoupon.code,
                    discount_percent: pricing.appliedCoupon.discount_percent,
                } : null,
                message: 'Pedido criado',
            });
        } catch (err) {
            console.error('Erro no checkout:', err);
            res.status(err.status || 500).json({ error: err.message || 'Erro interno no checkout' });
        }
    },

    calculateOrderPricing: orderPricingService.calculateOrderPricing,

    async getPixInfo(req, res, next) {
        try {
            const orderId = parseInt(req.params.orderId);
            const userId = req.user.id;

            if (!Number.isInteger(orderId) || orderId < 1) {
                return res.status(400).json({ error: 'ID invalido', status: 400 });
            }

            const order = await OrderModel.findById(orderId);
            if (!order) {
                return res.status(404).json({ error: 'Pedido nao encontrado', status: 404 });
            }

            if (order.user_id !== userId) {
                return res.status(403).json({
                    error: 'Nao autorizado',
                    status: 403,
                });
            }

            const pixInfo = await pixService.generateQRCode(order.total, {
                txid: `PS${order.id}`,
                description: `Pedido ${order.id}`,
            });

            res.status(200).json(pixInfo);
        } catch (err) {
            next(err);
        }
    },

    async confirmPayment(req, res, next) {
        try {
            const orderId = Number(req.body.orderId);

            if (!Number.isInteger(orderId) || orderId < 1) {
                return res.status(400).json({ error: 'ID invalido', status: 400 });
            }

            // Confirmacao manual de pagamento e uma operacao administrativa.
            // Webhook real deve usar uma rota propria com validacao do provedor.
            if (!req.user || !req.user.isAdmin) {
                return res.status(403).json({ error: 'Acesso restrito a administradores', status: 403 });
            }

            const order = await OrderModel.findById(orderId);
            if (!order) {
                return res.status(404).json({ error: 'Pedido nao encontrado', status: 404 });
            }

            const updatedOrder = await OrderModel.updateStatus(orderId, ORDER_STATUS.PROCESSING);

            try {
                const existing = await PixTransactionModel.findByOrderId(orderId);
                if (existing) {
                    await PixTransactionModel.updateStatusByOrderId(orderId, 'confirmed');
                } else {
                    await PixTransactionModel.create({
                        orderId,
                        userId: order.user_id,
                        amount: Number(order.total) || 0,
                        status: 'confirmed',
                    });
                }
            } catch (pixErr) {
                console.error('Erro ao atualizar transacao PIX:', pixErr.message);
            }

            await logAdminAction(req, {
                action: 'payment.confirm',
                entityType: 'order',
                entityId: orderId,
                details: {
                    previousStatus: order.status,
                    newStatus: ORDER_STATUS.PROCESSING,
                    total: order.total,
                    userId: order.user_id,
                },
            });

            res.status(200).json({
                message: 'Pagamento confirmado',
                order: updatedOrder,
            });
        } catch (err) {
            next(err);
        }
    },
};

module.exports = PaymentController;
