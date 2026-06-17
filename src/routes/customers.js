const express = require('express');
const db = require('../db/masim');
const auth = require('../middleware/auth');
const checkPermission = require('../middleware/permission');
const { logAction } = require('../services/audit');
const { insertCustomer, updateCustomer } = require('../services/customers');

const router = express.Router();
router.use(auth);

router.get('/', checkPermission('customers', 'r'), (req, res) => {
  res.json(db.prepare('SELECT *, name AS display_name FROM customers ORDER BY id DESC').all());
});

router.post('/', checkPermission('customers', 'c'), (req, res, next) => {
  try {
    const id = insertCustomer(req.body);
    const customer = db.prepare('SELECT *, name AS display_name FROM customers WHERE id = ?').get(id);
    logAction(req.user.id, 'CREATE', 'customers', `Cliente creado: ${customer.name} (ID: ${id})`, req.ip);
    res.status(201).json(customer);
  } catch (error) {
    next(error);
  }
});

router.put('/:id', checkPermission('customers', 'u'), (req, res, next) => {
  const existing = db.prepare('SELECT id, name FROM customers WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Cliente no encontrado' });
  try {
    updateCustomer(req.params.id, req.body);
    const updated = db.prepare('SELECT *, name AS display_name FROM customers WHERE id = ?').get(req.params.id);
    logAction(req.user.id, 'UPDATE', 'customers', `Cliente modificado: ${updated.name} (ID: ${req.params.id})`, req.ip);
    res.json(updated);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
