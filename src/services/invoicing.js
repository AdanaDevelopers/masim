const db = require('../db/masim');
const PRODUCT_CODE = '78181500';
const UNIT_CODE = 'E48';
const UNIT = 'Unidad de servicio';
const TAX_OBJECT = '02';

function round(value) {
  return Number(Number(value || 0).toFixed(2));
}

function requireValue(value, message) {
  if (value === undefined || value === null || String(value).trim() === '') {
    const error = new Error(message);
    error.status = 400;
    throw error;
  }
  return String(value).trim();
}

function normalizeRfc(value) {
  return String(value || '').trim().toUpperCase();
}

function nextInvoiceFolio() {
  const next = db.prepare('SELECT COALESCE(MAX(id), 0) + 1 AS next FROM invoices').get().next;
  return `FAC-${String(next).padStart(6, '0')}`;
}

function getClosedOrderDocument(id) {
  const order = db.prepare(`
    SELECT wo.*, c.name AS customer_name, c.name,
      c.customer_type, c.contact_name, c.phone, c.whatsapp, c.email, c.rfc,
      c.postal_code, c.tax_regime, c.cfdi_use,
      v.vin, v.make, v.model, v.year, v.trim, v.plates, v.mileage, v.economic_number
    FROM work_orders wo
    JOIN customers c ON c.id = wo.customer_id
    JOIN vehicles v ON v.id = wo.vehicle_id
    WHERE wo.id = ?
  `).get(id);
  if (!order) return null;
  order.items = db.prepare('SELECT * FROM order_items WHERE work_order_id = ? ORDER BY id').all(id);
  order.supplements = db.prepare('SELECT * FROM work_order_supplements WHERE work_order_id = ? ORDER BY id').all(id);
  order.supplements.forEach((supplement) => {
    supplement.items = db.prepare('SELECT * FROM work_order_supplement_items WHERE supplement_id = ? ORDER BY id').all(supplement.id);
  });
  order.payments = db.prepare('SELECT * FROM payments WHERE work_order_id = ? ORDER BY id').all(id);
  return order;
}

function receiptItems(order) {
  const items = [...(order.items || [])];
  (order.supplements || [])
    .filter((supplement) => supplement.status === 'aprobado')
    .forEach((supplement) => items.push(...(supplement.items || [])));
  return items;
}

function receiptTotals(order, items) {
  const subtotal = round(items.reduce((sum, item) => sum + (Number(item.quantity || 0) * Number(item.applied_price || 0)), 0));
  const approvedSupplements = (order.supplements || []).filter((supplement) => supplement.status === 'aprobado');
  const discountAmount = round(order.discount_amount || 0);
  const tax = round(Number(order.tax || 0) + approvedSupplements.reduce((sum, supplement) => sum + Number(supplement.tax || 0), 0));
  const total = round(Number(order.total || 0) + approvedSupplements.reduce((sum, supplement) => sum + Number(supplement.total || 0), 0));
  return { subtotal, discountAmount, taxableSubtotal: round(subtotal - discountAmount), tax, total };
}

function paymentForm(method) {
  return {
    efectivo: '01',
    tarjeta: '04',
    transferencia: '03'
  }[method] || process.env.FACTURAMA_DEFAULT_PAYMENT_FORM || '03';
}

function buildDescription(order, items) {
  const itemLines = items.map((item) => {
    const qty = Number(item.quantity || 0);
    const formattedQty = Number.isInteger(qty) ? String(qty) : String(qty.toFixed(2));
    const notes = item.notes ? ` (${item.notes})` : '';
    return `${formattedQty} ${item.description}${notes}`;
  });
  const vehicle = [order.year, order.make, order.model, order.trim].filter(Boolean).join(' ') || 'Vehiculo sin datos';
  const vehicleData = [
    `Vehiculo: ${vehicle}`,
    order.plates ? `Placas: ${order.plates}` : null,
    order.vin ? `VIN/NIV: ${order.vin}` : null,
    order.mileage ? `KM: ${Number(order.mileage).toLocaleString('es-MX')}` : null,
    order.economic_number ? `Economico: ${order.economic_number}` : null
  ].filter(Boolean).join('; ');
  const customerData = [
    `Cliente: ${order.customer_name}`,
    `RFC: ${order.rfc}`,
    order.phone || order.whatsapp ? `Contacto: ${order.phone || order.whatsapp}` : null
  ].filter(Boolean).join('; ');
  const description = [`Orden ${order.folio}`, `Servicios: ${itemLines.join('; ')}`, vehicleData, customerData]
    .filter(Boolean)
    .join(' | ');
  return description.slice(0, 1000);
}

function validateReady(order, issuer, certificate) {
  if (!order) {
    const error = new Error('Orden no encontrada');
    error.status = 404;
    throw error;
  }
  if (order.status !== 'cerrada') {
    const error = new Error('Solo se pueden timbrar ordenes cerradas');
    error.status = 400;
    throw error;
  }
  if (!order.payments?.length) {
    const error = new Error('La orden no tiene pago registrado');
    error.status = 400;
    throw error;
  }
  requireValue(order.customer_name, 'El cliente requiere nombre fiscal');
  requireValue(order.rfc, 'El cliente requiere RFC');
  requireValue(order.postal_code, 'El cliente requiere codigo postal fiscal');
  requireValue(order.tax_regime, 'El cliente requiere regimen fiscal');
  requireValue(order.cfdi_use, 'El cliente requiere uso de CFDI');
  if (!issuer) {
    const error = new Error('Configura los datos fiscales del taller');
    error.status = 400;
    throw error;
  }
  requireValue(issuer.rfc, 'El taller requiere RFC');
  requireValue(issuer.legal_name, 'El taller requiere razon social');
  requireValue(issuer.fiscal_regime, 'El taller requiere regimen fiscal');
  requireValue(issuer.expedition_place, 'El taller requiere codigo postal de expedicion');
  if (!certificate || certificate.status !== 'activo' || normalizeRfc(certificate.rfc) !== normalizeRfc(issuer.rfc)) {
    const error = new Error('Carga un CSD activo para el RFC del taller');
    error.status = 400;
    throw error;
  }
}

function buildCfdiPayload(workOrderId) {
  const order = getClosedOrderDocument(workOrderId);
  const issuer = db.prepare('SELECT * FROM billing_issuer_settings WHERE id = 1').get();
  const certificate = issuer ? db.prepare("SELECT * FROM billing_certificates WHERE rfc = ? AND status = 'activo'").get(normalizeRfc(issuer.rfc)) : null;
  validateReady(order, issuer, certificate);

  const items = receiptItems(order);
  if (!items.length) {
    const error = new Error('La orden no tiene conceptos para facturar');
    error.status = 400;
    throw error;
  }
  const totals = receiptTotals(order, items);
  const latestPayment = order.payments[order.payments.length - 1];
  const internalFolio = nextInvoiceFolio();
  const serie = process.env.FACTURAMA_SERIE || 'FAC';
  const itemSubtotal = round(totals.subtotal);
  const taxBase = round(totals.taxableSubtotal);
  const discount = round(totals.discountAmount);
  const tax = round(totals.tax);
  const total = round(totals.total);

  const payload = {
    Serie: serie,
    Currency: order.currency || 'MXN',
    ExpeditionPlace: String(issuer.expedition_place).trim(),
    Exportation: '01',
    Folio: internalFolio,
    CfdiType: 'I',
    PaymentForm: paymentForm(latestPayment.method),
    PaymentMethod: process.env.FACTURAMA_DEFAULT_PAYMENT_METHOD || 'PUE',
    Issuer: {
      Rfc: normalizeRfc(issuer.rfc),
      Name: issuer.legal_name.trim(),
      FiscalRegime: String(issuer.fiscal_regime).trim()
    },
    Receiver: {
      Rfc: normalizeRfc(order.rfc),
      Name: String(order.customer_name).trim(),
      CfdiUse: String(order.cfdi_use).trim(),
      FiscalRegime: String(order.tax_regime).trim(),
      TaxZipCode: String(order.postal_code).trim()
    },
    Items: [{
      ProductCode: PRODUCT_CODE,
      IdentificationNumber: order.folio,
      Description: buildDescription(order, items),
      Unit,
      UnitCode: UNIT_CODE,
      UnitPrice: itemSubtotal,
      Quantity: 1,
      Subtotal: itemSubtotal,
      ...(discount > 0 ? { Discount: discount } : {}),
      TaxObject: TAX_OBJECT,
      Taxes: [{
        Total: tax,
        Name: 'IVA',
        Base: taxBase,
        Rate: 0.16,
        IsRetention: false
      }],
      Total: total
    }],
    Observations: `Factura generada desde recibo de orden ${order.folio}`,
    OrderNumber: order.folio
  };

  return { order, payload, internalFolio, serie, totals: { subtotal: itemSubtotal, tax, total, currency: order.currency || 'MXN' } };
}

function extractUuid(response) {
  return response?.Complement?.TaxStamp?.Uuid || response?.Complement?.TaxStamp?.UUID || response?.Uuid || null;
}

module.exports = { buildCfdiPayload, extractUuid, normalizeRfc };
