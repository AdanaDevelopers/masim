const express = require('express');
const db = require('../db/masim');
const auth = require('../middleware/auth');
const checkPermission = require('../middleware/permission');
const { logAction } = require('../services/audit');
const facturama = require('../services/facturama');
const { buildCfdiPayload, extractUuid, normalizeRfc } = require('../services/invoicing');

const router = express.Router();
router.use(auth);

function clean(value) {
  return value === undefined || value === null ? null : String(value).trim();
}

function requireField(body, field, label) {
  const value = clean(body[field]);
  if (!value) {
    const error = new Error(`${label} requerido`);
    error.status = 400;
    throw error;
  }
  return value;
}

function publicCertificate(row) {
  if (!row) return null;
  return {
    id: row.id,
    rfc: row.rfc,
    csd_expiration_date: row.csd_expiration_date,
    upload_date: row.upload_date,
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

function invoiceRow(id) {
  return db.prepare(`
    SELECT i.*, wo.folio AS work_order_folio, c.name AS customer_name,
      v.make, v.model, v.year, v.plates
    FROM invoices i
    JOIN work_orders wo ON wo.id = i.work_order_id
    JOIN customers c ON c.id = wo.customer_id
    JOIN vehicles v ON v.id = wo.vehicle_id
    WHERE i.id = ?
  `).get(id);
}

router.get('/issuer', checkPermission('billing', 'r'), (req, res) => {
  res.json(db.prepare('SELECT * FROM billing_issuer_settings WHERE id = 1').get() || null);
});

router.put('/issuer', checkPermission('billing', 'u'), (req, res, next) => {
  try {
    const body = req.body || {};
    const rfc = normalizeRfc(requireField(body, 'rfc', 'RFC'));
    const legalName = requireField(body, 'legal_name', 'Razon social');
    const fiscalRegime = requireField(body, 'fiscal_regime', 'Regimen fiscal');
    const expeditionPlace = requireField(body, 'expedition_place', 'Codigo postal de expedicion');
    if (!/^\d{5}$/.test(expeditionPlace)) return res.status(400).json({ error: 'Codigo postal de expedicion invalido' });

    db.prepare(`
      INSERT INTO billing_issuer_settings (id, rfc, legal_name, fiscal_regime, expedition_place)
      VALUES (1, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        rfc = excluded.rfc,
        legal_name = excluded.legal_name,
        fiscal_regime = excluded.fiscal_regime,
        expedition_place = excluded.expedition_place,
        updated_at = CURRENT_TIMESTAMP
    `).run(rfc, legalName, fiscalRegime, expeditionPlace);
    
    logAction(req.user.id, 'UPDATE', 'billing', `Datos fiscales del taller actualizados (RFC: ${rfc})`, req.ip);
    
    res.json(db.prepare('SELECT * FROM billing_issuer_settings WHERE id = 1').get());
  } catch (error) {
    next(error);
  }
});

router.get('/certificate', checkPermission('billing', 'r'), (req, res) => {
  const issuer = db.prepare('SELECT * FROM billing_issuer_settings WHERE id = 1').get();
  const certificate = issuer
    ? db.prepare('SELECT * FROM billing_certificates WHERE rfc = ?').get(normalizeRfc(issuer.rfc))
    : db.prepare("SELECT * FROM billing_certificates WHERE status = 'activo' ORDER BY id DESC").get();
  res.json(publicCertificate(certificate));
});

router.post('/certificate', checkPermission('billing', 'c'), async (req, res, next) => {
  try {
    const body = req.body || {};
    const rfc = normalizeRfc(requireField(body, 'rfc', 'RFC'));
    const payload = {
      Rfc: rfc,
      Certificate: requireField(body, 'certificate', 'Certificado'),
      PrivateKey: requireField(body, 'private_key', 'Llave privada'),
      PrivateKeyPassword: requireField(body, 'private_key_password', 'Contrasena de llave privada')
    };
    await facturama.uploadCsd(payload);
    let remote = null;
    try { remote = await facturama.getCsd(rfc); } catch (error) {}
    db.prepare(`
      INSERT INTO billing_certificates (rfc, csd_expiration_date, upload_date, status)
      VALUES (?, ?, ?, 'activo')
      ON CONFLICT(rfc) DO UPDATE SET
        csd_expiration_date = excluded.csd_expiration_date,
        upload_date = excluded.upload_date,
        status = 'activo',
        updated_at = CURRENT_TIMESTAMP
    `).run(rfc, remote?.CsdExpirationDate || null, remote?.UploadDate || new Date().toISOString());
    
    logAction(req.user.id, 'CREATE', 'billing', `Cargado certificado CSD para RFC: ${rfc}`, req.ip);
    
    res.status(201).json(publicCertificate(db.prepare('SELECT * FROM billing_certificates WHERE rfc = ?').get(rfc)));
  } catch (error) {
    next(error);
  }
});

router.put('/certificate', checkPermission('billing', 'u'), async (req, res, next) => {
  try {
    const body = req.body || {};
    const rfc = normalizeRfc(requireField(body, 'rfc', 'RFC'));
    const payload = {
      Rfc: rfc,
      Certificate: requireField(body, 'certificate', 'Certificado'),
      PrivateKey: requireField(body, 'private_key', 'Llave privada'),
      PrivateKeyPassword: requireField(body, 'private_key_password', 'Contrasena de llave privada')
    };
    await facturama.updateCsd(rfc, payload);
    let remote = null;
    try { remote = await facturama.getCsd(rfc); } catch (error) {}
    db.prepare(`
      INSERT INTO billing_certificates (rfc, csd_expiration_date, upload_date, status)
      VALUES (?, ?, ?, 'activo')
      ON CONFLICT(rfc) DO UPDATE SET
        csd_expiration_date = excluded.csd_expiration_date,
        upload_date = excluded.upload_date,
        status = 'activo',
        updated_at = CURRENT_TIMESTAMP
    `).run(rfc, remote?.CsdExpirationDate || null, remote?.UploadDate || new Date().toISOString());
    
    logAction(req.user.id, 'UPDATE', 'billing', `Actualizado certificado CSD para RFC: ${rfc}`, req.ip);
    
    res.json(publicCertificate(db.prepare('SELECT * FROM billing_certificates WHERE rfc = ?').get(rfc)));
  } catch (error) {
    next(error);
  }
});

router.delete('/certificate', checkPermission('billing', 'd'), async (req, res, next) => {
  try {
    const rfc = normalizeRfc(req.body?.rfc || req.query.rfc || db.prepare('SELECT rfc FROM billing_issuer_settings WHERE id = 1').get()?.rfc);
    if (!rfc) return res.status(400).json({ error: 'RFC requerido' });
    await facturama.deleteCsd(rfc);
    db.prepare("UPDATE billing_certificates SET status = 'eliminado', updated_at = CURRENT_TIMESTAMP WHERE rfc = ?").run(rfc);
    
    logAction(req.user.id, 'DELETE', 'billing', `Eliminado certificado CSD para RFC: ${rfc}`, req.ip);
    
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

router.get('/invoices', checkPermission('billing', 'r'), (req, res) => {
  res.json(db.prepare(`
    SELECT i.*, wo.folio AS work_order_folio, c.name AS customer_name,
      v.make, v.model, v.year, v.plates
    FROM invoices i
    JOIN work_orders wo ON wo.id = i.work_order_id
    JOIN customers c ON c.id = wo.customer_id
    JOIN vehicles v ON v.id = wo.vehicle_id
    ORDER BY i.id DESC
  `).all());
});

router.get('/invoices/:id', checkPermission('billing', 'r'), (req, res) => {
  const invoice = invoiceRow(req.params.id);
  if (!invoice) return res.status(404).json({ error: 'Factura no encontrada' });
  res.json(invoice);
});

router.get('/work-orders/:id/invoice', checkPermission('billing', 'r'), (req, res) => {
  const invoice = db.prepare("SELECT * FROM invoices WHERE work_order_id = ? AND status != 'cancelada' ORDER BY id DESC").get(req.params.id);
  res.json(invoice || null);
});

router.post('/work-orders/:id/invoice', checkPermission('billing', 'c'), async (req, res, next) => {
  try {
    const existing = db.prepare("SELECT * FROM invoices WHERE work_order_id = ? AND status != 'cancelada'").get(req.params.id);
    if (existing) return res.status(409).json({ error: 'La orden ya tiene una factura timbrada', invoice: existing });

    const built = buildCfdiPayload(req.params.id);
    const response = await facturama.createCfdi(built.payload);
    const result = db.prepare(`
      INSERT INTO invoices (work_order_id, internal_folio, facturama_id, uuid, status, serie, subtotal, tax, total, currency, request_json, response_json, created_by)
      VALUES (?, ?, ?, ?, 'timbrada', ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      built.order.id,
      built.internalFolio,
      response?.Id || null,
      extractUuid(response),
      built.serie,
      built.totals.subtotal,
      built.totals.tax,
      built.totals.total,
      built.totals.currency,
      JSON.stringify(built.payload),
      JSON.stringify(response),
      req.user.id
    );
    
    logAction(req.user.id, 'CREATE', 'billing', `Factura timbrada Folio: ${built.internalFolio} para orden Folio: ${built.order.folio} (UUID: ${extractUuid(response)})`, req.ip);
    
    res.status(201).json(invoiceRow(result.lastInsertRowid));
  } catch (error) {
    next(error);
  }
});

async function downloadInvoiceFile(req, res, format) {
  const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(req.params.id);
  if (!invoice) return res.status(404).json({ error: 'Factura no encontrada' });
  if (!invoice.facturama_id) return res.status(400).json({ error: 'La factura no tiene ID de Facturama' });
  const file = await facturama.downloadCfdi(format, invoice.facturama_id);
  const content = file?.Content;
  if (!content) return res.status(502).json({ error: 'Facturama no devolvio el archivo' });
  const buffer = Buffer.from(content, 'base64');
  const contentType = format === 'pdf' ? 'application/pdf' : 'application/xml';
  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${invoice.internal_folio}.${format}"`);
  res.send(buffer);
}

router.get('/invoices/:id/pdf', checkPermission('billing', 'r'), (req, res, next) => {
  downloadInvoiceFile(req, res, 'pdf').catch(next);
});

router.get('/invoices/:id/xml', checkPermission('billing', 'r'), (req, res, next) => {
  downloadInvoiceFile(req, res, 'xml').catch(next);
});

module.exports = router;
