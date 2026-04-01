// ═══════════════════════════════════════════════
// KÚX — Rutas de Autenticación (Security Hardened)
// ═══════════════════════════════════════════════
const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { query } = require('../config/database');
const { authenticate } = require('../middleware/auth');

// ═══ SECURITY: Track failed login attempts in memory ═══
const loginAttempts = new Map();
const MAX_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

function checkLockout(email) {
  const key = email.toLowerCase();
  const record = loginAttempts.get(key);
  if (!record) return false;
  if (Date.now() - record.lastAttempt > LOCKOUT_MINUTES * 60 * 1000) {
    loginAttempts.delete(key);
    return false;
  }
  return record.count >= MAX_ATTEMPTS;
}

function recordFailedAttempt(email) {
  const key = email.toLowerCase();
  const record = loginAttempts.get(key) || { count: 0, lastAttempt: 0 };
  record.count++;
  record.lastAttempt = Date.now();
  loginAttempts.set(key, record);
}

function clearAttempts(email) {
  loginAttempts.delete(email.toLowerCase());
}

// Clean up old entries every 30 min
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of loginAttempts) {
    if (now - record.lastAttempt > LOCKOUT_MINUTES * 60 * 1000) {
      loginAttempts.delete(key);
    }
  }
}, 30 * 60 * 1000);

// ═══ INPUT VALIDATION HELPERS ═══
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

function isValidPassword(password) {
  return typeof password === 'string' && password.length >= 6 && password.length <= 128;
}

function sanitizeName(name) {
  if (typeof name !== 'string') return '';
  return name.replace(/[<>"'&\\]/g, '').trim().substring(0, 100);
}

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { email, password, firstName, lastName, phone } = req.body;

    if (!email || !password || !firstName || !lastName) {
      return res.status(400).json({ error: 'Campos requeridos: email, password, firstName, lastName' });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'Email inválido' });
    }

    if (!isValidPassword(password)) {
      return res.status(400).json({ error: 'Contraseña debe tener entre 6 y 128 caracteres' });
    }

    const safeFName = sanitizeName(firstName);
    const safeLName = sanitizeName(lastName);
    if (!safeFName || !safeLName) {
      return res.status(400).json({ error: 'Nombre inválido' });
    }

    // Sanitize phone
    const safePhone = phone ? phone.replace(/[^0-9+\-() ]/g, '').substring(0, 20) : null;

    const existing = await query('SELECT id FROM users WHERE LOWER(email) = LOWER($1)', [email]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'El email ya está registrado' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const qrCode = `QR-KUX-${uuidv4().split('-')[0].toUpperCase()}`;

    const result = await query(
      `INSERT INTO users (email, password_hash, role, first_name, last_name, phone, qr_code)
       VALUES (LOWER($1), $2, 'client', $3, $4, $5, $6)
       RETURNING id, email, role, first_name, last_name, qr_code`,
      [email, passwordHash, safeFName, safeLName, safePhone, qrCode]
    );

    const user = result.rows[0];

    const token = jwt.sign(
      { userId: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    res.status(201).json({
      message: 'Usuario registrado exitosamente',
      token,
      user: {
        id: user.id,
        email: user.email,
        name: `${user.first_name} ${user.last_name}`,
        role: user.role,
        qrCode: user.qr_code,
      }
    });
  } catch (err) {
    console.error('[Auth] Error en registro:', err.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email y password requeridos' });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'Email inválido' });
    }

    // Check account lockout
    if (checkLockout(email)) {
      return res.status(429).json({ 
        error: `Cuenta bloqueada por ${LOCKOUT_MINUTES} minutos por demasiados intentos fallidos` 
      });
    }

    const result = await query(
      'SELECT id, email, password_hash, role, first_name, last_name, qr_code FROM users WHERE LOWER(email) = LOWER($1) AND is_active = true',
      [email]
    );

    if (result.rows.length === 0) {
      // SECURITY: Still hash to prevent timing attacks
      await bcrypt.hash(password, 12);
      recordFailedAttempt(email);
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    const user = result.rows[0];
    const validPassword = await bcrypt.compare(password, user.password_hash);

    if (!validPassword) {
      recordFailedAttempt(email);
      const record = loginAttempts.get(email.toLowerCase());
      const remaining = MAX_ATTEMPTS - (record?.count || 0);
      
      if (remaining <= 2 && remaining > 0) {
        return res.status(401).json({ 
          error: `Credenciales inválidas. ${remaining} intento(s) restante(s)` 
        });
      }
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    // Success: clear failed attempts
    clearAttempts(email);

    const token = jwt.sign(
      { userId: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: `${user.first_name} ${user.last_name}`,
        role: user.role,
        qrCode: user.qr_code,
      }
    });
  } catch (err) {
    console.error('[Auth] Error en login:', err.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Helper: auto-expire memberships
async function ensureMembershipStatus(userId) {
  const membership = await query(
    `SELECT id, status, end_date
     FROM memberships
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT 1`,
    [userId]
  );

  if (!membership.rows.length) return null;

  const m = membership.rows[0];
  if (m.status === 'active' && m.end_date && new Date(m.end_date) < new Date()) {
    await query(`UPDATE memberships SET status = 'expired' WHERE id = $1`, [m.id]);
    m.status = 'expired';
  }

  return m;
}

// GET /api/auth/me
router.get('/me', authenticate, async (req, res) => {
  try {
    const membership = await ensureMembershipStatus(req.user.id);

    const result = await query(
      `SELECT u.id, u.email, u.role, u.first_name, u.last_name, u.phone, u.qr_code, u.created_at,
              m.id as membership_id,
              mp.name as plan_name,
              m.status as membership_status,
              m.end_date as membership_end
       FROM users u
       LEFT JOIN LATERAL (
         SELECT * FROM memberships WHERE user_id = u.id ORDER BY created_at DESC LIMIT 1
       ) m ON true
       LEFT JOIN membership_plans mp ON m.plan_id = mp.id
       WHERE u.id = $1`,
      [req.user.id]
    );

    const row = result.rows[0];
    
    let qrCode = row.qr_code;
    if (!qrCode) {
      qrCode = `QR-KUX-${uuidv4().split('-')[0].toUpperCase()}`;
      await query('UPDATE users SET qr_code = $1 WHERE id = $2', [qrCode, req.user.id]);
    }

    const user = {
      id: row.id,
      email: row.email,
      role: row.role,
      first_name: row.first_name,
      last_name: row.last_name,
      phone: row.phone,
      qr_code: qrCode,
      created_at: row.created_at,
      plan_name: row.plan_name,
      membership_id: row.membership_id || null,
      membership_status: membership ? membership.status : row.membership_status,
      membership_end: row.membership_end,
    };

    res.json({ user });
  } catch (err) {
    console.error('[Auth] Error en /me:', err.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// POST /api/auth/change-password (authenticated)
router.post('/change-password', authenticate, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Contraseña actual y nueva requeridas' });
    }

    if (!isValidPassword(newPassword)) {
      return res.status(400).json({ error: 'Nueva contraseña debe tener entre 6 y 128 caracteres' });
    }

    const result = await query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
    if (!result.rows.length) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    const valid = await bcrypt.compare(currentPassword, result.rows[0].password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Contraseña actual incorrecta' });
    }

    const newHash = await bcrypt.hash(newPassword, 12);
    await query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [newHash, req.user.id]);

    res.json({ message: 'Contraseña actualizada exitosamente' });
  } catch (err) {
    console.error('[Auth] Error change-password:', err.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

module.exports = router;
