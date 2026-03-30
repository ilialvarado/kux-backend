// ═══════════════════════════════════════════════
// KÚX — Rutas de Reportes
// Ventas, asistencia, churn, ARPM
// ═══════════════════════════════════════════════
const router = require('express').Router();
const { query } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');

// GET /api/reports/dashboard — KPIs principales
router.get('/dashboard', authenticate, authorize('owner', 'manager'), async (req, res) => {
  try {
    const [members, revenue, checkins, churn] = await Promise.all([
      query(`SELECT COUNT(*) FROM memberships WHERE status = 'active'`),
      query(`SELECT COALESCE(SUM(amount), 0) as total FROM payments
             WHERE status = 'completed' AND DATE_TRUNC('month', created_at) = DATE_TRUNC('month', NOW())`),
      query(`SELECT COUNT(*) FROM checkins WHERE DATE(checked_in_at) = CURRENT_DATE AND status = 'allowed'`),
      query(`SELECT
              COALESCE(
                ROUND(
                  COUNT(*) FILTER (WHERE cancelled_at IS NOT NULL AND DATE_TRUNC('month', cancelled_at) = DATE_TRUNC('month', NOW()))::numeric /
                  NULLIF(COUNT(*) FILTER (WHERE status = 'active'), 0) * 100
                , 1)
              , 0) as rate
             FROM memberships`)
    ]);

    res.json({
      activeMembers: parseInt(members.rows[0].count),
      monthlyRevenue: parseFloat(revenue.rows[0].total),
      todayCheckins: parseInt(checkins.rows[0].count),
      churnRate: parseFloat(churn.rows[0].rate),
    });
  } catch (err) {
    console.error('[Reports] Error dashboard:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// GET /api/reports/revenue — Ingresos por periodo
router.get('/revenue', authenticate, authorize('owner', 'manager'), async (req, res) => {
  try {
    const { months = 6 } = req.query;

    const result = await query(`
      SELECT
        TO_CHAR(DATE_TRUNC('month', created_at), 'Mon') as label,
        DATE_TRUNC('month', created_at) as month,
        SUM(amount) as total,
        COUNT(*) as transactions,
        SUM(amount) FILTER (WHERE payment_method = 'stripe') as stripe_total,
        SUM(amount) FILTER (WHERE payment_method = 'mercadopago') as mp_total,
        SUM(amount) FILTER (WHERE payment_method = 'cash') as cash_total
      FROM payments
      WHERE status = 'completed'
        AND created_at >= NOW() - INTERVAL '1 month' * $1
      GROUP BY DATE_TRUNC('month', created_at)
      ORDER BY month ASC
    `, [months]);

    res.json({ revenue: result.rows });
  } catch (err) {
    console.error('[Reports] Error revenue:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// GET /api/reports/attendance — Reporte de asistencia
router.get('/attendance', authenticate, authorize('owner', 'manager'), async (req, res) => {
  try {
    const { days = 30 } = req.query;

    const daily = await query(`
      SELECT * FROM v_daily_checkins
      WHERE day >= CURRENT_DATE - $1
      ORDER BY day ASC
    `, [days]);

    // Horas pico
    const hourly = await query(`
      SELECT
        EXTRACT(HOUR FROM checked_in_at) as hour,
        COUNT(*) as total
      FROM checkins
      WHERE checked_in_at >= NOW() - INTERVAL '1 day' * $1
        AND status = 'allowed'
      GROUP BY EXTRACT(HOUR FROM checked_in_at)
      ORDER BY hour
    `, [days]);

    res.json({
      daily: daily.rows,
      hourly: hourly.rows,
    });
  } catch (err) {
    console.error('[Reports] Error attendance:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// GET /api/reports/churn — Tasa de cancelación
router.get('/churn', authenticate, authorize('owner', 'manager'), async (req, res) => {
  try {
    const result = await query(`
      SELECT
        TO_CHAR(DATE_TRUNC('month', m.created_at), 'Mon YYYY') as month,
        DATE_TRUNC('month', m.created_at) as month_date,
        COUNT(*) as total_memberships,
        COUNT(*) FILTER (WHERE m.status = 'cancelled') as cancelled,
        ROUND(
          COUNT(*) FILTER (WHERE m.status = 'cancelled')::numeric /
          NULLIF(COUNT(*), 0) * 100
        , 1) as churn_rate
      FROM memberships m
      WHERE m.created_at >= NOW() - INTERVAL '12 months'
      GROUP BY DATE_TRUNC('month', m.created_at)
      ORDER BY month_date ASC
    `);

    res.json({ churn: result.rows });
  } catch (err) {
    console.error('[Reports] Error churn:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// GET /api/reports/arpm — Ingreso promedio por miembro
router.get('/arpm', authenticate, authorize('owner', 'manager'), async (req, res) => {
  try {
    const result = await query(`
      SELECT
        TO_CHAR(DATE_TRUNC('month', p.created_at), 'Mon') as month,
        DATE_TRUNC('month', p.created_at) as month_date,
        ROUND(SUM(p.amount) / NULLIF(COUNT(DISTINCT p.user_id), 0), 2) as arpm
      FROM payments p
      WHERE p.status = 'completed'
        AND p.created_at >= NOW() - INTERVAL '12 months'
      GROUP BY DATE_TRUNC('month', p.created_at)
      ORDER BY month_date ASC
    `);

    res.json({ arpm: result.rows });
  } catch (err) {
    console.error('[Reports] Error arpm:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// GET /api/reports/sales/today — Ventas del día
router.get('/sales/today', authenticate, authorize('owner', 'manager', 'staff'), async (req, res) => {
  try {
    const result = await query(`
      SELECT
        COALESCE(SUM(amount), 0) as total,
        COUNT(*) as transactions,
        COUNT(*) FILTER (WHERE status = 'completed') as completed,
        COUNT(*) FILTER (WHERE status = 'failed') as failed
      FROM payments
      WHERE DATE(created_at) = CURRENT_DATE
    `);
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// GET /api/reports/subscriptions/active
router.get('/subscriptions/active', authenticate, authorize('owner', 'manager'), async (req, res) => {
  try {
    const result = await query(`SELECT COUNT(*) FROM subscriptions WHERE status = 'active'`);
    res.json({ activeSubscriptions: parseInt(result.rows[0].count) });
  } catch (err) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

module.exports = router;
