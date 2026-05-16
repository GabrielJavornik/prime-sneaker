const ORDER_STATUS = Object.freeze({
    WAITING_PAYMENT: 'aguardando_pagamento',
    PROCESSING: 'processando',
    SHIPPED: 'enviado',
    DELIVERED: 'entregue',
    CANCELED: 'cancelado',
});

const LEGACY_PENDING_STATUS = 'pendente';
const ORDER_STATUS_VALUES = Object.freeze(Object.values(ORDER_STATUS));
const ORDER_STATUS_LABELS = Object.freeze({
    [ORDER_STATUS.WAITING_PAYMENT]: 'Aguardando Pagamento',
    [ORDER_STATUS.PROCESSING]: 'Processando',
    [ORDER_STATUS.SHIPPED]: 'Enviado',
    [ORDER_STATUS.DELIVERED]: 'Entregue',
    [ORDER_STATUS.CANCELED]: 'Cancelado',
});
const ORDER_STATUS_LEGACY_ALIASES = Object.freeze({
    [LEGACY_PENDING_STATUS]: ORDER_STATUS.WAITING_PAYMENT,
});

function normalizeOrderStatus(status) {
    if (typeof status !== 'string') return status;

    const normalized = status.trim().toLowerCase();
    return ORDER_STATUS_LEGACY_ALIASES[normalized] || normalized;
}

function isValidOrderStatus(status) {
    return ORDER_STATUS_VALUES.includes(normalizeOrderStatus(status));
}

function getOrderStatusLabel(status) {
    const normalizedStatus = normalizeOrderStatus(status);
    return ORDER_STATUS_LABELS[normalizedStatus] || normalizedStatus || '';
}

module.exports = {
    ORDER_STATUS,
    ORDER_STATUS_VALUES,
    ORDER_STATUS_LABELS,
    ORDER_STATUS_LEGACY_ALIASES,
    LEGACY_PENDING_STATUS,
    normalizeOrderStatus,
    isValidOrderStatus,
    getOrderStatusLabel,
};
