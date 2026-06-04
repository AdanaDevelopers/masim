function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Acceso no permitido' });
    }
    next();
  };
}

module.exports = requireRole;
