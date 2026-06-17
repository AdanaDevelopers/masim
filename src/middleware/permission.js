const db = require('../db/masim');

/**
 * Middleware para validar si el usuario tiene permisos específicos para una sección y acción CRUD.
 * @param {string} section - Sección a validar (customers, vehicles, orders, catalog, billing, whatsapp, users, audit_logs)
 * @param {string} action - Acción CRUD ('c' = Create, 'r' = Read, 'u' = Update, 'd' = Delete)
 */
function checkPermission(section, action) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'No autenticado' });
    }

    try {
      // Obtener datos frescos del usuario desde la base de datos para validar cambios al instante
      const user = db.prepare('SELECT role, permissions FROM users WHERE id = ?').get(req.user.id);
      
      if (!user) {
        return res.status(401).json({ error: 'Usuario no encontrado' });
      }

      // Si es administrador por rol, tiene todos los permisos automáticamente
      if (user.role === 'administrador') {
        return next();
      }

      // Si el permiso requerido es de administración de usuarios o auditoría, y no es administrador
      if ((section === 'users' || section === 'audit_logs') && user.role !== 'administrador') {
        // Pero espera, el usuario dijo: "Se eliminan los roles, solo se dejan usuarios con acceso segun el administrador les de".
        // Entonces, un usuario también podría administrar usuarios si se le asigna el permiso 'users' CRUD de forma explícita.
        // Así que vamos a validar según su JSON de permisos en lugar de bloquear si no es rol 'administrador'!
      }

      let permissions = {};
      try {
        permissions = JSON.parse(user.permissions || '{}');
      } catch (err) {
        permissions = {};
      }

      const sectionPerms = permissions[section] || {};
      if (sectionPerms[action] === true) {
        return next();
      }

      return res.status(403).json({ 
        error: `No tienes permisos suficientes para realizar esta acción (${section}:${action})` 
      });
    } catch (error) {
      console.error('Error en middleware checkPermission:', error);
      return res.status(500).json({ error: 'Error interno de validación de permisos' });
    }
  };
}

module.exports = checkPermission;
