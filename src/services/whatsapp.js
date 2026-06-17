const path = require('path');
const fs = require('fs/promises');
const qrcode = require('qrcode');
const db = require('../db/masim');

const authPath = path.resolve(process.cwd(), process.env.WHATSAPP_SESSION_PATH || './data/whatsapp-auth');

let socket = null;
let connectionState = 'disconnected';
let qrText = null;
let qrDataUrl = null;
let lastError = null;
let starting = null;

const originalConsoleInfo = console.info.bind(console);
console.info = (...args) => {
  if (args[0] === 'Closing session:') return;
  originalConsoleInfo(...args);
};

function normalizePhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '';
  return digits.length === 10 ? `52${digits}` : digits;
}

function phoneFromJid(jid) {
  return String(jid || '').split('@')[0].replace(/\D/g, '');
}

function jidFromPhone(value) {
  const phone = normalizePhone(value);
  return phone ? `${phone}@s.whatsapp.net` : '';
}

async function resolveTargetJid({ phone, jid }) {
  if (jid) return jid;

  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return '';

  const candidates = [];
  
  if (digits.length === 10) {
    candidates.push(`52${digits}`);
    candidates.push(`521${digits}`);
  } else if (digits.length === 12 && digits.startsWith('52')) {
    const national = digits.slice(2);
    candidates.push(digits);
    candidates.push(`521${national}`);
  } else if (digits.length === 13 && digits.startsWith('521')) {
    const national = digits.slice(3);
    candidates.push(`52${national}`);
    candidates.push(digits);
  } else {
    candidates.push(digits);
    if (digits.length === 10) {
      candidates.push(`52${digits}`);
    }
  }

  for (const candidate of [...new Set(candidates)]) {
    const matches = await socket.onWhatsApp(candidate).catch(() => []);
    const match = matches?.find((item) => item.exists && item.jid);
    if (match?.jid) return match.jid;
  }

  const error = new Error('El numero no aparece registrado en WhatsApp o no se pudo resolver el destinatario. Verifica lada y digitos.');
  error.status = 400;
  throw error;
}

async function fetchAndCacheProfilePic(jid) {
  try {
    if (!socket || connectionState !== 'connected') return null;

    const cached = db.prepare('SELECT profile_pic_url, updated_at FROM whatsapp_contacts WHERE jid = ?').get(jid);
    if (cached?.profile_pic_url && cached.updated_at) {
      const lastUpdate = new Date(cached.updated_at.replace(' ', 'T')).getTime();
      const oneDay = 24 * 60 * 60 * 1000;
      if (Date.now() - lastUpdate < oneDay) {
        return cached.profile_pic_url;
      }
    }

    const url = await socket.profilePictureUrl(jid, 'image').catch(() => null);

    db.prepare(`
      INSERT INTO whatsapp_contacts (jid, phone, profile_pic_url, updated_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(jid) DO UPDATE SET profile_pic_url = excluded.profile_pic_url, updated_at = CURRENT_TIMESTAMP
    `).run(jid, phoneFromJid(jid), url || null);

    return url;
  } catch (e) {
    console.error('Error al obtener foto de perfil para', jid, e.message);
  }
  return null;
}

function findCustomerByPhone(phone) {
  if (!phone) return null;
  const digits = normalizePhone(phone);
  const localDigits = digits.startsWith('52') && digits.length > 10 ? digits.slice(2) : digits;
  return db.prepare(`
    SELECT id FROM customers
    WHERE REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(whatsapp, ''), '+', ''), ' ', ''), '-', ''), '(', '') LIKE ?
       OR REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(phone, ''), '+', ''), ' ', ''), '-', ''), '(', '') LIKE ?
    ORDER BY id DESC
  `).get(`%${localDigits}%`, `%${localDigits}%`) || null;
}

function extractText(message) {
  if (!message) return '';
  return message.conversation
    || message.extendedTextMessage?.text
    || message.imageMessage?.caption
    || message.videoMessage?.caption
    || message.documentMessage?.caption
    || '';
}

function storeMessage({ jid, direction, body, messageId, status = 'received', errorMessage = null, createdBy = null }) {
  const phone = phoneFromJid(jid);
  const customer = findCustomerByPhone(phone);
  db.prepare(`
    INSERT INTO whatsapp_messages (jid, phone, customer_id, direction, body, baileys_message_id, status, error_message, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(jid, phone, customer?.id || null, direction, body || null, messageId || null, status, errorMessage, createdBy);
}

function getStatus() {
  return {
    enabled: process.env.WHATSAPP_ENABLED !== 'false',
    state: connectionState,
    connected: connectionState === 'connected',
    hasQr: Boolean(qrDataUrl),
    qr: qrDataUrl,
    error: lastError
  };
}

async function start() {
  if (process.env.WHATSAPP_ENABLED === 'false') return getStatus();
  if (socket || starting) return starting || getStatus();

  starting = (async () => {
    try {
      const baileys = require('@whiskeysockets/baileys');
      const makeWASocket = baileys.default || baileys.makeWASocket;
      const { useMultiFileAuthState, DisconnectReason } = baileys;
      const pino = require('pino');
      const { state, saveCreds } = await useMultiFileAuthState(authPath);

      connectionState = 'connecting';
      lastError = null;
      socket = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: 'silent' })
      });

      socket.ev.on('creds.update', saveCreds);

      socket.ev.on('connection.update', async (update) => {
        if (update.qr) {
          qrText = update.qr;
          qrDataUrl = await qrcode.toDataURL(update.qr);
          connectionState = 'qr';
        }
        if (update.connection === 'open') {
          connectionState = 'connected';
          qrText = null;
          qrDataUrl = null;
          lastError = null;
        }
        if (update.connection === 'close') {
          const statusCode = update.lastDisconnect?.error?.output?.statusCode;
          const loggedOut = statusCode === DisconnectReason.loggedOut;
          connectionState = loggedOut ? 'logged_out' : 'disconnected';
          lastError = update.lastDisconnect?.error?.message || null;
          socket = null;
          if (!loggedOut) setTimeout(() => start().catch(() => {}), 3000);
        }
      });

      socket.ev.on('messages.upsert', ({ messages }) => {
        for (const item of messages || []) {
          if (!item.message || item.key.remoteJid === 'status@broadcast') continue;
          const body = extractText(item.message);
          if (!body) continue;
          
          const jid = item.key.remoteJid;
          const direction = item.key.fromMe ? 'out' : 'in';
          
          if (item.pushName) {
            db.prepare(`
              INSERT INTO whatsapp_contacts (jid, phone, push_name, updated_at)
              VALUES (?, ?, ?, CURRENT_TIMESTAMP)
              ON CONFLICT(jid) DO UPDATE SET push_name = excluded.push_name, updated_at = CURRENT_TIMESTAMP
            `).run(jid, phoneFromJid(jid), item.pushName);
          }
          
          const exists = db.prepare('SELECT 1 FROM whatsapp_messages WHERE baileys_message_id = ?').get(item.key.id);
          if (!exists) {
            storeMessage({ 
              jid, 
              direction, 
              body, 
              messageId: item.key.id, 
              status: item.key.fromMe ? 'sent' : 'received' 
            });
          }
        }
      });

      socket.ev.on('messaging-history.set', async ({ chats, contacts, messages }) => {
        try {
          if (contacts) {
            const insertContact = db.prepare(`
              INSERT INTO whatsapp_contacts (jid, phone, push_name, updated_at)
              VALUES (?, ?, ?, CURRENT_TIMESTAMP)
              ON CONFLICT(jid) DO UPDATE SET push_name = COALESCE(excluded.push_name, push_name), updated_at = CURRENT_TIMESTAMP
            `);
            for (const contact of contacts) {
              if (contact.id) {
                const phone = phoneFromJid(contact.id);
                insertContact.run(contact.id, phone, contact.name || contact.verifiedName || contact.notify || null);
              }
            }
          }

          if (messages) {
            for (const msg of messages) {
              if (!msg.message || msg.key.remoteJid === 'status@broadcast') continue;
              const body = extractText(msg.message);
              if (!body) continue;
              const jid = msg.key.remoteJid;
              const direction = msg.key.fromMe ? 'out' : 'in';
              const messageId = msg.key.id;
              const status = msg.status === 3 || msg.status === 4 ? 'sent' : (msg.status === 5 ? 'error' : 'received');

              const exists = db.prepare('SELECT 1 FROM whatsapp_messages WHERE baileys_message_id = ?').get(messageId);
              if (!exists) {
                const phone = phoneFromJid(jid);
                const customer = findCustomerByPhone(phone);
                
                let createdAt = new Date().toISOString().replace('T', ' ').replace(/\..+/, '');
                if (msg.messageTimestamp) {
                  const timestampSec = typeof msg.messageTimestamp === 'object' && msg.messageTimestamp.low 
                    ? msg.messageTimestamp.low 
                    : Number(msg.messageTimestamp);
                  if (!Number.isNaN(timestampSec) && timestampSec > 0) {
                    createdAt = new Date(timestampSec * 1000).toISOString().replace('T', ' ').replace(/\..+/, '');
                  }
                }
                
                db.prepare(`
                  INSERT INTO whatsapp_messages (jid, phone, customer_id, direction, body, baileys_message_id, status, created_at)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                `).run(jid, phone, customer?.id || null, direction, body, messageId, status, createdAt);
              }
            }
          }
        } catch (err) {
          console.error('Error procesando el historial de WhatsApp:', err);
        }
      });

      return getStatus();
    } catch (error) {
      socket = null;
      connectionState = 'error';
      lastError = error.message;
      throw error;
    } finally {
      starting = null;
    }
  })();

  return starting;
}

async function startAndWaitForQr() {
  await start();
  for (let i = 0; i < 30; i += 1) {
    const status = getStatus();
    if (status.connected || status.qr || status.state === 'error' || status.state === 'logged_out') return status;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return getStatus();
}

async function ensureConnected() {
  if (!socket || connectionState === 'disconnected' || connectionState === 'error' || connectionState === 'logged_out') {
    await start();
  }

  for (let i = 0; i < 20; i += 1) {
    if (socket && connectionState === 'connected') return;
    if (connectionState === 'qr' || connectionState === 'logged_out') break;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  const error = new Error('WhatsApp no esta conectado. Escanea el QR y espera a que el estado diga Conectado antes de enviar.');
  error.status = 400;
  throw error;
}

async function resetSession() {
  if (socket) {
    try {
      socket.end?.();
      socket.ws?.close?.();
    } catch (error) {}
  }
  socket = null;
  starting = null;
  connectionState = 'disconnected';
  qrText = null;
  qrDataUrl = null;
  lastError = null;
  await fs.rm(authPath, { recursive: true, force: true });
  return startAndWaitForQr();
}

async function sendText({ phone, jid, message, userId }) {
  await ensureConnected();

  const targetJid = await resolveTargetJid({ phone, jid });
  if (!targetJid) {
    const error = new Error('Numero de WhatsApp requerido');
    error.status = 400;
    throw error;
  }

  const text = String(message || '').trim();
  if (!text) {
    const error = new Error('Mensaje requerido');
    error.status = 400;
    throw error;
  }

  try {
    const result = await socket.sendMessage(targetJid, { text });
    storeMessage({ jid: targetJid, direction: 'out', body: text, messageId: result?.key?.id, status: 'sent', createdBy: userId });
    return { ok: true, jid: targetJid, messageId: result?.key?.id };
  } catch (error) {
    storeMessage({ jid: targetJid, direction: 'out', body: text, status: 'error', errorMessage: error.message, createdBy: userId });
    throw error;
  }
}

function listConversations() {
  return db.prepare(`
    SELECT wm.jid, wm.phone, MAX(wm.created_at) AS last_message_at,
      (SELECT body FROM whatsapp_messages last WHERE last.jid = wm.jid ORDER BY last.id DESC LIMIT 1) AS last_body,
      (SELECT direction FROM whatsapp_messages last WHERE last.jid = wm.jid ORDER BY last.id DESC LIMIT 1) AS last_direction,
      (SELECT status FROM whatsapp_messages last WHERE last.jid = wm.jid ORDER BY last.id DESC LIMIT 1) AS last_status,
      COUNT(*) AS message_count,
      SUM(CASE WHEN wm.direction = 'in' AND wm.read_at IS NULL THEN 1 ELSE 0 END) AS unread_count,
      c.id AS customer_id,
      c.name AS customer_name,
      wc.push_name AS whatsapp_push_name,
      wc.profile_pic_url AS whatsapp_profile_pic
    FROM whatsapp_messages wm
    LEFT JOIN customers c ON c.id = wm.customer_id
    LEFT JOIN whatsapp_contacts wc ON wc.jid = wm.jid
    GROUP BY wm.jid
    ORDER BY MAX(wm.id) DESC
    LIMIT 100
  `).all();
}

function listMessages(jid) {
  fetchAndCacheProfilePic(jid).catch(() => {});
  return db.prepare(`
    SELECT wm.*, c.name AS customer_name, u.name AS created_by_name,
      wc.push_name AS whatsapp_push_name,
      wc.profile_pic_url AS whatsapp_profile_pic
    FROM whatsapp_messages wm
    LEFT JOIN customers c ON c.id = wm.customer_id
    LEFT JOIN users u ON u.id = wm.created_by
    LEFT JOIN whatsapp_contacts wc ON wc.jid = wm.jid
    WHERE wm.jid = ?
    ORDER BY wm.id ASC
    LIMIT 300
  `).all(jid);
}

function markConversationRead(jid) {
  db.prepare(`
    UPDATE whatsapp_messages
    SET read_at = CURRENT_TIMESTAMP
    WHERE jid = ? AND direction = 'in' AND read_at IS NULL
  `).run(jid);
  return { ok: true };
}

module.exports = {
  getStatus,
  start,
  startAndWaitForQr,
  resetSession,
  sendText,
  listConversations,
  listMessages,
  markConversationRead,
  normalizePhone,
  jidFromPhone
};
