const express = require('express');
const db = require('../db/masim');
const auth = require('../middleware/auth');
const requireRole = require('../middleware/roles');

const router = express.Router();
router.use(auth);

function normalizeCatalogPayload(body) {
  const description = String(body.description || '').trim();
  const type = body.type;
  const publicPrice = Number(body.public_price ?? 0);
  const internalCost = Number(body.internal_cost ?? 0);

  if (!description) return { error: 'Descripcion requerida' };
  if (!['mano_obra', 'refaccion'].includes(type)) return { error: 'Tipo invalido' };
  if (!Number.isFinite(publicPrice) || publicPrice < 0) return { error: 'Precio publico invalido' };
  if (!Number.isFinite(internalCost) || internalCost < 0) return { error: 'Costo interno invalido' };

  return { description, type, publicPrice, internalCost };
}

function selectCatalogItem(id, role) {
  const fields = role === 'administrador'
    ? 'id, description, type, public_price, internal_cost, active, created_at'
    : 'id, description, type, public_price, active, created_at';
  return db.prepare(`SELECT ${fields} FROM catalog WHERE id = ?`).get(id);
}

router.get('/', (req, res) => {
  const includeInactive = req.user.role === 'administrador' && req.query.includeInactive === '1';
  const fields = req.user.role === 'administrador'
    ? 'id, description, type, public_price, internal_cost, active'
    : 'id, description, type, public_price, active';
  const where = includeInactive ? '' : 'WHERE active = 1';
  res.json(db.prepare(`SELECT ${fields} FROM catalog ${where} ORDER BY active DESC, description`).all());
});

router.post('/', requireRole('administrador'), (req, res) => {
  const payload = normalizeCatalogPayload(req.body);
  if (payload.error) return res.status(400).json({ error: payload.error });
  const result = db.prepare('INSERT INTO catalog (description, type, public_price, internal_cost) VALUES (?, ?, ?, ?)')
    .run(payload.description, payload.type, payload.publicPrice, payload.internalCost);
  res.status(201).json(selectCatalogItem(result.lastInsertRowid, req.user.role));
});

router.put('/:id', requireRole('administrador'), (req, res) => {
  const existing = db.prepare('SELECT id FROM catalog WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Item de catalogo no encontrado' });

  const payload = normalizeCatalogPayload(req.body);
  if (payload.error) return res.status(400).json({ error: payload.error });
  const active = req.body.active === undefined ? 1 : Number(req.body.active) ? 1 : 0;

  db.prepare(`
    UPDATE catalog
    SET description = ?, type = ?, public_price = ?, internal_cost = ?, active = ?
    WHERE id = ?
  `).run(payload.description, payload.type, payload.publicPrice, payload.internalCost, active, req.params.id);

  res.json(selectCatalogItem(req.params.id, req.user.role));
});

router.delete('/:id', requireRole('administrador'), (req, res) => {
  const existing = db.prepare('SELECT id FROM catalog WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Item de catalogo no encontrado' });

  db.prepare('UPDATE catalog SET active = 0 WHERE id = ?').run(req.params.id);
  res.json(selectCatalogItem(req.params.id, req.user.role));
});

router.put('/:id/restore', requireRole('administrador'), (req, res) => {
  const existing = db.prepare('SELECT id FROM catalog WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Item de catalogo no encontrado' });

  db.prepare('UPDATE catalog SET active = 1 WHERE id = ?').run(req.params.id);
  res.json(selectCatalogItem(req.params.id, req.user.role));
});

module.exports = router;
