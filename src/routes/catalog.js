const express = require('express');
const db = require('../db/masim');
const auth = require('../middleware/auth');
const checkPermission = require('../middleware/permission');
const { logAction } = require('../services/audit');

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

function selectCatalogItem(id, userId) {
  const user = db.prepare('SELECT role FROM users WHERE id = ?').get(userId);
  const isAdmin = user && user.role === 'administrador';
  const fields = isAdmin
    ? 'id, description, type, public_price, internal_cost, active, created_at'
    : 'id, description, type, public_price, active, created_at';
  return db.prepare(`SELECT ${fields} FROM catalog WHERE id = ?`).get(id);
}

router.get('/', checkPermission('catalog', 'r'), (req, res) => {
  const user = db.prepare('SELECT role FROM users WHERE id = ?').get(req.user.id);
  const isAdmin = user && user.role === 'administrador';
  const includeInactive = isAdmin && req.query.includeInactive === '1';
  const fields = isAdmin
    ? 'id, description, type, public_price, internal_cost, active'
    : 'id, description, type, public_price, active';
  const where = includeInactive ? '' : 'WHERE active = 1';
  res.json(db.prepare(`SELECT ${fields} FROM catalog ${where} ORDER BY active DESC, description`).all());
});

router.post('/', checkPermission('catalog', 'c'), (req, res) => {
  const payload = normalizeCatalogPayload(req.body);
  if (payload.error) return res.status(400).json({ error: payload.error });
  const result = db.prepare('INSERT INTO catalog (description, type, public_price, internal_cost) VALUES (?, ?, ?, ?)')
    .run(payload.description, payload.type, payload.publicPrice, payload.internalCost);
  
  logAction(req.user.id, 'CREATE', 'catalog', `Item de catálogo creado: ${payload.description} (Precio Público: ${payload.publicPrice})`, req.ip);
  
  res.status(201).json(selectCatalogItem(result.lastInsertRowid, req.user.id));
});

router.put('/:id', checkPermission('catalog', 'u'), (req, res) => {
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

  logAction(req.user.id, 'UPDATE', 'catalog', `Item de catálogo modificado: ${payload.description} (ID: ${req.params.id})`, req.ip);

  res.json(selectCatalogItem(req.params.id, req.user.id));
});

router.delete('/:id', checkPermission('catalog', 'd'), (req, res) => {
  const existing = db.prepare('SELECT id, description FROM catalog WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Item de catalogo no encontrado' });

  db.prepare('UPDATE catalog SET active = 0 WHERE id = ?').run(req.params.id);
  
  logAction(req.user.id, 'DELETE', 'catalog', `Item de catálogo desactivado: ${existing.description} (ID: ${req.params.id})`, req.ip);

  res.json(selectCatalogItem(req.params.id, req.user.id));
});

router.put('/:id/restore', checkPermission('catalog', 'u'), (req, res) => {
  const existing = db.prepare('SELECT id, description FROM catalog WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Item de catalogo no encontrado' });

  db.prepare('UPDATE catalog SET active = 1 WHERE id = ?').run(req.params.id);
  
  logAction(req.user.id, 'UPDATE', 'catalog', `Item de catálogo reactivado: ${existing.description} (ID: ${req.params.id})`, req.ip);

  res.json(selectCatalogItem(req.params.id, req.user.id));
});

module.exports = router;
