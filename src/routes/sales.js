// ═══════════════════════════════════════════════
// KÚX — Rutas POS (Punto de Venta)
// Venta de membresías, productos, descuentos, corte de caja
// ═══════════════════════════════════════════════
const router = require('express').Router();
const { query, transaction } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');

// GET /api/sales — Historial de ventas POS
router.get('/', authenticate, authorize('owner', 'manager', 'staff'), async (req, res) => {
  try {
    const { page = 1, limit = 20, date } = req.query;
    const offset = (page - 1) * limit;
    const params = [limit, offset];
    let dateFilter = '';

    if (date) {
      params.push(date);
      dateFilter = `WHERE DATE(s.created_at) = $${params.length}`;
    }

    const result = await query(`
      SELECT s.*, 
             staff.first_name || ' ' || staff.last_name as staff_name,
             COALESCE(client.first_name || ' ' || client.last_name, 'Walk-in') as client_name,
             json_agg(json_build_object('name', si.name, 'qty', si.quantity, 'price', si.unit_price)) as items
      FROM pos_sales s
      JOIN users staff ON s.staff_id = staff.id
      LEFT JOIN users client ON s.client_id = client.id
      LEFT JOIN pos_sale_items si ON si.sale_id = s.id
      ${dateFilter}
      GROUP BY s.id, staff.first_name, staff.last_name, client.first_name, client.last_name
      ORDER BY s.created_at DESC
      LIMIT $1 OFFSET $2
    `, params);

    res.json({ sales: result.rows });
  } catch (err) {
    console.error('[POS] Error:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// POST /api/sales — Registrar venta POS
router.post('/', authenticate, authorize('owner', 'manager', 'staff'), async (req, res) => {
  try {
    const { clientId, items, paymentMethod, discount = 0, notes } = req.body;
    // items: [{ productId, planId, name, quantity, unitPrice }]

    if (!items || items.length === 0) {
      return res.status(400).json({ error: 'La venta debe tener al menos un artículo' });
    }

    const result = await transaction(async (client) => {
      const subtotal = items.reduce((sum, i) => sum + (i.unitPrice * i.quantity), 0);
      const total = subtotal - discount;

      // Crear venta
      const saleResult = await client.query(
        `INSERT INTO pos_sales (staff_id, client_id, subtotal, discount, total, payment_method, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [req.user.id, clientId || null, subtotal, discount, total, paymentMethod, notes]
      );
      const saleId = saleResult.rows[0].id;

      // Insertar items
      for (const item of items) {
        await client.query(
          `INSERT INTO pos_sale_items (sale_id, product_id, plan_id, name, quantity, unit_price, total)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [saleId, item.productId || null, item.planId || null, item.name, item.quantity, item.unitPrice, item.unitPrice * item.quantity]
        );

        // Actualizar stock si es producto
        if (item.productId) {
          await client.query(
            'UPDATE products SET stock = stock - $1 WHERE id = $2',
            [item.quantity, item.productId]
          );
        }
      }

      // Registrar como pago
      if (clientId) {
        await client.query(
          `INSERT INTO payments (user_id, amount, payment_method, payment_type, status, description)
           VALUES ($1, $2, $3, 'product', 'completed', $4)`,
          [clientId, total, paymentMethod === 'cash' ? 'cash' : 'pos', `Venta POS #${saleId}`]
        );
      }

      return { saleId, total };
    });

    res.status(201).json({ message: 'Venta registrada', ...result });
  } catch (err) {
    console.error('[POS] Error en venta:', err);
    res.status(500).json({ error: 'Error registrando venta' });
  }
});

// POST /api/sales/cash-register/open — Abrir caja
router.post('/cash-register/open', authenticate, authorize('owner', 'manager', 'staff'), async (req, res) => {
  try {
    const { openingAmount } = req.body;
    const result = await query(
      `INSERT INTO cash_registers (staff_id, opening_amount) VALUES ($1, $2) RETURNING *`,
      [req.user.id, openingAmount || 0]
    );
    res.status(201).json({ register: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Error abriendo caja' });
  }
});

// POST /api/sales/cash-register/:id/close — Cerrar/corte de caja
router.post('/cash-register/:id/close', authenticate, authorize('owner', 'manager', 'staff'), async (req, res) => {
  try {
    const { closingAmount, notes } = req.body;

    // Calcular expected
    const expected = await query(`
      SELECT COALESCE(SUM(total), 0) as total
      FROM pos_sales
      WHERE payment_method = 'cash'
        AND created_at >= (SELECT opened_at FROM cash_registers WHERE id = $1)
    `, [req.params.id]);

    const register = await query(`SELECT opening_amount FROM cash_registers WHERE id = $1`, [req.params.id]);
    const expectedAmount = parseFloat(register.rows[0].opening_amount) + parseFloat(expected.rows[0].total);

    const result = await query(
      `UPDATE cash_registers
       SET closed_at = NOW(), closing_amount = $1, expected_amount = $2,
           difference = $1 - $2, notes = $3, status = 'closed'
       WHERE id = $4 RETURNING *`,
      [closingAmount, expectedAmount, notes, req.params.id]
    );

    res.json({ register: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Error cerrando caja' });
  }
});

module.exports = router;
