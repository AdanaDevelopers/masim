const db = require('../db/masim');

/**
 * Registra una acción en la tabla de auditoría.
 * @param {number|null} userId - ID del usuario que realiza la acción
 * @param {string} action - Tipo de acción (CREATE, READ, UPDATE, DELETE, LOGIN, etc.)
 * @param {string} section - Sección donde ocurre la acción (customers, vehicles, orders, catalog, billing, whatsapp, users)
 * @param {string} description - Detalles legibles de la acción realizada
 * @param {string|null} ipAddress - Dirección IP del cliente
 */
function logAction(userId, action, section, description, ipAddress = null) {
  try {
    db.prepare(`
      INSERT INTO audit_logs (user_id, action, section, description, ip_address)
      VALUES (?, ?, ?, ?, ?)
    `).run(userId || null, action.toUpperCase(), section.toLowerCase(), description, ipAddress || null);
  } catch (error) {
    console.error('Error al guardar log de auditoría:', error);
  }
}

module.exports = {
  logAction
};
