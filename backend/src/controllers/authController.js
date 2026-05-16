const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const UserModel = require('../models/userModel');
const emailService = require('../services/emailService');
const validators = require('../utils/validators');
const { JWT_SECRET } = require('../middlewares/authMiddleware');
require('dotenv').config();

const AuthController = {
    async register(req, res, next) {
        try {
            const { name, email, password, phone, cpf } = req.body;

            if (!name || !email || !password) {
                return res.status(400).json({
                    error: 'Nome, email e senha sao obrigatorios',
                    status: 400,
                });
            }

            if (name.trim().length < 3 || name.trim().length > 100) {
                return res.status(400).json({
                    error: 'Nome deve ter entre 3 e 100 caracteres',
                    status: 400,
                });
            }

            if (!validators.isValidEmail(email)) {
                return res.status(400).json({
                    error: 'Email invalido',
                    status: 400,
                });
            }

            const passwordError = validators.getPasswordStrengthError(password);
            if (passwordError) {
                return res.status(400).json({
                    error: passwordError,
                    status: 400,
                });
            }

            if (phone) {
                const phoneDigits = String(phone).replace(/\D/g, '');
                if (phoneDigits.length < 10 || phoneDigits.length > 11) {
                    return res.status(400).json({
                        error: 'Telefone invalido',
                        status: 400,
                    });
                }
            }

            if (cpf && !validators.isValidCPF(cpf)) {
                return res.status(400).json({
                    error: 'CPF invalido',
                    status: 400,
                });
            }

            const existing = await UserModel.findByEmail(email.toLowerCase());
            if (existing) {
                return res.status(400).json({ error: 'Email ja cadastrado', status: 400 });
            }

            const hash = await bcrypt.hash(password, 10);
            const user = await UserModel.create({
                name: name.trim(),
                email: email.toLowerCase(),
                password: hash,
                phone: phone || null,
                cpf: cpf || null,
                // Cadastro publico nunca pode promover usuario para administrador.
                isAdmin: false,
            });

            const token = jwt.sign(
                { id: user.id, name: user.name, email: user.email, isAdmin: user.is_admin, isSuperAdmin: user.is_super_admin },
                JWT_SECRET,
                { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
            );

            res.status(201).json({
                user: { id: user.id, name: user.name, email: user.email, phone: user.phone, is_admin: user.is_admin, is_super_admin: user.is_super_admin },
                token,
            });
        } catch (err) {
            next(err);
        }
    },

    async login(req, res, next) {
        try {
            const { email, password } = req.body;

            if (!email || !password) {
                return res.status(400).json({
                    error: 'Email e senha sao obrigatorios',
                    status: 400,
                });
            }

            if (!validators.isValidEmail(email)) {
                return res.status(400).json({
                    error: 'Email invalido',
                    status: 400,
                });
            }

            const user = await UserModel.findByEmail(email.toLowerCase());
            if (!user) {
                return res.status(401).json({ error: 'Credenciais invalidas', status: 401 });
            }

            const ok = await bcrypt.compare(password, user.password);
            if (!ok) {
                return res.status(401).json({ error: 'Credenciais invalidas', status: 401 });
            }

            const token = jwt.sign(
                { id: user.id, name: user.name, email: user.email, isAdmin: user.is_admin, isSuperAdmin: user.is_super_admin },
                JWT_SECRET,
                { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
            );

            res.status(200).json({
                user: { id: user.id, name: user.name, email: user.email, is_admin: user.is_admin, is_super_admin: user.is_super_admin },
                token,
            });
        } catch (err) {
            next(err);
        }
    },

    async me(req, res, next) {
        try {
            const user = await UserModel.findById(req.user.id);
            if (!user) {
                return res.status(404).json({ error: 'Usuario nao encontrado', status: 404 });
            }
            res.status(200).json(user);
        } catch (err) {
            next(err);
        }
    },

    async forgotPassword(req, res, next) {
        try {
            const { email } = req.body;

            if (!email || !validators.isValidEmail(email)) {
                return res.status(400).json({
                    error: 'Email invalido',
                    status: 400,
                });
            }

            const user = await UserModel.findByEmail(email.toLowerCase());
            if (!user) {
                return res.status(404).json({
                    error: 'Nao existe conta cadastrada com este email',
                    status: 404,
                });
            }

            const resetToken = crypto.randomBytes(32).toString('hex');
            await UserModel.setResetToken(email.toLowerCase(), resetToken, 3600000);

            // Responde imediatamente — envio do email roda em background.
            // SMTP pode levar varios segundos; nao vale travar a UI por isso.
            res.status(200).json({
                message: 'Link de recuperacao enviado para seu email',
            });

            emailService.sendPasswordResetEmail(user, resetToken).catch(() => {});
        } catch (err) {
            next(err);
        }
    },

    async verifyResetToken(req, res, next) {
        try {
            const { token } = req.params;

            if (!token) {
                return res.status(400).json({
                    error: 'Token nao fornecido',
                    status: 400,
                });
            }

            const user = await UserModel.findByResetToken(token);
            if (!user) {
                return res.status(400).json({
                    error: 'Token invalido ou expirado',
                    status: 400,
                });
            }

            res.status(200).json({
                valid: true,
                email: user.email,
            });
        } catch (err) {
            next(err);
        }
    },

    async resetPassword(req, res, next) {
        try {
            const { token, password } = req.body;

            if (!token || !password) {
                return res.status(400).json({
                    error: 'Token e nova senha sao obrigatorios',
                    status: 400,
                });
            }

            const passwordError = validators.getPasswordStrengthError(password);
            if (passwordError) {
                return res.status(400).json({
                    error: passwordError,
                    status: 400,
                });
            }

            const user = await UserModel.findByResetToken(token);
            if (!user) {
                return res.status(400).json({
                    error: 'Token invalido ou expirado',
                    status: 400,
                });
            }

            const hash = await bcrypt.hash(password, 10);
            await UserModel.update(user.id, { password: hash });
            await UserModel.clearResetToken(user.id);

            res.status(200).json({
                message: 'Senha alterada com sucesso',
            });
        } catch (err) {
            next(err);
        }
    },
};

module.exports = AuthController;
