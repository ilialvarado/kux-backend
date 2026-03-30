// ═══════════════════════════════════════════════
// KÚX — Rutas de Check-in Digital v2
// Sistema ENTRADA + SALIDA obligatoria
// QR queda bloqueado hasta que registre su salida
// ═══════════════════════════════════════════════
const router = require('express').Router();
const { query } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');

// POST /api/checkins/validate — Validar QR en recepción
// LÓGICA:
//   1. Si NO tiene entrada activa → registrar ENTRADA → QR queda bloqueado
//   2. Si YA tiene entrada activa → registrar SALIDA → QR queda libre
//   3. Si alguien más intenta usar un QR con entrada activa → BLOQUEADO
router.post('/validate', authenticate, authorize('owner', 'manager', 'staff'), async (req, res) => {
  try {
    const { qrCode } = req.body;

    if (!qrCode) {
      return res.status(400).json({ error: 'Código QR requerido' });
    }

    // 1. Buscar usuario por QR
    const userResult = await query(
      'SELECT id, first_name, last_name, qr_code, is_active FROM users WHERE qr_code = $1',
      [qrCode]
    );

    if (userResult.rows.length === 0) {
      await query(
        `INSERT INTO checkins (user_id, qr_code, status, blocked_reason, checkin_type)
         VALUES ((SELECT id FROM users WHERE role = 'owner' LIMIT 1), $1, 'blocked', 'qr_not_found', 'entry')`,
        [qrCode]
      );
      return res.json({
        allowed: false,
        reason: 'QR no reconocido',
        code: 'QR_NOT_FOUND'
      });
    }

    const user = userResult.rows[0];

    // 2. Verificar que el usuario esté activo
    if (!user.is_active) {
      await query(
        `INSERT INTO checkins (user_id, qr_code, status, blocked_reason, checkin_type)
         VALUES ($1, $2, 'blocked', 'user_inactive', 'entry')`,
        [user.id, qrCode]
      );
      return res.json({
        allowed: false,
        reason: 'Usuario inactivo',
        code: 'USER_INACTIVE',
        member: { name: `${user.first_name} ${user.last_name}` }
      });
    }

    // 3. Verificar si tiene una ENTRADA ACTIVA (sin salida)
    const activeEntry = await query(
      `SELECT id, checked_in_at FROM checkins 
       WHERE user_id = $1 AND status = 'allowed' AND checkin_type = 'entry' 
       AND checked_out_at IS NULL
       AND DATE(checked_in_at) = CURRENT_DATE
       ORDER BY checked_in_at DESC LIMIT 1`,
      [user.id]
    );

    // SI YA TIENE ENTRADA ACTIVA → REGISTRAR SALIDA
    if (activeEntry.rows.length > 0) {
      const entryId = activeEntry.rows[0].id;
      const entryTime = activeEntry.rows[0].checked_in_at;
      
      // Calcular duración de la visita
      await query(
        `UPDATE checkins SET checked_out_at = NOW() WHERE id = $1`,
        [entryId]
      );

      const duration = Math.round((Date.now() - new Date(entryTime).getTime()) / 60000); // minutos

      return res.json({
        allowed: true,
        action: 'exit',
        member: {
          name: `${user.first_name} ${user.last_name}`,
        },
        message: 'SALIDA registrada',
        duration: `${Math.floor(duration/60)}h ${duration%60}m`,
        entryTime: entryTime,
        exitTime: new Date().toISOString()
      });
    }

    // 4. NO tiene entrada activa → verificar membresía para NUEVA ENTRADA
    const membershipResult = await query(
      `SELECT m.id, m.status, m.end_date, mp.name as plan_name
       FROM memberships m
       JOIN membership_plans mp ON m.plan_id = mp.id
       WHERE m.user_id = $1 AND m.status = 'active' AND m.end_date > NOW()
       ORDER BY m.end_date DESC LIMIT 1`,
      [user.id]
    );

    if (membershipResult.rows.length === 0) {
      await query(
        `INSERT INTO checkins (user_id, qr_code, status, blocked_reason, checkin_type)
         VALUES ($1, $2, 'blocked', 'membership_expired', 'entry')`,
        [user.id, qrCode]
      );
      return res.json({
        allowed: false,
        reason: 'Membresía vencida o inexistente',
        code: 'MEMBERSHIP_EXPIRED',
        member: { name: `${user.first_name} ${user.last_name}` }
      });
    }

    const membership = membershipResult.rows[0];

    if (membership.status === 'frozen') {
      await query(
        `INSERT INTO checkins (user_id, qr_code, status, blocked_reason, checkin_type)
         VALUES ($1, $2, 'blocked', 'membership_frozen', 'entry')`,
        [user.id, qrCode]
      );
      return res.json({
        allowed: false,
        reason: 'Membresía congelada',
        code: 'MEMBERSHIP_FROZEN',
        member: { name: `${user.first_name} ${user.last_name}` }
      });
    }

    // 5. ✓ ENTRADA PERMITIDA — Registrar entrada (QR queda bloqueado hasta salida)
    await query(
      `INSERT INTO checkins (user_id, qr_code, status, checkin_type)
       VALUES ($1, $2, 'allowed', 'entry')`,
      [user.id, qrCode]
    );

    res.json({
      allowed: true,
      action: 'entry',
      member: {
        name: `${user.first_name} ${user.last_name}`,
        plan: membership.plan_name,
        expiresAt: membership.end_date,
      },
      message: 'ENTRADA registrada — QR bloqueado hasta registrar salida'
    });

  } catch (err) {
    console.error('[Checkin] Error en validación:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// GET /api/checkins/active — Personas actualmente dentro del gym
router.get('/active', authenticate, authorize('owner', 'manager', 'staff'), async (req, res) => {
  try {
    const result = await query(`
      SELECT c.id, c.checked_in_at, c.qr_code,
             u.first_name, u.last_name, u.email,
             mp.name as plan_name,
             ROUND(EXTRACT(EPOCH FROM (NOW() - c.checked_in_at)) / 60) as minutes_inside
      FROM checkins c
      JOIN users u ON c.user_id = u.id
      LEFT JOIN memberships m ON m.user_id = u.id AND m.status = 'active'
      LEFT JOIN membership_plans mp ON m.plan_id = mp.id
      WHERE c.status = 'allowed' AND c.checkin_type = 'entry' 
      AND c.checked_out_at IS NULL
      AND DATE(c.checked_in_at) = CURRENT_DATE
      ORDER BY c.checked_in_at DESC
    `);

    res.json({
      insideNow: result.rows.length,
      members: result.rows
    });
  } catch (err) {
    console.error('[Checkin] Error:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// POST /api/checkins/force-exit — Staff fuerza la salida de un miembro
// Por si alguien salió sin escanear
router.post('/force-exit', authenticate, authorize('owner', 'manager', 'staff'), async (req, res) => {
  try {
    const { checkinId } = req.body;

    if (!checkinId) {
      return res.status(400).json({ error: 'checkinId requerido' });
    }

    const result = await query(
      `UPDATE checkins SET checked_out_at = NOW() 
       WHERE id = $1 AND checked_out_at IS NULL
       RETURNING *`,
      [checkinId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Check-in no encontrado o ya tiene salida' });
    }

    res.json({
      message: 'Salida forzada registrada',
      checkin: result.rows[0]
    });
  } catch (err) {
    res.status(500).json({ error: 'Error forzando salida' });
  }
});

// GET /api/checkins — Log de check-ins del día
router.get('/', authenticate, authorize('owner', 'manager', 'staff'), async (req, res) => {
  try {
    const { date, page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;
    const targetDate = date || new Date().toISOString().split('T')[0];

    const result = await query(`
      SELECT c.id, c.qr_code, c.status, c.blocked_reason, c.checked_in_at, 
             c.checked_out_at, c.checkin_type,
             u.first_name, u.last_name, u.email,
             mp.name as plan_name,
             CASE WHEN c.checked_out_at IS NOT NULL 
               THEN ROUND(EXTRACT(EPOCH FROM (c.checked_out_at - c.checked_in_at)) / 60)
               ELSE NULL END as duration_minutes
      FROM checkins c
      JOIN users u ON c.user_id = u.id
      LEFT JOIN memberships m ON m.user_id = u.id AND m.status = 'active'
      LEFT JOIN membership_plans mp ON m.plan_id = mp.id
      WHERE DATE(c.checked_in_at) = $1
      ORDER BY c.checked_in_at DESC
      LIMIT $2 OFFSET $3
    `, [targetDate, limit, offset]);

    const totalStats = await query(`
      SELECT
        COUNT(*) FILTER (WHERE checkin_type = 'entry' AND status = 'allowed') as entries,
        COUNT(*) FILTER (WHERE checked_out_at IS NOT NULL) as exits,
        COUNT(*) FILTER (WHERE checkin_type = 'entry' AND status = 'allowed' AND checked_out_at IS NULL) as currently_inside,
        COUNT(*) FILTER (WHERE status = 'blocked') as blocked,
        COUNT(DISTINCT user_id) FILTER (WHERE status = 'allowed') as unique_users
      FROM checkins
      WHERE DATE(checked_in_at) = $1
    `, [targetDate]);

    // Hora pico
    const peakResult = await query(`
      SELECT EXTRACT(HOUR FROM checked_in_at)::int as hour, COUNT(*) as total
      FROM checkins
      WHERE DATE(checked_in_at) = $1 AND status = 'allowed' AND checkin_type = 'entry'
      GROUP BY EXTRACT(HOUR FROM checked_in_at)
      ORDER BY total DESC LIMIT 1
    `, [targetDate]);

    res.json({
      checkins: result.rows,
      stats: {
        ...totalStats.rows[0],
        peakHour: peakResult.rows[0]?.hour != null ? `${peakResult.rows[0].hour}:00` : null
      }
    });
  } catch (err) {
    console.error('[Checkin] Error:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// GET /api/checkins/heatmap — Mapa de asistencia
router.get('/heatmap', authenticate, authorize('owner', 'manager', 'staff'), async (req, res) => {
  try {
    const { weeks = 4 } = req.query;

    const result = await query(`
      SELECT DATE(checked_in_at) as day, COUNT(*) as count
      FROM checkins
      WHERE checked_in_at >= NOW() - INTERVAL '1 week' * $1
        AND status = 'allowed' AND checkin_type = 'entry'
      GROUP BY DATE(checked_in_at)
      ORDER BY day
    `, [weeks]);

    res.json({ heatmap: result.rows });
  } catch (err) {
    console.error('[Checkin] Error heatmap:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

module.exports = router;
