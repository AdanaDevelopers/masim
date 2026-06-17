const express = require('express');
const db = require('../db/masim');
const auth = require('../middleware/auth');
const checkPermission = require('../middleware/permission');
const { logAction } = require('../services/audit');
const { insertVehicle, updateVehicle } = require('../services/vehicles');

const router = express.Router();
router.use(auth);

router.get('/', checkPermission('vehicles', 'r'), (req, res) => {
  const { customerId, all } = req.query;
  const where = customerId && all !== '1' ? 'WHERE v.customer_id = ?' : '';
  const params = customerId && all !== '1' ? [customerId] : [];
  const rows = db.prepare(`
    SELECT v.*, c.name AS customer_name
    FROM vehicles v JOIN customers c ON c.id = v.customer_id
    ${where}
    ORDER BY v.id DESC
  `).all(...params);
  res.json(rows);
});

router.post('/', checkPermission('vehicles', 'c'), (req, res, next) => {
  try {
    const id = insertVehicle(req.body);
    const vehicle = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(id);
    logAction(req.user.id, 'CREATE', 'vehicles', `Vehículo creado: ${vehicle.make} ${vehicle.model} (${vehicle.year || ''}) Placas: ${vehicle.plates || 'N/D'} (ID: ${id})`, req.ip);
    res.status(201).json(vehicle);
  } catch (error) {
    next(error);
  }
});

router.put('/:id', checkPermission('vehicles', 'u'), (req, res, next) => {
  const existing = db.prepare('SELECT id FROM vehicles WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Vehiculo no encontrado' });
  try {
    updateVehicle(req.params.id, req.body);
    const updated = db.prepare(`
      SELECT v.*, c.name AS customer_name
      FROM vehicles v JOIN customers c ON c.id = v.customer_id
      WHERE v.id = ?
    `).get(req.params.id);
    logAction(req.user.id, 'UPDATE', 'vehicles', `Vehículo modificado: ${updated.make} ${updated.model} (${updated.year || ''}) Placas: ${updated.plates || 'N/D'} (ID: ${req.params.id})`, req.ip);
    res.json(updated);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
