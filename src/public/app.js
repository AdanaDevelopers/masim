let token = localStorage.getItem('masimToken');
let currentUser = JSON.parse(localStorage.getItem('masimUser') || 'null');
let customers = [];
let vehicles = [];
let catalog = [];
let orders = [];
let selectedOrderId = null;
let decodedVin = null;
let editingCustomerId = null;
let editingVehicleId = null;
let vehicleFilterCustomerId = '';
let vehicleFilterCustomerSearch = '';
let orderSearchText = '';
let selectedOrderStatuses = [];
let activeOrderDetailTab = 'summary';
let editingQuoteItemId = null;
let currentOrderDetail = null;
let quoteItemMode = 'catalog';
let quoteItemSearch = '';
let selectedQuoteCatalogItemId = '';
let selectedQuoteDocumentKey = 'main';
let editingCatalogId = null;
let catalogSearchText = '';
let catalogTypeFilter = '';
let showInactiveCatalog = false;
let billingIssuer = null;
let billingCertificate = null;
let invoices = [];
let whatsappStatus = null;
let whatsappConversations = [];
let whatsappMessages = [];
let selectedWhatsappJid = null;
let whatsappSearchText = '';
let whatsappReloading = false;

const $ = (id) => document.getElementById(id);

// ═══════════════════════════════════
// SISTEMA DE TOASTS PREMIUM
// ═══════════════════════════════════
function showToast(title, message, type = 'success') {
  const container = $('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  
  let iconClass = 'fa-solid fa-circle-check';
  if (type === 'error') iconClass = 'fa-solid fa-circle-xmark';
  if (type === 'info') iconClass = 'fa-solid fa-circle-info';

  toast.innerHTML = `
    <div class="toast-icon"><i class="${iconClass}"></i></div>
    <div class="toast-content">
      <div class="toast-title">${title}</div>
      <div class="toast-message">${message}</div>
    </div>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('fade-out');
    toast.addEventListener('animationend', () => toast.remove());
  }, 4000);
}

function showMessage(text) {
  showToast('Notificación', text, 'info');
}

// ═══════════════════════════════════
// API CALLS
// ═══════════════════════════════════
async function api(path, options = {}) {
  try {
    const res = await fetch(path, {
      ...options,
      headers: { 
        'Content-Type': 'application/json', 
        ...(token ? { Authorization: `Bearer ${token}` } : {}), 
        ...(options.headers || {}) 
      }
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error de API');
    return data;
  } catch (error) {
    showToast('Error', error.message, 'error');
    throw error;
  }
}

async function downloadFile(path, filename) {
  const res = await fetch(path, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) {
    let message = 'No se pudo descargar el documento';
    try {
      const data = await res.json();
      message = data.error || message;
    } catch (error) {}
    throw new Error(message);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function downloadFirstAvailable(paths, filename) {
  const errors = [];
  for (const path of paths) {
    try {
      await downloadFile(path, filename);
      return;
    } catch (error) {
      errors.push(`${path}: ${error.message}`);
    }
  }
  throw new Error(errors.join(' | '));
}

// ═══════════════════════════════════
// UTILIDADES
// ═══════════════════════════════════
function money(value) { 
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(value || 0);
}

function workOrderQuotedTotal(order) {
  return Number(order?.total || 0) + (order?.supplements || []).reduce((sum, supplement) => sum + Number(supplement.total || 0), 0);
}

function parseJsonSafe(value) {
  if (!value) return null;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch (error) { return null; }
}

function firstValue(...values) {
  return values.find((value) => value !== undefined && value !== null && String(value).trim() !== '') || null;
}

function normalizeSearch(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function phoneDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

function escapeAttr(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function jsString(value) {
  return JSON.stringify(String(value || ''));
}

function formatDateTime(value) {
  if (!value) return '';
  const date = new Date(String(value).replace(' ', 'T'));
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function contactInitials(value) {
  const parts = String(value || 'WA').trim().split(/\s+/).filter(Boolean);
  return (parts.length > 1 ? parts[0][0] + parts[1][0] : parts[0]?.slice(0, 2) || 'WA').toUpperCase();
}

// Saludo dinámico
function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Buenos días';
  if (hour < 18) return 'Buenas tardes';
  return 'Buenas noches';
}

function getFormattedDate() {
  const now = new Date();
  const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
  return now.toLocaleDateString('es-MX', options);
}

function getFormattedTime() {
  return new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
}

// ═══════════════════════════════════
// RIPPLE EFFECT EN BOTONES
// ═══════════════════════════════════
document.addEventListener('click', (e) => {
  const button = e.target.closest('button');
  if (!button || button.classList.contains('password-toggle') || button.classList.contains('hamburger-btn') || button.classList.contains('menu-close-btn')) return;
  
  const ripple = document.createElement('span');
  ripple.className = 'ripple';
  const rect = button.getBoundingClientRect();
  const size = Math.max(rect.width, rect.height);
  ripple.style.width = ripple.style.height = `${size}px`;
  ripple.style.left = `${e.clientX - rect.left - size / 2}px`;
  ripple.style.top = `${e.clientY - rect.top - size / 2}px`;
  button.appendChild(ripple);
  ripple.addEventListener('animationend', () => ripple.remove());
});

// ═══════════════════════════════════
// VEHICLE SPECS
// ═══════════════════════════════════
function vehicleSpecsFromDecoded(data) {
  const raw = data?.raw || data || {};
  const liters = firstValue(data?.displacementLiters, raw.DisplacementL);
  const cylinders = firstValue(data?.engineCylinders, raw.EngineCylinders);
  const engineParts = [];
  if (liters) engineParts.push(`${Number(liters).toFixed(Number(liters) % 1 === 0 ? 0 : 1)} L`);
  if (cylinders) engineParts.push(`${cylinders} cilindros`);
  if (firstValue(data?.engine, raw.EngineModel)) engineParts.push(firstValue(data?.engine, raw.EngineModel));

  return [
    { label: 'Tipo', icon: 'fa-car-side', value: firstValue(data?.vehicleType, raw.VehicleType, raw.BodyClass) },
    { label: 'Carroceria', icon: 'fa-car-rear', value: firstValue(data?.bodyClass, raw.BodyClass) },
    { label: 'Motor', icon: 'fa-gears', value: engineParts.join(' / ') || null },
    { label: 'Combustible', icon: 'fa-gas-pump', value: firstValue(data?.fuelType, raw.FuelTypePrimary) },
    { label: 'Transmision', icon: 'fa-right-left', value: [firstValue(data?.transmissionSpeed, raw.TransmissionSpeeds), firstValue(data?.transmission, raw.TransmissionStyle)].filter(Boolean).join(' vel. ') || null },
    { label: 'Traccion', icon: 'fa-road', value: firstValue(data?.driveType, raw.DriveType) },
    { label: 'Puertas', icon: 'fa-door-open', value: firstValue(data?.doors, raw.Doors) },
    { label: 'Pais planta', icon: 'fa-industry', value: firstValue(data?.plantCountry, raw.PlantCountry) }
  ];
}

function renderSpecsGrid(data) {
  const basicSpecs = [
    { label: 'Año', icon: 'fa-calendar', value: data?.year },
    { label: 'Marca', icon: 'fa-copyright', value: data?.make },
    { label: 'Modelo', icon: 'fa-car', value: data?.model },
    { label: 'Version', icon: 'fa-sliders', value: data?.trim }
  ];

  return [...basicSpecs, ...vehicleSpecsFromDecoded(data)]
    .filter((item) => item.value)
    .map((item) => `
      <div class="spec-item">
        <span class="spec-label"><i class="fa-solid ${item.icon}"></i> ${item.label}</span>
        <span class="spec-value">${item.value}</span>
      </div>
    `).join('') || '<div class="muted">No se encontraron datos tecnicos claros. Puedes capturar el vehiculo manualmente.</div>';
}

// ═══════════════════════════════════
// NAVEGACIÓN DE TABS (CON ANIMACIÓN)
// ═══════════════════════════════════
function showTab(name) {
  // Cerrar menú mobile si está abierto
  closeMobileMenu();

  document.querySelectorAll('.tab').forEach((el) => {
    el.classList.add('hidden');
    el.classList.remove('tab-entering');
  });
  
  document.querySelectorAll('.menu button[data-tab]').forEach((el) => {
    el.classList.toggle('active', el.dataset.tab === name);
  });
  
  const targetTab = $(name);
  if (targetTab) {
    targetTab.classList.remove('hidden');
    // Trigger animación de entrada
    requestAnimationFrame(() => {
      targetTab.classList.add('tab-entering');
    });
  }
}

// ═══════════════════════════════════
// MENÚ HAMBURGUESA MOBILE
// ═══════════════════════════════════
function openMobileMenu() {
  $('sidebarMenu')?.classList.add('open');
  $('mobileOverlay')?.classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeMobileMenu() {
  $('sidebarMenu')?.classList.remove('open');
  $('mobileOverlay')?.classList.remove('active');
  document.body.style.overflow = '';
}

$('hamburgerBtn')?.addEventListener('click', openMobileMenu);
$('menuCloseBtn')?.addEventListener('click', closeMobileMenu);
$('mobileOverlay')?.addEventListener('click', closeMobileMenu);

// ═══════════════════════════════════
// TOGGLE CONTRASEÑA
// ═══════════════════════════════════
$('togglePassword')?.addEventListener('click', () => {
  const input = $('loginPassword');
  const icon = $('togglePassword').querySelector('i');
  if (input.type === 'password') {
    input.type = 'text';
    icon.className = 'fa-solid fa-eye-slash';
  } else {
    input.type = 'password';
    icon.className = 'fa-solid fa-eye';
  }
});

// ═══════════════════════════════════
// DASHBOARD HEADER
// ═══════════════════════════════════
function updateDashboardHeader() {
  const name = currentUser?.name || 'Usuario';
  const firstName = name.split(' ')[0];
  
  if ($('dashboardGreeting')) {
    $('dashboardGreeting').innerHTML = `<i class="fa-solid fa-chart-simple"></i> ${getGreeting()}, ${firstName}`;
  }
  if ($('dashboardSubtitle')) {
    $('dashboardSubtitle').textContent = 'Resumen general del taller';
  }
  if ($('dashboardDate')) {
    $('dashboardDate').textContent = getFormattedDate();
  }
  if ($('dashboardTime')) {
    $('dashboardTime').textContent = getFormattedTime();
  }
}

// Actualizar hora cada minuto
setInterval(() => {
  if ($('dashboardTime')) {
    $('dashboardTime').textContent = getFormattedTime();
  }
}, 60000);

setInterval(() => {
  if (token && currentUser?.role === 'administrador' && !$('whatsapp')?.classList.contains('hidden')) {
    reloadWhatsapp().catch(() => {});
  }
}, 12000);

// ═══════════════════════════════════
// SIDEBAR BADGE
// ═══════════════════════════════════
function updateOrdersBadge() {
  const badge = $('ordersBadge');
  if (!badge) return;
  const activeCount = orders.filter(o => o.status !== 'cerrada').length;
  if (activeCount > 0) {
    badge.textContent = activeCount;
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }
}

// ═══════════════════════════════════
// CARGA DE DATOS
// ═══════════════════════════════════
async function loadAll() {
  try {
    const baseRequests = [
      api('/api/customers'), 
      api('/api/vehicles'), 
      api(currentUser?.role === 'administrador' ? '/api/catalog?includeInactive=1' : '/api/catalog'), 
      api('/api/work-orders')
    ];
    if (currentUser?.role === 'administrador') {
      baseRequests.push(api('/api/billing/issuer'), api('/api/billing/certificate'), api('/api/billing/invoices'));
    }
    const result = await Promise.all(baseRequests);
    [customers, vehicles, catalog, orders] = result;
    if (currentUser?.role === 'administrador') {
      billingIssuer = result[4];
      billingCertificate = result[5];
      invoices = result[6] || [];
    }
    renderCustomers(); 
    renderVehicles(); 
    renderCatalog(); 
    renderBilling();
    renderWhatsapp();
    renderOrders(); 
    renderSelectors(); 
    renderSummary();
    updateOrdersBadge();
    updateDashboardHeader();
    
    if (selectedOrderId) {
      await selectOrder(selectedOrderId);
    }
    if (currentUser?.role === 'administrador') reloadWhatsapp().catch(() => {});
  } catch (err) {
    console.error("Error cargando catálogos", err);
  }
}

function renderBilling() {
  if (!$('billing')) return;
  if ($('issuerRfc')) $('issuerRfc').value = billingIssuer?.rfc || '';
  if ($('issuerLegalName')) $('issuerLegalName').value = billingIssuer?.legal_name || '';
  if ($('issuerFiscalRegime')) $('issuerFiscalRegime').value = billingIssuer?.fiscal_regime || '';
  if ($('issuerExpeditionPlace')) $('issuerExpeditionPlace').value = billingIssuer?.expedition_place || '';
  if ($('csdRfc')) $('csdRfc').value = billingCertificate?.rfc || billingIssuer?.rfc || '';
  if ($('certificateSummary')) {
    $('certificateSummary').innerHTML = billingCertificate
      ? `<strong>CSD ${billingCertificate.status}</strong><br>RFC: ${billingCertificate.rfc}<br>Vigencia: ${billingCertificate.csd_expiration_date || 'No disponible'}<br>Cargado: ${billingCertificate.upload_date || billingCertificate.updated_at || 'No disponible'}`
      : 'No hay CSD activo registrado localmente.';
  }
  if ($('billingInvoices')) {
    $('billingInvoices').innerHTML = invoices.map((invoice) => {
      const vehicle = [invoice.year, invoice.make, invoice.model].filter(Boolean).join(' ') || 'Vehiculo';
      return `
        <div class="item">
          <header>
            <strong><i class="fa-solid fa-file-invoice"></i> ${invoice.internal_folio}</strong>
            <span class="badge badge-facturada_cerrada">${invoice.status}</span>
          </header>
          <div class="item-row"><span class="item-label">OT</span><span class="item-value">${invoice.work_order_folio}</span></div>
          <div class="item-row"><span class="item-label">Cliente</span><span class="item-value">${invoice.customer_name || 'N/D'}</span></div>
          <div class="item-row"><span class="item-label">Vehiculo</span><span class="item-value">${vehicle} ${invoice.plates || ''}</span></div>
          <div class="item-row"><span class="item-label">UUID</span><span class="item-value">${invoice.uuid || 'Pendiente'}</span></div>
          <div class="item-footer">
            <strong>${money(invoice.total)}</strong>
            <div>
              <button class="secondary small" onclick="downloadInvoicePdf(${invoice.id}, '${invoice.internal_folio}')"><i class="fa-solid fa-file-pdf"></i> PDF</button>
              <button class="secondary small" onclick="downloadInvoiceXml(${invoice.id}, '${invoice.internal_folio}')"><i class="fa-solid fa-file-code"></i> XML</button>
            </div>
          </div>
        </div>
      `;
    }).join('') || '<div class="empty-state"><i class="fa-solid fa-file-invoice"></i><p>No hay facturas timbradas.</p></div>';
  }
}

function renderWhatsapp() {
  if (!$('whatsapp')) return;
  const isAdmin = currentUser?.role === 'administrador';
  if (!isAdmin) {
    if ($('whatsappStatusBox')) $('whatsappStatusBox').innerHTML = 'WhatsApp solo esta disponible para administradores.';
    return;
  }

  if ($('waCustomer')) {
    const selected = $('waCustomer').value;
    $('waCustomer').innerHTML = '<option value="">Seleccionar cliente...</option>' + customers.map((customer) => {
      const contact = customer.whatsapp || customer.phone || '';
      return `<option value="${customer.id}" data-phone="${escapeAttr(contact)}">${escapeHtml(customerDisplayName(customer))} ${contact ? '(' + escapeHtml(contact) + ')' : ''}</option>`;
    }).join('');
    if (selected) $('waCustomer').value = selected;
  }

  const statusLabel = whatsappStatus?.connected ? 'Conectado' : (whatsappStatus?.state || 'No iniciado');
  const totalUnread = whatsappConversations.reduce((sum, conversation) => sum + Number(conversation.unread_count || 0), 0);
  const selectedConversation = whatsappConversations.find((conversation) => conversation.jid === selectedWhatsappJid) || null;
  if ($('whatsappStatusBox')) {
    $('whatsappStatusBox').innerHTML = `
      <div class="wa-status-grid">
        <div><span class="wa-status-dot ${whatsappStatus?.connected ? 'online' : ''}"></span><strong>${escapeHtml(statusLabel)}</strong></div>
        <div><i class="fa-solid fa-comments"></i><strong>${whatsappConversations.length}</strong><span>chats</span></div>
        <div><i class="fa-solid fa-circle-dot"></i><strong>${totalUnread}</strong><span>sin leer</span></div>
        <div class="wa-status-actions">
          <button type="button" class="secondary small" onclick="startWhatsapp()"><i class="fa-solid fa-qrcode"></i> Iniciar / QR</button>
          <button type="button" class="secondary small" onclick="resetWhatsappSession()"><i class="fa-solid fa-plug-circle-xmark"></i> Reiniciar</button>
        </div>
      </div>
      ${whatsappStatus?.error ? `<div class="wa-error"><i class="fa-solid fa-triangle-exclamation"></i> ${escapeHtml(whatsappStatus.error)}</div>` : ''}
    `;
  }

  if ($('whatsappQrBox')) {
    $('whatsappQrBox').classList.toggle('hidden', !whatsappStatus?.qr);
    $('whatsappQrBox').innerHTML = whatsappStatus?.qr
      ? `<h2><i class="fa-solid fa-qrcode"></i> Escanea este QR</h2><p class="muted">Abre WhatsApp > Dispositivos vinculados > Vincular dispositivo.</p><img src="${whatsappStatus.qr}" alt="QR WhatsApp" style="max-width:260px; width:100%; background:white; border-radius:12px; padding:10px;">`
      : '';
  }

  if ($('whatsappConversations')) {
    const query = normalizeSearch(whatsappSearchText);
    const visibleConversations = whatsappConversations.filter((conversation) => {
      const haystack = [conversation.customer_name, conversation.phone, conversation.jid, conversation.last_body].join(' ');
      return !query || normalizeSearch(haystack).includes(query);
    });
    $('whatsappConversations').innerHTML = visibleConversations.map((conversation) => {
      const title = conversation.customer_name || conversation.phone || conversation.jid;
      const unread = Number(conversation.unread_count || 0);
      const isSelected = conversation.jid === selectedWhatsappJid;
      const previewPrefix = conversation.last_direction === 'out' ? 'Tu: ' : '';
      return `
        <button type="button" class="wa-conversation ${isSelected ? 'active' : ''} ${unread ? 'unread' : ''}" data-jid="${escapeAttr(conversation.jid)}">
          <span class="wa-avatar">${escapeHtml(contactInitials(title))}</span>
          <span class="wa-conversation-main">
            <strong>${escapeHtml(title)}</strong>
            <small>${escapeHtml(previewPrefix + (conversation.last_body || 'Mensaje sin texto'))}</small>
          </span>
          <span class="wa-conversation-meta">
            <small>${escapeHtml(formatDateTime(conversation.last_message_at))}</small>
            ${unread ? `<span class="wa-unread">${unread}</span>` : ''}
          </span>
        </button>
      `;
    }).join('') || '<div class="empty-state"><i class="fa-brands fa-whatsapp"></i><p>No hay conversaciones registradas.</p></div>';
  }

  if ($('whatsappThreadTitle')) {
    $('whatsappThreadTitle').textContent = selectedConversation
      ? (selectedConversation.customer_name || selectedConversation.phone || selectedConversation.jid)
      : 'Selecciona una conversación';
  }

  if ($('whatsappThreadAvatar')) {
    const avatarText = selectedConversation
      ? contactInitials(selectedConversation.customer_name || selectedConversation.phone || selectedConversation.jid)
      : 'WA';
    $('whatsappThreadAvatar').textContent = avatarText;
  }

  if ($('whatsappThreadMeta')) {
    $('whatsappThreadMeta').textContent = selectedConversation
      ? `${selectedConversation.phone || selectedConversation.jid} · ${selectedConversation.message_count} mensajes`
      : 'Elige un chat de la izquierda o escribe un numero para iniciar uno nuevo.';
  }

  if ($('whatsappMessages')) {
    $('whatsappMessages').innerHTML = whatsappMessages.map((message) => {
      const outgoing = message.direction === 'out';
      const failed = message.status === 'error';
      return `
        <div class="wa-message ${outgoing ? 'out' : 'in'} ${failed ? 'failed' : ''}">
          <div class="wa-bubble">
            <p>${escapeHtml(message.body || 'Mensaje sin texto')}</p>
            <small>${escapeHtml(formatDateTime(message.created_at))}${message.created_by_name ? ' · ' + escapeHtml(message.created_by_name) : ''}${failed ? ' · Error' : ''}</small>
          </div>
        </div>
      `;
    }).join('') || '<div class="wa-empty-thread"><i class="fa-brands fa-whatsapp"></i><h3>WhatsApp Masim</h3><p>Selecciona una conversación para ver todo el historial por persona.</p></div>';
    $('whatsappMessages').scrollTop = $('whatsappMessages').scrollHeight;
  }

  if ($('waPhone') && selectedConversation && !$('waPhone').value) {
    $('waPhone').value = selectedConversation.phone || '';
  }
}

async function reloadWhatsapp() {
  if (currentUser?.role !== 'administrador') return;
  if (whatsappReloading) return;
  whatsappReloading = true;
  try {
    [whatsappStatus, whatsappConversations] = await Promise.all([
      api('/api/whatsapp/status'),
      api('/api/whatsapp/conversations')
    ]);
    if (selectedWhatsappJid) {
      whatsappMessages = await api('/api/whatsapp/messages/' + encodeURIComponent(selectedWhatsappJid));
    }
    renderWhatsapp();
  } finally {
    whatsappReloading = false;
  }
}

async function startWhatsapp() {
  whatsappStatus = await api('/api/whatsapp/start', { method: 'POST', body: '{}' });
  renderWhatsapp();
  for (let i = 0; i < 15 && !whatsappStatus?.connected && !whatsappStatus?.qr; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await reloadWhatsapp();
  }
  showToast('WhatsApp', whatsappStatus.connected ? 'WhatsApp conectado.' : 'Escanea el QR para conectar WhatsApp.', 'info');
}

async function resetWhatsappSession() {
  if (!confirm('Esto cerrara la sesion local de WhatsApp y generara un QR nuevo. ¿Continuar?')) return;
  whatsappStatus = await api('/api/whatsapp/reset', { method: 'POST', body: '{}' });
  renderWhatsapp();
  showToast('WhatsApp', 'Sesion reiniciada. Escanea el nuevo QR.', 'info');
}

async function loadWhatsappMessages(jid) {
  selectedWhatsappJid = jid;
  await api('/api/whatsapp/messages/' + encodeURIComponent(jid) + '/read', { method: 'POST', body: '{}' });
  whatsappMessages = await api('/api/whatsapp/messages/' + encodeURIComponent(jid));
  const conversation = whatsappConversations.find((item) => item.jid === jid);
  if ($('waPhone')) $('waPhone').value = conversation?.phone || '';
  renderWhatsapp();
  reloadWhatsapp().catch(() => {});
}

async function sendWhatsappMessage() {
  const phone = $('waPhone')?.value;
  const message = $('waMessage')?.value;
  const selectedConversation = whatsappConversations.find((item) => item.jid === selectedWhatsappJid);
  const selectedPhone = phoneDigits(selectedConversation?.phone || selectedWhatsappJid);
  const inputPhone = phoneDigits(phone);
  const jid = selectedWhatsappJid && (!inputPhone || inputPhone === selectedPhone || selectedPhone.endsWith(inputPhone) || inputPhone.endsWith(selectedPhone))
    ? selectedWhatsappJid
    : null;
  const result = await api('/api/whatsapp/send', {
    method: 'POST',
    body: JSON.stringify({ phone, jid, message })
  });
  if (result?.jid) selectedWhatsappJid = result.jid;
  if ($('waMessage')) $('waMessage').value = '';
  await reloadWhatsapp();
  showToast('WhatsApp', 'Mensaje enviado correctamente.', 'success');
}

// ═══════════════════════════════════
// MAPA DE ESTADOS
// ═══════════════════════════════════
const statusMap = {
  'recepcion': { label: 'Ingresado (Recepción)', color: 'recepcion', icon: 'fa-car-burst' },
  'cotizacion_borrador': { label: 'Presupuesto (Borrador)', color: 'cotizacion_borrador', icon: 'fa-file-signature' },
  'esperando_aprobacion': { label: 'Esperando Aprobación', color: 'esperando_aprobacion', icon: 'fa-hourglass-half' },
  'ot_activa': { label: 'En Reparación', color: 'ot_activa', icon: 'fa-screwdriver-wrench' },
  'trabajo_finalizado': { label: 'Trabajo Terminado', color: 'trabajo_finalizado', icon: 'fa-square-check' },
  'cerrada': { label: 'Cerrado y Cobrado', color: 'facturada_cerrada', icon: 'fa-receipt' }
};

// ═══════════════════════════════════
// RENDER: DASHBOARD
// ═══════════════════════════════════
function renderSummary() {
  const counts = orders.reduce((acc, o) => { acc[o.status] = (acc[o.status] || 0) + 1; return acc; }, {});
  
  const states = ['recepcion', 'cotizacion_borrador', 'esperando_aprobacion', 'ot_activa', 'trabajo_finalizado', 'cerrada'];
  
  $('summary').innerHTML = states.map((s, i) => {
    const meta = statusMap[s];
    return `
      <div class="metric metric-${meta.color}" style="animation: fadeInUp 0.4s ${i * 0.06}s var(--ease-out) both;">
        <span><i class="fa-solid ${meta.icon}"></i> ${meta.label}</span>
        <strong>${counts[s] || 0}</strong>
      </div>
    `;
  }).join('');
}

// ═══════════════════════════════════
// RENDER: SELECTORES
// ═══════════════════════════════════
function renderSelectors() {
  const customerOptions = customers.map((c) => `<option value="${c.id}">${customerDisplayName(c)} (${c.phone || c.whatsapp || 'Sin tel.'})</option>`).join('');
  $('vehicleCustomer').innerHTML = customerOptions || '<option value="">Registra un cliente primero</option>';
  renderVehicleCustomerFilter();
  renderReceptionCustomerSummary();
  renderReceptionCustomerPicker();
  renderReceptionVehicles();
}

// ═══════════════════════════════════
// RENDER: CLIENTES
// ═══════════════════════════════════
function renderCustomers() {
  $('customersList').innerHTML = customers.map((c) => {
    const isCompany = (c.customer_type || 'particular') === 'empresa';
    const primaryContact = c.phone || c.whatsapp || 'Sin teléfono';
    const secondaryData = [c.email, c.rfc ? `RFC: ${c.rfc}` : null].filter(Boolean).join(' · ');
    return `
      <div class="item customer-compact-card">
        <header>
          <strong><i class="fa-solid ${isCompany ? 'fa-building' : 'fa-user'}"></i> ${customerDisplayName(c)}</strong>
          <span class="badge badge-recepcion">${isCompany ? 'Empresa' : 'Particular'}</span>
        </header>
        <div class="customer-compact-body">
          ${isCompany && c.contact_name ? `<span><i class="fa-solid fa-user-tie"></i> ${c.contact_name}</span>` : ''}
          <span><i class="fa-solid fa-phone"></i> ${primaryContact}</span>
          ${secondaryData ? `<span><i class="fa-solid fa-circle-info"></i> ${secondaryData}</span>` : ''}
          ${c.address ? `<span><i class="fa-solid fa-location-dot"></i> ${c.address}</span>` : ''}
        </div>
        <div class="item-footer customer-compact-actions">
          <span class="muted">ID #${c.id}</span>
          <button type="button" class="small secondary" data-edit-customer="${c.id}"><i class="fa-solid fa-pen-to-square"></i> Modificar</button>
        </div>
      </div>
    `;
  }).join('') || `<div class="empty-state"><i class="fa-solid fa-user-plus"></i><p>No hay clientes registrados. Comienza registrando tu primer cliente.</p></div>`;

  $('customersList').querySelectorAll('[data-edit-customer]').forEach((button) => {
    button.addEventListener('click', () => openCustomerModal(Number(button.dataset.editCustomer)));
  });
}

function setVehicleCustomerFilter(customerId) {
  vehicleFilterCustomerId = customerId ? String(customerId) : '';
  const customer = customers.find((c) => String(c.id) === vehicleFilterCustomerId);
  vehicleFilterCustomerSearch = customer ? customerDisplayName(customer) : '';
  if ($('vehicleFilterCustomerSearch')) {
    $('vehicleFilterCustomerSearch').value = vehicleFilterCustomerSearch;
  }
  $('vehicleFilterCustomerBox')?.classList.remove('picker-open');
  renderVehicleCustomerFilter();
  renderVehicles();
}

function renderVehicleCustomerFilter() {
  if (!$('vehicleFilterCustomerOptions')) return;
  if (vehicleFilterCustomerId && !customers.some((c) => String(c.id) === String(vehicleFilterCustomerId))) {
    vehicleFilterCustomerId = '';
    vehicleFilterCustomerSearch = '';
  }

  const query = vehicleFilterCustomerSearch.trim().toLowerCase();
  const selected = customers.find((c) => String(c.id) === vehicleFilterCustomerId);
  const rows = query && (!selected || customerDisplayName(selected) !== vehicleFilterCustomerSearch)
    ? customers.filter((c) => customerSearchText(c).includes(query))
    : customers;

  if ($('vehicleFilterCustomerSearch') && document.activeElement !== $('vehicleFilterCustomerSearch')) {
    $('vehicleFilterCustomerSearch').value = selected ? customerDisplayName(selected) : vehicleFilterCustomerSearch;
  }

  $('vehicleFilterCustomerOptions').innerHTML = `
    <button type="button" class="customer-option new-customer-option ${!vehicleFilterCustomerId ? 'selected' : ''}" data-all-customers="1">
      <i class="fa-solid fa-users"></i>
      <span><strong>Todos los clientes</strong><small>Mostrar todos los vehículos registrados</small></span>
    </button>
    ${rows.map((c) => `
      <button type="button" class="customer-option ${String(c.id) === String(vehicleFilterCustomerId) ? 'selected' : ''}" data-filter-customer-id="${c.id}">
        <i class="fa-solid ${c.customer_type === 'empresa' ? 'fa-building' : 'fa-user'}"></i>
        <span>
          <strong>${customerDisplayName(c)}</strong>
          <small>${c.customer_type || 'particular'} · ${c.phone || c.whatsapp || 'Sin teléfono'}${c.rfc ? ' · RFC: ' + c.rfc : ''}</small>
        </span>
      </button>
    `).join('') || '<div class="customer-empty">No se encontraron clientes con esa búsqueda.</div>'}
  `;

  $('vehicleFilterCustomerOptions').querySelector('[data-all-customers]')?.addEventListener('click', () => {
    vehicleFilterCustomerSearch = '';
    setVehicleCustomerFilter('');
  });
  $('vehicleFilterCustomerOptions').querySelectorAll('[data-filter-customer-id]').forEach((button) => {
    button.addEventListener('click', () => setVehicleCustomerFilter(button.dataset.filterCustomerId));
  });
}

// ═══════════════════════════════════
// RENDER: VEHÍCULOS
// ═══════════════════════════════════
function renderVehicles() {
  const filterCustomerId = vehicleFilterCustomerId;
  const rows = !filterCustomerId ? vehicles : vehicles.filter((v) => String(v.customer_id) === String(filterCustomerId));
  $('vehiclesList').innerHTML = rows.map((v) => {
    const title = `${v.year || ''} ${v.make || ''} ${v.model || ''}`.replace(/\s+/g, ' ').trim() || 'Vehículo sin datos';
    const details = [
      v.trim ? `Versión: ${v.trim}` : null,
      v.mileage ? `${Number(v.mileage).toLocaleString()} KM` : null,
      v.economic_number ? `Eco: ${v.economic_number}` : null,
      v.vehicle_type || null
    ].filter(Boolean).join(' · ');

    return `
      <div class="item customer-compact-card vehicle-compact-card">
        <header>
          <strong><i class="fa-solid fa-car-side"></i> ${title}</strong>
          <span class="badge badge-ot_activa">${v.plates || 'S/P'}</span>
        </header>
        <div class="customer-compact-body">
          <span><i class="fa-solid fa-user"></i> ${v.customer_name || 'Sin propietario'}</span>
          ${details ? `<span><i class="fa-solid fa-circle-info"></i> ${details}</span>` : ''}
          <span><i class="fa-solid fa-barcode"></i> VIN: ${v.vin || 'No registrado'}</span>
        </div>
        ${parseJsonSafe(v.nhtsa_raw_json) ? `
          <details class="vehicle-tech-details compact-tech-details">
            <summary><i class="fa-solid fa-microchip"></i> Ficha tecnica</summary>
            <div class="specs-grid compact-specs">${renderSpecsGrid({
              year: v.year,
              make: v.make,
              model: v.model,
              trim: v.trim,
              vehicleType: v.vehicle_type,
              raw: parseJsonSafe(v.nhtsa_raw_json)
            })}</div>
          </details>` : ''}
        <div class="item-footer customer-compact-actions vehicle-compact-actions">
          <span class="muted">ID #${v.id}</span>
          <button type="button" class="small secondary" data-edit-vehicle="${v.id}"><i class="fa-solid fa-pen-to-square"></i> Modificar</button>
        </div>
      </div>
    `;
  }).join('') || `<div class="empty-state"><i class="fa-solid fa-car-on"></i><p>No hay vehículos registrados. Registra un vehículo para comenzar.</p></div>`;

  $('vehiclesList').querySelectorAll('[data-edit-vehicle]').forEach((button) => {
    button.addEventListener('click', () => openVehicleModal(Number(button.dataset.editVehicle)));
  });
}

// ═══════════════════════════════════
// RENDER: CATÁLOGO
// ═══════════════════════════════════
function catalogSearchHaystack(item) {
  return normalizeSearch([item.description, item.type, item.public_price, item.internal_cost].filter(Boolean).join(' '));
}

function filteredCatalogItems() {
  const query = normalizeSearch(catalogSearchText);
  return catalog.filter((item) => {
    const matchesActive = showInactiveCatalog || item.active !== 0;
    const matchesType = !catalogTypeFilter || item.type === catalogTypeFilter;
    const matchesSearch = !query || query.split(/\s+/).every((part) => catalogSearchHaystack(item).includes(part));
    return matchesActive && matchesType && matchesSearch;
  });
}

function renderCatalog() {
  const rows = filteredCatalogItems();
  if ($('catalogShowInactive')) {
    $('catalogShowInactive').closest('label')?.classList.toggle('hidden', currentUser?.role !== 'administrador');
    $('catalogShowInactive').checked = showInactiveCatalog;
  }

  $('catalogList').innerHTML = rows.map((i) => {
    const isService = i.type === 'mano_obra';
    const typeLabel = isService ? 'Servicio / Mano Obra' : 'Refacción';
    const typeIcon = isService ? 'fa-screwdriver-wrench' : 'fa-box';
    const badgeClass = isService ? 'badge-ot_activa' : 'badge-cotizacion_borrador';
    const inactive = i.active === 0;
    const adminActions = currentUser?.role === 'administrador'
      ? `<div class="item-footer customer-compact-actions">
          <span class="muted">ID #${i.id}${inactive ? ' · Inactivo' : ''}</span>
          <div style="display:flex; gap:8px; flex-wrap:wrap; justify-content:flex-end;">
            <button type="button" class="small secondary" data-edit-catalog="${i.id}"><i class="fa-solid fa-pen-to-square"></i> Modificar</button>
            ${inactive
              ? `<button type="button" class="small brand-outline" data-restore-catalog="${i.id}"><i class="fa-solid fa-rotate-left"></i> Reactivar</button>`
              : `<button type="button" class="small secondary danger-action" data-delete-catalog="${i.id}"><i class="fa-solid fa-ban"></i> Desactivar</button>`}
          </div>
        </div>`
      : '';
    
    return `
      <div class="item" style="${inactive ? 'opacity:0.68;' : ''}">
        <header>
          <strong>${i.description}</strong>
          <span class="badge ${inactive ? 'badge-recepcion' : badgeClass}"><i class="fa-solid ${typeIcon}"></i> ${inactive ? 'Inactivo' : typeLabel}</span>
        </header>
        <div class="item-row" style="margin-top: 5px;">
          <span class="item-label">Precio Público</span>
          <span class="item-value" style="color: var(--success); font-weight: 700;">${money(i.public_price)}</span>
        </div>
        ${i.internal_cost !== undefined ? `
        <div class="item-row">
          <span class="item-label">Costo Interno</span>
          <span class="item-value">${money(i.internal_cost)}</span>
        </div>` : ''}
        ${adminActions}
      </div>
    `;
  }).join('') || `<div class="empty-state"><i class="fa-solid fa-tags"></i><p>No hay items que coincidan con los filtros actuales.</p></div>`;

  $('catalogList').querySelectorAll('[data-edit-catalog]').forEach((button) => {
    button.addEventListener('click', () => openCatalogEdit(Number(button.dataset.editCatalog)));
  });
  $('catalogList').querySelectorAll('[data-delete-catalog]').forEach((button) => {
    button.addEventListener('click', () => deleteCatalogItem(Number(button.dataset.deleteCatalog)));
  });
  $('catalogList').querySelectorAll('[data-restore-catalog]').forEach((button) => {
    button.addEventListener('click', () => restoreCatalogItem(Number(button.dataset.restoreCatalog)));
  });
}

function resetCatalogForm() {
  editingCatalogId = null;
  if ($('catalogDescription')) $('catalogDescription').value = '';
  if ($('catalogType')) $('catalogType').value = 'mano_obra';
  if ($('catalogPrice')) $('catalogPrice').value = '';
  if ($('catalogCost')) $('catalogCost').value = '';
  if ($('saveCatalog')) $('saveCatalog').innerHTML = '<i class="fa-solid fa-plus"></i> Agregar al Catálogo';
  $('cancelCatalogEdit')?.classList.add('hidden');
  if ($('catalogModeBadge')) $('catalogModeBadge').textContent = 'Nuevo item';
}

function openCatalogEdit(id) {
  const item = catalog.find((row) => Number(row.id) === Number(id));
  if (!item) return;
  editingCatalogId = item.id;
  $('catalogDescription').value = item.description || '';
  $('catalogType').value = item.type || 'mano_obra';
  $('catalogPrice').value = Number(item.public_price || 0);
  $('catalogCost').value = Number(item.internal_cost || 0);
  $('saveCatalog').innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Guardar Cambios';
  $('cancelCatalogEdit')?.classList.remove('hidden');
  if ($('catalogModeBadge')) $('catalogModeBadge').textContent = `Editando CAT-${item.id}`;
  $('catalogDescription')?.focus();
}

function upsertCatalogItem(item) {
  const index = catalog.findIndex((row) => Number(row.id) === Number(item.id));
  if (index >= 0) catalog[index] = item;
  else catalog.push(item);
  catalog.sort((a, b) => String(a.description).localeCompare(String(b.description), 'es'));
}

async function deleteCatalogItem(id) {
  if (!confirm('¿Desactivar este item del catálogo? Ya no aparecerá en nuevas cotizaciones, pero las órdenes existentes conservarán sus datos.')) return;
  const item = await api(`/api/catalog/${id}`, { method: 'DELETE' });
  upsertCatalogItem(item);
  if (editingCatalogId === id) resetCatalogForm();
  renderCatalog();
  showToast('Item desactivado', 'El historial de órdenes no fue modificado.');
}

async function restoreCatalogItem(id) {
  const item = await api(`/api/catalog/${id}/restore`, { method: 'PUT' });
  upsertCatalogItem(item);
  renderCatalog();
  showToast('Item reactivado', 'El item vuelve a estar disponible para cotizaciones.');
}

// ═══════════════════════════════════
// RENDER: ÓRDENES
// ═══════════════════════════════════
function orderSearchHaystack(o) {
  return normalizeSearch([
    o.folio,
    o.customer_name,
    o.name,
    o.contact_name,
    o.phone,
    o.whatsapp,
    o.make,
    o.model,
    o.trim,
    o.year,
    o.vin,
    o.plates,
    o.economic_number,
    o.symptom,
    statusMap[o.status]?.label
  ].filter(Boolean).join(' '));
}

function filteredOrders() {
  const query = normalizeSearch(orderSearchText);
  return orders.filter((o) => {
    const matchesStatus = selectedOrderStatuses.length === 0 || selectedOrderStatuses.includes(o.status);
    const matchesSearch = !query || query.split(/\s+/).every((part) => orderSearchHaystack(o).includes(part));
    return matchesStatus && matchesSearch;
  });
}

function renderOrderStatusFilters() {
  const container = $('ordersStatusFilters');
  if (!container) return;
  const states = Object.keys(statusMap);
  const allActive = selectedOrderStatuses.length === 0;
  container.innerHTML = `
    <button type="button" class="status-filter-chip ${allActive ? 'active' : ''}" data-order-status="all">
      <i class="fa-solid fa-layer-group"></i> Todas
    </button>
    ${states.map((status) => {
      const meta = statusMap[status];
      const active = selectedOrderStatuses.includes(status);
      const count = orders.filter((o) => o.status === status).length;
      return `
        <button type="button" class="status-filter-chip ${active ? 'active' : ''}" data-order-status="${status}">
          <i class="fa-solid ${meta.icon}"></i> ${meta.label} <strong>${count}</strong>
        </button>
      `;
    }).join('')}
  `;
  container.querySelectorAll('[data-order-status]').forEach((button) => {
    button.addEventListener('click', () => {
      const status = button.dataset.orderStatus;
      if (status === 'all') {
        selectedOrderStatuses = [];
      } else if (selectedOrderStatuses.includes(status)) {
        selectedOrderStatuses = selectedOrderStatuses.filter((item) => item !== status);
      } else {
        selectedOrderStatuses = [...selectedOrderStatuses, status];
      }
      renderOrders();
    });
  });
}

function renderOrders() {
  renderOrderStatusFilters();
  const rows = filteredOrders();
  const count = $('ordersResultCount');
  if (count) count.textContent = `${rows.length} ${rows.length === 1 ? 'orden' : 'órdenes'}`;

  $('ordersList').innerHTML = rows.map((o) => {
    const meta = statusMap[o.status] || { label: o.status, color: 'recepcion', icon: 'fa-receipt' };
    const vehicleTitle = [o.year, o.make, o.model, o.trim].filter(Boolean).join(' ') || 'Vehículo sin datos';
    const customerType = o.customer_type === 'empresa' ? 'Empresa' : 'Particular';
    
    return `
      <div class="item order-card">
        <header>
          <strong style="color: var(--brand); font-size:15px;"><i class="fa-solid fa-receipt"></i> ${o.folio}</strong>
          <button class="small" onclick="selectOrder(${o.id})">
            <i class="fa-solid fa-folder-open"></i> Abrir
          </button>
        </header>
        <div class="item-row">
          <span class="item-label"><i class="fa-solid fa-building-user"></i> ${customerType}</span>
          <span class="item-value">${o.customer_name || 'Sin cliente'}</span>
        </div>
        <div class="item-row">
          <span class="item-label"><i class="fa-solid fa-car"></i> Vehículo</span>
          <span class="item-value">${vehicleTitle}</span>
        </div>
        <div class="order-card-meta">
          <span><i class="fa-solid fa-barcode"></i> VIN/NIV: ${o.vin || 'N/D'}</span>
          <span><i class="fa-solid fa-id-card"></i> Placas: ${o.plates || 'S/P'}</span>
          <span><i class="fa-solid fa-hashtag"></i> Económico: ${o.economic_number || 'N/D'}</span>
          <span><i class="fa-solid fa-gauge-high"></i> KM: ${o.mileage ? Number(o.mileage).toLocaleString('es-MX') : 'N/D'}</span>
        </div>
        ${o.symptom ? `<div class="order-card-symptom"><i class="fa-solid fa-triangle-exclamation"></i> ${o.symptom}</div>` : ''}
        <div class="item-footer">
          <span class="badge badge-${meta.color}"><i class="fa-solid ${meta.icon}"></i> ${meta.label}</span>
          <strong style="color: #fff; font-size:14px;">${money(o.total)}</strong>
        </div>
      </div>
    `;
  }).join('') || `<div class="empty-state orders-empty"><i class="fa-solid fa-magnifying-glass"></i><p>No hay órdenes que coincidan con la búsqueda o los estatus seleccionados.</p></div>`;
}

// ═══════════════════════════════════
// RENDER: PIPELINE
// ═══════════════════════════════════
function renderPipeline(status) {
  const steps = [
    { key: 'recepcion', label: 'Recepción', icon: 'fa-car-burst' },
    { key: 'cotizacion_borrador', label: 'Presupuesto', icon: 'fa-file-signature' },
    { key: 'esperando_aprobacion', label: 'Aprobación', icon: 'fa-hourglass-half' },
    { key: 'ot_activa', label: 'Reparación', icon: 'fa-screwdriver-wrench' },
    { key: 'trabajo_finalizado', label: 'Terminado', icon: 'fa-square-check' },
    { key: 'cerrada', label: 'Cerrado', icon: 'fa-receipt' }
  ];

  let activeIndex = steps.findIndex(s => s.key === status);
  if (activeIndex === -1) activeIndex = 0;

  const percent = (activeIndex / (steps.length - 1)) * 100;

  return `
    <div class="pipeline-container">
      <div class="pipeline">
        <div class="pipeline-progress" style="width: ${percent}%"></div>
        ${steps.map((s, idx) => {
          let stepClass = '';
          if (idx === activeIndex) stepClass = 'active';
          else if (idx < activeIndex) stepClass = 'completed';

          return `
            <div class="pipeline-step ${stepClass}">
              <div class="pipeline-icon" title="${s.label}"><i class="fa-solid ${s.icon}"></i></div>
              <div class="pipeline-label">${s.label}</div>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;
}

// ═══════════════════════════════════
// DETALLE DE ORDEN
// ═══════════════════════════════════
function renderQuoteDocumentList(o) {
  const docs = [
    { key: 'main', title: 'Cotización principal', status: o.status, total: o.total, count: o.items.length, folio: o.folio },
    ...(o.supplements || []).map((s) => ({ key: `supp-${s.id}`, title: s.description || 'Complemento de cotización', status: s.status, total: s.total, count: (s.items || []).length, folio: s.folio_adicional }))
  ];
  const canAddComplement = !['recepcion', 'cotizacion_borrador'].includes(o.status);
  return `
    <aside class="quote-doc-list">
      <div class="quote-doc-list-head">
        <strong>Cotizaciones</strong>
        ${canAddComplement ? '<button type="button" class="small brand-outline" onclick="createQuoteComplement()"><i class="fa-solid fa-plus"></i> Agregar complemento a cotización</button>' : ''}
      </div>
      ${docs.map((doc) => `
        <button type="button" class="quote-doc-card ${selectedQuoteDocumentKey === doc.key ? 'active' : ''}" onclick="selectQuoteDocument('${doc.key}')">
          <span><b>${doc.folio}</b><small>${doc.title}</small></span>
          <span><em>${doc.count} conceptos</em><strong>${money(doc.total)}</strong></span>
        </button>
      `).join('')}
    </aside>
  `;
}

function renderQuoteItemForm() {
  const activeCatalog = catalog.filter((item) => item.active !== 0);
  const selectedCatalogItem = activeCatalog.find((item) => String(item.id) === String(selectedQuoteCatalogItemId));
  return `
    <div class="quote-add-card">
      <div class="quote-item-picker-grid">
        <div id="quoteItemPickerBox" class="quote-item-picker">
          <label class="customer-search-label">
            <span class="customer-search-input"><i class="fa-solid fa-magnifying-glass"></i>
              <input id="quoteItemSearch" placeholder="Buscar servicio o refacción..." autocomplete="off" value="${escapeAttr(selectedCatalogItem ? selectedCatalogItem.description : quoteItemSearch)}">
            </span>
          </label>
          <div id="quoteItemOptions" class="customer-options quote-item-options"></div>
        </div>
        <input id="quoteItemQty" type="number" min="1" step="1" value="1" aria-label="Cantidad" placeholder="Cant.">
        <input id="quoteItemPrice" type="number" min="0" step="0.01" aria-label="Precio" placeholder="Precio" value="${selectedCatalogItem ? Number(selectedCatalogItem.public_price || 0) : ''}" readonly>
        <button type="button" onclick="addOrderItem()"><i class="fa-solid fa-plus"></i> Agregar</button>
      </div>
      <div id="quoteNewItemBox" class="quote-new-item-box ${quoteItemMode === 'new' ? '' : 'hidden'}">
        <div class="subsection-title">Nuevo item</div>
        <div class="quote-new-item-row">
          <input id="quoteNewDescription" placeholder="Descripción del item" value="${escapeAttr(quoteItemSearch)}">
          <select id="quoteNewType" aria-label="Tipo de item">
            <option value="mano_obra">Mano de obra</option>
            <option value="refaccion">Refacción</option>
          </select>
          <input id="quoteNewPrice" type="number" min="0" step="0.01" placeholder="Precio público">
          <input id="quoteNewCost" type="number" min="0" step="0.01" placeholder="Costo interno">
        </div>
        <label class="quote-save-catalog-check"><input id="quoteSaveCatalog" type="checkbox" checked> Guardar también en catálogo</label>
      </div>
    </div>
  `;
}

function renderSupplementQuotePane(o, supplement) {
  const canEdit = supplement.status === 'borrador';
  return `
    <div class="quote-pane-layout quote-doc-layout">
      ${renderQuoteDocumentList(o)}
      <div class="quote-document-detail">
        <div class="detail-section-head quote-pane-head">
          <h3><i class="fa-solid fa-file-circle-plus"></i> ${supplement.description || 'Complemento de cotización'}</h3>
          <div class="quote-head-actions">
            <span class="badge ${supplement.status === 'aprobado' ? 'badge-facturada_cerrada' : 'badge-esperando_aprobacion'}">${supplement.status}</span>
            <strong>${money(supplement.total)}</strong>
          </div>
        </div>
        ${canEdit ? renderQuoteItemForm() : '<div class="quote-readonly-note"><i class="fa-solid fa-lock"></i><span>Este complemento ya fue enviado a aprobación y no se puede modificar.</span></div>'}
        <div class="quote-items-scroll">
          ${(supplement.items || []).length ? `
            <table class="quote-items-table">
              <thead><tr><th>Clave</th><th>Concepto</th><th style="text-align:right;">Cantidad</th><th style="text-align:right;">Precio</th><th style="text-align:right;">Subtotal</th><th style="text-align:right;">Acciones</th></tr></thead>
              <tbody>
                ${(supplement.items || []).map((i) => `
                  <tr class="quote-table-row">
                    <td>${i.item_id ? `CAT-${i.item_id}` : `AD-${i.id}`}</td>
                    <td><strong>${i.description}</strong><span>${i.type === 'mano_obra' ? 'Mano de obra' : 'Refacción'}</span></td>
                    <td style="text-align:right;">${i.quantity}</td>
                    <td style="text-align:right;">${money(i.applied_price)}</td>
                    <td style="text-align:right;"><b>${money(i.quantity * i.applied_price)}</b></td>
                    <td style="text-align:right;">${canEdit ? `<button class="secondary small danger-action" onclick="deleteSupplementItem(${supplement.id}, ${i.id})"><i class="fa-solid fa-trash"></i> Eliminar</button>` : '<span>Solo lectura</span>'}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          ` : '<div class="detail-empty">No se han agregado conceptos a este complemento.</div>'}
        </div>
        <div class="quote-complement-actions">
          ${canEdit ? `<button onclick="sendSupplementApproval(${supplement.id})" class="brand-outline"><i class="fa-solid fa-paper-plane"></i> Cerrar y enviar a aprobación</button>` : `<button onclick="downloadSupplementQuote(${supplement.id}, '${supplement.folio_adicional}')" class="secondary"><i class="fa-solid fa-file-pdf"></i> Generar PDF</button>`}
        </div>
      </div>
    </div>
  `;
}

function renderQuotePaneContent(o) {
  const supplements = o.supplements || [];
  if (selectedQuoteDocumentKey !== 'main' && !supplements.some((s) => selectedQuoteDocumentKey === `supp-${s.id}`)) {
    selectedQuoteDocumentKey = 'main';
  }
  const selectedSupplement = supplements.find((s) => selectedQuoteDocumentKey === `supp-${s.id}`);
  if (selectedSupplement) return renderSupplementQuotePane(o, selectedSupplement);
  const discountAmount = Number(o.discount_amount || 0);
  const conceptCount = o.items.length + (discountAmount > 0 ? 1 : 0);
  const canEditQuote = ['recepcion', 'cotizacion_borrador'].includes(o.status);
  return `
    <div class="quote-pane-layout quote-doc-layout">
      ${renderQuoteDocumentList(o)}
      <div class="quote-document-detail">
      <div class="detail-section-head quote-pane-head">
        <h3><i class="fa-solid fa-list-check"></i> Cotización</h3>
        <div class="quote-head-actions">
          <strong>${conceptCount} ${conceptCount === 1 ? 'concepto' : 'conceptos'}</strong>
        </div>
      </div>
      ${canEditQuote ? renderQuoteItemForm() : ''}
      <div class="quote-items-scroll">
        ${conceptCount > 0 ? `
          <table class="quote-items-table">
            <thead>
              <tr>
                <th>Clave</th>
                <th>Concepto</th>
                <th style="text-align:right;">Cantidad</th>
                <th style="text-align:right;">Precio</th>
                <th style="text-align:right;">Subtotal</th>
                <th style="text-align:right;">Editar</th>
              </tr>
            </thead>
            <tbody>
            ${o.items.map((i) => {
              const isEditing = editingQuoteItemId === i.id;
              return `
                <tr class="quote-table-row ${isEditing ? 'editing' : ''}">
                  <td>${i.item_id ? `CAT-${i.item_id}` : `C-${i.id}`}</td>
                  <td><strong>${i.description}</strong><span>${i.type === 'mano_obra' ? 'Mano de obra' : 'Refacción'}</span></td>
                  <td style="text-align:right;">${i.quantity}</td>
                  <td style="text-align:right;">${money(i.applied_price)}</td>
                  <td style="text-align:right;"><b>${money(i.quantity * i.applied_price)}</b></td>
                  <td style="text-align:right;">${canEditQuote ? `<button type="button" class="secondary small" onclick="editQuoteItem(${i.id})"><i class="fa-solid fa-pen-to-square"></i> Editar</button>` : '<span>Solo lectura</span>'}</td>
                </tr>
                  ${canEditQuote && isEditing ? `
                    <tr class="quote-edit-table-row">
                      <td colspan="6">
                        <div class="quote-edit-panel">
                          <label><span>Cantidad</span><input id="itemQty${i.id}" type="number" min="1" step="1" value="${i.quantity}"></label>
                          <label><span>Precio</span><input id="itemPrice${i.id}" type="number" min="0" step="0.01" value="${i.applied_price}"></label>
                          <button type="button" onclick="updateOrderItem(${i.id})"><i class="fa-solid fa-floppy-disk"></i> Guardar</button>
                          <button type="button" class="secondary" onclick="cancelQuoteItemEdit()"><i class="fa-solid fa-ban"></i> Cancelar</button>
                          <button type="button" class="secondary danger-action" onclick="deleteOrderItem(${i.id})"><i class="fa-solid fa-trash"></i> Eliminar</button>
                        </div>
                      </td>
                    </tr>
                  ` : ''}
              `;
            }).join('')}
            ${discountAmount > 0 ? `
              <tr class="quote-table-row discount-row">
                <td>DESC</td>
                <td><strong>${o.adjustment_note || 'Descuento / ajuste'}</strong><span>${o.discount_type === 'percent' ? `Descuento ${Number(o.discount_value || 0)}%` : 'Descuento por monto'}</span></td>
                <td style="text-align:right;">1</td>
                <td style="text-align:right;">-${money(discountAmount)}</td>
                <td style="text-align:right;"><b>-${money(discountAmount)}</b></td>
                <td style="text-align:right;">${canEditQuote ? '<button type="button" class="secondary small" onclick="openQuoteItemModal()"><i class="fa-solid fa-pen-to-square"></i> Editar</button>' : '<span>Solo lectura</span>'}</td>
              </tr>
            ` : ''}
            </tbody>
          </table>
        ` : '<div class="detail-empty">No se han agregado conceptos a esta orden.</div>'}
      </div>
      <div class="quote-complement-actions">
        ${canEditQuote ? '<button onclick="generateQuoteLink()" class="brand-outline"><i class="fa-solid fa-paper-plane"></i> Cerrar y enviar a aprobación</button>' : '<button onclick="downloadOrderQuote()" class="secondary"><i class="fa-solid fa-file-pdf"></i> Generar PDF</button>'}
      </div>
      </div>
    </div>
  `;
}

function quoteApprovalState(quote) {
  if (['ot_activa', 'aprobado', 'cerrada', 'trabajo_finalizado'].includes(quote.status)) return 'aprobada';
  if (['esperando_aprobacion'].includes(quote.status)) return 'pendiente';
  if (['rechazado', 'cotizacion_borrador'].includes(quote.status)) return 'rechazada';
  return 'preparacion';
}

function renderApprovalStatus(quotes) {
  const actionable = quotes.filter((quote) => quote.state !== 'preparacion');
  const pending = actionable.filter((quote) => quote.state === 'pendiente');
  const rejected = actionable.filter((quote) => quote.state === 'rechazada');
  const approved = actionable.filter((quote) => quote.state === 'aprobada');
  if (actionable.length && pending.length === 0 && rejected.length === 0) {
    return `<div class="approval-state-card approved"><i class="fa-solid fa-circle-check"></i><div><strong>Todas las cotizaciones están aprobadas</strong><p>${approved.length} cotización(es) autorizadas para esta orden de trabajo.</p></div></div>`;
  }
  if (rejected.length) {
    return `<div class="approval-state-card rejected"><i class="fa-solid fa-triangle-exclamation"></i><div><strong>Hay cotizaciones no aprobadas</strong><p>${rejected.length} rechazada(s) y ${pending.length} pendiente(s). Revisa los comentarios del cliente en la lista inferior.</p></div></div>`;
  }
  return `<div class="approval-state-card waiting"><i class="fa-solid fa-hourglass-half"></i><div><strong>Hay cotizaciones pendientes de aprobación</strong><p>${pending.length || 0} cotización(es) pendientes. Comparte el link de OT o aprueba manualmente por línea.</p></div></div>`;
}

function suggestedMaintenanceDate() {
  const date = new Date();
  date.setMonth(date.getMonth() + 6);
  return date.toISOString().slice(0, 10);
}

function renderScheduledMaintenanceSummary(o) {
  const visit = (o.maintenance_visits || []).find((item) => item.status === 'programada') || (o.maintenance_visits || [])[0];
  if (!visit) return '';
  return `
    <div class="approval-state-card approved">
      <i class="fa-solid fa-calendar-check"></i>
      <div>
        <strong>Próxima visita programada</strong>
        <p>${visit.service_type || 'Servicio'} · ${visit.scheduled_date || 'Fecha por definir'} · KM ${visit.scheduled_mileage ? Number(visit.scheduled_mileage).toLocaleString('es-MX') : 'por definir'}</p>
      </div>
    </div>
  `;
}

function renderFlowActions(o) {
  if (o.status === 'ot_activa') {
    return `
      <button onclick="finalizeOrder()" class="purple-action"><i class="fa-solid fa-circle-check"></i> Concluir reparación</button>
    `;
  }
  if (o.status === 'trabajo_finalizado') {
    return `
      <div class="payment-action">
        <select id="paymentMethod">
          <option value="efectivo">Efectivo</option>
          <option value="tarjeta">Tarjeta Bancaria</option>
          <option value="transferencia">Transferencia</option>
        </select>
        <button onclick="closeOrder()" class="green-action"><i class="fa-solid fa-file-invoice-dollar"></i> Cobrar, cerrar y generar recibo</button>
      </div>
    `;
  }
  if (o.status === 'cerrada') {
    const invoice = o.invoice;
    return `${renderScheduledMaintenanceSummary(o)}
      <button onclick="downloadOrderReceipt()" class="green-action"><i class="fa-solid fa-receipt"></i> Descargar recibo</button>
      ${invoice
        ? `<button onclick="downloadInvoicePdf(${invoice.id}, '${invoice.internal_folio}')" class="blue-action"><i class="fa-solid fa-file-pdf"></i> Factura PDF</button><button onclick="downloadInvoiceXml(${invoice.id}, '${invoice.internal_folio}')" class="secondary"><i class="fa-solid fa-file-code"></i> Factura XML</button>`
        : '<button onclick="stampCurrentOrderInvoice()" class="blue-action"><i class="fa-solid fa-file-invoice-dollar"></i> Timbrar factura</button>'}`;
  }
  return '<div class="detail-empty">Agrega conceptos a la cotización para avanzar en el flujo.</div>';
}

function renderApprovalPaneContent(o) {
  const quotes = [
    { type: 'main', id: o.id, folio: o.folio, description: 'Cotización principal', status: o.status, total: o.total, rejection_note: o.rejection_note, state: quoteApprovalState(o) },
    ...(o.supplements || []).map((s) => ({ type: 'supplement', id: s.id, folio: s.folio_adicional, description: s.description || 'Complemento de cotización', status: s.status, total: s.total, rejection_note: s.rejection_note, state: quoteApprovalState(s) }))
  ];
  const quoteRows = quotes.map((quote) => {
    const canPdf = quote.state !== 'preparacion';
    const canApprove = quote.state === 'pendiente';
    const statusClass = quote.state === 'aprobada' ? 'badge-facturada_cerrada' : (quote.state === 'rechazada' ? 'badge-recepcion' : 'badge-esperando_aprobacion');
    const approveAction = quote.type === 'main' ? 'manualApproveOrder()' : `manualApproveSupplement(${quote.id})`;
    const pdfAction = quote.type === 'main' ? 'downloadOrderQuote()' : `downloadSupplementQuote(${quote.id}, '${quote.folio}')`;
    return `
      <div class="approval-quote-row">
        <div>
          <strong>${quote.folio}</strong>
          <span>${quote.description}</span>
          ${quote.rejection_note ? `<small>Comentarios: ${quote.rejection_note}</small>` : ''}
        </div>
        <div class="approval-quote-meta">
          <span class="badge ${statusClass}">${quote.status}</span>
          <b>${money(quote.total)}</b>
        </div>
        <div class="approval-quote-actions">
          ${canPdf ? `<button onclick="${pdfAction}" class="secondary small"><i class="fa-solid fa-file-pdf"></i> PDF</button>` : ''}
          ${canApprove ? `<button onclick="${approveAction}" class="blue-action small"><i class="fa-solid fa-check-double"></i> Aprobar</button>` : ''}
        </div>
      </div>
    `;
  }).join('');
  return `
    <div class="approval-pane">
      <div class="detail-section-head">
        <h3><i class="fa-solid fa-file-circle-check"></i> Aprobación</h3>
        <strong>${statusMap[o.status]?.label || o.status}</strong>
      </div>
      <div class="approval-pane-body">
        ${renderApprovalStatus(quotes)}
        <div class="approval-quotes-box">
          <div class="approval-quotes-head">
            <div class="subsection-title">Cotizaciones de la orden</div>
            <div class="approval-quotes-head-actions">
              <button onclick="downloadFullOrderQuote()" class="secondary small"><i class="fa-solid fa-file-pdf"></i> Generar PDF general</button>
              ${['trabajo_finalizado', 'cerrada'].includes(o.status) ? '<button onclick="openMaintenanceVisitModal()" class="blue-action small"><i class="fa-solid fa-calendar-plus"></i> Programar próxima visita</button>' : ''}
            </div>
          </div>
          ${quoteRows}
        </div>
      </div>
      <div class="approval-fixed-actions">
        ${renderFlowActions(o)}
        <button id="copyLinkBtn" onclick="copyWorkOrderLink()" class="secondary"><i class="fa-solid fa-link"></i> Copiar link de OT</button>
        <button onclick="sendOrderApprovalWhatsApp()" class="brand-outline"><i class="fa-brands fa-whatsapp"></i> Enviar WhatsApp</button>
      </div>
    </div>
  `;
}

function updateOrderSummary(order) {
  const index = orders.findIndex((item) => item.id === order.id);
  if (index >= 0) orders[index] = { ...orders[index], ...order };
  else orders.unshift(order);
}

function selectQuoteDocument(key) {
  selectedQuoteDocumentKey = key || 'main';
  quoteItemMode = 'catalog';
  quoteItemSearch = '';
  selectedQuoteCatalogItemId = '';
  if (currentOrderDetail) {
    const quotePane = document.querySelector('[data-order-tab="quote"]');
    if (quotePane) {
      quotePane.innerHTML = renderQuotePaneContent(currentOrderDetail);
      bindQuoteItemPicker();
    }
    setOrderDetailTab('quote');
  }
}

function refreshOrderModalAfterQuoteChange(order) {
  currentOrderDetail = order;
  if ($('orderDetailTotalValue')) $('orderDetailTotalValue').textContent = money(workOrderQuotedTotal(order));
  if ($('orderDetailPipeline')) $('orderDetailPipeline').innerHTML = renderPipeline(order.status);
  const quotePane = document.querySelector('[data-order-tab="quote"]');
  if (quotePane) {
    quotePane.innerHTML = renderQuotePaneContent(order);
    bindQuoteItemPicker();
  }
  setOrderDetailTab('quote');
  updateOrderSummary(order);
  renderOrders();
}

function editQuoteItem(itemId) {
  editingQuoteItemId = itemId;
  if (currentOrderDetail) {
    const quotePane = document.querySelector('[data-order-tab="quote"]');
    if (quotePane) {
      quotePane.innerHTML = renderQuotePaneContent(currentOrderDetail);
      bindQuoteItemPicker();
    }
    setOrderDetailTab('quote');
  }
}

function cancelQuoteItemEdit() {
  editingQuoteItemId = null;
  if (currentOrderDetail) {
    const quotePane = document.querySelector('[data-order-tab="quote"]');
    if (quotePane) {
      quotePane.innerHTML = renderQuotePaneContent(currentOrderDetail);
      bindQuoteItemPicker();
    }
    setOrderDetailTab('quote');
  }
}

function syncQuoteItemForm() {
  const selectedItem = catalog.find((item) => String(item.id) === String(selectedQuoteCatalogItemId));
  if ($('quoteItemPrice') && selectedItem) $('quoteItemPrice').value = Number(selectedItem.public_price || 0);
}

function quoteCatalogSearchText(item) {
  return normalizeSearch([item.description, item.type, item.public_price].filter(Boolean).join(' '));
}

function renderQuoteItemPicker() {
  if (!$('quoteItemOptions')) return;
  const query = normalizeSearch(quoteItemSearch);
  const rows = query
    ? catalog.filter((item) => item.active !== 0 && quoteCatalogSearchText(item).includes(query))
    : catalog.filter((item) => item.active !== 0);

  $('quoteItemOptions').innerHTML = `
    <button type="button" class="customer-option new-customer-option ${quoteItemMode === 'new' ? 'selected' : ''}" data-new-quote-item="1">
      <i class="fa-solid fa-plus"></i>
      <span><strong>Nuevo item</strong><small>Capturar servicio o refacción ahora</small></span>
    </button>
    ${rows.map((item) => `
      <button type="button" class="customer-option ${String(item.id) === String(selectedQuoteCatalogItemId) ? 'selected' : ''}" data-quote-item-id="${item.id}">
        <i class="fa-solid ${item.type === 'mano_obra' ? 'fa-screwdriver-wrench' : 'fa-box'}"></i>
        <span>
          <strong>${item.description}</strong>
          <small>${item.type === 'mano_obra' ? 'Mano de obra' : 'Refacción'} · ${money(item.public_price)}</small>
        </span>
      </button>
    `).join('') || '<div class="customer-empty">No se encontraron items con esa búsqueda.</div>'}
  `;

  $('quoteItemOptions').querySelector('[data-new-quote-item]')?.addEventListener('click', () => {
    quoteItemMode = 'new';
    selectedQuoteCatalogItemId = '';
    $('quoteItemPickerBox')?.classList.remove('picker-open');
    $('quoteNewItemBox')?.classList.remove('hidden');
    if ($('quoteNewDescription') && !$('quoteNewDescription').value.trim()) $('quoteNewDescription').value = quoteItemSearch;
    if ($('quoteItemSearch')) $('quoteItemSearch').value = quoteItemSearch;
    if ($('quoteNewPrice')) $('quoteNewPrice').focus();
  });

  $('quoteItemOptions').querySelectorAll('[data-quote-item-id]').forEach((button) => {
    button.addEventListener('click', () => {
      const selectedItem = catalog.find((item) => String(item.id) === String(button.dataset.quoteItemId));
      selectedQuoteCatalogItemId = button.dataset.quoteItemId;
      quoteItemMode = 'catalog';
      quoteItemSearch = selectedItem ? selectedItem.description : '';
      if ($('quoteItemSearch')) $('quoteItemSearch').value = quoteItemSearch;
      if ($('quoteNewItemBox')) $('quoteNewItemBox').classList.add('hidden');
      if ($('quoteItemPickerBox')) $('quoteItemPickerBox').classList.remove('picker-open');
      syncQuoteItemForm();
    });
  });
}

function bindQuoteItemPicker() {
  const searchInput = $('quoteItemSearch');
  if (!searchInput) return;

  searchInput.addEventListener('input', () => {
    quoteItemSearch = searchInput.value;
    selectedQuoteCatalogItemId = '';
    quoteItemMode = 'catalog';
    $('quoteNewItemBox')?.classList.add('hidden');
    $('quoteItemPickerBox')?.classList.add('picker-open');
    renderQuoteItemPicker();
  });

  searchInput.addEventListener('focus', () => {
    $('quoteItemPickerBox')?.classList.add('picker-open');
    renderQuoteItemPicker();
  });
}

function renderQuoteItemModal() {
  // El alta de items ahora vive inline dentro de la pestaña Cotización.
}

function openQuoteItemModal(mode = 'catalog') {
  if (mode === 'catalog') {
    quoteItemMode = 'catalog';
    $('quoteNewItemBox')?.classList.add('hidden');
  }
  setOrderDetailTab('quote');
  setTimeout(() => {
    const itemSearch = $('quoteItemSearch');
    if (itemSearch) {
      itemSearch.focus();
      $('quoteItemPickerBox')?.classList.add('picker-open');
      renderQuoteItemPicker();
    }
  }, 0);
}

function closeQuoteItemModal() {
  // Sin modal secundario: no hay nada que cerrar.
}

async function selectOrder(id) {
  if (selectedOrderId !== id) {
    activeOrderDetailTab = 'summary';
    selectedQuoteDocumentKey = 'main';
  }
  selectedOrderId = id;
  const o = await api('/api/work-orders/' + id);
  currentOrderDetail = o;
  const inventory = parseJsonSafe(o.reception_inventory) || {};
  
  const modal = $('orderModal');
  modal.className = 'modal-overlay order-detail-modal';
  modal.innerHTML = `
    <div class="modal-card order-detail-card">
      <div class="modal-header order-detail-header">
        <div class="order-detail-title">
          <span class="modal-kicker">Orden de trabajo</span>
          <h2><i class="fa-solid fa-receipt"></i> ${o.folio}</h2>
        </div>
        <div class="order-detail-total">
          <span>Total cotizado</span>
          <strong id="orderDetailTotalValue">${money(workOrderQuotedTotal(o))}</strong>
        </div>
        <button class="secondary small modal-close-btn" type="button" onclick="closeOrderModal()" aria-label="Cerrar detalle">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>
      <div class="panel order-detail-panel">
        <div id="orderDetailPipeline">${renderPipeline(o.status)}</div>

        <div class="order-detail-tabs" role="tablist">
          <button type="button" class="${activeOrderDetailTab === 'summary' ? 'active' : ''}" data-order-tab-target="summary" onclick="setOrderDetailTab('summary')"><i class="fa-solid fa-circle-info"></i> Resumen</button>
          <button type="button" class="${activeOrderDetailTab === 'quote' ? 'active' : ''}" data-order-tab-target="quote" onclick="setOrderDetailTab('quote')"><i class="fa-solid fa-list-check"></i> Cotización</button>
          <button type="button" class="${activeOrderDetailTab === 'flow' ? 'active' : ''}" data-order-tab-target="flow" onclick="setOrderDetailTab('flow')"><i class="fa-solid fa-file-circle-check"></i> Aprobación</button>
        </div>

        <div class="order-tab-content">
          <section class="detail-section order-tab-pane ${activeOrderDetailTab === 'summary' ? 'active' : ''}" data-order-tab="summary">
            <div class="detail-section-head">
              <h3><i class="fa-solid fa-circle-info"></i> Resumen</h3>
              <strong>Datos generales</strong>
            </div>
            <div class="detail-facts">
              <div><span>Cliente</span><strong>${o.customer_name || 'Sin cliente'}</strong></div>
              <div><span>Tipo de cliente</span><strong>${o.customer_type === 'empresa' ? 'Empresa' : 'Particular'}</strong></div>
              <div><span>Contacto</span><strong>${o.contact_name || 'No registrado'}</strong></div>
              <div><span>Teléfono / WhatsApp</span><strong>${o.phone || o.whatsapp || 'No registrado'}</strong></div>
              <div><span>Marca</span><strong>${o.make || 'No registrada'}</strong></div>
              <div><span>Modelo</span><strong>${o.model || 'No registrado'}</strong></div>
              <div><span>Año</span><strong>${o.year || 'N/D'}</strong></div>
              <div><span>Versión</span><strong>${o.trim || 'No registrada'}</strong></div>
              <div><span>Vehículo</span><strong>${[o.year, o.make, o.model, o.trim].filter(Boolean).join(' ') || 'Vehículo sin datos'}</strong></div>
              <div><span>Placas</span><strong>${o.plates || 'S/P'}</strong></div>
              <div><span>Kilometraje</span><strong>${o.mileage ? Number(o.mileage).toLocaleString('es-MX') + ' KM' : 'N/D'}</strong></div>
              <div><span>VIN/NIV</span><strong>${o.vin || 'No registrado'}</strong></div>
              <div><span>No. económico</span><strong>${o.economic_number || 'No registrado'}</strong></div>
            </div>
            <div class="detail-note"><span><i class="fa-solid fa-triangle-exclamation"></i> Síntoma</span><p>${o.symptom || 'No especificado'}</p></div>
            <div class="detail-note"><span><i class="fa-solid fa-clipboard-list"></i> Inventario</span><p>${inventory.inventario || inventory.inventory || 'No registrado'}</p></div>
          </section>

          <section class="detail-section quote-section order-tab-pane ${activeOrderDetailTab === 'quote' ? 'active' : ''}" data-order-tab="quote">
            ${renderQuotePaneContent(o)}
          </section>

          <section class="detail-section flow-section order-tab-pane ${activeOrderDetailTab === 'flow' ? 'active' : ''}" data-order-tab="flow">
            ${renderApprovalPaneContent(o)}
          </section>
        </div>
      </div>
    </div>
  `;

  bindQuoteItemPicker();

  modal.onclick = (event) => {
    if (event.target === modal) closeOrderModal();
  };

  renderOrders();
}

function setOrderDetailTab(tab) {
  activeOrderDetailTab = tab;
  document.querySelectorAll('.order-detail-tabs button').forEach((button) => {
    button.classList.toggle('active', button.dataset.orderTabTarget === tab);
  });
  document.querySelectorAll('.order-tab-pane').forEach((pane) => {
    pane.classList.toggle('active', pane.dataset.orderTab === tab);
  });
}

function closeOrderModal() {
  const modal = $('orderModal');
  if (!modal) return;
  selectedOrderId = null;
  activeOrderDetailTab = 'summary';
  editingQuoteItemId = null;
  currentOrderDetail = null;
  selectedQuoteDocumentKey = 'main';
  modal.className = 'hidden';
  modal.innerHTML = '';
  closeQuoteItemModal();
  renderOrders();
}

// ═══════════════════════════════════
// ACCIONES DE ORDEN
// ═══════════════════════════════════
async function addOrderItem() {
  const qtyInput = $('quoteItemQty');
  const priceInput = $('quoteItemPrice');
  if (!selectedOrderId || !qtyInput || !priceInput) return;

  const quantity = Number(qtyInput.value || 0);
  if (!Number.isInteger(quantity) || quantity <= 0) {
    showToast('Alerta', 'Ingrese una cantidad válida en números enteros', 'error');
    return;
  }

  let appliedPrice = 0;
  const payload = { quantity };
  if (quoteItemMode === 'new') {
    const description = $('quoteNewDescription')?.value.trim();
    const type = $('quoteNewType')?.value;
    appliedPrice = Number($('quoteNewPrice')?.value || 0);
    if (!description) {
      showToast('Alerta', 'Ingrese la descripción del item', 'error');
      return;
    }
    if (!Number.isFinite(appliedPrice) || appliedPrice < 0) {
      showToast('Alerta', 'Ingrese un precio público válido para el nuevo item', 'error');
      return;
    }

    if ($('quoteSaveCatalog')?.checked) {
      const newCatalogItem = await api('/api/catalog', {
        method: 'POST',
        body: JSON.stringify({
          description,
          type,
          public_price: appliedPrice,
          internal_cost: Number($('quoteNewCost')?.value || 0)
        })
      });
      catalog.push(newCatalogItem);
      catalog.sort((a, b) => String(a.description).localeCompare(String(b.description), 'es'));
      renderCatalog();
      payload.item_id = newCatalogItem.id;
    } else {
      payload.description = description;
      payload.type = type;
    }
  } else if (selectedQuoteCatalogItemId) {
    const selectedItem = catalog.find((item) => String(item.id) === String(selectedQuoteCatalogItemId));
    appliedPrice = Number(selectedItem?.public_price || 0);
    payload.item_id = Number(selectedQuoteCatalogItemId);
  } else {
    showToast('Alerta', 'Seleccione un item del catálogo o capture uno nuevo', 'error');
    return;
  }

  if (!Number.isFinite(appliedPrice) || appliedPrice < 0) {
    showToast('Alerta', 'El item no tiene un precio válido', 'error');
    return;
  }
  payload.applied_price = appliedPrice;

  const supplementId = selectedQuoteDocumentKey.startsWith('supp-')
    ? Number(selectedQuoteDocumentKey.replace('supp-', ''))
    : null;

  let updatedOrder;
  if (supplementId) {
    await api(`/api/supplements/${supplementId}/items`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    updatedOrder = await api('/api/work-orders/' + selectedOrderId);
  } else {
    updatedOrder = await api(`/api/work-orders/${selectedOrderId}/items`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }
  editingQuoteItemId = null;
  quoteItemMode = 'catalog';
  quoteItemSearch = '';
  selectedQuoteCatalogItemId = '';
  refreshOrderModalAfterQuoteChange(updatedOrder);
  showToast('Concepto agregado', supplementId ? 'El complemento se recalculó correctamente.' : 'La cotización se recalculó correctamente.');
}

async function updateOrderItem(itemId) {
  const qty = Number($(`itemQty${itemId}`).value || 0);
  const price = Number($(`itemPrice${itemId}`).value || 0);
  if (!Number.isInteger(qty) || qty <= 0) {
    showToast('Alerta', 'Ingrese una cantidad válida en números enteros', 'error');
    return;
  }
  if (!Number.isFinite(price) || price < 0) {
    showToast('Alerta', 'Ingrese un precio válido', 'error');
    return;
  }
  const updatedOrder = await api(`/api/work-orders/${selectedOrderId}/items/${itemId}`, {
    method: 'PUT',
    body: JSON.stringify({ quantity: qty, applied_price: price })
  });
  editingQuoteItemId = null;
  refreshOrderModalAfterQuoteChange(updatedOrder);
  showToast('Concepto actualizado', 'La cotización se recalculó correctamente.');
}

async function deleteOrderItem(itemId) {
  if (!confirm('¿Eliminar este concepto de la cotización?')) return;
  const updatedOrder = await api(`/api/work-orders/${selectedOrderId}/items/${itemId}`, { method: 'DELETE' });
  editingQuoteItemId = null;
  refreshOrderModalAfterQuoteChange(updatedOrder);
  showToast('Concepto eliminado', 'La cotización se recalculó correctamente.');
}

async function applyOrderDiscount() {
  // Limpio para iniciar desde cero
}

async function finalizeQuote() {
  if (!currentOrderDetail?.items?.length) {
    showToast('Alerta', 'Agrega al menos un item antes de finalizar la cotización', 'error');
    return;
  }
  await api(`/api/work-orders/${selectedOrderId}/status`, {
    method: 'POST',
    body: JSON.stringify({ status: 'esperando_aprobacion', note: 'Cotizacion finalizada' })
  });
  const updatedOrder = await api('/api/work-orders/' + selectedOrderId);
  editingQuoteItemId = null;
  refreshOrderModalAfterQuoteChange(updatedOrder);
  showToast('Cotización finalizada', 'La cotización quedó cerrada y lista para aprobación.', 'success');
}

async function changeStatus(status) {
  await api(`/api/work-orders/${selectedOrderId}/status`, { 
    method: 'POST', 
    body: JSON.stringify({ status }) 
  });
  await loadAll(); 
  showToast('Estado Actualizado', `La orden ahora está en estado: ${statusMap[status]?.label || status}`);
}

async function manualApproveOrder() {
  if (currentOrderDetail && currentOrderDetail.status !== 'esperando_aprobacion') {
    showToast('Alerta', 'La cotización debe estar en espera de aprobación para aprobar manualmente.', 'error');
    return;
  }
  if (!confirm('¿Confirmas la aprobación manual de esta cotización? Esta acción activará la orden de trabajo.')) return;
  await api(`/api/work-orders/${selectedOrderId}/status`, {
    method: 'POST',
    body: JSON.stringify({ status: 'ot_activa', manual: true, note: 'Aprobacion manual confirmada por usuario del sistema' })
  });
  await loadAll();
  showToast('Aprobación manual', 'La orden fue aprobada manualmente y pasó a reparación.', 'success');
}

async function manualApproveSupplement(supplementId) {
  if (!confirm('¿Confirmas la aprobación manual de este complemento?')) return;
  await api(`/api/supplements/${supplementId}/status`, {
    method: 'POST',
    body: JSON.stringify({ status: 'aprobado' })
  });
  await selectOrder(selectedOrderId);
  setOrderDetailTab('flow');
  showToast('Complemento aprobado', 'El complemento fue aprobado manualmente.', 'success');
}

async function downloadOrderQuote() {
  try {
    await downloadFile(`/api/pdf/work-orders/${selectedOrderId}/quote`, `${currentOrderDetail?.folio || 'cotizacion'}-cotizacion.pdf`);
  } catch (error) {
    showToast('Error', error.message, 'error');
  }
}

async function downloadOrderReceipt() {
  try {
    await downloadFile(`/api/pdf/work-orders/${selectedOrderId}/receipt`, `${currentOrderDetail?.folio || 'orden'}-recibo.pdf`);
  } catch (error) {
    showToast('Error', error.message, 'error');
  }
}

async function downloadFullOrderQuote() {
  try {
    await downloadFile(`/api/pdf/work-orders/${selectedOrderId}/full-quote`, `${currentOrderDetail?.folio || 'orden'}-cotizacion-general.pdf`);
  } catch (error) {
    showToast('Error', error.message, 'error');
  }
}

async function downloadSupplementQuote(id, folio) {
  try {
    await downloadFile(`/api/pdf/supplements/${id}/quote`, `${folio || 'adicional'}-cotizacion.pdf`);
  } catch (error) {
    showToast('Error', error.message, 'error');
  }
}

async function createApprovalToken() {
  const data = await api(`/api/work-orders/${selectedOrderId}/approval-token`, { 
    method: 'POST', 
    body: '{}' 
  });
  const url = location.origin + data.url;
  
  navigator.clipboard?.writeText(url);
  
  const copyBtn = $('copyLinkBtn');
  if (copyBtn) {
    const origHtml = copyBtn.innerHTML;
    copyBtn.innerHTML = '<i class="fa-solid fa-check-double" style="color:var(--success);"></i> ¡Copiado!';
    setTimeout(() => {
      copyBtn.innerHTML = origHtml;
    }, 2000);
  }
  
  showToast('Enlace Copiado', 'Se copió el enlace de aprobación al portapapeles para enviarlo por WhatsApp/SMS', 'success');
  return url;
}

async function sendOrderApprovalWhatsApp() {
  if (!currentOrderDetail) return;
  const phone = currentOrderDetail.whatsapp || currentOrderDetail.phone;
  if (!phone) {
    showToast('Alerta', 'El cliente no tiene WhatsApp o telefono registrado.', 'error');
    return;
  }
  const url = await createApprovalToken();
  const vehicle = [currentOrderDetail.year, currentOrderDetail.make, currentOrderDetail.model].filter(Boolean).join(' ') || 'su vehiculo';
  const message = `Hola ${currentOrderDetail.customer_name || ''}. Le compartimos la cotizacion ${currentOrderDetail.folio} para ${vehicle}: ${url}`;
  await api('/api/whatsapp/send', {
    method: 'POST',
    body: JSON.stringify({ phone, message })
  });
  await reloadWhatsapp();
  showToast('WhatsApp', 'Cotizacion enviada por WhatsApp.', 'success');
}

async function copyWorkOrderLink() {
  if (!selectedOrderId) return;
  await createApprovalToken();
  await selectOrder(selectedOrderId);
  setOrderDetailTab('flow');
}

async function generateQuoteLink() {
  if (!currentOrderDetail?.items?.length) {
    showToast('Alerta', 'Agrega al menos un concepto antes de generar el link de cotización', 'error');
    return;
  }
  if (currentOrderDetail.status === 'recepcion') {
    showToast('Alerta', 'Agrega conceptos para pasar la orden a cotización antes de generar el link.', 'error');
    return;
  }
  if (currentOrderDetail.status === 'cotizacion_borrador') {
    await api(`/api/work-orders/${selectedOrderId}/status`, {
      method: 'POST',
      body: JSON.stringify({ status: 'esperando_aprobacion', note: 'Cotizacion finalizada para aprobacion' })
    });
    currentOrderDetail = await api('/api/work-orders/' + selectedOrderId);
  }
  if (currentOrderDetail.status !== 'esperando_aprobacion') {
    showToast('Alerta', 'Solo se puede generar link cuando la cotización está en espera de aprobación.', 'error');
    return;
  }
  await createApprovalToken();
  await selectOrder(selectedOrderId);
  setOrderDetailTab('flow');
}

async function finalizeOrder() {
  await api(`/api/work-orders/${selectedOrderId}/finalize`, { method: 'POST', body: '{}' });
  await loadAll(); 
  showToast('Finalizado', 'El mecánico ha finalizado el trabajo. Listo para entrega.', 'success');
}

function openMaintenanceVisitModal() {
  if (!currentOrderDetail) return;
  const currentMileage = Number(currentOrderDetail.mileage || 0);
  const suggestedMileage = currentMileage > 0 ? currentMileage + 5000 : '';
  const modal = $('quoteItemModal');
  if (!modal) return;
  modal.className = 'modal-overlay maintenance-visit-modal';
  modal.innerHTML = `
    <div class="modal-card maintenance-visit-card">
      <div class="modal-header">
        <div>
          <span class="modal-kicker">Mantenimiento preventivo</span>
          <h2><i class="fa-solid fa-calendar-plus"></i> Programar próxima visita</h2>
        </div>
        <button class="secondary small modal-close-btn" type="button" onclick="closeMaintenanceVisitModal()" aria-label="Cerrar">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>
      <div class="form-row compact-row">
        <label><span>Fecha sugerida</span><input id="maintenanceVisitDate" type="date" value="${suggestedMaintenanceDate()}"></label>
        <label><span>Kilometraje sugerido</span><input id="maintenanceVisitMileage" type="number" min="0" step="1" value="${suggestedMileage}" placeholder="Ej. 85000"></label>
      </div>
      <div class="form-row compact-row">
        <label><span>Tipo de servicio</span><select id="maintenanceVisitType">
          <option value="Revision general">Revisión general</option>
          <option value="Cambio de aceite">Cambio de aceite</option>
          <option value="Afinacion">Afinación</option>
          <option value="Frenos">Frenos</option>
          <option value="Suspension">Suspensión</option>
          <option value="Otro">Otro</option>
        </select></label>
      </div>
      <label><span>Notas</span><input id="maintenanceVisitNotes" placeholder="Notas para la próxima cita"></label>
      <div class="modal-actions">
        <button type="button" class="secondary" onclick="closeMaintenanceVisitModal()"><i class="fa-solid fa-ban"></i> Cancelar</button>
        <button type="button" onclick="saveMaintenanceVisit()"><i class="fa-solid fa-floppy-disk"></i> Guardar visita</button>
      </div>
    </div>
  `;
  modal.onclick = (event) => {
    if (event.target === modal) closeMaintenanceVisitModal();
  };
}

function closeMaintenanceVisitModal() {
  const modal = $('quoteItemModal');
  if (!modal) return;
  modal.className = 'hidden';
  modal.innerHTML = '';
  modal.onclick = null;
}

async function saveMaintenanceVisit() {
  if (!currentOrderDetail) return;
  const serviceType = $('maintenanceVisitType')?.value || '';
  if (!serviceType.trim()) {
    showToast('Alerta', 'Selecciona el tipo de servicio para la próxima visita.', 'error');
    return;
  }
  const visit = await api('/api/maintenance-visits', {
    method: 'POST',
    body: JSON.stringify({
      vehicle_id: currentOrderDetail.vehicle_id,
      source_work_order_id: currentOrderDetail.id,
      scheduled_date: $('maintenanceVisitDate')?.value || null,
      scheduled_mileage: $('maintenanceVisitMileage')?.value || null,
      service_type: serviceType,
      notes: $('maintenanceVisitNotes')?.value || null
    })
  });
  currentOrderDetail.maintenance_visits = [visit, ...(currentOrderDetail.maintenance_visits || [])];
  closeMaintenanceVisitModal();
  await selectOrder(selectedOrderId);
  setOrderDetailTab('flow');
  showToast('Próxima visita programada', 'La cita de mantenimiento preventivo quedó registrada.', 'success');
}

async function closeOrder() {
  const method = $('paymentMethod').value;
  const closedOrder = await api(`/api/work-orders/${selectedOrderId}/close`, { 
    method: 'POST', 
    body: JSON.stringify({ method }) 
  });
  currentOrderDetail = closedOrder;
  await loadAll();
  await downloadOrderReceipt();
  showToast('Orden Cerrada', `Orden cobrada con ${method.toUpperCase()} y archivada exitosamente.`, 'success');
}

async function createSupplement() {
  return createQuoteComplement();
}

async function createQuoteComplement() {
  if (!selectedOrderId) return;
  if (currentOrderDetail && ['recepcion', 'cotizacion_borrador'].includes(currentOrderDetail.status)) {
    showToast('Alerta', 'Primero cierra la cotización principal para poder agregar complementos.', 'error');
    return;
  }
  const description = prompt('Describe el complemento de cotización:', 'Complemento de cotización');
  if (!description || !description.trim()) return;
  const s = await api('/api/supplements', {
    method: 'POST',
    body: JSON.stringify({ work_order_id: selectedOrderId, description: description.trim() })
  });
  selectedQuoteDocumentKey = `supp-${s.id}`;
  await selectOrder(selectedOrderId);
  setOrderDetailTab('quote');
  showToast('Complemento agregado', 'Ahora puedes cargar los ítems de esta nueva cotización.', 'success');
}

async function addSupplementItem(supplementId) {
  const catalogId = $(`suppCatalog${supplementId}`)?.value;
  const quantity = Number($(`suppQty${supplementId}`)?.value || 0);
  const payload = { quantity };
  if (!Number.isInteger(quantity) || quantity <= 0) {
    showToast('Alerta', 'Ingrese una cantidad válida para el complemento', 'error');
    return;
  }
  if (catalogId) {
    const item = catalog.find((row) => String(row.id) === String(catalogId));
    payload.item_id = Number(catalogId);
    payload.applied_price = Number(item?.public_price || 0);
  } else {
    const description = $(`suppDesc${supplementId}`)?.value.trim();
    const type = $(`suppType${supplementId}`)?.value;
    const appliedPrice = Number($(`suppPrice${supplementId}`)?.value || 0);
    if (!description) {
      showToast('Alerta', 'Ingrese la descripción del concepto manual', 'error');
      return;
    }
    if (!Number.isFinite(appliedPrice) || appliedPrice < 0) {
      showToast('Alerta', 'Ingrese un precio válido para el concepto manual', 'error');
      return;
    }
    payload.description = description;
    payload.type = type;
    payload.applied_price = appliedPrice;
  }

  await api(`/api/supplements/${supplementId}/items`, { method: 'POST', body: JSON.stringify(payload) });
  selectedQuoteDocumentKey = `supp-${supplementId}`;
  await selectOrder(selectedOrderId);
  setOrderDetailTab('quote');
  showToast('Concepto agregado', 'La cotización complementaria se recalculó correctamente.', 'success');
}

async function deleteSupplementItem(supplementId, itemId) {
  if (!confirm('¿Eliminar este concepto del complemento de cotización?')) return;
  await api(`/api/supplements/${supplementId}/items/${itemId}`, { method: 'DELETE' });
  selectedQuoteDocumentKey = `supp-${supplementId}`;
  await selectOrder(selectedOrderId);
  setOrderDetailTab('quote');
  showToast('Concepto eliminado', 'La cotización complementaria se recalculó correctamente.', 'success');
}

async function sendSupplementApproval(supplementId) {
  const data = await api(`/api/supplements/${supplementId}/send-approval`, { method: 'POST', body: '{}' });
  const url = location.origin + data.url;
  
  navigator.clipboard?.writeText(url);
  showToast('Link de complemento copiado', 'Enlace para aprobación del complemento copiado al portapapeles', 'success');
  selectedQuoteDocumentKey = `supp-${supplementId}`;
  await selectOrder(selectedOrderId);
  setOrderDetailTab('quote');
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    if (!file) return reject(new Error('Selecciona el archivo requerido'));
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
    reader.onerror = () => reject(new Error('No se pudo leer el archivo'));
    reader.readAsDataURL(file);
  });
}

async function reloadBilling() {
  if (currentUser?.role !== 'administrador') return;
  [billingIssuer, billingCertificate, invoices] = await Promise.all([
    api('/api/billing/issuer'),
    api('/api/billing/certificate'),
    api('/api/billing/invoices')
  ]);
  renderBilling();
}

async function saveBillingIssuer() {
  billingIssuer = await api('/api/billing/issuer', {
    method: 'PUT',
    body: JSON.stringify({
      rfc: $('issuerRfc')?.value,
      legal_name: $('issuerLegalName')?.value,
      fiscal_regime: $('issuerFiscalRegime')?.value,
      expedition_place: $('issuerExpeditionPlace')?.value
    })
  });
  await reloadBilling();
  showToast('Emisor guardado', 'Los datos fiscales del taller quedaron actualizados.', 'success');
}

async function saveBillingCertificate() {
  const certificateFile = $('csdCertificate')?.files?.[0];
  const privateKeyFile = $('csdPrivateKey')?.files?.[0];
  const certificate = await fileToBase64(certificateFile);
  const privateKey = await fileToBase64(privateKeyFile);
  const rfc = $('csdRfc')?.value || billingIssuer?.rfc;
  const method = billingCertificate?.rfc ? 'PUT' : 'POST';
  billingCertificate = await api('/api/billing/certificate', {
    method,
    body: JSON.stringify({
      rfc,
      certificate,
      private_key: privateKey,
      private_key_password: $('csdPassword')?.value
    })
  });
  if ($('csdCertificate')) $('csdCertificate').value = '';
  if ($('csdPrivateKey')) $('csdPrivateKey').value = '';
  if ($('csdPassword')) $('csdPassword').value = '';
  await reloadBilling();
  showToast('CSD actualizado', 'El certificado fue enviado a Facturama sandbox.', 'success');
}

async function deleteBillingCertificate() {
  const rfc = $('csdRfc')?.value || billingCertificate?.rfc || billingIssuer?.rfc;
  if (!rfc) return showToast('Alerta', 'Captura el RFC del certificado.', 'error');
  if (!confirm(`¿Eliminar el CSD de ${rfc}?`)) return;
  await api('/api/billing/certificate', { method: 'DELETE', body: JSON.stringify({ rfc }) });
  billingCertificate = null;
  await reloadBilling();
  showToast('CSD eliminado', 'El certificado fue eliminado en Facturama.', 'success');
}

async function stampCurrentOrderInvoice() {
  if (!selectedOrderId) return;
  if (!confirm('¿Timbrar factura CFDI para esta orden cerrada?')) return;
  const invoice = await api(`/api/billing/work-orders/${selectedOrderId}/invoice`, { method: 'POST', body: '{}' });
  await reloadBilling();
  await selectOrder(selectedOrderId);
  setOrderDetailTab('flow');
  showToast('Factura timbrada', `Se generó ${invoice.internal_folio}.`, 'success');
}

async function downloadInvoicePdf(id, folio) {
  try {
    await downloadFile(`/api/billing/invoices/${id}/pdf`, `${folio || 'factura'}.pdf`);
  } catch (error) {
    showToast('Error', error.message, 'error');
  }
}

async function downloadInvoiceXml(id, folio) {
  try {
    await downloadFile(`/api/billing/invoices/${id}/xml`, `${folio || 'factura'}.xml`);
  } catch (error) {
    showToast('Error', error.message, 'error');
  }
}

// Exponer funciones globales
window.selectOrder = selectOrder; 
window.closeOrderModal = closeOrderModal;
window.setOrderDetailTab = setOrderDetailTab;
window.selectQuoteDocument = selectQuoteDocument;
window.addOrderItem = addOrderItem; 
window.updateOrderItem = updateOrderItem;
window.deleteOrderItem = deleteOrderItem;
window.applyOrderDiscount = applyOrderDiscount;
window.finalizeQuote = finalizeQuote;
window.editQuoteItem = editQuoteItem;
window.cancelQuoteItemEdit = cancelQuoteItemEdit;
window.syncQuoteItemForm = syncQuoteItemForm;
window.openQuoteItemModal = openQuoteItemModal;
window.closeQuoteItemModal = closeQuoteItemModal;
window.changeStatus = changeStatus; 
window.manualApproveOrder = manualApproveOrder;
window.manualApproveSupplement = manualApproveSupplement;
window.createApprovalToken = createApprovalToken; 
window.copyWorkOrderLink = copyWorkOrderLink;
window.generateQuoteLink = generateQuoteLink;
window.downloadOrderQuote = downloadOrderQuote;
window.downloadFullOrderQuote = downloadFullOrderQuote;
window.downloadOrderReceipt = downloadOrderReceipt;
window.downloadSupplementQuote = downloadSupplementQuote;
window.finalizeOrder = finalizeOrder; 
window.openMaintenanceVisitModal = openMaintenanceVisitModal;
window.closeMaintenanceVisitModal = closeMaintenanceVisitModal;
window.saveMaintenanceVisit = saveMaintenanceVisit;
window.closeOrder = closeOrder; 
window.createSupplement = createSupplement; 
window.createQuoteComplement = createQuoteComplement;
window.addSupplementItem = addSupplementItem;
window.deleteSupplementItem = deleteSupplementItem;
window.sendSupplementApproval = sendSupplementApproval;
window.stampCurrentOrderInvoice = stampCurrentOrderInvoice;
window.downloadInvoicePdf = downloadInvoicePdf;
window.downloadInvoiceXml = downloadInvoiceXml;

// ═══════════════════════════════════
// RECEPCIÓN
// ═══════════════════════════════════
let receptionDecodedVin = null;
let selectedReceptionVehicleId = null;
let selectedReceptionCustomerId = null;
let receptionCustomerMode = 'existing';
let receptionCustomerSearch = '';
let receptionVehicleMode = 'existing';
let receptionVehicleSearch = '';

function customerDisplayName(c) {
  return c?.display_name || c?.name || 'Cliente sin nombre';
}

function pendingValue(value) {
  return value ? value : '<span class="muted">Pendiente por registrar</span>';
}

function customerSearchText(c) {
  return [customerDisplayName(c), c.contact_name, c.phone, c.whatsapp, c.email, c.address, c.rfc]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function setReceptionCustomerMode(mode) {
  receptionCustomerMode = mode;
  selectedReceptionVehicleId = null;
  receptionVehicleSearch = '';
  if ($('rxVehicleSearch')) $('rxVehicleSearch').value = '';
  if (mode === 'new') {
    selectedReceptionCustomerId = null;
    receptionVehicleMode = 'new';
  } else {
    receptionVehicleMode = 'existing';
  }
  $('rxExistingCustomerBox')?.classList.remove('picker-open');
  setReceptionModeVisibility();
  renderReceptionCustomerPicker();
  renderReceptionCustomerSummary();
  renderReceptionVehicles();
}

function selectedCustomerIdForReception() {
  return receptionCustomerMode === 'existing' ? selectedReceptionCustomerId : null;
}

function renderReceptionCustomerPicker() {
  if (!$('rxCustomerOptions')) return;
  if (selectedReceptionCustomerId && !customers.some((c) => String(c.id) === String(selectedReceptionCustomerId))) {
    selectedReceptionCustomerId = null;
  }

  const query = receptionCustomerSearch.trim().toLowerCase();
  const rows = query ? customers.filter((c) => customerSearchText(c).includes(query)) : customers;
  const selected = customers.find((c) => String(c.id) === String(selectedReceptionCustomerId));
  if ($('rxCustomerSearch') && document.activeElement !== $('rxCustomerSearch')) {
    $('rxCustomerSearch').value = receptionCustomerMode === 'existing' && selected ? customerDisplayName(selected) : receptionCustomerSearch;
  }

  $('rxCustomerOptions').innerHTML = `
    <button type="button" class="customer-option new-customer-option ${receptionCustomerMode === 'new' ? 'selected' : ''}" data-new-customer="1">
      <i class="fa-solid fa-user-plus"></i>
      <span><strong>Nuevo cliente</strong><small>Capturar datos ahora</small></span>
    </button>
    ${rows.map((c) => `
      <button type="button" class="customer-option ${String(c.id) === String(selectedReceptionCustomerId) ? 'selected' : ''}" data-customer-id="${c.id}">
        <i class="fa-solid ${c.customer_type === 'empresa' ? 'fa-building' : 'fa-user'}"></i>
        <span>
          <strong>${customerDisplayName(c)}</strong>
          <small>${c.customer_type || 'particular'} · ${c.phone || c.whatsapp || 'Sin teléfono'}${c.rfc ? ' · RFC: ' + c.rfc : ''}</small>
        </span>
      </button>
    `).join('') || '<div class="customer-empty">No se encontraron clientes con esa búsqueda.</div>'}
  `;

  $('rxCustomerOptions').querySelector('[data-new-customer]')?.addEventListener('click', () => {
    receptionCustomerSearch = '';
    if ($('rxCustomerSearch')) $('rxCustomerSearch').value = '';
    setReceptionCustomerMode('new');
  });
  $('rxCustomerOptions').querySelectorAll('[data-customer-id]').forEach((button) => {
    button.addEventListener('click', () => {
      selectedReceptionCustomerId = button.dataset.customerId;
      receptionCustomerMode = 'existing';
      selectedReceptionVehicleId = null;
      receptionVehicleMode = 'existing';
      receptionVehicleSearch = '';
      if ($('rxVehicleSearch')) $('rxVehicleSearch').value = '';
      const customer = customers.find((c) => String(c.id) === String(selectedReceptionCustomerId));
      receptionCustomerSearch = customer ? customerDisplayName(customer) : '';
      $('rxExistingCustomerBox')?.classList.remove('picker-open');
      setReceptionModeVisibility();
      renderReceptionCustomerPicker();
      renderReceptionCustomerSummary();
      renderReceptionVehicles();
    });
  });
}

function renderReceptionCustomerSummary() {
  if (!$('rxCustomerSummary')) return;
  if (receptionCustomerMode === 'new') {
    $('rxCustomerSummary').innerHTML = '';
    $('rxCustomerSummary').classList.add('hidden');
    return;
  }
  $('rxCustomerSummary').classList.remove('hidden');
  const id = selectedReceptionCustomerId;
  const c = customers.find((item) => String(item.id) === String(id));
  if (!c) {
    $('rxCustomerSummary').innerHTML = '';
    $('rxCustomerSummary').classList.add('hidden');
    return;
  }
  $('rxCustomerSummary').classList.remove('hidden');
  const isCompany = (c.customer_type || 'particular') === 'empresa';
  $('rxCustomerSummary').innerHTML = `
    <div class="customer-summary-grid">
      <div class="customer-summary-card primary">
        <strong>${isCompany ? 'Razón social' : 'Nombre'}</strong>
        <span>${customerDisplayName(c)}</span>
      </div>
      ${isCompany ? `<div class="customer-summary-card"><strong>Contacto</strong><span>${pendingValue(c.contact_name)}</span></div>` : ''}
      <div class="customer-summary-card"><strong>Teléfono</strong><span>${pendingValue(c.phone)}</span></div>
      <div class="customer-summary-card"><strong>WhatsApp</strong><span>${pendingValue(c.whatsapp)}</span></div>
      <div class="customer-summary-card"><strong>Email</strong><span>${pendingValue(c.email)}</span></div>
      <div class="customer-summary-card wide"><strong>Dirección</strong><span>${pendingValue(c.address)}</span></div>
      <div class="customer-summary-card"><strong>RFC</strong><span>${pendingValue(c.rfc)}</span></div>
      <div class="customer-summary-card"><strong>Código Postal</strong><span>${pendingValue(c.postal_code)}</span></div>
      <div class="customer-summary-card"><strong>Régimen Fiscal</strong><span>${pendingValue(c.tax_regime)}</span></div>
      <div class="customer-summary-card"><strong>Uso CFDI</strong><span>${pendingValue(c.cfdi_use)}</span></div>
    </div>
  `;
}

function vehicleDisplayName(v) {
  return `${v.plates || 'S/P'} · ${v.year || ''} ${v.make || ''} ${v.model || ''}`.replace(/\s+/g, ' ').trim();
}

function vehicleSearchText(v) {
  return [v.plates, v.year, v.make, v.model, v.trim, v.vin, v.economic_number]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function setReceptionVehicleMode(mode) {
  receptionVehicleMode = mode;
  if (mode === 'new') selectedReceptionVehicleId = null;
  $('rxExistingVehicleBox')?.classList.remove('picker-open');
  setReceptionModeVisibility();
  renderReceptionVehicles();
}

function renderReceptionVehicles() {
  if (!$('rxVehicleList')) return;
  const customerId = selectedCustomerIdForReception();
  const customerVehicles = customerId ? vehicles.filter((v) => String(v.customer_id) === String(customerId)) : [];
  const query = receptionVehicleSearch.trim().toLowerCase();
  const rows = query ? customerVehicles.filter((v) => vehicleSearchText(v).includes(query)) : customerVehicles;
  selectedReceptionVehicleId = rows.some((v) => String(v.id) === String(selectedReceptionVehicleId)) ? selectedReceptionVehicleId : null;
  const selected = vehicles.find((v) => String(v.id) === String(selectedReceptionVehicleId));
  if ($('rxVehicleSearch') && document.activeElement !== $('rxVehicleSearch')) {
    $('rxVehicleSearch').value = receptionVehicleMode === 'existing' && selected ? vehicleDisplayName(selected) : receptionVehicleSearch;
  }

  $('rxVehicleList').innerHTML = `
    <button type="button" class="customer-option new-customer-option ${receptionVehicleMode === 'new' ? 'selected' : ''}" data-new-vehicle="1">
      <i class="fa-solid fa-car-on"></i>
      <span><strong>Nuevo vehículo</strong><small>Capturar vehículo para este cliente</small></span>
    </button>
    ${customerId ? rows.map((v) => `
      <button type="button" class="customer-option ${String(v.id) === String(selectedReceptionVehicleId) ? 'selected' : ''}" data-vehicle-id="${v.id}">
        <i class="fa-solid fa-car-side"></i>
        <span>
          <strong>${vehicleDisplayName(v)}</strong>
          <small>${v.trim || 'Sin versión'}${v.vin ? ' · VIN: ' + v.vin : ''}${v.economic_number ? ' · Eco: ' + v.economic_number : ''}</small>
        </span>
      </button>
    `).join('') || '<div class="customer-empty">No hay vehículos de este cliente con esa búsqueda.</div>' : '<div class="customer-empty">Selecciona un cliente para ver sus vehículos.</div>'}
  `;

  $('rxVehicleList').querySelector('[data-new-vehicle]')?.addEventListener('click', () => {
    receptionVehicleSearch = '';
    if ($('rxVehicleSearch')) $('rxVehicleSearch').value = '';
    setReceptionVehicleMode('new');
  });
  $('rxVehicleList').querySelectorAll('[data-vehicle-id]').forEach((button) => {
    button.addEventListener('click', () => {
      selectedReceptionVehicleId = button.dataset.vehicleId;
      receptionVehicleMode = 'existing';
      const vehicle = vehicles.find((v) => String(v.id) === String(selectedReceptionVehicleId));
      receptionVehicleSearch = '';
      if ($('rxVehicleSearch') && vehicle) $('rxVehicleSearch').value = vehicleDisplayName(vehicle);
      $('rxExistingVehicleBox')?.classList.remove('picker-open');
      setReceptionModeVisibility();
      renderReceptionVehicles();
    });
  });
}

function setReceptionModeVisibility() {
  const customerMode = receptionCustomerMode;
  $('rxExistingCustomerBox')?.classList.remove('hidden');
  $('rxNewCustomerBox')?.classList.toggle('hidden', customerMode !== 'new');
  const vehicleMode = receptionVehicleMode;
  $('rxExistingVehicleBox')?.classList.remove('hidden');
  $('rxNewVehicleBox')?.classList.toggle('hidden', vehicleMode !== 'new');
  const inputMode = document.querySelector('input[name="rxVehicleInputMode"]:checked')?.value;
  $('rxVinBox')?.classList.toggle('hidden', inputMode !== 'vin');
  $('rxManualBox')?.classList.toggle('hidden', inputMode !== 'manual');
  renderReceptionVehicles();
}

function fillReceptionVehicleFromDecoded(data) {
  $('rxVehicleYear').value = data.year || '';
  $('rxVehicleMake').value = data.make || '';
  $('rxVehicleModel').value = data.model || '';
  $('rxVehicleTrim').value = data.trim || '';
  $('rxVinSummary').innerHTML = `
    <strong>${data.year || ''} ${data.make || ''} ${data.model || ''}</strong>
    <span>${data.trim ? 'Versión: ' + data.trim : 'Versión: N/D'}</span>
    <span>${data.vehicleType ? 'Tipo: ' + data.vehicleType : ''}</span>
    <span>${vehicleSpecsFromDecoded(data).filter((s) => ['Motor', 'Combustible', 'Transmision'].includes(s.label) && s.value).map((s) => `${s.label}: ${s.value}`).join(' · ')}</span>
  `;
  $('rxVinSummary').classList.remove('hidden');
}

async function loadReceptionYears() {
  if (!$('rxRefYear') || $('rxRefYear').dataset.loaded) return;
  const years = await api('/api/vehicle-reference/years');
  $('rxRefYear').innerHTML = '<option value="">Año...</option>' + years.map((y) => `<option value="${y}">${y}</option>`).join('');
  $('rxRefYear').dataset.loaded = '1';
}

async function rxLoadMakes() {
  const year = $('rxRefYear').value;
  $('rxRefMake').disabled = !year;
  $('rxRefModel').disabled = true; $('rxRefStyle').disabled = true;
  $('rxRefMake').innerHTML = '<option value="">Marca...</option>';
  $('rxRefModel').innerHTML = '<option value="">Modelo...</option>';
  $('rxRefStyle').innerHTML = '<option value="">Versión...</option>';
  if (!year) return;
  const data = await api('/api/vehicle-reference/makes?year=' + year);
  $('rxRefMake').innerHTML += data.map((m) => `<option value="${m.id}">${m.make_name}</option>`).join('');
  $('rxVehicleYear').value = year;
}

async function rxLoadModels() {
  const year = $('rxRefYear').value;
  const makeId = $('rxRefMake').value;
  $('rxRefModel').disabled = !makeId;
  $('rxRefStyle').disabled = true;
  $('rxRefModel').innerHTML = '<option value="">Modelo...</option>';
  $('rxRefStyle').innerHTML = '<option value="">Versión...</option>';
  if (!makeId) return;
  const data = await api(`/api/vehicle-reference/models?year=${year}&makeId=${makeId}`);
  $('rxRefModel').innerHTML += data.map((m) => `<option value="${m.id}" data-type="${m.vehicle_type || ''}">${m.model_name}</option>`).join('');
  $('rxVehicleMake').value = $('rxRefMake').selectedOptions[0]?.textContent || '';
}

async function rxLoadStyles() {
  const year = $('rxRefYear').value;
  const makeId = $('rxRefMake').value;
  const modelId = $('rxRefModel').value;
  $('rxRefStyle').disabled = !modelId;
  $('rxRefStyle').innerHTML = '<option value="">Versión...</option>';
  if (!modelId) return;
  const data = await api(`/api/vehicle-reference/styles?year=${year}&makeId=${makeId}&modelId=${modelId}`);
  $('rxRefStyle').innerHTML += data.map((s) => `<option value="${s.id}">${s.style_name}</option>`).join('');
  $('rxVehicleModel').value = $('rxRefModel').selectedOptions[0]?.textContent || '';
}

function rxApplyStyle() {
  $('rxVehicleTrim').value = $('rxRefStyle').selectedOptions[0]?.textContent || '';
}

function resetReceptionForm() {
  receptionDecodedVin = null;
  selectedReceptionVehicleId = null;

  const setRadio = (name, value) => {
    const input = document.querySelector(`input[name="${name}"][value="${value}"]`);
    if (input) input.checked = true;
  };

  setRadio('rxCustomerMode', 'existing');
  setRadio('rxVehicleInputMode', 'vin');
  receptionCustomerMode = 'existing';
  receptionVehicleMode = 'existing';
  selectedReceptionCustomerId = null;
  receptionCustomerSearch = '';
  receptionVehicleSearch = '';

  [
    'rxBusinessName', 'rxContactName', 'rxPhone', 'rxWhatsapp', 'rxEmail', 'rxAddress', 'rxRfc',
    'rxPostalCode', 'rxTaxRegime', 'rxCfdiUse', 'rxCustomerSearch', 'rxVehicleSearch',
    'rxVin', 'rxVehicleYear', 'rxVehicleMake', 'rxVehicleModel', 'rxVehicleTrim', 'rxPlates',
    'rxMileage', 'rxEconomicNumber', 'rxSymptom', 'rxFuel', 'rxInventory', 'rxObservations'
  ].forEach((id) => { if ($(id)) $(id).value = ''; });

  if ($('rxCustomerType')) $('rxCustomerType').value = 'empresa';
  updateReceptionCustomerTypeUI();
  setReceptionFiscalVisibility(false);
  if ($('rxVinSummary')) {
    $('rxVinSummary').innerHTML = '';
    $('rxVinSummary').classList.add('hidden');
  }

  if ($('rxRefYear')) $('rxRefYear').value = '';
  if ($('rxRefMake')) {
    $('rxRefMake').innerHTML = '<option value="">Marca...</option>';
    $('rxRefMake').disabled = true;
  }
  if ($('rxRefModel')) {
    $('rxRefModel').innerHTML = '<option value="">Modelo...</option>';
    $('rxRefModel').disabled = true;
  }
  if ($('rxRefStyle')) {
    $('rxRefStyle').innerHTML = '<option value="">Versión...</option>';
    $('rxRefStyle').disabled = true;
  }

  setReceptionModeVisibility();
  renderReceptionCustomerPicker();
  renderReceptionCustomerSummary();
  renderReceptionVehicles();
}

// ═══════════════════════════════════
// REFERENCIA DE VEHÍCULOS
// ═══════════════════════════════════
async function initReference() {
  try {
    const years = await api('/api/vehicle-reference/years');
    $('refYear').innerHTML = '<option value="">Seleccione año...</option>' + 
      years.slice(0, 80).map((y) => `<option value="${y}">${y}</option>`).join('');
    
    $('refYear').onchange = loadMakes; 
    $('refMake').onchange = loadModels; 
    $('refModel').onchange = loadStyles;
  } catch (e) {
    console.error("Error cargando base de vehículos local", e);
  }
}

async function loadMakes() { 
  const val = $('refYear').value;
  if (!val) return;
  const data = await api('/api/vehicle-reference/makes?year=' + val); 
  $('refMake').innerHTML = '<option value="">Seleccione marca...</option>' + 
    data.map((m) => `<option value="${m.id}">${m.make_name}</option>`).join(''); 
  $('refModel').innerHTML = '<option value="">Seleccione modelo primero</option>';
  $('refStyle').innerHTML = '<option value="">Seleccione modelo primero</option>';
}

async function loadModels() { 
  const year = $('refYear').value;
  const makeId = $('refMake').value;
  if (!makeId) return;
  const data = await api(`/api/vehicle-reference/models?year=${year}&makeId=${makeId}`); 
  $('refModel').innerHTML = '<option value="">Seleccione modelo...</option>' + 
    data.map((m) => `<option value="${m.id}" data-type="${m.vehicle_type || ''}">${m.model_name}</option>`).join(''); 
  $('refStyle').innerHTML = '<option value="">Seleccione modelo primero</option>';
}

async function loadStyles() { 
  const year = $('refYear').value;
  const makeId = $('refMake').value;
  const modelId = $('refModel').value;
  if (!modelId) return;
  const data = await api(`/api/vehicle-reference/styles?year=${year}&makeId=${makeId}&modelId=${modelId}`); 
  $('refStyle').innerHTML = '<option value="">Seleccione estilo...</option>' + 
    data.map((s) => `<option value="${s.id}">${s.style_name}</option>`).join(''); 
}

// ═══════════════════════════════════
// LOGIN
// ═══════════════════════════════════
$('loginBtn').onclick = async () => {
  const email = $('loginEmail').value;
  const password = $('loginPassword').value;
  
  if (!email || !password) {
    showToast('Campos vacíos', 'Por favor complete todos los datos', 'error');
    return;
  }

  // Loading state
  const btn = $('loginBtn');
  btn.classList.add('loading');
  const origHtml = btn.innerHTML;
  btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Verificando...';
  
  try {
    const data = await api('/api/auth/login', { 
      method: 'POST', 
      body: JSON.stringify({ email, password }) 
    });
    
    token = data.token; 
    currentUser = data.user; 
    localStorage.setItem('masimToken', token); 
    localStorage.setItem('masimUser', JSON.stringify(currentUser));
    
    $('loginView').classList.add('hidden'); 
    $('appView').classList.remove('hidden'); 
    $('logoutBtn').classList.remove('hidden'); 
    $('topReceptionBtn')?.classList.remove('hidden');
    
    setupProfileUI();
    
    await loadAll();
    showToast('Bienvenido', `Acceso concedido como: ${currentUser.name}`, 'success');
  } catch (error) {
    // El catch ya muestra el Toast
  } finally {
    btn.classList.remove('loading');
    btn.innerHTML = origHtml;
  }
};

// Logout
$('logoutBtn').onclick = () => { 
  localStorage.clear(); 
  showToast('Cerrado', 'Sesión finalizada. Redireccionando...', 'info');
  setTimeout(() => {
    location.reload();
  }, 1000);
};

// Navegación
document.querySelectorAll('[data-tab]').forEach((button) => {
  button.onclick = () => showTab(button.dataset.tab);
});

// Perfil
function setupProfileUI() {
  if (currentUser) {
    $('userProfile').classList.remove('hidden');
    $('topReceptionBtn')?.classList.remove('hidden');
    $('userName').textContent = currentUser.name;
    const initials = currentUser.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
    $('userAvatar').textContent = initials;
  }
}

function customerFormIds() {
  return [
    'customerName', 'customerContact', 'customerPhone', 'customerWhatsapp', 'customerEmail', 'customerAddress',
    'customerRfc', 'customerPostalCode', 'customerTaxRegime', 'customerCfdiUse'
  ];
}

function updateCustomerTypeUI() {
  const isCompany = $('customerType')?.value !== 'particular';
  if ($('customerNameLabel')) $('customerNameLabel').textContent = isCompany ? 'Razón social' : 'Nombre completo';
  if ($('customerName')) $('customerName').placeholder = isCompany ? 'Razón social exacta' : 'Nombre completo';
  $('customerContactField')?.classList.toggle('hidden', !isCompany);
  $('customerBusinessNameHelp')?.classList.toggle('hidden', !isCompany);
}

function setCustomerFiscalVisibility(show) {
  $('customerFiscalBox')?.classList.toggle('hidden', !show);
  if ($('toggleCustomerFiscal')) {
    $('toggleCustomerFiscal').innerHTML = show
      ? '<i class="fa-solid fa-eye-slash"></i> Ocultar datos fiscales'
      : '<i class="fa-solid fa-file-invoice"></i> Agregar datos fiscales';
    $('toggleCustomerFiscal').classList.toggle('secondary', show);
  }
}

function resetCustomerForm() {
  customerFormIds().forEach((id) => { if ($(id)) $(id).value = ''; });
  if ($('customerType')) $('customerType').value = 'empresa';
  updateCustomerTypeUI();
  setCustomerFiscalVisibility(false);
}

function closeCustomerModal() {
  $('customerModalOverlay')?.classList.add('hidden');
  document.body.style.overflow = '';
  editingCustomerId = null;
  resetCustomerForm();
}

function fillCustomerForm(customer) {
  $('customerType').value = customer.customer_type || 'particular';
  $('customerName').value = customer.display_name || customer.name || '';
  $('customerContact').value = customer.contact_name || '';
  $('customerPhone').value = customer.phone || '';
  $('customerWhatsapp').value = customer.whatsapp || '';
  $('customerEmail').value = customer.email || '';
  $('customerAddress').value = customer.address || '';
  $('customerRfc').value = customer.rfc || '';
  $('customerPostalCode').value = customer.postal_code || '';
  $('customerTaxRegime').value = customer.tax_regime || '';
  $('customerCfdiUse').value = customer.cfdi_use || '';
  updateCustomerTypeUI();
  setCustomerFiscalVisibility(Boolean(customer.rfc || customer.postal_code || customer.tax_regime || customer.cfdi_use));
}

function openCustomerModal(customerId = null) {
  resetCustomerForm();
  editingCustomerId = customerId;
  const customer = customers.find((c) => Number(c.id) === Number(customerId));
  if (customer) fillCustomerForm(customer);

  const isEditing = Boolean(customer);
  if ($('customerModalTitle')) {
    $('customerModalTitle').innerHTML = isEditing
      ? '<i class="fa-solid fa-pen-to-square"></i> Modificar cliente'
      : '<i class="fa-solid fa-user-plus"></i> Registrar cliente';
  }
  if ($('saveCustomer')) {
    $('saveCustomer').innerHTML = isEditing
      ? '<i class="fa-solid fa-floppy-disk"></i> Actualizar cliente'
      : '<i class="fa-solid fa-floppy-disk"></i> Guardar cliente';
  }
  $('customerModalOverlay')?.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  setTimeout(() => $('customerName')?.focus(), 0);
}

function vehicleFormIds() {
  return ['vin', 'vehicleYear', 'vehicleMake', 'vehicleModel', 'vehicleTrim', 'vehiclePlates', 'vehicleMileage', 'vehicleEconomicNumber'];
}

function resetVehicleForm() {
  vehicleFormIds().forEach((id) => { if ($(id)) $(id).value = ''; });
  const vinMode = document.querySelector('input[name="vehicleInputMode"][value="vin"]');
  if (vinMode) vinMode.checked = true;
  if ($('vinResultContainer')) $('vinResultContainer').classList.add('hidden');
  if ($('specsContainer')) $('specsContainer').innerHTML = '';
  if ($('vinResult')) $('vinResult').textContent = '';
  if ($('vehicleRefYear')) $('vehicleRefYear').value = '';
  if ($('vehicleRefMake')) {
    $('vehicleRefMake').innerHTML = '<option value="">Marca...</option>';
    $('vehicleRefMake').disabled = true;
  }
  if ($('vehicleRefModel')) {
    $('vehicleRefModel').innerHTML = '<option value="">Modelo...</option>';
    $('vehicleRefModel').disabled = true;
  }
  if ($('vehicleRefStyle')) {
    $('vehicleRefStyle').innerHTML = '<option value="">Versión...</option>';
    $('vehicleRefStyle').disabled = true;
  }
  decodedVin = null;
  setVehicleInputModeVisibility();
}

function closeVehicleModal() {
  $('vehicleModalOverlay')?.classList.add('hidden');
  document.body.style.overflow = '';
  editingVehicleId = null;
  resetVehicleForm();
}

function fillVehicleForm(vehicle) {
  if ($('vehicleCustomer')) $('vehicleCustomer').value = vehicle.customer_id || '';
  $('vin').value = vehicle.vin || '';
  $('vehicleYear').value = vehicle.year || '';
  $('vehicleMake').value = vehicle.make || '';
  $('vehicleModel').value = vehicle.model || '';
  $('vehicleTrim').value = vehicle.trim || '';
  $('vehiclePlates').value = vehicle.plates || '';
  $('vehicleMileage').value = vehicle.mileage || '';
  $('vehicleEconomicNumber').value = vehicle.economic_number || '';
  const raw = parseJsonSafe(vehicle.nhtsa_raw_json);
  decodedVin = raw ? { raw, vehicleType: vehicle.vehicle_type } : null;
  if (raw && $('specsContainer')) {
    $('specsContainer').innerHTML = renderSpecsGrid({
      year: vehicle.year,
      make: vehicle.make,
      model: vehicle.model,
      trim: vehicle.trim,
      vehicleType: vehicle.vehicle_type,
      raw
    });
    $('vinResult').textContent = JSON.stringify(raw, null, 2);
    $('vinResultContainer').classList.remove('hidden');
  }
}

function setVehicleInputModeVisibility() {
  const inputMode = document.querySelector('input[name="vehicleInputMode"]:checked')?.value || 'vin';
  $('vehicleVinBox')?.classList.toggle('hidden', inputMode !== 'vin');
  $('vehicleManualBox')?.classList.toggle('hidden', inputMode !== 'manual');
}

async function loadVehicleYears() {
  if (!$('vehicleRefYear') || $('vehicleRefYear').dataset.loaded) return;
  const years = await api('/api/vehicle-reference/years');
  $('vehicleRefYear').innerHTML = '<option value="">Año...</option>' + years.map((y) => `<option value="${y}">${y}</option>`).join('');
  $('vehicleRefYear').dataset.loaded = '1';
}

async function vehicleLoadMakes() {
  const year = $('vehicleRefYear').value;
  $('vehicleRefMake').disabled = !year;
  $('vehicleRefModel').disabled = true;
  $('vehicleRefStyle').disabled = true;
  $('vehicleRefMake').innerHTML = '<option value="">Marca...</option>';
  $('vehicleRefModel').innerHTML = '<option value="">Modelo...</option>';
  $('vehicleRefStyle').innerHTML = '<option value="">Versión...</option>';
  if (!year) return;
  const data = await api('/api/vehicle-reference/makes?year=' + year);
  $('vehicleRefMake').innerHTML += data.map((m) => `<option value="${m.id}">${m.make_name}</option>`).join('');
  $('vehicleYear').value = year;
}

async function vehicleLoadModels() {
  const year = $('vehicleRefYear').value;
  const makeId = $('vehicleRefMake').value;
  $('vehicleRefModel').disabled = !makeId;
  $('vehicleRefStyle').disabled = true;
  $('vehicleRefModel').innerHTML = '<option value="">Modelo...</option>';
  $('vehicleRefStyle').innerHTML = '<option value="">Versión...</option>';
  if (!makeId) return;
  const data = await api(`/api/vehicle-reference/models?year=${year}&makeId=${makeId}`);
  $('vehicleRefModel').innerHTML += data.map((m) => `<option value="${m.id}" data-type="${m.vehicle_type || ''}">${m.model_name}</option>`).join('');
  $('vehicleMake').value = $('vehicleRefMake').selectedOptions[0]?.textContent || '';
}

async function vehicleLoadStyles() {
  const year = $('vehicleRefYear').value;
  const makeId = $('vehicleRefMake').value;
  const modelId = $('vehicleRefModel').value;
  $('vehicleRefStyle').disabled = !modelId;
  $('vehicleRefStyle').innerHTML = '<option value="">Versión...</option>';
  if (!modelId) return;
  const data = await api(`/api/vehicle-reference/styles?year=${year}&makeId=${makeId}&modelId=${modelId}`);
  $('vehicleRefStyle').innerHTML += data.map((s) => `<option value="${s.id}">${s.style_name}</option>`).join('');
  $('vehicleModel').value = $('vehicleRefModel').selectedOptions[0]?.textContent || '';
}

function vehicleApplyStyle() {
  $('vehicleTrim').value = $('vehicleRefStyle').selectedOptions[0]?.textContent || '';
}

function openVehicleModal(vehicleId = null) {
  resetVehicleForm();
  editingVehicleId = vehicleId;
  const vehicle = vehicles.find((v) => Number(v.id) === Number(vehicleId));
  if (vehicle) fillVehicleForm(vehicle);

  const isEditing = Boolean(vehicle);
  if ($('vehicleModalTitle')) {
    $('vehicleModalTitle').innerHTML = isEditing
      ? '<i class="fa-solid fa-pen-to-square"></i> Modificar vehículo'
      : '<i class="fa-solid fa-car-on"></i> Registrar vehículo';
  }
  if ($('saveVehicle')) {
    $('saveVehicle').innerHTML = isEditing
      ? '<i class="fa-solid fa-floppy-disk"></i> Actualizar vehículo'
      : '<i class="fa-solid fa-car-on"></i> Registrar vehículo';
  }
  $('vehicleModalOverlay')?.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  setVehicleInputModeVisibility();
  setTimeout(() => $('vehicleCustomer')?.focus(), 0);
}

// ═══════════════════════════════════
// FORMULARIOS
// ═══════════════════════════════════

$('openCustomerModal')?.addEventListener('click', () => openCustomerModal());
$('closeCustomerModal')?.addEventListener('click', closeCustomerModal);
$('cancelCustomerModal')?.addEventListener('click', closeCustomerModal);
$('customerModalOverlay')?.addEventListener('click', (event) => {
  if (event.target === $('customerModalOverlay')) closeCustomerModal();
});
$('customerType')?.addEventListener('change', updateCustomerTypeUI);
$('toggleCustomerFiscal')?.addEventListener('click', () => {
  setCustomerFiscalVisibility($('customerFiscalBox')?.classList.contains('hidden'));
});
$('openVehicleModal')?.addEventListener('click', () => openVehicleModal());
$('closeVehicleModal')?.addEventListener('click', closeVehicleModal);
$('cancelVehicleModal')?.addEventListener('click', closeVehicleModal);
$('saveIssuer')?.addEventListener('click', () => saveBillingIssuer().catch(() => {}));
$('uploadCertificate')?.addEventListener('click', () => saveBillingCertificate().catch((error) => showToast('Error', error.message, 'error')));
$('deleteCertificate')?.addEventListener('click', () => deleteBillingCertificate().catch(() => {}));
$('refreshBilling')?.addEventListener('click', () => reloadBilling().catch(() => {}));
$('refreshWhatsapp')?.addEventListener('click', () => reloadWhatsapp().catch(() => {}));
$('sendWhatsapp')?.addEventListener('click', () => sendWhatsappMessage().catch((error) => showToast('Error', error.message, 'error')));
$('whatsappConversations')?.addEventListener('click', (event) => {
  const button = event.target.closest('.wa-conversation');
  if (!button?.dataset?.jid) return;
  loadWhatsappMessages(button.dataset.jid).catch((error) => showToast('Error', error.message, 'error'));
});
$('waSearch')?.addEventListener('input', () => {
  whatsappSearchText = $('waSearch')?.value || '';
  renderWhatsapp();
});
$('waCustomer')?.addEventListener('change', () => {
  const phone = $('waCustomer')?.selectedOptions?.[0]?.dataset?.phone || '';
  if ($('waPhone')) $('waPhone').value = phone;
  selectedWhatsappJid = null;
  whatsappMessages = [];
  renderWhatsapp();
});
$('waPhone')?.addEventListener('input', () => {
  const selectedConversation = whatsappConversations.find((item) => item.jid === selectedWhatsappJid);
  if (!selectedConversation) return;
  const selectedPhone = phoneDigits(selectedConversation.phone || selectedConversation.jid);
  const inputPhone = phoneDigits($('waPhone')?.value);
  if (inputPhone && selectedPhone && !selectedPhone.endsWith(inputPhone) && !inputPhone.endsWith(selectedPhone)) {
    selectedWhatsappJid = null;
    whatsappMessages = [];
    renderWhatsapp();
  }
});
$('waMessage')?.addEventListener('input', () => {
  const box = $('waMessage');
  box.style.height = 'auto';
  box.style.height = `${Math.min(box.scrollHeight, 140)}px`;
});
$('waMessage')?.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    sendWhatsappMessage().catch((error) => showToast('Error', error.message, 'error'));
  }
});
$('vehicleModalOverlay')?.addEventListener('click', (event) => {
  if (event.target === $('vehicleModalOverlay')) closeVehicleModal();
});
document.querySelectorAll('input[name="vehicleInputMode"]').forEach((input) => {
  input.addEventListener('change', async () => {
    setVehicleInputModeVisibility();
    if (document.querySelector('input[name="vehicleInputMode"]:checked')?.value === 'manual') await loadVehicleYears();
  });
});
$('vehicleRefYear')?.addEventListener('change', vehicleLoadMakes);
$('vehicleRefMake')?.addEventListener('change', vehicleLoadModels);
$('vehicleRefModel')?.addEventListener('change', vehicleLoadStyles);
$('vehicleRefStyle')?.addEventListener('change', vehicleApplyStyle);

// Guardar Cliente
$('saveCustomer').onclick = async () => {
  const name = $('customerName').value;
  const customerType = $('customerType').value;
  const contactName = $('customerContact').value;
  const phone = $('customerPhone').value;
  const whatsapp = $('customerWhatsapp').value;
  const email = $('customerEmail').value;
  const address = $('customerAddress').value;
  const rfc = $('customerRfc').value;
  const postalCode = $('customerPostalCode').value;
  const taxRegime = $('customerTaxRegime').value;
  const cfdiUse = $('customerCfdiUse').value;
  
  if (!name) {
    showToast('Alerta', 'El nombre del cliente es obligatorio', 'error');
    return;
  }
  
  if (!phone && !whatsapp) {
    showToast('Alerta', 'Capture teléfono o WhatsApp', 'error');
    return;
  }

  const method = editingCustomerId ? 'PUT' : 'POST';
  const path = editingCustomerId ? `/api/customers/${editingCustomerId}` : '/api/customers';

  await api(path, { 
    method, 
    body: JSON.stringify({ customer_type: customerType, name, contact_name: contactName, phone, whatsapp, email, address, rfc, postal_code: postalCode, tax_regime: taxRegime, cfdi_use: cfdiUse }) 
  });

  const wasEditing = Boolean(editingCustomerId);
  closeCustomerModal();
  await loadAll(); 
  showToast(wasEditing ? 'Cliente Actualizado' : 'Cliente Registrado', `Se guardó correctamente a ${name}`);
};

// Decodificar VIN
$('decodeVin').onclick = async () => {
  const vinVal = $('vin').value.trim().toUpperCase();
  if (!vinVal) {
    decodedVin = null;
    $('vinResultContainer').classList.add('hidden');
    showToast('Captura manual', 'No hay VIN/NIV. Llena Año, Marca, Modelo y Version manualmente.', 'info');
    return;
  }

  if (vinVal.length !== 17) {
    showToast('VIN incompleto', 'El VIN/NIV debe tener exactamente 17 caracteres. Si no lo tienes completo, captura el vehiculo manualmente.', 'error');
    return;
  }
  
  showToast('Procesando', 'Decodificando VIN con la base de la NHTSA...', 'info');
  
  try {
    decodedVin = await api('/api/vin/decode/' + vinVal);
    
    $('vehicleYear').value = decodedVin.year || '';
    $('vehicleMake').value = decodedVin.make || '';
    $('vehicleModel').value = decodedVin.model || '';
    $('vehicleTrim').value = decodedVin.trim || '';
    
    const container = $('specsContainer');
    container.innerHTML = renderSpecsGrid(decodedVin);
    
    $('vinResultContainer').classList.remove('hidden');
    $('vinResult').textContent = JSON.stringify(decodedVin, null, 2);
    
    if (!decodedVin.year && !decodedVin.make && !decodedVin.model) {
      showToast('Sin datos claros', 'NHTSA respondio, pero no encontro datos principales. Captura el vehiculo manualmente.', 'info');
      return;
    }

    showToast('Decodificado con Exito', `${decodedVin.year || ''} ${decodedVin.make || ''} ${decodedVin.model || ''}`, 'success');
  } catch (e) {
    console.error(e);
    decodedVin = null;
    $('vinResultContainer').classList.add('hidden');
    showToast('Captura manual disponible', 'No fue posible decodificar el VIN/NIV. Puedes registrar Año, Marca, Modelo y Version manualmente.', 'info');
  }
};

// Registrar / modificar Vehículo
$('saveVehicle').onclick = async () => {
  const custId = $('vehicleCustomer').value;
  const vinVal = $('vin').value.trim();
  const year = $('vehicleYear').value;
  const make = $('vehicleMake').value;
  const model = $('vehicleModel').value;
  const trim = $('vehicleTrim').value;
  const plates = $('vehiclePlates').value;
  const mileage = $('vehicleMileage').value;
  const economicNumber = $('vehicleEconomicNumber').value;
  
  if (!custId || !make || !model) {
    showToast('Campos vacíos', 'Marca, Modelo y Propietario son obligatorios', 'error');
    return;
  }

  const existingVehicle = vehicles.find((v) => Number(v.id) === Number(editingVehicleId));
  const method = editingVehicleId ? 'PUT' : 'POST';
  const path = editingVehicleId ? `/api/vehicles/${editingVehicleId}` : '/api/vehicles';

  await api(path, { 
    method, 
    body: JSON.stringify({ 
      customer_id: custId, 
      vin: vinVal, 
      year, 
      make, 
      model, 
      trim, 
      vehicle_type: decodedVin?.vehicleType || $('vehicleRefModel')?.selectedOptions[0]?.dataset.type || existingVehicle?.vehicle_type || null,
      plates, 
      mileage, 
      economic_number: economicNumber,
      open_vehicle_make_id: $('vehicleRefMake')?.value || existingVehicle?.open_vehicle_make_id || null,
      open_vehicle_model_id: $('vehicleRefModel')?.value || existingVehicle?.open_vehicle_model_id || null,
      open_vehicle_style_id: $('vehicleRefStyle')?.value || existingVehicle?.open_vehicle_style_id || null,
      nhtsa_raw_json: decodedVin?.raw || parseJsonSafe(existingVehicle?.nhtsa_raw_json)
    }) 
  });

  const wasEditing = Boolean(editingVehicleId);
  closeVehicleModal();
  await loadAll(); 
  showToast(wasEditing ? 'Vehículo Actualizado' : 'Vehículo Registrado', 'Guardado con éxito en el inventario del taller.');
};

document.querySelectorAll('input[name="rxCustomerMode"], input[name="rxVehicleInputMode"]').forEach((input) => {
  input.onchange = async () => {
    setReceptionModeVisibility();
    if (document.querySelector('input[name="rxVehicleInputMode"]:checked')?.value === 'manual') await loadReceptionYears();
  };
});

function updateReceptionCustomerTypeUI() {
  const isCompany = $('rxCustomerType')?.value !== 'particular';
  if ($('rxCustomerNameLabel')) $('rxCustomerNameLabel').textContent = isCompany ? 'Razón social' : 'Nombre completo';
  if ($('rxBusinessName')) $('rxBusinessName').placeholder = isCompany ? 'Razón social exacta' : 'Nombre completo';
  $('rxContactNameField')?.classList.toggle('hidden', !isCompany);
  $('rxBusinessNameHelp')?.classList.toggle('hidden', !isCompany);
}

function setReceptionFiscalVisibility(show) {
  $('rxFiscalBox')?.classList.toggle('hidden', !show);
  if ($('rxToggleFiscal')) {
    $('rxToggleFiscal').innerHTML = show
      ? '<i class="fa-solid fa-eye-slash"></i> Ocultar datos fiscales'
      : '<i class="fa-solid fa-file-invoice"></i> Agregar datos fiscales';
    $('rxToggleFiscal').classList.toggle('secondary', show);
  }
}

$('rxCustomerSearch')?.addEventListener('input', () => {
  receptionCustomerSearch = $('rxCustomerSearch').value;
  if (receptionCustomerMode !== 'new') selectedReceptionCustomerId = null;
  receptionCustomerMode = 'existing';
  $('rxExistingCustomerBox')?.classList.add('picker-open');
  renderReceptionCustomerPicker();
  renderReceptionCustomerSummary();
  renderReceptionVehicles();
});
$('rxCustomerSearch')?.addEventListener('focus', () => {
  $('rxExistingCustomerBox')?.classList.add('picker-open');
  renderReceptionCustomerPicker();
});
$('vehicleFilterCustomerSearch')?.addEventListener('input', () => {
  vehicleFilterCustomerSearch = $('vehicleFilterCustomerSearch').value;
  vehicleFilterCustomerId = '';
  $('vehicleFilterCustomerBox')?.classList.add('picker-open');
  renderVehicleCustomerFilter();
  renderVehicles();
});
$('vehicleFilterCustomerSearch')?.addEventListener('focus', () => {
  $('vehicleFilterCustomerBox')?.classList.add('picker-open');
  renderVehicleCustomerFilter();
});
$('ordersSearch')?.addEventListener('input', () => {
  orderSearchText = $('ordersSearch').value;
  renderOrders();
});
document.addEventListener('click', (event) => {
  if (!$('rxExistingCustomerBox')?.contains(event.target)) {
    $('rxExistingCustomerBox')?.classList.remove('picker-open');
  }
  if (!$('rxExistingVehicleBox')?.contains(event.target)) {
    $('rxExistingVehicleBox')?.classList.remove('picker-open');
  }
  if (!$('vehicleFilterCustomerBox')?.contains(event.target)) {
    $('vehicleFilterCustomerBox')?.classList.remove('picker-open');
  }
  if (!$('quoteItemPickerBox')?.contains(event.target)) {
    $('quoteItemPickerBox')?.classList.remove('picker-open');
  }
});
$('rxCustomerType')?.addEventListener('change', updateReceptionCustomerTypeUI);
$('rxToggleFiscal')?.addEventListener('click', () => {
  setReceptionFiscalVisibility($('rxFiscalBox')?.classList.contains('hidden'));
});
$('rxVehicleSearch')?.addEventListener('input', () => {
  receptionVehicleSearch = $('rxVehicleSearch').value;
  if (receptionVehicleMode !== 'new') selectedReceptionVehicleId = null;
  receptionVehicleMode = 'existing';
  $('rxExistingVehicleBox')?.classList.add('picker-open');
  renderReceptionVehicles();
});
$('rxVehicleSearch')?.addEventListener('focus', () => {
  $('rxExistingVehicleBox')?.classList.add('picker-open');
  renderReceptionVehicles();
});
$('rxRefYear').onchange = rxLoadMakes;
$('rxRefMake').onchange = rxLoadModels;
$('rxRefModel').onchange = rxLoadStyles;
$('rxRefStyle').onchange = rxApplyStyle;

$('rxDecodeVin').onclick = async () => {
  const vin = $('rxVin').value.trim().toUpperCase();
  if (vin.length !== 17) {
    showToast('VIN incompleto', 'El VIN/NIV debe tener exactamente 17 caracteres.', 'error');
    return;
  }
  receptionDecodedVin = await api('/api/vin/decode/' + vin);
  fillReceptionVehicleFromDecoded(receptionDecodedVin);
  showToast('VIN decodificado', `${receptionDecodedVin.year || ''} ${receptionDecodedVin.make || ''} ${receptionDecodedVin.model || ''}`, 'success');
};

$('rxCreateReception').onclick = async () => {
  const customerMode = receptionCustomerMode;
  const vehicleMode = receptionVehicleMode;
  const body = {
    customerMode,
    customerId: customerMode === 'existing' ? Number(selectedReceptionCustomerId) : null,
    customer: customerMode === 'new' ? {
      customer_type: $('rxCustomerType').value,
      name: $('rxBusinessName').value,
      contact_name: $('rxContactName').value,
      phone: $('rxPhone').value,
      whatsapp: $('rxWhatsapp').value,
      email: $('rxEmail').value,
      address: $('rxAddress').value,
      rfc: $('rxRfc').value,
      postal_code: $('rxPostalCode').value,
      tax_regime: $('rxTaxRegime').value,
      cfdi_use: $('rxCfdiUse').value
    } : null,
    vehicleMode,
    vehicleId: vehicleMode === 'existing' ? Number(selectedReceptionVehicleId) : null,
    vehicleInputMode: document.querySelector('input[name="rxVehicleInputMode"]:checked')?.value,
    vehicle: vehicleMode === 'new' ? {
      vin: $('rxVin').value.trim().toUpperCase(),
      year: $('rxVehicleYear').value,
      make: $('rxVehicleMake').value,
      model: $('rxVehicleModel').value,
      trim: $('rxVehicleTrim').value,
      plates: $('rxPlates').value,
      mileage: $('rxMileage').value,
      economic_number: $('rxEconomicNumber').value,
      vehicle_type: receptionDecodedVin?.vehicleType || $('rxRefModel').selectedOptions[0]?.dataset.type || null,
      open_vehicle_make_id: $('rxRefMake').value || null,
      open_vehicle_model_id: $('rxRefModel').value || null,
      open_vehicle_style_id: $('rxRefStyle').value || null,
      nhtsa_raw_json: receptionDecodedVin?.raw || null
    } : null,
    reception: {
      symptom: $('rxSymptom').value,
      fuel_level: $('rxFuel').value,
      inventory: $('rxInventory').value,
      observations: $('rxObservations').value
    }
  };

  if (customerMode === 'existing' && !body.customerId) {
    showToast('Alerta', 'Selecciona un cliente o usa la opción Nuevo cliente.', 'error');
    return;
  }
  if (vehicleMode === 'existing' && !body.vehicleId) {
    showToast('Alerta', 'Selecciona un vehículo o registra uno nuevo.', 'error');
    return;
  }
  if (customerMode === 'new' && vehicleMode === 'existing') {
    showToast('Alerta', 'Para un cliente nuevo registra también un vehículo nuevo.', 'error');
    return;
  }

  const result = await api('/api/receptions', { method: 'POST', body: JSON.stringify(body) });
  await loadAll();
  resetReceptionForm();
  selectedOrderId = result.workOrderId;
  showTab('orders');
  await selectOrder(result.workOrderId);
  showToast('Recepción creada', `Se generó la orden ${result.workOrder.folio}`, 'success');
};

// Guardar o editar Item en Catálogo
$('saveCatalog').onclick = async () => {
  const desc = $('catalogDescription').value.trim();
  const type = $('catalogType').value;
  const price = Number($('catalogPrice').value || 0);
  const cost = Number($('catalogCost').value || 0);
  
  if (!desc) {
    showToast('Campos vacíos', 'La descripción es requerida', 'error');
    return;
  }
  if (!Number.isFinite(price) || price < 0) {
    showToast('Precio inválido', 'El precio al público debe ser mayor o igual a cero', 'error');
    return;
  }
  if (!Number.isFinite(cost) || cost < 0) {
    showToast('Costo inválido', 'El costo interno debe ser mayor o igual a cero', 'error');
    return;
  }

  const wasEditing = Boolean(editingCatalogId);
  const existingItem = catalog.find((item) => Number(item.id) === Number(editingCatalogId));
  const payload = {
    description: desc,
    type,
    public_price: price,
    internal_cost: cost,
    ...(existingItem ? { active: existingItem.active } : {})
  };
  const savedItem = await api(editingCatalogId ? `/api/catalog/${editingCatalogId}` : '/api/catalog', {
    method: editingCatalogId ? 'PUT' : 'POST',
    body: JSON.stringify(payload)
  });

  upsertCatalogItem(savedItem);
  resetCatalogForm();
  renderCatalog();
  showToast(wasEditing ? 'Concepto actualizado' : 'Concepto creado', 'El catálogo global se actualizó correctamente.');
};

$('cancelCatalogEdit')?.addEventListener('click', resetCatalogForm);
$('catalogSearch')?.addEventListener('input', () => {
  catalogSearchText = $('catalogSearch').value;
  renderCatalog();
});
$('catalogTypeFilter')?.addEventListener('change', () => {
  catalogTypeFilter = $('catalogTypeFilter').value;
  renderCatalog();
});
$('catalogShowInactive')?.addEventListener('change', () => {
  showInactiveCatalog = $('catalogShowInactive').checked;
  renderCatalog();
});

// Cargar Órdenes del Mecánico
$('loadMechanic').onclick = async () => {
  showToast('Buscando...', 'Consultando tus OTs asignadas...', 'info');
  try {
    const rows = await api('/api/work-orders/mechanic/my-active/list'); 
    
    $('mechanicList').innerHTML = rows.map((o) => `
      <div class="item" style="border-left: 4px solid var(--purple);">
        <header>
          <strong style="color:var(--brand);">${o.folio}</strong>
          <button onclick="selectedOrderId=${o.id}; finalizeOrder()">
            <i class="fa-solid fa-check"></i> Finalizar Trabajo
          </button>
        </header>
        <div class="item-row">
          <span class="item-label"><i class="fa-solid fa-car"></i> Vehículo</span>
          <span class="item-value" style="color:#fff;">${o.year || ''} ${o.make || ''} ${o.model || ''} [${o.plates || 'S/P'}]</span>
        </div>
        <div class="item-row">
          <span class="item-label">Propietario</span>
          <span class="item-value">${o.customer_name}</span>
        </div>
        <div class="item-footer" style="background: rgba(255,255,255,0.01); padding: 8px 10px; border-radius: 6px;">
          <span style="color:#f8fafc; font-style:italic;"><i class="fa-solid fa-triangle-exclamation"></i> "${o.symptom || 'Falla sin especificar'}"</span>
        </div>
      </div>
    `).join('') || `<div class="empty-state"><i class="fa-solid fa-toolbox"></i><p>No tienes órdenes de trabajo activas asignadas.</p></div>`;
    
    showToast('Actualizado', `${rows.length} órdenes de trabajo encontradas.`);
  } catch (err) {
    console.error(err);
  }
};

// ═══════════════════════════════════
// AUTOLOGIN
// ═══════════════════════════════════
if (token) { 
  $('loginView').classList.add('hidden'); 
  $('appView').classList.remove('hidden'); 
  $('logoutBtn').classList.remove('hidden'); 
  setupProfileUI();
  
  loadAll().catch(() => {
    localStorage.clear();
    location.reload();
  }); 
}
