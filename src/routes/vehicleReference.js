const express = require('express');
const db = require('../db/vehicleReference');
const auth = require('../middleware/auth');

const router = express.Router();
router.use(auth);

router.get('/years', (req, res) => {
  const years = db.prepare('SELECT DISTINCT year FROM make_years ORDER BY year DESC').all().map((r) => r.year);
  res.json(years);
});

router.get('/makes', (req, res) => {
  const { year } = req.query;
  res.json(db.prepare(`
    SELECT ma.id, ma.make_name, ma.make_slug
    FROM makes ma JOIN make_years my ON my.make_id = ma.id
    WHERE my.year = ? ORDER BY ma.make_name
  `).all(year));
});

router.get('/models', (req, res) => {
  const { year, makeId } = req.query;
  res.json(db.prepare(`
    SELECT mo.id, mo.model_name, mo.vehicle_type
    FROM models mo JOIN model_years my ON my.model_id = mo.id
    WHERE mo.make_id = ? AND my.year = ? ORDER BY mo.model_name
  `).all(makeId, year));
});

router.get('/styles', (req, res) => {
  const { year, makeId, modelId } = req.query;
  res.json(db.prepare(`
    SELECT s.id, s.style_name
    FROM styles s JOIN style_years sy ON sy.style_id = s.id
    WHERE s.make_id = ? AND s.model_id = ? AND sy.year = ? ORDER BY s.style_name
  `).all(makeId, modelId, year));
});

module.exports = router;
