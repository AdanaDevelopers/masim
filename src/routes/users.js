const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db/masim');
const auth = require('../middleware/auth');
const checkPermission = require('../middleware/permission');
const { logAction } = require('../services/audit');

const router = express.Router();

// Todas las rutas requieren autenticación
router.use(auth);

// Helper para sanitizar salida del usuario
function sanitizeUser(user) {
  if (!user) return null;
  const { password_hash, ...rest } = user;
  return rest;
}

// 1. Obtener lista de usuarios
router.get('/', checkPermission('users', 'r'), (req, res) => {
  try {
    const users = db.prepare('SELECT id, name, email, username, role, permissions, created_at FROM users ORDER BY id DESC').all();
    res.json(users.map(u => ({
      ...u,
      permissions: JSON.parse(u.permissions || '{}')
    })));
  } catch (error) {
    res.status(500).json({ error: 'Error al listar usuarios' });
  }
});

// 2. Crear usuario
router.post('/', checkPermission('users', 'c'), (req, res) => {
  const { name, email, username, password, role, permissions } = req.body;

  if (!name || !email || !username || !password) {
    return res.status(400).json({ error: 'Todos los campos principales son requeridos (Nombre, correo, usuario, contraseña)' });
  }

  // Validar que el nombre de usuario sea alfanumérico
  const alphanumericRegex = /^[a-zA-Z0-9]+$/;
  if (!alphanumericRegex.test(username)) {
    return res.status(400).json({ error: 'El nombre de usuario debe ser alfanumérico (solo letras y números, sin espacios ni caracteres especiales)' });
  }

  try {
    // Validar unicidad de username e email
    const existingUsername = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (existingUsername) {
      return res.status(400).json({ error: 'El nombre de usuario ya está registrado' });
    }

    const existingEmail = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existingEmail) {
      return res.status(400).json({ error: 'El correo electrónico ya está registrado' });
    }

    const passwordHash = bcrypt.hashSync(password, 10);
    const permsJson = JSON.stringify(permissions || {});

    const result = db.prepare(`
      INSERT INTO users (name, email, username, password_hash, role, permissions)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(name.trim(), email.trim().toLowerCase(), username.trim().toLowerCase(), passwordHash, role || 'personalizado', permsJson);

    const newUser = db.prepare('SELECT id, name, email, username, role, permissions, created_at FROM users WHERE id = ?').get(result.lastInsertRowid);
    newUser.permissions = JSON.parse(newUser.permissions || '{}');

    // Registrar en auditoría
    logAction(
      req.user.id,
      'CREATE',
      'users',
      `Creado nuevo usuario: ${newUser.username} (${newUser.name})`,
      req.ip
    );

    res.status(201).json(newUser);
  } catch (error) {
    console.error('Error al crear usuario:', error);
    res.status(500).json({ error: 'Error interno al registrar el usuario' });
  }
});

// 3. Modificar usuario
router.put('/:id', checkPermission('users', 'u'), (req, res) => {
  const userId = Number(req.params.id);
  const { name, email, username, role, permissions } = req.body;

  if (!name || !email || !username) {
    return res.status(400).json({ error: 'Nombre, correo y usuario son requeridos' });
  }

  // Validar nombre de usuario alfanumérico
  const alphanumericRegex = /^[a-zA-Z0-9]+$/;
  if (!alphanumericRegex.test(username)) {
    return res.status(400).json({ error: 'El nombre de usuario debe ser alfanumérico' });
  }

  // Proteger al admin original (id = 1)
  if (userId === 1 && role !== 'administrador') {
    return res.status(400).json({ error: 'No se puede quitar el rol de administrador al administrador principal del sistema' });
  }

  try {
    const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!existing) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    // Validar unicidad si cambian
    if (username.toLowerCase() !== existing.username.toLowerCase()) {
      const dupUser = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
      if (dupUser) return res.status(400).json({ error: 'El nombre de usuario ya está en uso' });
    }

    if (email.toLowerCase() !== existing.email.toLowerCase()) {
      const dupEmail = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
      if (dupEmail) return res.status(400).json({ error: 'El correo electrónico ya está en uso' });
    }

    const permsJson = JSON.stringify(permissions || {});

    db.prepare(`
      UPDATE users
      SET name = ?, email = ?, username = ?, role = ?, permissions = ?
      WHERE id = ?
    `).run(name.trim(), email.trim().toLowerCase(), username.trim().toLowerCase(), role || 'personalizado', permsJson, userId);

    const updatedUser = db.prepare('SELECT id, name, email, username, role, permissions, created_at FROM users WHERE id = ?').get(userId);
    updatedUser.permissions = JSON.parse(updatedUser.permissions || '{}');

    // Registrar en auditoría
    logAction(
      req.user.id,
      'UPDATE',
      'users',
      `Modificado usuario: ${updatedUser.username} (${updatedUser.name})`,
      req.ip
    );

    res.json(updatedUser);
  } catch (error) {
    console.error('Error al modificar usuario:', error);
    res.status(500).json({ error: 'Error interno al actualizar el usuario' });
  }
});

// 4. Restablecer contraseña
router.post('/:id/reset-password', checkPermission('users', 'u'), (req, res) => {
  const userId = Number(req.params.id);
  const { password } = req.body;

  if (!password || password.trim().length < 4) {
    return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 4 caracteres' });
  }

  try {
    const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!existing) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    const passwordHash = bcrypt.hashSync(password, 10);
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, userId);

    // Registrar en auditoría
    logAction(
      req.user.id,
      'UPDATE',
      'users',
      `Contraseña restablecida para el usuario: ${existing.username}`,
      req.ip
    );

    res.json({ success: true, message: 'Contraseña restablecida exitosamente' });
  } catch (error) {
    console.error('Error al restablecer contraseña:', error);
    res.status(500).json({ error: 'Error al restablecer la contraseña' });
  }
});

// 5. Eliminar usuario
router.delete('/:id', checkPermission('users', 'd'), (req, res) => {
  const userId = Number(req.params.id);

  if (userId === req.user.id) {
    return res.status(400).json({ error: 'No puedes eliminar tu propia cuenta' });
  }

  if (userId === 1) {
    return res.status(400).json({ error: 'El administrador principal no puede ser eliminado' });
  }

  try {
    const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!existing) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    db.prepare('DELETE FROM users WHERE id = ?').run(userId);

    // Registrar en auditoría
    logAction(
      req.user.id,
      'DELETE',
      'users',
      `Eliminado usuario: ${existing.username} (${existing.name})`,
      req.ip
    );

    res.json({ success: true, message: 'Usuario eliminado correctamente' });
  } catch (error) {
    console.error('Error al eliminar usuario:', error);
    res.status(500).json({ error: 'Error al eliminar el usuario' });
  }
});

module.exports = router;
