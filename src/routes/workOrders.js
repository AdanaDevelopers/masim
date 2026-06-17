const crypto = require('crypto');
const express = require('express');
const db = require('../db/masim');
const auth = require('../middleware/auth');
const checkPermission = require('../middleware/permission');
const { logAction } = require('../services/audit');
const { calculateTotals, TAX_RATE, CURRENCY, finalWorkOrderTotal } = require('../services/totals');
const { assertTransition, assertEditable, assertNotClosed } = require('../services/workOrderState');
const { nextWorkOrderFolio } = require('../services/folios');

const router = express.Router();
router.use(auth);

function recalc(workOrderId) {
  const items = db.prepare('SELECT quantity, applied_price FROM order_items WHERE work_order_id = ?').all(workOrderId);
  const order = db.prepare('SELECT discount_type, discount_value FROM work_orders WHERE id = ?').get(workOrderId) || {};
  const totals = calculateTotals(items, order);
  db.prepare('UPDATE work_orders SET subtotal = ?, discount_amount = ?, tax = ?, total = ?, tax_rate = ?, currency = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run(totals.subtotal, totals.discountAmount, totals.tax, totals.total, totals.taxRate, totals.currency, workOrderId);
}

function getEditableOrder(id) {
  const order = db.prepare('SELECT * FROM work_orders WHERE id = ?').get(id);
  if (!order) return null;
  assertEditable(order.status);
  return order;
}

function getOrderItem(orderId, itemId) {
  return db.prepare('SELECT * FROM order_items WHERE id = ? AND work_order_id = ?').get(itemId, orderId);
}

function getFullOrder(id) {
  const order = db.prepare(`
    SELECT wo.*, c.name AS customer_name, c.name,
      c.customer_type, c.contact_name, c.phone, c.whatsapp,
      v.vin, v.make, v.model, v.year, v.trim, v.plates, v.mileage, v.economic_number
    FROM work_orders wo
    JOIN customers c ON c.id = wo.customer_id
    JOIN vehicles v ON v.id = wo.vehicle_id
    WHERE wo.id = ?
  `).get(id);
  if (!order) return null;
  order.items = db.prepare('SELECT * FROM order_items WHERE work_order_id = ? ORDER BY id').all(id);
  order.supplements = db.prepare('SELECT * FROM work_order_supplements WHERE work_order_id = ? ORDER BY id').all(id);
  order.supplements.forEach((supplement) => {
    supplement.items = db.prepare('SELECT * FROM work_order_supplement_items WHERE supplement_id = ? ORDER BY id').all(supplement.id);
  });
  order.mechanics = db.prepare(`
    SELECT u.id, u.name, u.email FROM mechanic_assignments ma JOIN users u ON u.id = ma.mechanic_id WHERE ma.work_order_id = ?
  `).all(id);
  order.maintenance_visits = db.prepare(`
    SELECT * FROM maintenance_visits WHERE source_work_order_id = ? ORDER BY id DESC
  `).all(id);
  order.invoice = db.prepare("SELECT * FROM invoices WHERE work_order_id = ? AND status != 'cancelada' ORDER BY id DESC").get(id) || null;
  return order;
}

function normalizeMaintenanceVisit(body) {
  if (!body || typeof body !== 'object') return null;
  const serviceType = String(body.service_type || '').trim();
  const scheduledDate = body.scheduled_date ? String(body.scheduled_date).trim() : null;
  const scheduledMileage = body.scheduled_mileage === undefined || body.scheduled_mileage === '' || body.scheduled_mileage === null
    ? null
    : Number(body.scheduled_mileage);
  const notes = body.notes ? String(body.notes).trim() : null;
  if (!serviceType && !scheduledDate && scheduledMileage === null && !notes) return null;
  if (!serviceType) {
    const error = new Error('Tipo de servicio de proxima visita requerido');
    error.status = 400;
    throw error;
  }
  if (scheduledMileage !== null && (!Number.isFinite(scheduledMileage) || scheduledMileage < 0)) {
    const error = new Error('Kilometraje de proxima visita invalido');
    error.status = 400;
    throw error;
  }
  return { serviceType, scheduledDate, scheduledMileage, notes };
}

router.get('/', checkPermission('orders', 'r'), (req, res) => {
  const rows = db.prepare(`
    SELECT wo.*, c.name AS customer_name, c.name,
      c.customer_type, c.contact_name, c.phone, c.whatsapp,
      v.vin, v.make, v.model, v.year, v.trim, v.plates, v.mileage, v.economic_number
    FROM work_orders wo
    JOIN customers c ON c.id = wo.customer_id
    JOIN vehicles v ON v.id = wo.vehicle_id
    ORDER BY wo.id DESC
  `).all();
  res.json(rows);
});

router.get('/mechanic/my-active/list', (req, res) => {
  // Retorna órdenes asignadas activas de cualquier usuario que ingrese
  res.json(db.prepare(`
    SELECT wo.*, c.name AS customer_name, v.make, v.model, v.year, v.plates
    FROM work_orders wo
    JOIN mechanic_assignments ma ON ma.work_order_id = wo.id
    JOIN customers c ON c.id = wo.customer_id
    JOIN vehicles v ON v.id = wo.vehicle_id
    WHERE ma.mechanic_id = ? AND wo.status = 'ot_activa'
    ORDER BY wo.id DESC
  `).all(req.user.id));
});

router.get('/:id', checkPermission('orders', 'r'), (req, res) => {
  const order = getFullOrder(req.params.id);
  if (!order) return res.status(404).json({ error: 'Orden no encontrada' });
  res.json(order);
});

router.post('/', checkPermission('orders', 'c'), (req, res) => {
  const { customer_id, vehicle_id, symptom, reception_inventory } = req.body;
  if (!customer_id || !vehicle_id) return res.status(400).json({ error: 'Cliente y vehiculo son requeridos' });
  const folio = nextWorkOrderFolio();
  const result = db.prepare(`
    INSERT INTO work_orders (folio, customer_id, vehicle_id, status, symptom, reception_inventory, tax_rate, currency, created_by)
    VALUES (?, ?, ?, 'recepcion', ?, ?, ?, ?, ?)
  `).run(folio, customer_id, vehicle_id, symptom || null, reception_inventory ? JSON.stringify(reception_inventory) : null, TAX_RATE, CURRENCY, req.user.id);
  db.prepare('INSERT INTO work_order_status_history (work_order_id, to_status, changed_by, note) VALUES (?, ?, ?, ?)')
    .run(result.lastInsertRowid, 'recepcion', req.user.id, 'Recepcion creada');
  
  logAction(req.user.id, 'CREATE', 'orders', `Orden de trabajo creada Folio: ${folio} (ID: ${result.lastInsertRowid})`, req.ip);
  
  res.status(201).json(getFullOrder(result.lastInsertRowid));
});

router.post('/:id/items', checkPermission('orders', 'u'), (req, res, next) => {
  try {
    const order = db.prepare('SELECT * FROM work_orders WHERE id = ?').get(req.params.id);
    if (!order) return res.status(404).json({ error: 'Orden no encontrada' });
    assertEditable(order.status);
    const catalog = req.body.item_id ? db.prepare('SELECT * FROM catalog WHERE id = ?').get(req.body.item_id) : null;
    const description = (req.body.description || (catalog && catalog.description) || '').trim();
    const type = req.body.type || (catalog && catalog.type);
    const quantity = Number(req.body.quantity || 1);
    const appliedPrice = Number(req.body.applied_price ?? catalog?.public_price ?? 0);
    if (!description || !['mano_obra', 'refaccion'].includes(type)) return res.status(400).json({ error: 'Item invalido' });
    if (!Number.isFinite(quantity) || quantity <= 0) return res.status(400).json({ error: 'Cantidad invalida' });
    if (!Number.isFinite(appliedPrice) || appliedPrice < 0) return res.status(400).json({ error: 'Precio invalido' });
    const existingItem = req.body.item_id
      ? db.prepare('SELECT * FROM order_items WHERE work_order_id = ? AND item_id = ? AND applied_price = ?').get(order.id, req.body.item_id, appliedPrice)
      : db.prepare('SELECT * FROM order_items WHERE work_order_id = ? AND item_id IS NULL AND LOWER(description) = LOWER(?) AND type = ? AND applied_price = ?').get(order.id, description, type, appliedPrice);
    if (existingItem) {
      db.prepare('UPDATE order_items SET quantity = quantity + ?, notes = COALESCE(?, notes) WHERE id = ?')
        .run(quantity, req.body.notes || null, existingItem.id);
    } else {
      db.prepare(`
        INSERT INTO order_items (work_order_id, item_id, description, type, quantity, applied_price, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(order.id, req.body.item_id || null, description, type, quantity, appliedPrice, req.body.notes || null);
    }
    if (order.status === 'recepcion') {
      db.prepare('UPDATE work_orders SET status = ? WHERE id = ?').run('cotizacion_borrador', order.id);
      db.prepare('INSERT INTO work_order_status_history (work_order_id, from_status, to_status, changed_by, note) VALUES (?, ?, ?, ?, ?)')
        .run(order.id, 'recepcion', 'cotizacion_borrador', req.user.id, 'Primer item de cotizacion');
    }
    recalc(order.id);
    
    logAction(req.user.id, 'UPDATE', 'orders', `Agregado concepto a Orden Folio: ${order.folio}: ${description}`, req.ip);
    
    res.status(201).json(getFullOrder(order.id));
  } catch (error) {
    next(error);
  }
});

router.put('/:id/items/:itemId', checkPermission('orders', 'u'), (req, res, next) => {
  try {
    const order = getEditableOrder(req.params.id);
    if (!order) return res.status(404).json({ error: 'Orden no encontrada' });
    const item = getOrderItem(order.id, req.params.itemId);
    if (!item) return res.status(404).json({ error: 'Concepto no encontrado' });
    const quantity = Number(req.body.quantity ?? item.quantity);
    const appliedPrice = Number(req.body.applied_price ?? item.applied_price);
    if (!Number.isFinite(quantity) || quantity <= 0) return res.status(400).json({ error: 'Cantidad invalida' });
    if (!Number.isFinite(appliedPrice) || appliedPrice < 0) return res.status(400).json({ error: 'Precio invalido' });
    db.prepare(`
      UPDATE order_items
      SET quantity = ?, applied_price = ?, notes = ?
      WHERE id = ? AND work_order_id = ?
    `).run(quantity, appliedPrice, req.body.notes ?? item.notes, item.id, order.id);
    recalc(order.id);
    
    logAction(req.user.id, 'UPDATE', 'orders', `Concepto modificado en Orden Folio: ${order.folio}: ${item.description}`, req.ip);
    
    res.json(getFullOrder(order.id));
  } catch (error) {
    next(error);
  }
});

router.delete('/:id/items/:itemId', checkPermission('orders', 'u'), (req, res, next) => {
  try {
    const order = getEditableOrder(req.params.id);
    if (!order) return res.status(404).json({ error: 'Orden no encontrada' });
    const item = getOrderItem(order.id, req.params.itemId);
    if (!item) return res.status(404).json({ error: 'Concepto no encontrado' });
    db.prepare('DELETE FROM order_items WHERE id = ? AND work_order_id = ?').run(item.id, order.id);
    recalc(order.id);
    
    logAction(req.user.id, 'UPDATE', 'orders', `Concepto eliminado de Orden Folio: ${order.folio}: ${item.description}`, req.ip);
    
    res.json(getFullOrder(order.id));
  } catch (error) {
    next(error);
  }
});

router.put('/:id/discount', checkPermission('orders', 'u'), (req, res, next) => {
  try {
    const order = getEditableOrder(req.params.id);
    if (!order) return res.status(404).json({ error: 'Orden no encontrada' });
    const discountType = ['amount', 'percent'].includes(req.body.discount_type) ? req.body.discount_type : 'none';
    const discountValue = discountType === 'none' ? 0 : Number(req.body.discount_value || 0);
    if (!Number.isFinite(discountValue) || discountValue < 0) return res.status(400).json({ error: 'Descuento invalido' });
    if (discountType === 'percent' && discountValue > 100) return res.status(400).json({ error: 'El porcentaje no puede ser mayor a 100' });
    if (discountType === 'amount' && discountValue > Number(order.subtotal || 0)) return res.status(400).json({ error: 'El descuento no puede superar el subtotal' });
    db.prepare(`
      UPDATE work_orders
      SET discount_type = ?, discount_value = ?, adjustment_note = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(discountType, discountValue, req.body.adjustment_note || null, order.id);
    recalc(order.id);
    
    logAction(req.user.id, 'UPDATE', 'orders', `Descuento aplicado en Orden Folio: ${order.folio} (${discountType}: ${discountValue})`, req.ip);
    
    res.json(getFullOrder(order.id));
  } catch (error) {
    next(error);
  }
});

router.post('/:id/status', checkPermission('orders', 'u'), (req, res, next) => {
  try {
    const order = db.prepare('SELECT * FROM work_orders WHERE id = ?').get(req.params.id);
    if (!order) return res.status(404).json({ error: 'Orden no encontrada' });
    assertTransition(order.status, req.body.status);
    const manualApproval = req.body.status === 'ot_activa' && req.body.manual === true;
    db.prepare(`
      UPDATE work_orders
      SET status = ?,
        approved_at = CASE WHEN ? = ? THEN CURRENT_TIMESTAMP ELSE approved_at END,
        manual_approved_by = CASE WHEN ? THEN ? ELSE manual_approved_by END,
        manual_approved_at = CASE WHEN ? THEN CURRENT_TIMESTAMP ELSE manual_approved_at END,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(req.body.status, req.body.status, 'ot_activa', manualApproval ? 1 : 0, req.user.id, manualApproval ? 1 : 0, order.id);
    db.prepare('INSERT INTO work_order_status_history (work_order_id, from_status, to_status, changed_by, note) VALUES (?, ?, ?, ?, ?)')
      .run(order.id, order.status, req.body.status, req.user.id, req.body.note || (manualApproval ? 'Aprobacion manual confirmada' : null));
    
    logAction(req.user.id, 'UPDATE', 'orders', `Estado de Orden Folio: ${order.folio} cambiado de ${order.status} a ${req.body.status}`, req.ip);
    
    res.json(getFullOrder(order.id));
  } catch (error) {
    next(error);
  }
});

router.post('/:id/approval-token', checkPermission('orders', 'u'), (req, res) => {
  const order = db.prepare('SELECT * FROM work_orders WHERE id = ?').get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Orden no encontrada' });
  if (order.status !== 'esperando_aprobacion') return res.status(400).json({ error: 'La cotizacion debe estar esperando aprobacion' });
  const itemCount = db.prepare('SELECT COUNT(*) AS count FROM order_items WHERE work_order_id = ?').get(order.id).count;
  if (!itemCount) return res.status(400).json({ error: 'Agrega conceptos antes de enviar aprobacion' });
  
  logAction(req.user.id, 'UPDATE', 'orders', `Generado enlace de aprobación digital para Orden Folio: ${order.folio}`, req.ip);

  const existing = db.prepare("SELECT token FROM public_approval_tokens WHERE target_type = 'work_order' AND target_id = ? AND status = 'pendiente' ORDER BY id DESC").get(order.id);
  if (existing) return res.json({ token: existing.token, url: `/approve.html?token=${existing.token}` });
  const token = crypto.randomBytes(24).toString('hex');
  db.prepare('INSERT INTO public_approval_tokens (token, target_type, target_id) VALUES (?, ?, ?)').run(token, 'work_order', order.id);
  res.status(201).json({ token, url: `/approve.html?token=${token}` });
});

router.post('/:id/assign', checkPermission('orders', 'u'), (req, res) => {
  const order = db.prepare('SELECT * FROM work_orders WHERE id = ?').get(req.params.id);
  const mechanic = db.prepare('SELECT * FROM users WHERE id = ?').get(req.body.mechanic_id);
  if (!order || !mechanic) return res.status(404).json({ error: 'Orden o usuario no encontrado' });
  if (order.status !== 'ot_activa') return res.status(400).json({ error: 'Solo se asignan tecnicos en OT activa' });
  db.prepare('INSERT OR IGNORE INTO mechanic_assignments (work_order_id, mechanic_id) VALUES (?, ?)').run(order.id, mechanic.id);
  
  logAction(req.user.id, 'UPDATE', 'orders', `Asignado técnico ${mechanic.username || mechanic.name} a Orden Folio: ${order.folio}`, req.ip);

  res.json(getFullOrder(order.id));
});

router.post('/:id/finalize', (req, res) => {
  const order = db.prepare('SELECT * FROM work_orders WHERE id = ?').get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Orden no encontrada' });
  if (order.status !== 'ot_activa') return res.status(400).json({ error: 'Solo una OT activa puede finalizarse' });
  
  // Validar permisos: tiene orders:u o está asignado
  const user = db.prepare('SELECT role, permissions FROM users WHERE id = ?').get(req.user.id);
  let hasOrderUpdate = user && user.role === 'administrador';
  if (!hasOrderUpdate) {
    try {
      const perms = JSON.parse(user?.permissions || '{}');
      hasOrderUpdate = perms.orders && perms.orders.u === true;
    } catch(e) {}
  }

  if (!hasOrderUpdate) {
    const assigned = db.prepare('SELECT id FROM mechanic_assignments WHERE work_order_id = ? AND mechanic_id = ?').get(order.id, req.user.id);
    if (!assigned) {
      return res.status(403).json({ error: 'No tienes permisos para actualizar esta orden ni estás asignado a ella' });
    }
  }

  db.prepare('UPDATE work_orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run('trabajo_finalizado', order.id);
  db.prepare('INSERT INTO work_order_status_history (work_order_id, from_status, to_status, changed_by, note) VALUES (?, ?, ?, ?, ?)')
    .run(order.id, order.status, 'trabajo_finalizado', req.user.id, req.body.note || 'Trabajo finalizado');
  
  logAction(req.user.id, 'UPDATE', 'orders', `Trabajo finalizado para Orden Folio: ${order.folio}`, req.ip);

  res.json(getFullOrder(order.id));
});

router.post('/:id/close', checkPermission('orders', 'u'), (req, res, next) => {
  try {
    const order = db.prepare('SELECT * FROM work_orders WHERE id = ?').get(req.params.id);
    if (!order) return res.status(404).json({ error: 'Orden no encontrada' });
    if (order.status !== 'trabajo_finalizado') return res.status(400).json({ error: 'La OT debe estar finalizada' });
    if (!['efectivo', 'tarjeta', 'transferencia'].includes(req.body.method)) return res.status(400).json({ error: 'Metodo de pago invalido' });
    const unresolved = db.prepare("SELECT COUNT(*) AS count FROM work_order_supplements WHERE work_order_id = ? AND status IN ('borrador', 'esperando_aprobacion')").get(order.id).count;
    if (unresolved) return res.status(400).json({ error: 'Hay complementos sin resolver. Envia, aprueba, rechaza o elimina antes de cerrar.' });
    const visit = normalizeMaintenanceVisit(req.body.maintenance_visit);
    const supplements = db.prepare('SELECT status, total FROM work_order_supplements WHERE work_order_id = ?').all(order.id);
    const finalTotal = finalWorkOrderTotal(order, supplements);

    db.transaction(() => {
      db.prepare('INSERT INTO payments (work_order_id, method, amount, currency) VALUES (?, ?, ?, ?)')
        .run(order.id, req.body.method, finalTotal, CURRENCY);
      if (visit) {
        db.prepare(`
          INSERT INTO maintenance_visits (customer_id, vehicle_id, source_work_order_id, scheduled_date, scheduled_mileage, service_type, notes)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(order.customer_id, order.vehicle_id, order.id, visit.scheduledDate, visit.scheduledMileage, visit.serviceType, visit.notes);
      }
      db.prepare('UPDATE work_orders SET status = ?, exit_date = CURRENT_TIMESTAMP, closed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run('cerrada', order.id);
      db.prepare('INSERT INTO work_order_status_history (work_order_id, from_status, to_status, changed_by, note) VALUES (?, ?, ?, ?, ?)')
        .run(order.id, order.status, 'cerrada', req.user.id, `Pago ${req.body.method}`);
    })();

    logAction(req.user.id, 'UPDATE', 'orders', `Orden de trabajo Folio: ${order.folio} CERRADA y cobrada mediante ${req.body.method} (Total: ${finalTotal})`, req.ip);

    res.json({ ...getFullOrder(order.id), final_total: finalTotal });
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', checkPermission('orders', 'd'), (req, res, next) => {
  try {
    const orderId = req.params.id;
    const order = db.prepare('SELECT * FROM work_orders WHERE id = ?').get(orderId);
    if (!order) return res.status(404).json({ error: 'Orden no encontrada' });

    // Validar si tiene facturas asociadas
    const invoiceCount = db.prepare('SELECT COUNT(*) AS count FROM invoices WHERE work_order_id = ?').get(orderId).count;
    if (invoiceCount > 0) {
      return res.status(400).json({ error: 'No se puede eliminar la orden porque tiene facturas asociadas.' });
    }

    // Validar si tiene pagos registrados
    const paymentCount = db.prepare('SELECT COUNT(*) AS count FROM payments WHERE work_order_id = ?').get(orderId).count;
    if (paymentCount > 0) {
      return res.status(400).json({ error: 'No se puede eliminar la orden porque tiene pagos registrados.' });
    }

    // Desligar visitas de mantenimiento vinculadas para evitar fallas de claves foráneas
    db.prepare('UPDATE maintenance_visits SET source_work_order_id = NULL WHERE source_work_order_id = ?').run(orderId);

    // Eliminar la orden de trabajo. Las relaciones con ON DELETE CASCADE se limpiarán automáticamente en SQLite
    db.prepare('DELETE FROM work_orders WHERE id = ?').run(orderId);

    logAction(req.user.id, 'DELETE', 'orders', `Orden de trabajo eliminada Folio: ${order.folio} (ID: ${order.id})`, req.ip);

    res.json({ success: true, message: `Orden ${order.folio} eliminada correctamente.` });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
