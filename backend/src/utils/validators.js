const validators = {
    isValidEmail(email) {
        const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return regex.test(email);
    },

    getPasswordStrengthError(password) {
        const value = String(password || '');
        const normalized = value.toLowerCase();
        const digitsOnly = value.replace(/\D/g, '');
        const lettersOnly = normalized.replace(/[^a-z]/g, '');
        const commonPasswords = new Set([
            '123456',
            '1234567',
            '12345678',
            '123456789',
            '1234567890',
            '111111',
            '000000',
            'qwerty',
            'qwerty123',
            'senha',
            'senha123',
            'password',
            'password123',
            'admin',
            'admin123',
            'prime123',
            'tenis123',
        ]);

        function hasSequential(text, sequence) {
            if (text.length < 6) return false;
            return sequence.includes(text) || sequence.split('').reverse().join('').includes(text);
        }

        if (value.length < 8) {
            return 'Senha fraca. Use no minimo 8 caracteres, com letras e numeros.';
        }

        if (!/[a-zA-Z]/.test(value) || !/\d/.test(value)) {
            return 'Senha fraca. Use letras e numeros.';
        }

        if (/^(.)\1+$/.test(value)) {
            return 'Senha fraca. Evite repetir o mesmo caractere.';
        }

        if (commonPasswords.has(normalized)) {
            return 'Senha muito simples. Evite senhas obvias como 123456.';
        }

        if (hasSequential(digitsOnly, '0123456789') || hasSequential(lettersOnly, 'abcdefghijklmnopqrstuvwxyz')) {
            return 'Senha fraca. Evite sequencias como 123456 ou abcdef.';
        }

        return null;
    },

    isStrongPassword(password) {
        return this.getPasswordStrengthError(password) === null;
    },

    isValidCPF(cpf) {
        cpf = cpf.replace(/\D/g, '');
        if (cpf.length !== 11) return false;
        if (/^(\d)\1{10}$/.test(cpf)) return false;

        let sum = 0;
        for (let i = 0; i < 9; i++) {
            sum += parseInt(cpf[i]) * (10 - i);
        }
        let digit1 = 11 - (sum % 11);
        digit1 = digit1 > 9 ? 0 : digit1;

        sum = 0;
        for (let i = 0; i < 10; i++) {
            sum += parseInt(cpf[i]) * (11 - i);
        }
        let digit2 = 11 - (sum % 11);
        digit2 = digit2 > 9 ? 0 : digit2;

        return cpf[9] == digit1 && cpf[10] == digit2;
    },

    isValidPrice(price) {
        const num = Number(price);
        return !isNaN(num) && num > 0 && num <= 999999.99;
    },

    isValidDiscountPercent(discount) {
        const num = Number(discount || 0);
        return !isNaN(num) && num >= 0 && num <= 99;
    },

    isValidQuantity(qty) {
        const num = Number(qty);
        return Number.isInteger(num) && num > 0 && num <= 9999;
    },

    isValidName(name) {
        return typeof name === 'string' && name.trim().length >= 2 && name.trim().length <= 100;
    },

    isValidDescription(desc) {
        return typeof desc === 'string' && desc.trim().length <= 500;
    },

    isValidCategory(category) {
        const validCategories = ['casual', 'esportivo', 'formal', 'trekking'];
        return validCategories.includes(category.toLowerCase());
    },

    isValidBrand(brand) {
        return typeof brand === 'string' && brand.trim().length <= 80;
    },

    isValidGender(gender) {
        const validGenders = ['masculino', 'feminino', 'infantil', 'unissex'];
        return validGenders.includes(String(gender || '').toLowerCase());
    },

    isValidStock(stock) {
        const num = Number(stock);
        return Number.isInteger(num) && num >= 0 && num <= 9999;
    },

    isValidPageLimit(page, limit) {
        const p = Number(page);
        const l = Number(limit);
        return Number.isInteger(p) && p > 0 && Number.isInteger(l) && l > 0 && l <= 100;
    },
};

module.exports = validators;
