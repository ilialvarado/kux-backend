// ═══════════════════════════════════════════════
// KÚX — Rutas de Miembros
// ═══════════════════════════════════════════════
const router = require('express').Router();
const { query } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');

// Helper para actualizar estado de membresía expirado
async function refreshMembershipStatus(userId) {
  const result = await query(
    `SELECT id, status, end_date FROM memberships WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [userId]
  );
  if (!result.rows.length) return null;

  const membership = result.rows[0];
  if (membership.status === 'active' && membership.end_date && new Date(membership.end_date) < new Date()) {
    await query(`UPDATE memberships SET status = 'expired' WHERE id = $1`, [membership.id]);
    membership.status = 'expired';
  }

  return membership;
}

// GET /api/members — Listar miembros (admin/staff)
router.get('/', authenticate, authorize('owner', 'manager', 'staff'), async (req, res) => {
  try {
    const { status, search, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    let sql = `
      SELECT u.id, u.email, u.first_name, u.last_name, u.phone, u.qr_code, u.created_at,
             CASE
               WHEN m.status = 'active' AND m.end_date < NOW() THEN 'expired'
               ELSE COALESCE(m.status, 'pending')
             END as membership_status,
             mp.name as plan_name,
             m.end_date,
             (SELECT COUNT(*) FROM checkins c WHERE c.user_id = u.id) as total_checkins
      FROM users u
      LEFT JOIN LATERAL (
        SELECT * FROM memberships WHERE user_id = u.id ORDER BY created_at DESC LIMIT 1
      ) m ON true
      LEFT JOIN membership_plans mp ON m.plan_id = mp.id
      WHERE u.role = 'client'
    `;
    const params = [];

    if (status && status !== 'all') {
      params.push(status);
      sql += ` AND m.status = $${params.length}`;
    }

    if (search) {
      params.push(`%${search}%`);
      sql += ` AND (u.first_name ILIKE $${params.length} OR u.last_name ILIKE $${params.length} OR u.email ILIKE $${params.length})`;
    }

    // Count total
    const countResult = await query(`SELECT COUNT(*) FROM (${sql}) sub`, params);

    sql += ` ORDER BY u.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const result = await query(sql, params);

    res.json({
      members: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(countResult.rows[0].count),
        pages: Math.ceil(countResult.rows[0].count / limit)
      }
    });
  } catch (err) {
    console.error('[Members] Error:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// POST /api/members — Crear nuevo miembro (staff/admin)
router.post('/', authenticate, authorize('owner', 'manager', 'staff'), async (req, res) => {
  try {
    const { email, firstName, lastName, phone, planSlug } = req.body;
    const bcrypt = require('bcryptjs');
    const { v4: uuidv4 } = require('uuid');

    // Password temporal
    const tempPassword = Math.random().toString(36).slice(-8);
    const passwordHash = await bcrypt.hash(tempPassword, 12);
    const qrCode = `QR-KUX-${uuidv4().split('-')[0].toUpperCase()}`;

    const userResult = await query(
      `INSERT INTO users (email, password_hash, role, first_name, last_name, phone, qr_code)
       VALUES ($1, $2, 'client', $3, $4, $5, $6)
       RETURNING id, email, first_name, last_name, qr_code`,
      [email, passwordHash, firstName, lastName, phone, qrCode]
    );

    const user = userResult.rows[0];

    // Si se especifica un plan, crear membresía
    if (planSlug) {
      const planResult = await query('SELECT id, duration_days FROM membership_plans WHERE slug = $1', [planSlug]);
      if (planResult.rows.length > 0) {
        const plan = planResult.rows[0];
        await query(
          `INSERT INTO memberships (user_id, plan_id, status, start_date, end_date)
           VALUES ($1, $2, 'active', NOW(), NOW() + INTERVAL '1 day' * $3)`,
          [user.id, plan.id, plan.duration_days]
        );
      }
    }

    res.status(201).json({
      message: 'Miembro creado exitosamente',
      member: user,
      tempPassword // En producción: enviar por email
    });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'El email ya está registrado' });
    }
    console.error('[Members] Error creando miembro:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// GET /api/members/:id — Detalle de un miembro
router.get('/:id', authenticate, authorize('owner', 'manager', 'staff'), async (req, res) => {
  try {
    const result = await query(`
      SELECT u.*, m.status as membership_status, mp.name as plan_name, m.start_date, m.end_date, m.auto_renew,
             (SELECT COUNT(*) FROM checkins WHERE user_id = u.id) as total_checkins,
             (SELECT checked_in_at FROM checkins WHERE user_id = u.id ORDER BY checked_in_at DESC LIMIT 1) as last_checkin
      FROM users u
      LEFT JOIN LATERAL (SELECT * FROM memberships WHERE user_id = u.id ORDER BY created_at DESC LIMIT 1) m ON true
      LEFT JOIN membership_plans mp ON m.plan_id = mp.id
      WHERE u.id = $1
    `, [req.params.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Miembro no encontrado' });
    }

    res.json({ member: result.rows[0] });
  } catch (err) {
    console.error('[Members] Error:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// GET /api/members/:id/qr — Generar imagen QR del miembro
router.get('/:id/qr', authenticate, async (req, res) => {
  try {
    const QRCode = require('qrcode');
    const result = await query('SELECT qr_code FROM users WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Miembro no encontrado' });
    }
    const qrData = `${process.env.QR_BASE_URL || 'https://kux.com/checkin'}?qr=${result.rows[0].qr_code}`;
    res.setHeader('Content-Type', 'image/png');
    QRCode.toFileStream(res, qrData, { width: 400, margin: 2, color: { dark: '#000', light: '#fff' } });
  } catch (err) {
    console.error('[Members] Error QR:', err);
    res.status(500).json({ error: 'Error generando QR' });
  }
});

// POST /api/memberships/renew — Renovar la membresía actual
router.post('/memberships/renew', authenticate, async (req, res) => {
  try {
    const userId = (req.user.role === 'client') ? req.user.id : (req.body.userId || req.user.id);

    const member = await query(
      `SELECT m.id, m.status, m.end_date, m.plan_id, mp.duration_days
       FROM memberships m
       JOIN membership_plans mp ON m.plan_id = mp.id
       WHERE m.user_id = $1
       ORDER BY m.created_at DESC
       LIMIT 1`,
      [userId]
    );

    if (!member.rows.length) {
      return res.status(404).json({ error: 'No existe membresía para el usuario' });
    }

    const active = member.rows[0];
    const now = new Date();
    const currentEnd = active.end_date ? new Date(active.end_date) : now;
    const startDate = currentEnd > now ? currentEnd : now;

    const renewed = await query(
      `UPDATE memberships
       SET status = 'active', start_date = $1, end_date = $2
       WHERE id = $3
       RETURNING *`,
      [startDate, new Date(startDate.getTime() + active.duration_days * 24 * 60 * 60 * 1000), active.id]
    );

    res.json({ message: 'Membresía renovada', membership: renewed.rows[0] });
  } catch (err) {
    console.error('[Members] Error renewing membership:', err);
    res.status(500).json({ error: 'Error renovando membresía' });
  }
});

// POST /api/memberships/check-expiry — Revisión masiva para caducidad
router.post('/memberships/check-expiry', authenticate, authorize('owner', 'manager'), async (req, res) => {
  try {
    const result = await query(
      `UPDATE memberships
       SET status = 'expired'
       WHERE status = 'active' AND end_date < NOW()
       RETURNING id`);

    res.json({ message: 'Verificación completada', expired: result.rowCount });
  } catch (err) {
    console.error('[Members] Error expiry check:', err);
    res.status(500).json({ error: 'Error en verificación de expiraciones' });
  }
});

module.exports = router;
