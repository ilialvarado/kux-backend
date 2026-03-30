// ═══════════════════════════════════════════════
// KÚX — Seed: Datos iniciales de desarrollo
// ═══════════════════════════════════════════════
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { pool } = require('../config/database');

async function seed() {
  try {
    console.log('[KÚX Seed] Insertando datos iniciales...');

    // ── Planes de membresía ──
    await pool.query(`
      INSERT INTO membership_plans (name, slug, price, duration_days, features, sort_order) VALUES
        ('Basic',  'basic',  499,  30, '["Acceso sala principal","Vestuarios y duchas","Lunes a viernes"]', 1),
        ('Pro',    'pro',    999,  30, '["Acceso sala principal","Vestuarios y duchas","7 días a la semana","Clases grupales ilimitadas","Sauna y jacuzzi"]', 2),
        ('Elite',  'elite',  1699, 30, '["Acceso sala principal","Vestuarios y duchas","7 días a la semana","Clases grupales ilimitadas","Sauna y jacuzzi","Plan nutricional personalizado"]', 3)
      ON CONFLICT (slug) DO NOTHING;
    `);

    // ── Usuario admin ──
    const hash = await bcrypt.hash('admin123', 12);
    await pool.query(`
      INSERT INTO users (email, password_hash, role, first_name, last_name, phone, qr_code)
      VALUES ('admin@kux.com', $1, 'admin', 'Admin', 'KÚX', '+52 999 000 0000', 'QR-KUX-ADMIN')
      ON CONFLICT (email) DO NOTHING;
    `, [hash]);

    // ── Staff ──
    const staffHash = await bcrypt.hash('staff123', 12);
    await pool.query(`
      INSERT INTO users (email, password_hash, role, first_name, last_name, phone, qr_code) VALUES
        ('alex@kux.com',   $1, 'staff', 'Alex',   'Moreno', '+52 999 111 1111', 'QR-KUX-STAFF-01'),
        ('sara@kux.com',   $1, 'staff', 'Sara',   'Vidal',  '+52 999 222 2222', 'QR-KUX-STAFF-02'),
        ('marcos@kux.com', $1, 'staff', 'Marcos', 'Luna',   '+52 999 333 3333', 'QR-KUX-STAFF-03')
      ON CONFLICT (email) DO NOTHING;
    `, [staffHash]);

    // ── Clientes de ejemplo ──
    const clientHash = await bcrypt.hash('client123', 12);
    const clientsResult = await pool.query(`
      INSERT INTO users (email, password_hash, role, first_name, last_name, phone, qr_code) VALUES
        ('carlos@email.com',   $1, 'client', 'Carlos',    'Mendoza',   '+52 999 100 0001', 'QR-KUX-001'),
        ('maria@email.com',    $1, 'client', 'María',     'López',     '+52 999 100 0002', 'QR-KUX-002'),
        ('roberto@email.com',  $1, 'client', 'Roberto',   'Fernández', '+52 999 100 0003', 'QR-KUX-003'),
        ('ana@email.com',      $1, 'client', 'Ana',       'Pérez',     '+52 999 100 0004', 'QR-KUX-004'),
        ('diego@email.com',    $1, 'client', 'Diego',     'Ramírez',   '+52 999 100 0005', 'QR-KUX-005'),
        ('sofia@email.com',    $1, 'client', 'Sofía',     'García',    '+52 999 100 0006', 'QR-KUX-006'),
        ('luis@email.com',     $1, 'client', 'Luis',      'Torres',    '+52 999 100 0007', 'QR-KUX-007'),
        ('valentina@email.com',$1, 'client', 'Valentina', 'Cruz',      '+52 999 100 0008', 'QR-KUX-008')
      ON CONFLICT (email) DO NOTHING
      RETURNING id;
    `, [clientHash]);

    // ── Tipos de clase ──
    await pool.query(`
      INSERT INTO class_types (name, slug, color, duration_min, max_capacity) VALUES
        ('Fuerza',  'fuerza',  '#00c9a7', 60, 25),
        ('Boxeo',   'boxeo',   '#ef4444', 60, 20),
        ('Yoga',    'yoga',    '#6366f1', 75, 30),
        ('Cardio',  'cardio',  '#f59e0b', 45, 35),
        ('Pilates', 'pilates', '#10b981', 60, 20)
      ON CONFLICT (slug) DO NOTHING;
    `);

    // ── Productos ──
    await pool.query(`
      INSERT INTO products (name, slug, category, price, stock, emoji) VALUES
        ('Camiseta KÚX Pro',       'camiseta-kux-pro',      'ropa',         599,  50, '👕'),
        ('Shorts KÚX Edge',        'shorts-kux-edge',       'ropa',         499,  40, '🩳'),
        ('Proteína Whey Gold 2kg', 'proteina-whey-gold',    'suplementos', 999,  30, '💊'),
        ('Pre-Workout KÚX Blast',  'pre-workout-kux-blast', 'suplementos', 699,  25, '⚡'),
        ('Guantes de Boxeo',       'guantes-boxeo',         'accesorios',  799,  20, '🥊'),
        ('Hoodie KÚX Oversize',    'hoodie-kux-oversize',   'ropa',         949,  35, '🎽'),
        ('BCAA Recovery 300g',     'bcaa-recovery',         'suplementos', 479,  40, '🍃'),
        ('Banda Resistencia Set',  'banda-resistencia',     'accesorios',  349,  60, '🎯')
      ON CONFLICT (slug) DO NOTHING;
    `);

    console.log('[KÚX Seed] ✓ Datos iniciales insertados correctamente');
  } catch (err) {
    console.error('[KÚX Seed] ✕ Error:', err.message);
  } finally {
    await pool.end();
  }
}

seed();
