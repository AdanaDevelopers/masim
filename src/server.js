require('dotenv').config();

const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 3000;
const db = require('./db/masim');
const migrate = require('./db/migrate');
const auth = require('./middleware/auth');
const { getWorkOrderDocument, getSupplementDocument, buildQuotePdf, buildFullWorkOrderQuotePdf, buildReceiptPdf, streamPdf } = require('./services/documents');

migrate(db);

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use('/app.js', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/health', (req, res) => {
  res.json({ ok: true, app: 'Masim', currency: process.env.CURRENCY || 'MXN', taxRate: Number(process.env.TAX_RATE || 0.16) });
});

app.use('/api/auth', require('./routes/auth'));
app.use('/api/customers', require('./routes/customers'));
app.use('/api/vehicles', require('./routes/vehicles'));
app.use('/api/catalog', require('./routes/catalog'));
app.use('/api/vin', require('./routes/vin'));
app.use('/api/vehicle-reference', require('./routes/vehicleReference'));
app.use('/api/users', require('./routes/users'));
app.use('/api/audit-logs', require('./routes/auditLogs'));

app.get('/api/pdf/work-orders/:id/quote', auth, (req, res) => {
  const order = getWorkOrderDocument(req.params.id);
  if (!order) return res.status(404).json({ error: 'Orden no encontrada' });
  streamPdf(res, `${order.folio}-cotizacion.pdf`, buildQuotePdf(order, { title: 'Cotizacion de servicio', folio: order.folio }));
});

app.post('/api/pdf/quick-quote-direct', auth, (req, res) => {
  const { customer_name, customer_contact, vehicle, items } = req.body;
  if (!customer_name) return res.status(400).json({ error: 'El nombre del cliente es obligatorio para la cotización' });
  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Debe agregar al menos un concepto a la cotización' });
  }

  let subtotal = 0;
  const processedItems = items.map((item) => {
    const qty = Number(item.quantity || 1);
    const price = Number(item.applied_price || 0);
    subtotal += qty * price;
    return {
      quantity: qty,
      description: String(item.description || '').trim(),
      type: item.type === 'mano_obra' ? 'mano_obra' : 'refaccion',
      applied_price: price,
      notes: item.notes ? String(item.notes).trim() : null
    };
  });

  const taxRate = 0.16;
  const tax = subtotal * taxRate;
  const total = subtotal + tax;

  const docData = {
    customer_name,
    contact_name: customer_contact || null,
    phone: null,
    whatsapp: null,
    email: null,
    rfc: null,
    address: null,
    make: vehicle?.make || null,
    model: vehicle?.model || null,
    year: vehicle?.year ? Number(vehicle.year) : null,
    trim: vehicle?.trim || null,
    plates: vehicle?.plates || null,
    mileage: vehicle?.mileage ? Number(vehicle.mileage) : null,
    economic_number: vehicle?.economic_number || null,
    vin: null,
    folio: 'COT-RAPIDA',
    currency: 'MXN',
    subtotal,
    tax,
    total,
    items: processedItems
  };

  const filename = `${customer_name.trim().replace(/[^a-zA-Z0-9]/g, '_')}-cotizacion.pdf`;
  streamPdf(res, filename, buildQuotePdf(docData, { title: 'Cotizacion', folio: 'COT-RAP' }));
});

app.get('/api/pdf/work-orders/:id/full-quote', auth, (req, res) => {
  const order = getWorkOrderDocument(req.params.id);
  if (!order) return res.status(404).json({ error: 'Orden no encontrada' });
  streamPdf(res, `${order.folio}-cotizacion-general.pdf`, buildFullWorkOrderQuotePdf(order));
});

app.get('/api/pdf/work-orders/:id/receipt', auth, (req, res) => {
  const order = getWorkOrderDocument(req.params.id);
  if (!order) return res.status(404).json({ error: 'Orden no encontrada' });
  if (order.status !== 'cerrada') return res.status(400).json({ error: 'La orden aun no esta cerrada' });
  streamPdf(res, `${order.folio}-recibo.pdf`, buildReceiptPdf(order));
});

app.get('/api/pdf/supplements/:id/quote', auth, (req, res) => {
  const supplement = getSupplementDocument(req.params.id);
  if (!supplement) return res.status(404).json({ error: 'Adicional no encontrado' });
  streamPdf(res, `${supplement.folio_adicional}-cotizacion.pdf`, buildQuotePdf(supplement, { title: 'Cotizacion adicional', folio: supplement.folio_adicional }));
});

app.use('/api/work-orders', require('./routes/workOrders'));
app.use('/api/receptions', require('./routes/receptions'));
app.use('/api/supplements', require('./routes/supplements'));
app.use('/api/maintenance-visits', require('./routes/maintenanceVisits'));
app.use('/api/public-approvals', require('./routes/publicApprovals'));
app.use('/api/billing', require('./routes/billing'));
app.use('/api/whatsapp', require('./routes/whatsapp'));

app.use((req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada' });
});

app.use((error, req, res, next) => {
  console.error(error);
  res.status(error.status || 500).json({ error: error.message || 'Error interno' });
});

const whatsapp = require('./services/whatsapp');
app.listen(port, () => {
  console.log(`Masim escuchando en http://localhost:${port}`);
  whatsapp.start().catch((err) => console.error('Error al iniciar WhatsApp automáticamente:', err));
});
