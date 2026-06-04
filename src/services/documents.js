const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const db = require('../db/masim');

const logoPath = path.resolve(__dirname, '..', '..', 'logo.png');

function money(value, currency = 'MXN') {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency }).format(Number(value || 0));
}

function vehicleTitle(doc) {
  return [doc.year, doc.make, doc.model, doc.trim].filter(Boolean).join(' ') || 'Vehiculo sin datos';
}

function getWorkOrderDocument(id) {
  const order = db.prepare(`
    SELECT wo.*, c.name AS customer_name, c.name,
      c.customer_type, c.contact_name, c.phone, c.whatsapp, c.email, c.rfc, c.address,
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
  order.approved_supplements_total = db.prepare("SELECT COALESCE(SUM(total), 0) AS total FROM work_order_supplements WHERE work_order_id = ? AND status = 'aprobado'").get(id).total;
  order.payments = db.prepare('SELECT * FROM payments WHERE work_order_id = ? ORDER BY id').all(id);
  order.maintenance_visits = db.prepare('SELECT * FROM maintenance_visits WHERE source_work_order_id = ? ORDER BY id DESC').all(id);
  return order;
}

function getSupplementDocument(id) {
  const supplement = db.prepare(`
    SELECT s.*, wo.folio, wo.customer_id, wo.vehicle_id, wo.currency,
      c.name AS customer_name, c.name,
      c.customer_type, c.contact_name, c.phone, c.whatsapp, c.email, c.rfc, c.address,
      v.vin, v.make, v.model, v.year, v.trim, v.plates, v.mileage, v.economic_number
    FROM work_order_supplements s
    JOIN work_orders wo ON wo.id = s.work_order_id
    JOIN customers c ON c.id = wo.customer_id
    JOIN vehicles v ON v.id = wo.vehicle_id
    WHERE s.id = ?
  `).get(id);
  if (!supplement) return null;
  supplement.items = db.prepare('SELECT * FROM work_order_supplement_items WHERE supplement_id = ? ORDER BY id').all(id);
  supplement.discount_amount = 0;
  return supplement;
}

function line(doc, y) {
  doc.moveTo(40, y).lineTo(572, y).strokeColor('#dddddd').lineWidth(1).stroke();
}

function header(doc, title, folio) {
  if (fs.existsSync(logoPath)) {
    doc.image(logoPath, 40, 32, { fit: [82, 58] });
  }
  doc.fillColor('#111111').fontSize(18).font('Helvetica-Bold').text('MASIM', 138, 38);
  doc.fontSize(9).font('Helvetica').fillColor('#555555').text('Taller mecanico', 138, 62);
  doc.fontSize(16).font('Helvetica-Bold').fillColor('#991b1b').text(title, 360, 38, { align: 'right', width: 210 });
  doc.fontSize(10).font('Helvetica').fillColor('#333333').text(`Folio: ${folio}`, 360, 62, { align: 'right', width: 210 });
  doc.fontSize(9).fillColor('#666666').text(`Fecha: ${new Date().toLocaleString('es-MX')}`, 360, 78, { align: 'right', width: 210 });
  line(doc, 104);
}

function infoBlock(doc, data) {
  doc.font('Helvetica-Bold').fontSize(10).fillColor('#111111').text('Cliente', 40, 122);
  doc.font('Helvetica').fontSize(9).fillColor('#333333')
    .text(data.customer_name || 'No registrado', 40, 140)
    .text(`Contacto: ${data.contact_name || data.phone || data.whatsapp || 'No registrado'}`, 40, 154)
    .text(`RFC: ${data.rfc || 'No registrado'}`, 40, 168);

  doc.font('Helvetica-Bold').fontSize(10).fillColor('#111111').text('Vehiculo', 315, 122);
  doc.font('Helvetica').fontSize(9).fillColor('#333333')
    .text(vehicleTitle(data), 315, 140)
    .text(`Placas: ${data.plates || 'S/P'}  VIN: ${data.vin || 'N/D'}`, 315, 154)
    .text(`KM: ${data.mileage ? Number(data.mileage).toLocaleString('es-MX') : 'N/D'}  Eco: ${data.economic_number || 'N/D'}`, 315, 168);
  line(doc, 196);
}

function drawItems(doc, data, startY = 214) {
  let y = startY;
  doc.font('Helvetica-Bold').fontSize(9).fillColor('#ffffff');
  doc.rect(40, y, 532, 22).fill('#991b1b');
  doc.fillColor('#ffffff').text('Cant.', 48, y + 7, { width: 44, align: 'right' });
  doc.text('Concepto', 104, y + 7, { width: 286 });
  doc.text('Precio', 400, y + 7, { width: 72, align: 'right' });
  doc.text('Importe', 488, y + 7, { width: 74, align: 'right' });
  y += 30;

  doc.font('Helvetica').fontSize(8).fillColor('#222222');
  data.items.forEach((item) => {
    if (y > 690) {
      doc.addPage();
      y = 50;
    }
    const amount = Number(item.quantity || 0) * Number(item.applied_price || 0);
    doc.text(String(item.quantity || 0), 48, y, { width: 44, align: 'right' });
    doc.font('Helvetica-Bold').text(item.description, 104, y, { width: 286 });
    doc.font('Helvetica').fillColor('#666666').text(item.type === 'mano_obra' ? 'Mano de obra' : 'Refaccion', 104, y + 11, { width: 286 });
    if (item.notes) doc.text(`Nota: ${item.notes}`, 104, y + 22, { width: 286 });
    doc.fillColor('#222222').text(money(item.applied_price, data.currency), 400, y, { width: 72, align: 'right' });
    doc.font('Helvetica-Bold').text(money(amount, data.currency), 488, y, { width: 74, align: 'right' });
    doc.font('Helvetica').fillColor('#222222');
    y += item.notes ? 44 : 32;
  });
  line(doc, y);
  return y + 14;
}

function totals(doc, data, y, receipt = false) {
  const approvedSupplements = Number(data.approved_supplements_total || 0);
  const finalTotal = receipt ? Number((Number(data.total || 0) + approvedSupplements).toFixed(2)) : Number(data.total || 0);
  const rows = [
    ['Subtotal', data.subtotal],
    ...(Number(data.discount_amount || 0) > 0 ? [['Descuento', -Number(data.discount_amount || 0)]] : []),
    ['IVA', data.tax],
    ...(receipt && approvedSupplements > 0 ? [['Adicionales aprobados', approvedSupplements]] : []),
    [receipt ? 'Total pagado' : 'Total', finalTotal]
  ];
  rows.forEach(([label, value], index) => {
    const isTotal = index === rows.length - 1;
    doc.font(isTotal ? 'Helvetica-Bold' : 'Helvetica').fontSize(isTotal ? 12 : 9).fillColor(isTotal ? '#991b1b' : '#222222');
    doc.text(label, 370, y, { width: 92, align: 'right' });
    doc.text(money(value, data.currency), 470, y, { width: 92, align: 'right' });
    y += isTotal ? 22 : 16;
  });
  return y;
}

function groupReceiptItems(data) {
  const groups = new Map();
  const addItem = (item) => {
    const description = String(item.description || '').trim();
    const type = item.type || 'refaccion';
    const appliedPrice = Number(item.applied_price || 0);
    const key = [description.toLowerCase(), type, appliedPrice.toFixed(2)].join('|');
    const existing = groups.get(key);
    if (existing) {
      existing.quantity = Number(existing.quantity || 0) + Number(item.quantity || 0);
      if (item.notes && !String(existing.notes || '').includes(item.notes)) {
        existing.notes = existing.notes ? `${existing.notes}; ${item.notes}` : item.notes;
      }
      return;
    }
    groups.set(key, {
      ...item,
      description,
      type,
      quantity: Number(item.quantity || 0),
      applied_price: appliedPrice,
      notes: item.notes || null
    });
  };

  (data.items || []).forEach(addItem);
  (data.supplements || [])
    .filter((supplement) => supplement.status === 'aprobado')
    .forEach((supplement) => (supplement.items || []).forEach(addItem));

  return Array.from(groups.values());
}

function receiptTotals(doc, data, items, y) {
  const subtotal = items.reduce((sum, item) => sum + (Number(item.quantity || 0) * Number(item.applied_price || 0)), 0);
  const discountAmount = Number(data.discount_amount || 0);
  const approvedSupplements = (data.supplements || []).filter((supplement) => supplement.status === 'aprobado');
  const tax = Number(data.tax || 0) + approvedSupplements.reduce((sum, supplement) => sum + Number(supplement.tax || 0), 0);
  const finalTotal = Number(data.total || 0) + approvedSupplements.reduce((sum, supplement) => sum + Number(supplement.total || 0), 0);
  const rows = [
    ['Subtotal', subtotal],
    ...(discountAmount > 0 ? [['Descuento', -discountAmount]] : []),
    ['IVA', tax],
    ['Total pagado', finalTotal]
  ];

  rows.forEach(([label, value], index) => {
    const isTotal = index === rows.length - 1;
    doc.font(isTotal ? 'Helvetica-Bold' : 'Helvetica').fontSize(isTotal ? 12 : 9).fillColor(isTotal ? '#991b1b' : '#222222');
    doc.text(label, 370, y, { width: 92, align: 'right' });
    doc.text(money(value, data.currency), 470, y, { width: 92, align: 'right' });
    y += isTotal ? 22 : 16;
  });
  return y;
}

function footer(doc, text) {
  const y = doc.page.height - 70;
  line(doc, y - 10);
  doc.font('Helvetica').fontSize(8).fillColor('#666666').text(text, 40, y, { width: 532, align: 'center' });
}

function buildQuotePdf(data, options = {}) {
  const pdf = new PDFDocument({ size: 'LETTER', margin: 40, info: { Title: options.title || 'Cotizacion Masim' } });
  header(pdf, options.title || 'Cotizacion', options.folio || data.folio || data.folio_adicional);
  infoBlock(pdf, data);
  let y = drawItems(pdf, data);
  y = totals(pdf, data, y, false);
  if (data.description) {
    pdf.font('Helvetica-Bold').fontSize(9).fillColor('#111111').text('Observaciones', 40, y + 8);
    pdf.font('Helvetica').fontSize(9).fillColor('#333333').text(data.description, 40, y + 24, { width: 300 });
  }
  footer(pdf, 'Esta cotizacion esta sujeta a aprobacion del cliente. Los trabajos adicionales se cotizaran por separado antes de ejecutarse.');
  return pdf;
}

function buildReceiptPdf(data) {
  const pdf = new PDFDocument({ size: 'LETTER', margin: 40, info: { Title: 'Recibo Masim' } });
  header(pdf, 'Recibo de orden', data.folio);
  infoBlock(pdf, data);
  const receiptItems = groupReceiptItems(data);
  let y = drawItems(pdf, { ...data, items: receiptItems }, 214);
  y = receiptTotals(pdf, data, receiptItems, y);

  if (y > 650) {
    pdf.addPage();
    y = 50;
  }

  const payment = data.payments?.[data.payments.length - 1];
  pdf.font('Helvetica-Bold').fontSize(9).fillColor('#111111').text('Pago', 40, y + 8);
  pdf.font('Helvetica').fontSize(9).fillColor('#333333').text(`Metodo: ${payment?.method || 'No registrado'}`, 40, y + 24);
  pdf.text(`Fecha de cierre: ${data.closed_at || data.exit_date || 'No registrada'}`, 40, y + 38);

  const nextVisit = data.maintenance_visits?.find((visit) => visit.status === 'programada') || data.maintenance_visits?.[0];
  if (nextVisit) {
    const visitY = y + 64;
    pdf.font('Helvetica-Bold').fontSize(9).fillColor('#111111').text('Proximo mantenimiento preventivo', 40, visitY);
    pdf.font('Helvetica').fontSize(9).fillColor('#333333')
      .text(`Servicio: ${nextVisit.service_type || 'No especificado'}`, 40, visitY + 16)
      .text(`Fecha sugerida: ${nextVisit.scheduled_date || 'No registrada'}`, 40, visitY + 30)
      .text(`KM sugerido: ${nextVisit.scheduled_mileage ? Number(nextVisit.scheduled_mileage).toLocaleString('es-MX') : 'No registrado'}`, 40, visitY + 44);
    if (nextVisit.notes) pdf.text(`Notas: ${nextVisit.notes}`, 40, visitY + 58, { width: 300 });
  }
  footer(pdf, 'Gracias por confiar en MASIM. Este recibo corresponde a la orden de trabajo finalizada y cerrada.');
  return pdf;
}

function drawQuoteSection(pdf, title, quote, y) {
  if (y > 620) {
    pdf.addPage();
    y = 50;
  }
  pdf.font('Helvetica-Bold').fontSize(12).fillColor('#991b1b').text(title, 40, y);
  pdf.font('Helvetica').fontSize(8).fillColor('#666666').text(`Estado: ${quote.status || 'N/D'}`, 420, y + 2, { width: 140, align: 'right' });
  y += 20;
  y = drawItems(pdf, quote, y);
  y = totals(pdf, quote, y, false);
  return y + 8;
}

function buildFullWorkOrderQuotePdf(data) {
  const pdf = new PDFDocument({ size: 'LETTER', margin: 40, info: { Title: 'Cotizacion general Masim' } });
  header(pdf, 'Cotizacion general', data.folio);
  infoBlock(pdf, data);
  let y = 214;
  y = drawQuoteSection(pdf, `Cotizacion principal ${data.folio}`, { ...data, status: data.status, items: data.items }, y);
  let grandTotal = Number(data.total || 0);
  (data.supplements || []).forEach((supplement) => {
    grandTotal += Number(supplement.total || 0);
    y = drawQuoteSection(pdf, `Complemento ${supplement.folio_adicional}`, { ...supplement, currency: data.currency, items: supplement.items || [] }, y);
  });
  if (y > 650) {
    pdf.addPage();
    y = 50;
  }
  line(pdf, y);
  y += 16;
  pdf.font('Helvetica-Bold').fontSize(13).fillColor('#991b1b').text('Total general cotizado', 340, y, { width: 120, align: 'right' });
  pdf.text(money(grandTotal, data.currency), 470, y, { width: 92, align: 'right' });
  footer(pdf, 'Cotizacion general de la orden de trabajo. Cada complemento conserva su aprobacion individual.');
  return pdf;
}

function streamPdf(res, filename, pdf) {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  pdf.pipe(res);
  pdf.end();
}

module.exports = {
  getWorkOrderDocument,
  getSupplementDocument,
  buildQuotePdf,
  buildFullWorkOrderQuotePdf,
  buildReceiptPdf,
  streamPdf
};
