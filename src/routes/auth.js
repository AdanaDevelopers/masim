const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db/masim');
const { logAction } = require('../services/audit');

const router = express.Router();

router.post('/login', (req, res) => {
  const identifier = req.body.email || req.body.username;
  const password = req.body.password;

  if (!identifier) {
    return res.status(400).json({ error: 'Usuario o correo es requerido' });
  }

  const user = db.prepare('SELECT * FROM users WHERE username = ? OR email = ?').get(identifier, identifier);
  if (!user || !bcrypt.compareSync(password || '', user.password_hash)) {
    return res.status(401).json({ error: 'Credenciales invalidas' });
  }

  const payload = { 
    id: user.id, 
    name: user.name, 
    email: user.email, 
    username: user.username || '', 
    role: user.role,
    permissions: JSON.parse(user.permissions || '{}')
  };
  const token = jwt.sign(payload, process.env.JWT_SECRET || 'dev-secret', { expiresIn: '12h' });
  
  // Registrar inicio de sesión en auditoría
  logAction(user.id, 'LOGIN', 'auth', `Inicio de sesión exitoso (Usuario: ${user.username || user.email})`, req.ip);

  res.json({ token, user: payload });
});

module.exports = router;
