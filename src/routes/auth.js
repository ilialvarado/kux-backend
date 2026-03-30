// ═══════════════════════════════════════════════
// KÚX — Rutas de Autenticación
// ═══════════════════════════════════════════════
const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { query } = require('../config/database');
const { authenticate } = require('../middleware/auth');

// POST /api/auth/register — Registro de nuevo cliente
router.post('/register', async (req, res) => {
  try {
    const { email, password, firstName, lastName, phone } = req.body;

    // Validaciones
    if (!email || !password || !firstName || !lastName) {
      return res.status(400).json({ error: 'Campos requeridos: email, password, firstName, lastName' });
    }

    // Verificar si ya existe
    const existing = await query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'El email ya está registrado' });
    }

    // Crear usuario
    const passwordHash = await bcrypt.hash(password, 12);
    const qrCode = `QR-KUX-${uuidv4().split('-')[0].toUpperCase()}`;

    const result = await query(
      `INSERT INTO users (email, password_hash, role, first_name, last_name, phone, qr_code)
       VALUES ($1, $2, 'client', $3, $4, $5, $6)
       RETURNING id, email, role, first_name, last_name, qr_code`,
      [email, passwordHash, firstName, lastName, phone || null, qrCode]
    );

    const user = result.rows[0];

    // Generar JWT
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
    console.error('[Auth] Error en registro:', err);
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

    const result = await query(
      'SELECT id, email, password_hash, role, first_name, last_name, qr_code FROM users WHERE email = $1 AND is_active = true',
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    const user = result.rows[0];
    const validPassword = await bcrypt.compare(password, user.password_hash);

    if (!validPassword) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

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
    console.error('[Auth] Error en login:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// GET /api/auth/me — Perfil del usuario autenticado
router.get('/me', authenticate, async (req, res) => {
  try {
    const result = await query(
      `SELECT u.id, u.email, u.role, u.first_name, u.last_name, u.phone, u.qr_code, u.created_at,
              m.status as membership_status, mp.name as plan_name, m.end_date as membership_end
       FROM users u
       LEFT JOIN memberships m ON m.user_id = u.id AND m.status = 'active'
       LEFT JOIN membership_plans mp ON m.plan_id = mp.id
       WHERE u.id = $1`,
      [req.user.id]
    );

    res.json({ user: result.rows[0] });
  } catch (err) {
    console.error('[Auth] Error en /me:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

module.exports = router;
