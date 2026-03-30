// ═══════════════════════════════════════════════
// KÚX — Seed V2: Agregar dueña y gerente
// Ejecutar después de migrate:v2
// ═══════════════════════════════════════════════
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { pool } = require('../config/database');

async function seedV2() {
  try {
    console.log('[KÚX Seed V2] Actualizando roles...');

    // El usuario admin@kux.com ya fue convertido a 'owner' por migrate-v2
    // Actualizamos su nombre para que sea la dueña
    await pool.query(`
      UPDATE users SET first_name = 'Dueña', last_name = 'KÚX' 
      WHERE email = 'admin@kux.com'
    `);

    // Crear gerente
    const managerHash = await bcrypt.hash('manager123', 12);
    await pool.query(`
      INSERT INTO users (email, password_hash, role, first_name, last_name, phone, qr_code)
      VALUES ('gerente@kux.com', $1, 'manager', 'Gerente', 'KÚX', '+52 999 444 4444', 'QR-KUX-MANAGER')
      ON CONFLICT (email) DO NOTHING;
    `, [managerHash]);

    console.log('[KÚX Seed V2] ✓ Roles actualizados:');
    console.log('  👑 Dueña:    admin@kux.com     / admin123');
    console.log('  📊 Gerente:  gerente@kux.com   / manager123');
    console.log('  💼 Staff:    alex@kux.com      / staff123');
    console.log('  👤 Clientes: carlos@email.com  / client123');

    // Verificar roles
    const result = await pool.query(`
      SELECT role, COUNT(*) as total FROM users GROUP BY role ORDER BY role
    `);
    console.log('\n  Distribución de roles:');
    result.rows.forEach(r => console.log(`    ${r.role}: ${r.total} usuarios`));

  } catch (err) {
    console.error('[KÚX Seed V2] ✕ Error:', err.message);
  } finally {
    await pool.end();
  }
}

seedV2();
