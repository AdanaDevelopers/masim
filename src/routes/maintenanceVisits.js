const express = require('express');
const db = require('../db/masim');
const auth = require('../middleware/auth');
const requireRole = require('../middleware/roles');

const router = express.Router();
router.use(auth);

function getVisit(id) {
  return db.prepare(`
    SELECT mv.*, c.name AS customer_name,
      v.make, v.model, v.year, v.trim, v.plates, v.vin, wo.folio AS source_folio
    FROM maintenance_visits mv
    JOIN customers c ON c.id = mv.customer_id
    JOIN vehicles v ON v.id = mv.vehicle_id
    LEFT JOIN work_orders wo ON wo.id = mv.source_work_order_id
    WHERE mv.id = ?
  `).get(id);
}

function validateVisitPayload(body, partial = false) {
  const serviceType = String(body.service_type || '').trim();
  const scheduledDate = body.scheduled_date ? String(body.scheduled_date).trim() : null;
  const scheduledMileage = body.scheduled_mileage === undefined || body.scheduled_mileage === '' || body.scheduled_mileage === null
    ? null
    : Number(body.scheduled_mileage);
  const notes = body.notes ? String(body.notes).trim() : null;

  if (!partial && !serviceType) return { error: 'Tipo de servicio requerido' };
  if (scheduledMileage !== null && (!Number.isFinite(scheduledMileage) || scheduledMileage < 0)) return { error: 'Kilometraje invalido' };

  return { serviceType, scheduledDate, scheduledMileage, notes };
}

router.get('/', (req, res) => {
  const filters = [];
  const params = [];
  if (req.query.vehicle_id) {
    filters.push('mv.vehicle_id = ?');
    params.push(req.query.vehicle_id);
  }
  if (req.query.status) {
    filters.push('mv.status = ?');
    params.push(req.query.status);
  }
  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const rows = db.prepare(`
    SELECT mv.*, c.name AS customer_name,
      v.make, v.model, v.year, v.trim, v.plates, v.vin, wo.folio AS source_folio
    FROM maintenance_visits mv
    JOIN customers c ON c.id = mv.customer_id
    JOIN vehicles v ON v.id = mv.vehicle_id
    LEFT JOIN work_orders wo ON wo.id = mv.source_work_order_id
    ${where}
    ORDER BY COALESCE(mv.scheduled_date, mv.created_at) ASC, mv.id DESC
  `).all(...params);
  res.json(rows);
});

router.post('/', requireRole('administrador'), (req, res) => {
  const vehicle = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(req.body.vehicle_id);
  if (!vehicle) return res.status(404).json({ error: 'Vehiculo no encontrado' });
  const payload = validateVisitPayload(req.body);
  if (payload.error) return res.status(400).json({ error: payload.error });

  const result = db.prepare(`
    INSERT INTO maintenance_visits (customer_id, vehicle_id, source_work_order_id, scheduled_date, scheduled_mileage, service_type, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(vehicle.customer_id, vehicle.id, req.body.source_work_order_id || null, payload.scheduledDate, payload.scheduledMileage, payload.serviceType, payload.notes);
  res.status(201).json(getVisit(result.lastInsertRowid));
});

router.put('/:id', requireRole('administrador'), (req, res) => {
  const visit = db.prepare('SELECT * FROM maintenance_visits WHERE id = ?').get(req.params.id);
  if (!visit) return res.status(404).json({ error: 'Visita no encontrada' });
  if (visit.status !== 'programada') return res.status(400).json({ error: 'Solo visitas programadas pueden modificarse' });
  const payload = validateVisitPayload(req.body, true);
  if (payload.error) return res.status(400).json({ error: payload.error });

  db.prepare(`
    UPDATE maintenance_visits
    SET scheduled_date = ?, scheduled_mileage = ?, service_type = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    payload.scheduledDate ?? visit.scheduled_date,
    payload.scheduledMileage ?? visit.scheduled_mileage,
    payload.serviceType || visit.service_type,
    payload.notes ?? visit.notes,
    visit.id
  );
  res.json(getVisit(visit.id));
});

router.post('/:id/complete', requireRole('administrador'), (req, res) => {
  const visit = db.prepare('SELECT * FROM maintenance_visits WHERE id = ?').get(req.params.id);
  if (!visit) return res.status(404).json({ error: 'Visita no encontrada' });
  db.prepare("UPDATE maintenance_visits SET status = 'realizada', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(visit.id);
  res.json(getVisit(visit.id));
});

router.post('/:id/cancel', requireRole('administrador'), (req, res) => {
  const visit = db.prepare('SELECT * FROM maintenance_visits WHERE id = ?').get(req.params.id);
  if (!visit) return res.status(404).json({ error: 'Visita no encontrada' });
  db.prepare("UPDATE maintenance_visits SET status = 'cancelada', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(visit.id);
  res.json(getVisit(visit.id));
});

module.exports = router;
