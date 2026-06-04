const crypto = require('crypto');
const express = require('express');
const db = require('../db/masim');
const auth = require('../middleware/auth');
const requireRole = require('../middleware/roles');
const { calculateTotals, TAX_RATE } = require('../services/totals');
const { assertNotClosed } = require('../services/workOrderState');

const router = express.Router();
router.use(auth);

function nextSupplementFolio(workOrderId) {
  const count = db.prepare('SELECT COUNT(*) AS count FROM work_order_supplements WHERE work_order_id = ?').get(workOrderId).count + 1;
  return `AD-${String(workOrderId).padStart(5, '0')}-${count}`;
}

function recalc(id) {
  const items = db.prepare('SELECT quantity, applied_price FROM work_order_supplement_items WHERE supplement_id = ?').all(id);
  const totals = calculateTotals(items);
  db.prepare('UPDATE work_order_supplements SET subtotal = ?, tax = ?, total = ?, tax_rate = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run(totals.subtotal, totals.tax, totals.total, totals.taxRate, id);
}

function fullSupplement(id) {
  const supplement = db.prepare('SELECT * FROM work_order_supplements WHERE id = ?').get(id);
  if (!supplement) return null;
  supplement.items = db.prepare('SELECT * FROM work_order_supplement_items WHERE supplement_id = ? ORDER BY id').all(id);
  return supplement;
}

router.get('/:id', (req, res) => {
  const supplement = fullSupplement(req.params.id);
  if (!supplement) return res.status(404).json({ error: 'Adicional no encontrado' });
  res.json(supplement);
});

router.post('/', (req, res) => {
  const order = db.prepare('SELECT * FROM work_orders WHERE id = ?').get(req.body.work_order_id);
  if (!order) return res.status(404).json({ error: 'Orden no encontrada' });
  assertNotClosed(order.status);
  if (!['ot_activa', 'trabajo_finalizado'].includes(order.status)) {
    return res.status(400).json({ error: 'Los adicionales solo aplican a OT activa o finalizada' });
  }
  const result = db.prepare(`
    INSERT INTO work_order_supplements (work_order_id, folio_adicional, status, description, tax_rate, created_by)
    VALUES (?, ?, 'borrador', ?, ?, ?)
  `).run(order.id, nextSupplementFolio(order.id), req.body.description || null, TAX_RATE, req.user.id);
  res.status(201).json(fullSupplement(result.lastInsertRowid));
});

router.post('/:id/items', requireRole('administrador'), (req, res) => {
  const supplement = db.prepare('SELECT * FROM work_order_supplements WHERE id = ?').get(req.params.id);
  if (!supplement) return res.status(404).json({ error: 'Adicional no encontrado' });
  if (supplement.status !== 'borrador') return res.status(400).json({ error: 'Solo adicional en borrador es editable' });
  const catalog = req.body.item_id ? db.prepare('SELECT * FROM catalog WHERE id = ?').get(req.body.item_id) : null;
  const description = (req.body.description || (catalog && catalog.description) || '').trim();
  const type = req.body.type || (catalog && catalog.type);
  const quantity = Number(req.body.quantity || 1);
  const appliedPrice = Number(req.body.applied_price ?? catalog?.public_price ?? 0);
  if (!description || !['mano_obra', 'refaccion'].includes(type)) return res.status(400).json({ error: 'Item invalido' });
  if (!Number.isFinite(quantity) || quantity <= 0) return res.status(400).json({ error: 'Cantidad invalida' });
  if (!Number.isFinite(appliedPrice) || appliedPrice < 0) return res.status(400).json({ error: 'Precio invalido' });
  db.prepare(`
    INSERT INTO work_order_supplement_items (supplement_id, item_id, description, type, quantity, applied_price, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(supplement.id, req.body.item_id || null, description, type, quantity, appliedPrice, req.body.notes || null);
  recalc(supplement.id);
  res.status(201).json(fullSupplement(supplement.id));
});

router.delete('/:id/items/:itemId', requireRole('administrador'), (req, res) => {
  const supplement = db.prepare('SELECT * FROM work_order_supplements WHERE id = ?').get(req.params.id);
  if (!supplement) return res.status(404).json({ error: 'Adicional no encontrado' });
  if (supplement.status !== 'borrador') return res.status(400).json({ error: 'Solo adicional en borrador es editable' });
  db.prepare('DELETE FROM work_order_supplement_items WHERE id = ? AND supplement_id = ?').run(req.params.itemId, supplement.id);
  recalc(supplement.id);
  res.json(fullSupplement(supplement.id));
});

router.post('/:id/send-approval', requireRole('administrador'), (req, res) => {
  const supplement = db.prepare('SELECT * FROM work_order_supplements WHERE id = ?').get(req.params.id);
  if (!supplement) return res.status(404).json({ error: 'Adicional no encontrado' });
  if (!['borrador', 'esperando_aprobacion'].includes(supplement.status)) return res.status(400).json({ error: 'Solo borrador o pendiente puede enviarse' });
  const itemCount = db.prepare('SELECT COUNT(*) AS count FROM work_order_supplement_items WHERE supplement_id = ?').get(supplement.id).count;
  if (!itemCount) return res.status(400).json({ error: 'Agrega conceptos antes de enviar el adicional' });
  if (supplement.status === 'borrador') {
    db.prepare('UPDATE work_order_supplements SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run('esperando_aprobacion', supplement.id);
  }
  const existing = db.prepare("SELECT token FROM public_approval_tokens WHERE target_type = 'supplement' AND target_id = ? AND status = 'pendiente' ORDER BY id DESC").get(supplement.id);
  const token = existing ? existing.token : crypto.randomBytes(24).toString('hex');
  if (!existing) db.prepare('INSERT INTO public_approval_tokens (token, target_type, target_id) VALUES (?, ?, ?)').run(token, 'supplement', supplement.id);
  res.status(201).json({ token, url: `/approve.html?token=${token}`, supplement: fullSupplement(supplement.id) });
});

router.post('/:id/status', requireRole('administrador'), (req, res) => {
  const supplement = db.prepare('SELECT * FROM work_order_supplements WHERE id = ?').get(req.params.id);
  if (!supplement) return res.status(404).json({ error: 'Adicional no encontrado' });
  if (supplement.status !== 'esperando_aprobacion') return res.status(400).json({ error: 'El complemento debe estar esperando aprobacion' });
  if (!['aprobado', 'rechazado'].includes(req.body.status)) return res.status(400).json({ error: 'Estado invalido' });
  db.prepare('UPDATE work_order_supplements SET status = ?, approved_at = CASE WHEN ? THEN CURRENT_TIMESTAMP ELSE approved_at END, rejected_at = CASE WHEN ? THEN CURRENT_TIMESTAMP ELSE rejected_at END, rejection_note = CASE WHEN ? THEN ? ELSE rejection_note END, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run(req.body.status, req.body.status === 'aprobado' ? 1 : 0, req.body.status === 'rechazado' ? 1 : 0, req.body.status === 'rechazado' ? 1 : 0, req.body.note || null, supplement.id);
  res.json(fullSupplement(supplement.id));
});

module.exports = router;
