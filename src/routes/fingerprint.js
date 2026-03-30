// ═══════════════════════════════════════════════
// KÚX — Rutas de Huella Digital
// Preparado para conectar un lector USB de huellas
// ═══════════════════════════════════════════════
const router = require('express').Router();
const crypto = require('crypto');
const { query } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');

// POST /api/fingerprint/register — Registrar huella de un usuario
// El lector USB envía el template/hash de la huella
router.post('/register', authenticate, authorize('owner', 'manager', 'staff'), async (req, res) => {
  try {
    const { userId, fingerprintData } = req.body;

    if (!userId || !fingerprintData) {
      return res.status(400).json({ error: 'userId y fingerprintData requeridos' });
    }

    // Hashear los datos biométricos para mayor seguridad
    const fingerprintHash = crypto
      .createHash('sha256')
      .update(fingerprintData)
      .digest('hex');

    // Verificar que esta huella no esté ya registrada para otro usuario
    const existing = await query(
      'SELECT id, first_name, last_name FROM users WHERE fingerprint_hash = $1 AND id != $2',
      [fingerprintHash, userId]
    );

    if (existing.rows.length > 0) {
      return res.status(409).json({
        error: 'Esta huella ya está registrada para otro usuario',
        existingUser: `${existing.rows[0].first_name} ${existing.rows[0].last_name}`
      });
    }

    // Registrar la huella
    await query(
      `UPDATE users SET fingerprint_hash = $1, fingerprint_registered_at = NOW() WHERE id = $2`,
      [fingerprintHash, userId]
    );

    res.json({
      message: 'Huella registrada exitosamente',
      userId,
      registeredAt: new Date().toISOString()
    });
  } catch (err) {
    if (err.message && err.message.includes('ya está registrada')) {
      return res.status(409).json({ error: err.message });
    }
    console.error('[Fingerprint] Error:', err);
    res.status(500).json({ error: 'Error registrando huella' });
  }
});

// POST /api/fingerprint/validate — Validar huella en check-in
// Similar al check-in por QR pero usando huella
router.post('/validate', authenticate, authorize('owner', 'manager', 'staff'), async (req, res) => {
  try {
    const { fingerprintData } = req.body;

    if (!fingerprintData) {
      return res.status(400).json({ error: 'fingerprintData requerido' });
    }

    const fingerprintHash = crypto
      .createHash('sha256')
      .update(fingerprintData)
      .digest('hex');

    // Buscar usuario por huella
    const userResult = await query(
      'SELECT id, first_name, last_name, qr_code, is_active FROM users WHERE fingerprint_hash = $1',
      [fingerprintHash]
    );

    if (userResult.rows.length === 0) {
      await query(
        `INSERT INTO checkins (user_id, qr_code, status, blocked_reason, checkin_method)
         VALUES ((SELECT id FROM users WHERE role = 'owner' LIMIT 1), 'FINGERPRINT-UNKNOWN', 'blocked', 'fingerprint_not_found', 'fingerprint')`
      );
      return res.json({
        allowed: false,
        reason: 'Huella no registrada',
        code: 'FINGERPRINT_NOT_FOUND'
      });
    }

    const user = userResult.rows[0];

    // Verificar membresía activa (misma lógica que check-in QR)
    if (!user.is_active) {
      await query(
        `INSERT INTO checkins (user_id, qr_code, status, blocked_reason, checkin_method)
         VALUES ($1, $2, 'blocked', 'user_inactive', 'fingerprint')`,
        [user.id, user.qr_code]
      );
      return res.json({
        allowed: false,
        reason: 'Usuario inactivo',
        code: 'USER_INACTIVE',
        member: { name: `${user.first_name} ${user.last_name}` }
      });
    }

    const membershipResult = await query(
      `SELECT m.status, m.end_date, mp.name as plan_name
       FROM memberships m
       JOIN membership_plans mp ON m.plan_id = mp.id
       WHERE m.user_id = $1 AND m.status = 'active' AND m.end_date > NOW()
       ORDER BY m.end_date DESC LIMIT 1`,
      [user.id]
    );

    if (membershipResult.rows.length === 0) {
      await query(
        `INSERT INTO checkins (user_id, qr_code, status, blocked_reason, checkin_method)
         VALUES ($1, $2, 'blocked', 'membership_expired', 'fingerprint')`,
        [user.id, user.qr_code]
      );
      return res.json({
        allowed: false,
        reason: 'Membresía vencida',
        code: 'MEMBERSHIP_EXPIRED',
        member: { name: `${user.first_name} ${user.last_name}` }
      });
    }

    const membership = membershipResult.rows[0];

    // ACCESO PERMITIDO
    await query(
      `INSERT INTO checkins (user_id, qr_code, status, checkin_method)
       VALUES ($1, $2, 'allowed', 'fingerprint')`,
      [user.id, user.qr_code]
    );

    res.json({
      allowed: true,
      method: 'fingerprint',
      member: {
        name: `${user.first_name} ${user.last_name}`,
        plan: membership.plan_name,
        expiresAt: membership.end_date,
      }
    });
  } catch (err) {
    console.error('[Fingerprint] Error validando:', err);
    res.status(500).json({ error: 'Error validando huella' });
  }
});

// DELETE /api/fingerprint/:userId — Eliminar huella registrada
router.delete('/:userId', authenticate, authorize('owner'), async (req, res) => {
  try {
    await query(
      'UPDATE users SET fingerprint_hash = NULL, fingerprint_registered_at = NULL WHERE id = $1',
      [req.params.userId]
    );
    res.json({ message: 'Huella eliminada' });
  } catch (err) {
    res.status(500).json({ error: 'Error eliminando huella' });
  }
});

// GET /api/fingerprint/status/:userId — Ver si un usuario tiene huella registrada
router.get('/status/:userId', authenticate, authorize('owner', 'manager', 'staff'), async (req, res) => {
  try {
    const result = await query(
      'SELECT fingerprint_hash IS NOT NULL as has_fingerprint, fingerprint_registered_at FROM users WHERE id = $1',
      [req.params.userId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Usuario no encontrado' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Error consultando huella' });
  }
});

module.exports = router;
