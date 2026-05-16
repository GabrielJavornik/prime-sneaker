/**
 * @swagger
 * tags:
 *   name: Health
 *   description: Verificacao de saude do servico
 */
const express = require('express');
const router = express.Router();

/**
 * @swagger
 * /health:
 *   get:
 *     tags: [Health]
 *     summary: Valida se o servico esta online
 *     responses:
 *       200:
 *         description: Servico OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: "ok" }
 *                 uptime: { type: number }
 *                 timestamp: { type: string }
 */
router.get('/health', (req, res) => {
    res.status(200).json({
        status: 'ok',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
    });
});

module.exports = router;
