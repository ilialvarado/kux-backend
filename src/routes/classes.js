// ═══════════════════════════════════════════════
// KÚX — Rutas de Clases / Servicios
// ═══════════════════════════════════════════════
const router = require('express').Router();
const { query } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');

// GET /api/classes/types — Listar tipos de clase disponibles
router.get('/types', async (req, res) => {
  try {
    const result = await query('SELECT id, name, slug, color, duration_min, max_capacity FROM class_types WHERE is_active = true ORDER BY name');
    res.json({ types: result.rows });
  } catch (err) {
    console.error('[Classes] Error tipos:', err);
    res.status(500).json({ error: 'Error obteniendo tipos de clase' });
  }
});

// GET /api/classes — Listar clases programadas
router.get('/', async (req, res) => {
  try {
    const result = await query(`
      SELECT cs.*, ct.name as class_name, ct.color, ct.duration_min,
             u.first_name || ' ' || u.last_name as instructor_name,
             COALESCE(cs.max_capacity, ct.max_capacity) as capacity,
             (SELECT COUNT(*) FROM class_bookings cb 
              WHERE cb.schedule_id = cs.id AND cb.class_date = CURRENT_DATE 
              AND cb.status IN ('confirmed', 'attended')) as enrolled
      FROM class_schedules cs
      JOIN class_types ct ON cs.class_type_id = ct.id
      JOIN users u ON cs.instructor_id = u.id
      WHERE cs.is_active = true
      ORDER BY cs.day_of_week, cs.start_time
    `);
    res.json({ classes: result.rows });
  } catch (err) {
    console.error('[Classes] Error:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// POST /api/classes — Crear clase (admin)
router.post('/', authenticate, authorize('owner'), async (req, res) => {
  try {
    const { classTypeId, instructorId, dayOfWeek, startTime, endTime, maxCapacity } = req.body;
    const result = await query(
      `INSERT INTO class_schedules (class_type_id, instructor_id, day_of_week, start_time, end_time, max_capacity)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [classTypeId, instructorId, dayOfWeek, startTime, endTime, maxCapacity]
    );
    res.status(201).json({ schedule: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Error creando clase' });
  }
});

// POST /api/classes/:scheduleId/book — Reservar lugar en clase
router.post('/:scheduleId/book', authenticate, async (req, res) => {
  try {
    const { date } = req.body; // YYYY-MM-DD

    // Verificar capacidad
    const schedule = await query(`
      SELECT cs.*, COALESCE(cs.max_capacity, ct.max_capacity) as capacity
      FROM class_schedules cs
      JOIN class_types ct ON cs.class_type_id = ct.id
      WHERE cs.id = $1
    `, [req.params.scheduleId]);

    if (schedule.rows.length === 0) {
      return res.status(404).json({ error: 'Clase no encontrada' });
    }

    const bookings = await query(
      `SELECT COUNT(*) FROM class_bookings
       WHERE schedule_id = $1 AND class_date = $2 AND status IN ('confirmed', 'attended')`,
      [req.params.scheduleId, date]
    );

    if (parseInt(bookings.rows[0].count) >= schedule.rows[0].capacity) {
      return res.status(409).json({ error: 'Clase llena' });
    }

    const result = await query(
      `INSERT INTO class_bookings (schedule_id, user_id, class_date)
       VALUES ($1, $2, $3) RETURNING *`,
      [req.params.scheduleId, req.user.id, date]
    );

    res.status(201).json({ booking: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Ya tienes reserva para esta clase' });
    }
    res.status(500).json({ error: 'Error reservando clase' });
  }
});

module.exports = router;
