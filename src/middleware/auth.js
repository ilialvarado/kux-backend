// ═══════════════════════════════════════════════
// KÚX — Middleware de Autenticación
// Roles: owner (dueña), manager (gerente), staff (empleado), client (cliente)
// ═══════════════════════════════════════════════
const jwt = require('jsonwebtoken');
const { query } = require('../config/database');

// Verificar JWT
const authenticate = async (req, res, next) => {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token no proporcionado' });
    }

    const token = header.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const result = await query('SELECT id, email, role, first_name, last_name FROM users WHERE id = $1 AND is_active = true', [decoded.userId]);
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Usuario no encontrado o inactivo' });
    }

    req.user = result.rows[0];
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expirado' });
    }
    return res.status(401).json({ error: 'Token inválido' });
  }
};

// Verificar roles — acepta los 4 roles del sistema
// owner > manager > staff > client
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ 
        error: 'No tienes permisos para esta acción',
        requiredRoles: roles,
        yourRole: req.user?.role 
      });
    }
    next();
  };
};

// Verificar permiso específico por módulo
const checkPermission = (module, action = 'can_view') => {
  return async (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'No autenticado' });
    
    // Owner siempre tiene acceso total
    if (req.user.role === 'owner') return next();
    
    try {
      const result = await query(
        `SELECT ${action} FROM role_permissions WHERE role = $1 AND module = $2`,
        [req.user.role, module]
      );
      
      if (result.rows.length === 0 || !result.rows[0][action]) {
        return res.status(403).json({ 
          error: 'Tu rol no tiene acceso a esta función',
          role: req.user.role,
          module,
          action 
        });
      }
      next();
    } catch (err) {
      // Si la tabla no existe aún, fallback al sistema de roles simple
      if (!roles) return next();
      return res.status(500).json({ error: 'Error verificando permisos' });
    }
  };
};

// Helper: roles que pueden administrar
const ADMIN_ROLES = ['owner', 'manager'];
const STAFF_ROLES = ['owner', 'manager', 'staff'];
const ALL_INTERNAL = ['owner', 'manager', 'staff'];

module.exports = { authenticate, authorize, checkPermission, ADMIN_ROLES, STAFF_ROLES, ALL_INTERNAL };
