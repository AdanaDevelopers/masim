const express = require('express');
const db = require('../db/masim');
const auth = require('../middleware/auth');
const { insertCustomer, updateCustomer } = require('../services/customers');

const router = express.Router();
router.use(auth);

router.get('/', (req, res) => {
  res.json(db.prepare('SELECT *, name AS display_name FROM customers ORDER BY id DESC').all());
});

router.post('/', (req, res, next) => {
  try {
    const id = insertCustomer(req.body);
    res.status(201).json(db.prepare('SELECT *, name AS display_name FROM customers WHERE id = ?').get(id));
  } catch (error) {
    next(error);
  }
});

router.put('/:id', (req, res, next) => {
  const existing = db.prepare('SELECT id FROM customers WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Cliente no encontrado' });
  try {
    updateCustomer(req.params.id, req.body);
    res.json(db.prepare('SELECT *, name AS display_name FROM customers WHERE id = ?').get(req.params.id));
  } catch (error) {
    next(error);
  }
});

module.exports = router;
