const OrderModel = require('../models/orderModel');
const UserModel = require('../models/userModel');
const PixTransactionModel = require('../models/pixTransactionModel');
const emailService = require('../services/emailService');
const validators = require('../utils/validators');
const orderPricingService = require('../services/orderPricingService');
const { logAdminAction } = require('../services/auditService');
const {
    ORDER_STATUS,
    ORDER_STATUS_VALUES,
    normalizeOrderStatus,
    isValidOrderStatus,
} = require('../services/orderStatusService');

const OrderController = {
    async create(req, res, next) {
        try {
            const { couponCode, coupon, items } = req.body;
            const userId = req.user.id;

            if (!Array.isArray(items) || items.length === 0) {
                return res.status(400).json({
                    error: 'Pedido deve conter ao menos um item',
                    status: 400,
                });
            }

            const { order, pricing } = await orderPricingService.createOrderWithPricing({
                userId,
                items,
                couponCode: couponCode || coupon,
                status: ORDER_STATUS.WAITING_PAYMENT,
            });

            // Fetch user data for email
            const user = await UserModel.findById(userId);
            if (user) {
                await emailService.sendOrderConfirmation(order, user, pricing.items);
            }

            res.status(201).json(order);
        } catch (err) {
            next(err);
        }
    },

    async getMyOrders(req, res, next) {
        try {
            const userId = req.user.id;
            const page = Number(req.query.page) || 1;
            const limit = Number(req.query.limit) || 10;

            if (!validators.isValidPageLimit(page, limit)) {
                return res.status(400).json({
                    error: 'Paginacao invalida',
                    status: 400,
                });
            }

            const result = await OrderModel.findByUserId(userId, page, limit);
            res.status(200).json(result);
        } catch (err) {
            next(err);
        }
    },

    async getOrderDetail(req, res, next) {
        try {
            const orderId = parseInt(req.params.id);
            const userId = req.user.id;

            if (!Number.isInteger(orderId) || orderId < 1) {
                return res.status(400).json({ error: 'ID invalido', status: 400 });
            }

            const order = await OrderModel.findById(orderId);
            if (!order) {
                return res.status(404).json({ error: 'Pedido nao encontrado', status: 404 });
            }

            if (order.user_id !== userId && !req.user.isAdmin) {
                return res.status(403).json({
                    error: 'Nao autorizado a acessar este pedido',
                    status: 403,
                });
            }

            res.status(200).json(order);
        } catch (err) {
            next(err);
        }
    },

    async listAllAdmin(req, res, next) {
        try {
            if (!req.user.isAdmin) {
                return res.status(403).json({
                    error: 'Apenas administradores podem listar todos os pedidos',
                    status: 403,
                });
            }

            const page = Number(req.query.page) || 1;
            const limit = Number(req.query.limit) || 50;
            const status = req.query.status || null;
            const q = req.query.q || req.query.search || '';

            const result = await OrderModel.findAllForAdmin({ status, q, page, limit });
            res.status(200).json(result);
        } catch (err) {
            next(err);
        }
    },

    async updateStatus(req, res, next) {
        try {
            const orderId = parseInt(req.params.id);
            const { status } = req.body;

            if (!req.user.isAdmin) {
                return res.status(403).json({
                    error: 'Apenas administradores podem atualizar pedidos',
                    status: 403,
                });
            }

            if (!Number.isInteger(orderId) || orderId < 1) {
                return res.status(400).json({ error: 'ID invalido', status: 400 });
            }

            const normalizedStatus = normalizeOrderStatus(status);
            if (!isValidOrderStatus(normalizedStatus)) {
                return res.status(400).json({
                    error: `Status invalido. Validos: ${ORDER_STATUS_VALUES.join(', ')}`,
                    status: 400,
                });
            }

            const previousOrder = await OrderModel.findById(orderId);
            const order = await OrderModel.updateStatus(orderId, normalizedStatus);
            if (!order) {
                return res.status(404).json({ error: 'Pedido nao encontrado', status: 404 });
            }

            await logAdminAction(req, {
                action: 'order.status.update',
                entityType: 'order',
                entityId: orderId,
                details: {
                    previousStatus: previousOrder?.status || null,
                    newStatus: normalizedStatus,
                    total: order.total,
                    userId: order.user_id,
                },
            });

            // Sincroniza status da transacao PIX correspondente
            try {
                let pixStatus = null;
                if (
                    normalizedStatus === ORDER_STATUS.PROCESSING ||
                    normalizedStatus === ORDER_STATUS.SHIPPED ||
                    normalizedStatus === ORDER_STATUS.DELIVERED
                ) {
                    pixStatus = 'confirmed';
                } else if (normalizedStatus === ORDER_STATUS.CANCELED) {
                    pixStatus = 'cancelled';
                }

                if (pixStatus) {
                    const existing = await PixTransactionModel.findByOrderId(orderId);
                    if (existing) {
                        await PixTransactionModel.updateStatusByOrderId(orderId, pixStatus);
                    } else if (pixStatus === 'confirmed') {
                        // Cria retroativamente caso o pedido tenha sido feito antes desse registro existir
                        await PixTransactionModel.create({
                            orderId,
                            userId: order.user_id,
                            amount: Number(order.total) || 0,
                            status: 'confirmed',
                        });
                    }
                }
            } catch (pixErr) {
                console.error('Erro ao sincronizar transacao PIX:', pixErr.message);
            }

            // Enviar email de notificação ao cliente
            try {
                const user = await UserModel.findById(order.user_id);
                if (user && user.email) {
                    await emailService.sendOrderStatusUpdate(order, user);
                }
            } catch (emailErr) {
                console.error('Erro ao enviar email de status:', emailErr.message);
            }

            res.status(200).json(order);
        } catch (err) {
            next(err);
        }
    },

    async cancelAllPending(req, res, next) {
        try {
            const userId = req.user.id;
            const cancelled = await OrderModel.cancelAllPendingByUser(userId);
            res.status(200).json({
                message: `${cancelled.length} pedido(s) aguardando pagamento cancelado(s)`,
                cancelledIds: cancelled.map(r => r.id),
            });
        } catch (err) {
            next(err);
        }
    },

    async deleteAllCancelled(req, res, next) {
        try {
            const userId = req.user.id;
            const deleted = await OrderModel.deleteCancelledByUser(userId);
            res.status(200).json({
                message: `${deleted.length} pedido(s) cancelado(s) excluido(s) permanentemente`,
                deletedIds: deleted.map(r => r.id),
            });
        } catch (err) {
            next(err);
        }
    },

    async deleteOne(req, res, next) {
        try {
            const orderId = parseInt(req.params.id);
            const userId = req.user.id;

            if (!Number.isInteger(orderId) || orderId < 1) {
                return res.status(400).json({ error: 'ID invalido', status: 400 });
            }

            const order = await OrderModel.findById(orderId);
            if (!order) {
                return res.status(404).json({ error: 'Pedido nao encontrado', status: 404 });
            }
            if (order.user_id !== userId && !req.user.isAdmin) {
                return res.status(403).json({ error: 'Nao autorizado', status: 403 });
            }
            if (normalizeOrderStatus(order.status) !== ORDER_STATUS.CANCELED && !req.user.isAdmin) {
                return res.status(400).json({
                    error: 'So e possivel excluir pedidos com status "cancelado"',
                    status: 400,
                });
            }

            await OrderModel.deleteById(orderId, req.user.isAdmin ? order.user_id : userId);
            if (req.user.isAdmin) {
                await logAdminAction(req, {
                    action: 'order.delete',
                    entityType: 'order',
                    entityId: orderId,
                    details: {
                        status: order.status,
                        total: order.total,
                        userId: order.user_id,
                    },
                });
            }
            res.status(200).json({ message: 'Pedido excluido', id: orderId });
        } catch (err) {
            next(err);
        }
    },

    async cancel(req, res, next) {
        try {
            const orderId = parseInt(req.params.id);
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
                    error: 'Nao autorizado a cancelar este pedido',
                    status: 403,
                });
            }

            if (normalizeOrderStatus(order.status) !== ORDER_STATUS.WAITING_PAYMENT) {
                return res.status(400).json({
                    error: 'So pedidos em "aguardando_pagamento" podem ser cancelados',
                    status: 400,
                });
            }

            const cancelledOrder = await OrderModel.updateStatus(orderId, ORDER_STATUS.CANCELED);

            res.status(200).json({
                message: 'Pedido cancelado com sucesso',
                order: cancelledOrder,
            });
        } catch (err) {
            next(err);
        }
    },
};

module.exports = OrderController;
