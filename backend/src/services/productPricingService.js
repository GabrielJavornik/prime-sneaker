function getProductDiscountPercent(product) {
    const discount = Number(product?.discount_percent || product?.outlet_discount_percent || 0);
    if (!Number.isFinite(discount)) return 0;
    return Math.max(0, Math.min(99, discount));
}

function getProductSalePrice(product) {
    const price = Number(product?.price || 0);
    const discount = getProductDiscountPercent(product);

    if (discount <= 0) return Number(price.toFixed(2));

    return Number((price * (1 - discount / 100)).toFixed(2));
}

module.exports = {
    getProductDiscountPercent,
    getProductSalePrice,
};
