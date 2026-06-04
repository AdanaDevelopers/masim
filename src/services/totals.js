const TAX_RATE = Number(process.env.TAX_RATE || 0.16);
const CURRENCY = process.env.CURRENCY || 'MXN';

function calculateTotals(items, discount = {}) {
  const subtotal = items.reduce((sum, item) => {
    return sum + Number(item.quantity || 0) * Number(item.applied_price || 0);
  }, 0);
  const normalizedSubtotal = Math.max(0, Number(subtotal.toFixed(2)));
  const discountType = ['amount', 'percent'].includes(discount.discount_type) ? discount.discount_type : 'none';
  const discountValue = Math.max(0, Number(discount.discount_value || 0));
  const rawDiscount = discountType === 'percent'
    ? normalizedSubtotal * Math.min(discountValue, 100) / 100
    : (discountType === 'amount' ? discountValue : 0);
  const discountAmount = Number(Math.min(normalizedSubtotal, rawDiscount).toFixed(2));
  const taxableSubtotal = Number((normalizedSubtotal - discountAmount).toFixed(2));
  const tax = Number((taxableSubtotal * TAX_RATE).toFixed(2));
  const total = Number((taxableSubtotal + tax).toFixed(2));
  return { subtotal: normalizedSubtotal, discountAmount, taxableSubtotal, tax, total, taxRate: TAX_RATE, currency: CURRENCY };
}

function round(value) {
  return Number(Number(value || 0).toFixed(2));
}

function approvedSupplementsTotal(supplements = []) {
  return round(supplements
    .filter((supplement) => supplement.status === 'aprobado')
    .reduce((sum, supplement) => sum + Number(supplement.total || 0), 0));
}

function finalWorkOrderTotal(order, supplements = []) {
  return round(Number(order?.total || 0) + approvedSupplementsTotal(supplements));
}

module.exports = { calculateTotals, TAX_RATE, CURRENCY, approvedSupplementsTotal, finalWorkOrderTotal, round };
