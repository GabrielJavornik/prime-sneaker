const QRCode = require('qrcode');

function getRequiredPixEnv(name) {
    const value = String(process.env[name] || '').trim();
    if (!value) {
        const error = new Error(`[CONFIG] ${name} precisa ser definido no .env para gerar Pix.`);
        error.status = 500;
        throw error;
    }
    return value;
}

function getPixConfig() {
    return {
        chave: getRequiredPixEnv('PIX_KEY'),
        nome: String(process.env.PIX_MERCHANT_NAME || 'PRIME SNEAKER').trim(),
        cidade: String(process.env.PIX_MERCHANT_CITY || 'ERECHIM').trim(),
    };
}

const pixService = {
    async generateQRCode(amount, options = {}) {
        try {
            const value = this.normalizeAmount(amount);
            const txid = this.normalizeTxId(options.txid || '***');
            const pixConfig = getPixConfig();
            const emvString = this.generateEMVString(value, {
                txid,
                description: options.description || '',
                pixConfig,
            });
            const qrCodeDataUrl = await QRCode.toDataURL(emvString, {
                errorCorrectionLevel: 'M',
                margin: 2,
                width: 320,
            });

            return {
                qrCode: qrCodeDataUrl,
                emvString,
                copiaECola: emvString,
                chave: pixConfig.chave,
                nome: pixConfig.nome,
                valor: value.toFixed(2),
                txid,
            };
        } catch (err) {
            console.error('Erro ao gerar QR Code PIX:', err);
            throw err.status ? err : new Error('Erro ao gerar QR Code PIX');
        }
    },

    normalizeAmount(amount) {
        const value = Number(amount);
        if (!Number.isFinite(value) || value <= 0) {
            throw new Error('Valor PIX invalido');
        }
        return Number(value.toFixed(2));
    },

    generateEMVString(amount, options = {}) {
        const pixConfig = options.pixConfig || getPixConfig();
        const fields = [
            this.encodeField('00', '01'),
            this.encodeField('01', '12'),
            this.createMerchantAccountInformation(pixConfig.chave, options.description),
            this.encodeField('52', '0000'),
            this.encodeField('53', '986'),
            this.createTransactionAmount(amount),
            this.encodeField('58', 'BR'),
            this.encodeField('59', this.normalizeText(pixConfig.nome, 25)),
            this.encodeField('60', this.normalizeText(pixConfig.cidade, 15)),
            this.createAdditionalDataField(options.txid || '***'),
        ];

        const payloadWithoutCrc = fields.join('') + '6304';
        return payloadWithoutCrc + this.calculateCRC16(payloadWithoutCrc);
    },

    createMerchantAccountInformation(chave, description = '') {
        const gui = this.encodeField('00', 'br.gov.bcb.pix');
        const pixKey = this.encodeField('01', chave);
        const pixDescription = description
            ? this.encodeField('02', this.normalizeText(description, 72))
            : '';

        return this.encodeField('26', gui + pixKey + pixDescription);
    },

    createAdditionalDataField(txid) {
        return this.encodeField('62', this.encodeField('05', this.normalizeTxId(txid)));
    },

    createTransactionAmount(amount) {
        return this.encodeField('54', this.normalizeAmount(amount).toFixed(2));
    },

    normalizeText(value, maxLength) {
        return String(value || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-zA-Z0-9 ]/g, '')
            .toUpperCase()
            .slice(0, maxLength);
    },

    normalizeTxId(txid) {
        const normalized = String(txid || '***')
            .replace(/[^a-zA-Z0-9*]/g, '')
            .slice(0, 25);
        return normalized || '***';
    },

    encodeField(tag, value) {
        const normalizedValue = String(value);
        const length = String(Buffer.byteLength(normalizedValue, 'utf8')).padStart(2, '0');
        return tag + length + normalizedValue;
    },

    calculateCRC16(payload) {
        let crc = 0xffff;
        const polynomial = 0x1021;

        for (let i = 0; i < payload.length; i++) {
            crc ^= payload.charCodeAt(i) << 8;

            for (let bit = 0; bit < 8; bit++) {
                crc = (crc & 0x8000)
                    ? ((crc << 1) ^ polynomial)
                    : (crc << 1);
                crc &= 0xffff;
            }
        }

        return crc.toString(16).toUpperCase().padStart(4, '0');
    },
};

module.exports = pixService;
