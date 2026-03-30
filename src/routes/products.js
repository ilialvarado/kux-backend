// ═══════════════════════════════════════════════
// KÚX — Rutas de Productos
// ═══════════════════════════════════════════════
const router = require('express').Router();
const { query } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');

// GET /api/products — Listar productos (público)
router.get('/', async (req, res) => {
  try {
    const { category } = req.query;
    let sql = 'SELECT * FROM products WHERE is_active = true';
    const params = [];

    if (category && category !== 'all') {
      params.push(category);
      sql += ` AND category = $${params.length}`;
    }

    sql += ' ORDER BY category, name';
    const result = await query(sql, params);
    res.json({ products: result.rows });
  } catch (err) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// POST /api/products — Crear producto (admin)
router.post('/', authenticate, authorize('owner'), async (req, res) => {
  try {
    const { name, slug, description, category, price, stock, emoji } = req.body;
    const result = await query(
      `INSERT INTO products (name, slug, description, category, price, stock, emoji)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [name, slug, description, category, price, stock, emoji]
    );
    res.status(201).json({ product: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Error creando producto' });
  }
});

module.exports = router;
