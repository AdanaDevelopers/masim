const express = require('express');
const db = require('../db/masim');
const auth = require('../middleware/auth');
const requireRole = require('../middleware/roles');
const { TAX_RATE, CURRENCY } = require('../services/totals');
const { nextWorkOrderFolio } = require('../services/folios');
const { insertCustomer } = require('../services/customers');
const { insertVehicle } = require('../services/vehicles');

const router = express.Router();
router.use(auth);

router.post('/', requireRole('administrador'), (req, res, next) => {
  try {
    const tx = db.transaction((body) => {
      let customerId = body.customerId;
      if (body.customerMode === 'new') customerId = insertCustomer(body.customer || {});
      if (!customerId) throw Object.assign(new Error('Cliente requerido'), { status: 400 });

      let vehicleId = body.vehicleId;
      if (body.vehicleMode === 'new') vehicleId = insertVehicle({ ...(body.vehicle || {}), customer_id: customerId });
      if (!vehicleId) throw Object.assign(new Error('Vehiculo requerido'), { status: 400 });
      if (body.vehicleMode !== 'new') {
        const vehicle = db.prepare('SELECT customer_id FROM vehicles WHERE id = ?').get(vehicleId);
        if (!vehicle) throw Object.assign(new Error('Vehiculo no encontrado'), { status: 404 });
        if (Number(vehicle.customer_id) !== Number(customerId)) {
          throw Object.assign(new Error('El vehiculo seleccionado no pertenece al cliente'), { status: 400 });
        }
      }

      const reception = body.reception || {};
      const inventory = {
        combustible: reception.fuel_level || null,
        inventario: reception.inventory || null,
        observaciones: reception.observations || null
      };
      const order = db.prepare(`
        INSERT INTO work_orders (folio, customer_id, vehicle_id, status, symptom, reception_inventory, tax_rate, currency, created_by)
        VALUES (?, ?, ?, 'recepcion', ?, ?, ?, ?, ?)
      `).run(
        nextWorkOrderFolio(),
        customerId,
        vehicleId,
        reception.symptom || null,
        JSON.stringify(inventory),
        TAX_RATE,
        CURRENCY,
        req.user.id
      );
      db.prepare('INSERT INTO work_order_status_history (work_order_id, to_status, changed_by, note) VALUES (?, ?, ?, ?)')
        .run(order.lastInsertRowid, 'recepcion', req.user.id, 'Recepcion creada');
      return { customerId, vehicleId, workOrderId: order.lastInsertRowid };
    });

    const result = tx(req.body);
    const workOrder = db.prepare('SELECT * FROM work_orders WHERE id = ?').get(result.workOrderId);
    res.status(201).json({ ...result, workOrder });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
