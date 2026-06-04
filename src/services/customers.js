const db = require('../db/masim');

function clean(value) {
  return value === undefined || value === null ? null : String(value).trim() || null;
}

function normalizeCustomer(body = {}) {
  const name = clean(body.name || body.business_name || body.full_name);
  if (!name) throw Object.assign(new Error('Nombre de cliente requerido'), { status: 400 });
  if (!clean(body.phone) && !clean(body.whatsapp)) throw Object.assign(new Error('Telefono o WhatsApp requerido'), { status: 400 });
  return {
    name,
    customerType: ['empresa', 'particular'].includes(body.customer_type) ? body.customer_type : 'particular',
    contactName: clean(body.contact_name),
    phone: clean(body.phone),
    whatsapp: clean(body.whatsapp),
    email: clean(body.email),
    address: clean(body.address),
    rfc: clean(body.rfc),
    postalCode: clean(body.postal_code),
    taxRegime: clean(body.tax_regime),
    cfdiUse: clean(body.cfdi_use),
    notes: clean(body.notes)
  };
}

function insertCustomer(body) {
  const customer = normalizeCustomer(body);
  const result = db.prepare(`
    INSERT INTO customers (name, customer_type, contact_name, phone, whatsapp, email, address, rfc, postal_code, tax_regime, cfdi_use, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    customer.name,
    customer.customerType,
    customer.contactName,
    customer.phone,
    customer.whatsapp,
    customer.email,
    customer.address,
    customer.rfc,
    customer.postalCode,
    customer.taxRegime,
    customer.cfdiUse,
    customer.notes
  );
  return result.lastInsertRowid;
}

function updateCustomer(id, body) {
  const customer = normalizeCustomer(body);
  db.prepare(`
    UPDATE customers
    SET name = ?, customer_type = ?, contact_name = ?, phone = ?, whatsapp = ?, email = ?,
        address = ?, rfc = ?, postal_code = ?, tax_regime = ?, cfdi_use = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    customer.name,
    customer.customerType,
    customer.contactName,
    customer.phone,
    customer.whatsapp,
    customer.email,
    customer.address,
    customer.rfc,
    customer.postalCode,
    customer.taxRegime,
    customer.cfdiUse,
    customer.notes,
    id
  );
}

module.exports = { insertCustomer, updateCustomer, normalizeCustomer };
