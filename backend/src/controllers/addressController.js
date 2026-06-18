const AddressModel = require('../models/addressModel');

const AddressController = {
    async getAddresses(req, res, next) {
        try {
            const addresses = await AddressModel.findByUserId(req.user.id);
            res.status(200).json(addresses);
        } catch (err) {
            next(err);
        }
    },

    async createAddress(req, res, next) {
        try {
            const { cep, street, number, complement, neighborhood, city, state, country, type, isDefault } = req.body;

            if (!cep || !street || !number || !city || !state) {
                return res.status(400).json({
                    error: 'CEP, rua, número, cidade e estado são obrigatórios',
                    status: 400,
                });
            }

            const address = await AddressModel.create(req.user.id, {
                cep,
                street,
                number,
                complement,
                neighborhood,
                city,
                state,
                country,
                type,
                isDefault: !!isDefault,
            });

            if (isDefault) {
                await AddressModel.setDefault(address.id, req.user.id);
            }

            res.status(201).json(address);
        } catch (err) {
            next(err);
        }
    },

    async updateAddress(req, res, next) {
        try {
            const { id } = req.params;
            const { cep, street, number, complement, neighborhood, city, state, country, type, isDefault } = req.body;

            const address = await AddressModel.findById(id, req.user.id);
            if (!address) {
                return res.status(404).json({ error: 'Endereço não encontrado', status: 404 });
            }

            const updated = await AddressModel.update(id, req.user.id, {
                cep,
                street,
                number,
                complement,
                neighborhood,
                city,
                state,
                country,
                type,
                isDefault,
            });

            if (isDefault) {
                await AddressModel.setDefault(id, req.user.id);
            }

            res.status(200).json(updated);
        } catch (err) {
            next(err);
        }
    },

    async deleteAddress(req, res, next) {
        try {
            const { id } = req.params;

            const address = await AddressModel.findById(id, req.user.id);
            if (!address) {
                return res.status(404).json({ error: 'Endereço não encontrado', status: 404 });
            }

            await AddressModel.delete(id, req.user.id);
            res.status(200).json({ message: 'Endereço removido com sucesso' });
        } catch (err) {
            next(err);
        }
    },

    async setDefaultAddress(req, res, next) {
        try {
            const { id } = req.params;

            const address = await AddressModel.findById(id, req.user.id);
            if (!address) {
                return res.status(404).json({ error: 'Endereço não encontrado', status: 404 });
            }

            await AddressModel.setDefault(id, req.user.id);
            res.status(200).json({ message: 'Endereço definido como padrão' });
        } catch (err) {
            next(err);
        }
    },
};

module.exports = AddressController;
