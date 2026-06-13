/**
 * @swagger
 * tags:
 *   name: Autenticacao
 *   description: Registro, login e perfil do usuario
 */
const express = require('express');
const AuthController = require('../controllers/authController');
const { verifyToken } = require('../middlewares/authMiddleware');

const router = express.Router();

/**
 * @swagger
 * /register:
 *   post:
 *     tags: [Autenticacao]
 *     summary: Registra um novo usuario
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, email, password]
 *             properties:
 *               name: { type: string, example: "Gabriel" }
 *               email: { type: string, example: "gabriel@teste.com" }
 *               password: { type: string, example: "SenhaForte123" }
 *     responses:
 *       200:
 *         description: Usuario criado com sucesso
 *       400:
 *         description: Dados invalidos ou email ja existente
 */
router.post('/register', AuthController.register);

/**
 * @swagger
 * /login:
 *   post:
 *     tags: [Autenticacao]
 *     summary: Realiza login e retorna JWT
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email: { type: string, example: "usuario@exemplo.com" }
 *               password: { type: string, example: "senhaSegura123" }
 *     responses:
 *       200:
 *         description: Sucesso, retorna usuario e token
 *       401:
 *         description: Credenciais invalidas
 */
router.post('/login', AuthController.login);

/**
 * @swagger
 * /me:
 *   get:
 *     tags: [Autenticacao]
 *     summary: Retorna os dados do usuario autenticado
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Dados do usuario
 *       401:
 *         description: Token ausente ou invalido
 */
router.get('/me', verifyToken, AuthController.me);

router.post('/forgot-password', AuthController.forgotPassword);
router.post('/admin/forgot-password', AuthController.forgotAdminPassword);
router.get('/verify-reset-token/:token', AuthController.verifyResetToken);
router.get('/admin/verify-reset-token', AuthController.verifyAdminResetToken);
router.get('/admin/verify-reset-token/:token', AuthController.verifyAdminResetToken);
router.post('/reset-password', AuthController.resetPassword);
router.post('/admin/reset-password', AuthController.resetAdminPassword);

module.exports = router;
