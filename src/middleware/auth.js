// ═══════════════════════════════════════════════
// KÚX — Middleware de Autenticación (Security Hardened)
// Roles: owner > manager > staff > client
// ═══════════════════════════════════════════════
const jwt = require('jsonwebtoken');
const { query } = require('../config/database');

// Verify JWT with extra checks
const authenticate = async (req, res, next) => {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token no proporcionado' });
    }

    const token = header.split(' ')[1];
    
    // SECURITY: Reject suspiciously long tokens
    if (token.length > 2000) {
      return res.status(401).json({ error: 'Token inválido' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET, {
      algorithms: ['HS256'], // Only allow expected algorithm
      maxAge: '7d',          // Hard max even if token says longer
    });

    // SECURITY: Validate token payload
    if (!decoded.userId || !decoded.role) {
      return res.status(401).json({ error: 'Token malformado' });
    }

    const result = await query(
      'SELECT id, email, role, first_name, last_name FROM users WHERE id = $1 AND is_active = true',
      [decoded.userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Usuario no encontrado o inactivo' });
    }

    const user = result.rows[0];
    
    // SECURITY: Verify role hasn't changed since token was issued
    if (user.role !== decoded.role) {
      return res.status(401).json({ error: 'Sesión inválida, inicia sesión de nuevo' });
    }

    req.user = user;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expirado' });
    }
    if (err.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Token inválido' });
    }
    return res.status(401).json({ error: 'Error de autenticación' });
  }
};

// Role-based authorization
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ 
        error: 'No tienes permisos para esta acción',
      });
    }
    next();
  };
};

// Permission-based authorization
const checkPermission = (module, action = 'can_view') => {
  return async (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'No autenticado' });
    
    // Owner always has full access
    if (req.user.role === 'owner') return next();
    
    // SECURITY: Whitelist valid actions
    const validActions = ['can_view', 'can_create', 'can_edit', 'can_delete'];
    if (!validActions.includes(action)) {
      return res.status(400).json({ error: 'Acción no válida' });
    }

    try {
      const result = await query(
        `SELECT ${action} FROM role_permissions WHERE role = $1 AND module = $2`,
        [req.user.role, module]
      );
      
      if (result.rows.length === 0 || !result.rows[0][action]) {
        return res.status(403).json({ 
          error: 'Tu rol no tiene acceso a esta función',
        });
      }
      next();
    } catch (err) {
      return res.status(500).json({ error: 'Error verificando permisos' });
    }
  };
};

// Helper constants
const ADMIN_ROLES = ['owner', 'manager'];
const STAFF_ROLES = ['owner', 'manager', 'staff'];
const ALL_INTERNAL = ['owner', 'manager', 'staff'];

module.exports = { authenticate, authorize, checkPermission, ADMIN_ROLES, STAFF_ROLES, ALL_INTERNAL };
