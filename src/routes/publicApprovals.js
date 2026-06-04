const express = require('express');
const db = require('../db/masim');
const { getWorkOrderDocument, getSupplementDocument, buildQuotePdf, streamPdf } = require('../services/documents');

const router = express.Router();

function getToken(token) {
  return db.prepare('SELECT * FROM public_approval_tokens WHERE token = ?').get(token);
}

function tokenExpired(row) {
  return row.expires_at && new Date(String(row.expires_at).replace(' ', 'T')) < new Date();
}

function tokenAllows(row, quoteType, quoteId) {
  if (row.target_type === quoteType && Number(row.target_id) === Number(quoteId)) return true;
  if (row.target_type !== 'work_order' || quoteType !== 'supplement') return false;
  const supplement = db.prepare('SELECT work_order_id FROM work_order_supplements WHERE id = ?').get(quoteId);
  return Number(supplement?.work_order_id) === Number(row.target_id);
}

function payload(row) {
  const workOrderId = row.target_type === 'work_order'
    ? row.target_id
    : db.prepare('SELECT work_order_id FROM work_order_supplements WHERE id = ?').get(row.target_id)?.work_order_id;
  const order = db.prepare(`
    SELECT wo.*, c.name AS customer_name, v.make, v.model, v.year, v.plates
    FROM work_orders wo JOIN customers c ON c.id = wo.customer_id JOIN vehicles v ON v.id = wo.vehicle_id
    WHERE wo.id = ?
  `).get(workOrderId);
  if (!order) return null;
  const mainItems = db.prepare('SELECT description, type, quantity, applied_price, notes FROM order_items WHERE work_order_id = ?').all(order.id);
  const supplements = db.prepare('SELECT * FROM work_order_supplements WHERE work_order_id = ? ORDER BY id').all(order.id).map((supplement) => ({
    quoteType: 'supplement',
    id: supplement.id,
    can_decide: tokenAllows(row, 'supplement', supplement.id),
    can_pdf: tokenAllows(row, 'supplement', supplement.id),
    folio: supplement.folio_adicional,
    status: supplement.status,
    description: supplement.description,
    subtotal: supplement.subtotal,
    tax: supplement.tax,
    total: supplement.total,
    rejection_note: supplement.rejection_note,
    items: db.prepare('SELECT description, type, quantity, applied_price, notes FROM work_order_supplement_items WHERE supplement_id = ?').all(supplement.id)
  }));
  return {
    token: row.token,
    status: row.status,
    targetType: row.target_type,
    order,
    quotes: [
      {
        quoteType: 'work_order',
        id: order.id,
        can_decide: tokenAllows(row, 'work_order', order.id),
        can_pdf: tokenAllows(row, 'work_order', order.id),
        folio: order.folio,
        status: order.status,
        description: 'Cotizacion principal',
        subtotal: order.subtotal,
        tax: order.tax,
        total: order.total,
        rejection_note: order.rejection_note,
        items: mainItems
      },
      ...supplements
    ]
  };
}

router.get('/:token/pdf', (req, res) => {
  const row = getToken(req.params.token);
  if (!row) return res.status(404).json({ error: 'Token no encontrado' });
  if (tokenExpired(row)) return res.status(400).json({ error: 'Token expirado' });
  const quoteType = req.query.quote_type || row.target_type;
  const quoteId = req.query.quote_id || row.target_id;
  if (!tokenAllows(row, quoteType, quoteId)) return res.status(403).json({ error: 'Documento no autorizado para este token' });
  const document = quoteType === 'work_order'
    ? getWorkOrderDocument(quoteId)
    : getSupplementDocument(quoteId);
  if (!document) return res.status(404).json({ error: 'Documento no encontrado' });
  const folio = quoteType === 'work_order' ? document.folio : document.folio_adicional;
  const title = quoteType === 'work_order' ? 'Cotizacion de servicio' : 'Cotizacion adicional';
  streamPdf(res, `${folio}-cotizacion.pdf`, buildQuotePdf(document, { title, folio }));
});

router.get('/:token', (req, res) => {
  const row = getToken(req.params.token);
  if (!row) return res.status(404).json({ error: 'Token no encontrado' });
  if (tokenExpired(row)) return res.status(400).json({ error: 'Token expirado' });
  const data = payload(row);
  if (!data) return res.status(404).json({ error: 'Orden no encontrada' });
  res.json(data);
});

router.post('/:token/decision', (req, res) => {
  const row = getToken(req.params.token);
  if (!row) return res.status(404).json({ error: 'Token no encontrado' });
  if (tokenExpired(row)) return res.status(400).json({ error: 'Token expirado' });
  if (row.status !== 'pendiente') return res.status(400).json({ error: 'Token no disponible' });
  const approved = req.body.decision === 'aprobar';
  const rejected = req.body.decision === 'rechazar';
  if (!approved && !rejected) return res.status(400).json({ error: 'Decision invalida' });
  const rejectionNote = rejected ? String(req.body.note || '').trim() : null;
  const quoteType = req.body.quote_type || row.target_type;
  const quoteId = Number(req.body.quote_id || row.target_id);
  if (!tokenAllows(row, quoteType, quoteId)) return res.status(403).json({ error: 'Documento no autorizado para este token' });

  if (quoteType === 'work_order') {
    const order = db.prepare('SELECT * FROM work_orders WHERE id = ?').get(quoteId);
    if (!order || order.status !== 'esperando_aprobacion') return res.status(400).json({ error: 'Documento no disponible para decision' });
    db.prepare('UPDATE work_orders SET status = ?, approved_at = CASE WHEN ? THEN CURRENT_TIMESTAMP ELSE approved_at END, rejection_note = CASE WHEN ? THEN ? ELSE rejection_note END, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(approved ? 'ot_activa' : 'cotizacion_borrador', approved ? 1 : 0, rejected ? 1 : 0, rejectionNote, order.id);
    db.prepare('INSERT INTO work_order_status_history (work_order_id, from_status, to_status, note) VALUES (?, ?, ?, ?)')
      .run(order.id, order.status, approved ? 'ot_activa' : 'cotizacion_borrador', approved ? 'Aprobacion publica' : `Rechazo publico${rejectionNote ? ': ' + rejectionNote : ''}`);
  } else {
    const supplement = db.prepare('SELECT * FROM work_order_supplements WHERE id = ?').get(quoteId);
    if (!supplement || supplement.status !== 'esperando_aprobacion') return res.status(400).json({ error: 'Documento no disponible para decision' });
    const status = approved ? 'aprobado' : 'rechazado';
    db.prepare('UPDATE work_order_supplements SET status = ?, approved_at = CASE WHEN ? THEN CURRENT_TIMESTAMP ELSE approved_at END, rejected_at = CASE WHEN ? THEN CURRENT_TIMESTAMP ELSE rejected_at END, rejection_note = CASE WHEN ? THEN ? ELSE rejection_note END, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(status, approved ? 1 : 0, rejected ? 1 : 0, rejected ? 1 : 0, rejectionNote, quoteId);
  }

  db.prepare('UPDATE public_approval_tokens SET status = ?, decision_ip = ?, rejection_note = ?, decided_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run(approved ? 'aprobado' : 'rechazado', req.ip, rejectionNote, row.id);
  res.json({ ok: true, decision: req.body.decision, quote_type: quoteType, quote_id: quoteId });
});

module.exports = router;
