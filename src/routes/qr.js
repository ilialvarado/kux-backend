// ═══════════════════════════════════════════════
// KÚX — Ruta de generación de QR
// GET /api/members/:id/qr → imagen PNG del QR
// ═══════════════════════════════════════════════
const router = require('express').Router();
const QRCode = require('qrcode');
const { query } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');

// GET /api/qr/my — QR del usuario autenticado
router.get('/my', authenticate, async (req, res) => {
  try {
    const result = await query('SELECT qr_code FROM users WHERE id = $1', [req.user.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Usuario no encontrado' });

    const qrData = JSON.stringify({
      code: result.rows[0].qr_code,
      gym: 'KUX',
      url: `${process.env.QR_BASE_URL || 'https://kux.com/checkin'}/${result.rows[0].qr_code}`
    });

    res.setHeader('Content-Type', 'image/png');
    await QRCode.toFileStream(res, qrData, {
      width: 400,
      margin: 2,
      color: { dark: '#0a0a0a', light: '#ffffff' }
    });
  } catch (err) {
    console.error('[QR] Error:', err);
    res.status(500).json({ error: 'Error generando QR' });
  }
});

// GET /api/qr/:userId — QR de un miembro (staff/admin)
router.get('/:userId', authenticate, authorize('owner', 'manager', 'staff'), async (req, res) => {
  try {
    const result = await query('SELECT qr_code, first_name, last_name FROM users WHERE id = $1', [req.params.userId]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Usuario no encontrado' });

    const user = result.rows[0];
    const qrData = JSON.stringify({
      code: user.qr_code,
      gym: 'KUX',
      name: `${user.first_name} ${user.last_name}`,
      url: `${process.env.QR_BASE_URL || 'https://kux.com/checkin'}/${user.qr_code}`
    });

    const format = req.query.format || 'png';

    if (format === 'base64') {
      const base64 = await QRCode.toDataURL(qrData, { width: 400, margin: 2, color: { dark: '#0a0a0a', light: '#ffffff' } });
      return res.json({ qr: base64, code: user.qr_code });
    }

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Disposition', `inline; filename="kux-qr-${user.qr_code}.png"`);
    await QRCode.toFileStream(res, qrData, {
      width: 400, margin: 2,
      color: { dark: '#0a0a0a', light: '#ffffff' }
    });
  } catch (err) {
    console.error('[QR] Error:', err);
    res.status(500).json({ error: 'Error generando QR' });
  }
});

module.exports = router;
