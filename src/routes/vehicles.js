const express = require('express');
const db = require('../db/masim');
const auth = require('../middleware/auth');
const { insertVehicle, updateVehicle } = require('../services/vehicles');

const router = express.Router();
router.use(auth);

router.get('/', (req, res) => {
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

router.post('/', (req, res, next) => {
  try {
    const id = insertVehicle(req.body);
    res.status(201).json(db.prepare('SELECT * FROM vehicles WHERE id = ?').get(id));
  } catch (error) {
    next(error);
  }
});

router.put('/:id', (req, res, next) => {
  const existing = db.prepare('SELECT id FROM vehicles WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Vehiculo no encontrado' });
  try {
    updateVehicle(req.params.id, req.body);
    res.json(db.prepare(`
    SELECT v.*, c.name AS customer_name
    FROM vehicles v JOIN customers c ON c.id = v.customer_id
    WHERE v.id = ?
  `).get(req.params.id));
  } catch (error) {
    next(error);
  }
});

module.exports = router;
