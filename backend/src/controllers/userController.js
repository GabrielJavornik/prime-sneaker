const bcrypt = require('bcryptjs');
const UserModel = require('../models/userModel');
const validators = require('../utils/validators');
const { logAdminAction } = require('../services/auditService');

const UserController = {
    async adminSession(req, res, next) {
        try {
            const user = await UserModel.findById(req.user.id);

            if (!user) {
                return res.status(404).json({ error: 'Usuario nao encontrado', status: 404 });
            }

            if (!user.is_admin) {
                return res.status(403).json({ error: 'Acesso restrito a administradores', status: 403 });
            }

            res.status(200).json(user);
        } catch (err) {
            next(err);
        }
    },

    async updateProfile(req, res, next) {
        try {
            const userId = req.user.id;
            const { name, email, phone, cpf, cep, address, currentPassword, newPassword } = req.body;

            const user = await UserModel.findById(userId);
            if (!user) {
                return res.status(404).json({ error: 'Usuario nao encontrado', status: 404 });
            }

            if (name && !validators.isValidName(name)) {
                return res.status(400).json({
                    error: 'Nome invalido: deve ter entre 3 e 100 caracteres',
                    status: 400,
                });
            }

            if (email && !validators.isValidEmail(email)) {
                return res.status(400).json({
                    error: 'Email invalido',
                    status: 400,
                });
            }

            if (email && email !== user.email) {
                const existing = await UserModel.findByEmail(email.toLowerCase());
                if (existing) {
                    return res.status(400).json({
                        error: 'Email ja cadastrado',
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

            if (newPassword) {
                const authUser = await UserModel.findAuthById(userId);
                if (!authUser || !authUser.password) {
                    return res.status(404).json({ error: 'Usuario nao encontrado', status: 404 });
                }

                if (!currentPassword) {
                    return res.status(400).json({
                        error: 'Senha atual obrigatoria para mudar senha',
                        status: 400,
                    });
                }

                const passwordOk = await bcrypt.compare(currentPassword, authUser.password);
                if (!passwordOk) {
                    return res.status(401).json({
                        error: 'Senha atual incorreta',
                        status: 401,
                    });
                }

                const passwordError = validators.getPasswordStrengthError(newPassword);
                if (passwordError) {
                    return res.status(400).json({
                        error: passwordError,
                        status: 400,
                    });
                }
            }

            const updateData = {};
            if (name) updateData.name = name.trim();
            if (email) updateData.email = email.toLowerCase();
            if (phone) updateData.phone = phone;
            if (cpf) updateData.cpf = cpf;
            if (cep) updateData.cep = cep;
            if (address) updateData.address = address;
            if (newPassword) {
                updateData.password = await bcrypt.hash(newPassword, 10);
            }

            const updated = await UserModel.update(userId, updateData);

            res.status(200).json({
                message: 'Perfil atualizado com sucesso',
                user: updated,
            });
        } catch (err) {
            next(err);
        }
    },

    async getProfile(req, res, next) {
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

    async listAdmins(req, res, next) {
        try {
            if (!req.user.isAdmin) {
                return res.status(403).json({ error: 'Nao autorizado', status: 403 });
            }
            const users = await UserModel.findAdmins();
            res.status(200).json(users);
        } catch (err) {
            next(err);
        }
    },

    async createAdmin(req, res, next) {
        try {
            if (!(req.user.isSuperAdmin || req.user.is_super_admin)) {
                return res.status(403).json({ error: 'Nao autorizado', status: 403 });
            }

            const { name, email, password, role, isSuperAdmin, is_super_admin } = req.body;
            const normalizedName = String(name || '').trim();
            const normalizedEmail = String(email || '').trim().toLowerCase();

            if (!validators.isValidName(normalizedName)) {
                return res.status(400).json({
                    error: 'Nome invalido: deve ter entre 3 e 100 caracteres',
                    status: 400,
                });
            }

            if (!validators.isValidEmail(normalizedEmail)) {
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

            const hash = await bcrypt.hash(password, 10);
            const shouldCreateSuperAdmin = role === 'superadmin' || isSuperAdmin === true || is_super_admin === true;

            const promoteExistingUser = async (existingUser) => {
                const promotedAdmin = await UserModel.promoteToAdmin(existingUser.id, {
                    name: normalizedName,
                    password: hash,
                    isSuperAdmin: shouldCreateSuperAdmin,
                });

                await logAdminAction(req, {
                    action: 'admin.create',
                    entityType: 'user',
                    entityId: promotedAdmin.id,
                    details: {
                        name: promotedAdmin.name,
                        email: promotedAdmin.email,
                        role: promotedAdmin.is_super_admin ? 'superadmin' : 'admin',
                        promoted: true,
                    },
                });

                return res.status(200).json({
                    ...promotedAdmin,
                    message: existingUser.is_admin ? 'Administrador atualizado' : 'Conta promovida para administrador',
                    promoted: !existingUser.is_admin,
                });
            };

            const existing = await UserModel.findByEmail(normalizedEmail);

            if (existing) {
                return promoteExistingUser(existing);
            }

            let newAdmin;
            try {
                newAdmin = await UserModel.create({
                    name: normalizedName,
                    email: normalizedEmail,
                    password: hash,
                    isAdmin: true,
                    isSuperAdmin: shouldCreateSuperAdmin,
                });
            } catch (err) {
                if (err.code === '23505') {
                    const duplicatedUser = await UserModel.findByEmail(normalizedEmail);
                    if (duplicatedUser) {
                        return promoteExistingUser(duplicatedUser);
                    }
                }
                throw err;
            }

            await logAdminAction(req, {
                action: 'admin.create',
                entityType: 'user',
                entityId: newAdmin.id,
                details: {
                    name: newAdmin.name,
                    email: newAdmin.email,
                    role: shouldCreateSuperAdmin ? 'superadmin' : 'admin',
                },
            });

            res.status(201).json(newAdmin);
        } catch (err) {
            next(err);
        }
    },

    async updateAdmin(req, res, next) {
        try {
            if (!(req.user.isSuperAdmin || req.user.is_super_admin)) {
                return res.status(403).json({ error: 'Nao autorizado', status: 403 });
            }

            const adminId = parseInt(req.params.id, 10);
            if (!Number.isInteger(adminId) || adminId < 1) {
                return res.status(400).json({ error: 'ID invalido', status: 400 });
            }

            const admin = await UserModel.findById(adminId);
            if (!admin || !admin.is_admin) {
                return res.status(404).json({ error: 'Administrador nao encontrado', status: 404 });
            }

            const { name, email, password, role, isSuperAdmin, is_super_admin } = req.body;
            const normalizedName = String(name || '').trim();
            const normalizedEmail = String(email || '').trim().toLowerCase();
            const shouldBeSuperAdmin = role === 'superadmin' || isSuperAdmin === true || is_super_admin === true;

            if (!['admin', 'superadmin'].includes(role)) {
                return res.status(400).json({ error: 'Tipo de acesso invalido', status: 400 });
            }

            if (!validators.isValidName(normalizedName)) {
                return res.status(400).json({
                    error: 'Nome invalido: deve ter entre 3 e 100 caracteres',
                    status: 400,
                });
            }

            if (!validators.isValidEmail(normalizedEmail)) {
                return res.status(400).json({ error: 'Email invalido', status: 400 });
            }

            if (adminId === Number(req.user.id) && !shouldBeSuperAdmin) {
                return res.status(400).json({
                    error: 'Voce nao pode remover seu proprio acesso de superadmin',
                    status: 400,
                });
            }

            const emailOwner = await UserModel.findByEmail(normalizedEmail);
            if (emailOwner && Number(emailOwner.id) !== adminId) {
                return res.status(409).json({ error: 'Email ja cadastrado', status: 409 });
            }

            let passwordHash;
            if (password) {
                const passwordError = validators.getPasswordStrengthError(password);
                if (passwordError) {
                    return res.status(400).json({ error: passwordError, status: 400 });
                }
                passwordHash = await bcrypt.hash(password, 10);
            }

            const updatedAdmin = await UserModel.updateAdmin(adminId, {
                name: normalizedName,
                email: normalizedEmail,
                password: passwordHash,
                isSuperAdmin: shouldBeSuperAdmin,
            });

            await logAdminAction(req, {
                action: 'admin.update',
                entityType: 'user',
                entityId: adminId,
                details: {
                    previous: {
                        name: admin.name,
                        email: admin.email,
                        role: admin.is_super_admin ? 'superadmin' : 'admin',
                    },
                    current: {
                        name: updatedAdmin.name,
                        email: updatedAdmin.email,
                        role: updatedAdmin.is_super_admin ? 'superadmin' : 'admin',
                    },
                    passwordChanged: Boolean(passwordHash),
                },
            });

            return res.status(200).json({
                message: 'Administrador atualizado com sucesso',
                user: updatedAdmin,
            });
        } catch (err) {
            next(err);
        }
    },

    async deleteAdmin(req, res, next) {
        try {
            if (!(req.user.isSuperAdmin || req.user.is_super_admin)) {
                return res.status(403).json({ error: 'Nao autorizado', status: 403 });
            }

            const adminId = parseInt(req.params.id);
            if (!Number.isInteger(adminId) || adminId < 1) {
                return res.status(400).json({ error: 'ID invalido', status: 400 });
            }

            const admin = await UserModel.findById(adminId);
            if (!admin) {
                return res.status(404).json({ error: 'Administrador nao encontrado', status: 404 });
            }

            if (!admin.is_admin) {
                return res.status(400).json({ error: 'Esse usuario nao e admin', status: 400 });
            }

            // Impedir que delete a si mesmo
            if (admin.id === req.user.id) {
                return res.status(400).json({ error: 'Voce nao pode deletar a si mesmo', status: 400 });
            }

            if (admin.is_super_admin) {
                return res.status(400).json({ error: 'Nao e permitido remover um superadmin pelo painel', status: 400 });
            }

            await UserModel.delete(adminId);
            await logAdminAction(req, {
                action: 'admin.delete',
                entityType: 'user',
                entityId: adminId,
                details: {
                    name: admin.name,
                    email: admin.email,
                },
            });
            res.status(200).json({ message: 'Administrador removido', id: adminId });
        } catch (err) {
            next(err);
        }
    },
};

module.exports = UserController;
