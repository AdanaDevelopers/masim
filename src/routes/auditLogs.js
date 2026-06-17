const express = require('express');
const db = require('../db/masim');
const auth = require('../middleware/auth');
const checkPermission = require('../middleware/permission');

const router = express.Router();

// Obtener logs de auditoría con filtros
router.get('/', auth, checkPermission('audit_logs', 'r'), (req, res) => {
  try {
    const { user_id, section, action, query } = req.query;
    
    let sql = `
      SELECT al.*, u.username, u.name AS user_name
      FROM audit_logs al
      LEFT JOIN users u ON u.id = al.user_id
      WHERE 1=1
    `;
    const params = [];
    
    if (user_id) {
      sql += ' AND al.user_id = ?';
      params.push(Number(user_id));
    }
    
    if (section) {
      sql += ' AND al.section = ?';
      params.push(section.toLowerCase());
    }
    
    if (action) {
      sql += ' AND al.action = ?';
      params.push(action.toUpperCase());
    }
    
    if (query) {
      sql += ' AND (al.description LIKE ? OR u.username LIKE ? OR u.name LIKE ? OR al.ip_address LIKE ?)';
      const wildcard = `%${query}%`;
      params.push(wildcard, wildcard, wildcard, wildcard);
    }
    
    sql += ' ORDER BY al.id DESC LIMIT 500';
    
    const logs = db.prepare(sql).all(...params);
    res.json(logs);
  } catch (error) {
    console.error('Error al consultar logs de auditoría:', error);
    res.status(500).json({ error: 'Error al consultar logs de auditoría' });
  }
});

module.exports = router;
