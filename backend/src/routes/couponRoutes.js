/**
 * @swagger
 * tags:
 *   name: Cupons
 *   description: Gerenciamento de cupons (admin)
 */
const express = require('express');
const CouponController = require('../controllers/couponController');
const { basicAuthAdmin, verifyToken, requireSuperAdmin } = require('../middlewares/authMiddleware');

const router = express.Router();

/**
 * @swagger
 * /coupons:
 *   get:
 *     tags: [Cupons]
 *     summary: Lista todos os cupons (admin)
 *     security:
 *       - basicAuth: []
 *       - bearerAuth: []
 *     responses:
 *       200: { description: Lista de cupons }
 *       401: { description: Nao autorizado }
 */
router.get('/coupons', basicAuthAdmin, CouponController.list);

/**
 * @swagger
 * /coupons:
 *   post:
 *     tags: [Cupons]
 *     summary: Cria um cupom (admin)
 *     security:
 *       - basicAuth: []
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [code, discount_percent]
 *             properties:
 *               code: { type: string, example: "URI10" }
 *               discount_percent: { type: integer, example: 10 }
 *               active: { type: boolean, example: true }
 *     responses:
 *       200: { description: Cupom criado }
 *       400: { description: Dados invalidos ou codigo duplicado }
 *       401: { description: Nao autorizado }
 */
router.post('/coupons', verifyToken, requireSuperAdmin, CouponController.create);

/**
 * @swagger
 * /coupons/{id}:
 *   put:
 *     tags: [Cupons]
 *     summary: Atualiza um cupom (admin)
 *     security:
 *       - basicAuth: []
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Cupom atualizado }
 *       404: { description: Nao encontrado }
 */
router.put('/coupons/:id', verifyToken, requireSuperAdmin, CouponController.update);

/**
 * @swagger
 * /coupons/{id}:
 *   delete:
 *     tags: [Cupons]
 *     summary: Exclui um cupom (admin)
 *     security:
 *       - basicAuth: []
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Cupom excluido }
 *       404: { description: Nao encontrado }
 */
router.delete('/coupons/:id', verifyToken, requireSuperAdmin, CouponController.remove);

module.exports = router;
