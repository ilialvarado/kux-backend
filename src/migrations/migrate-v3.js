// ═══════════════════════════════════════════════
// KÚX — Migración V3: Datos REALES del negocio
// Basado en: Archivo_Hector_PARA_CREACION_SISTEMA.xls
// Ejecutar: npm run migrate:v3
// ═══════════════════════════════════════════════
require('dotenv').config();
const { pool } = require('../config/database');

const migrationV3 = `

-- ═══════════════════════════════════════════
-- PASO 1: Extender campos de usuario (datos del cliente)
-- Según hoja "CLIENTES" del Excel
-- ═══════════════════════════════════════════

ALTER TABLE users ADD COLUMN IF NOT EXISTS birth_date DATE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS occupation VARCHAR(100);
ALTER TABLE users ADD COLUMN IF NOT EXISTS ine VARCHAR(20);
ALTER TABLE users ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS zip_code VARCHAR(10);
ALTER TABLE users ADD COLUMN IF NOT EXISTS city_state VARCHAR(100);
ALTER TABLE users ADD COLUMN IF NOT EXISTS emergency_contact VARCHAR(200);
ALTER TABLE users ADD COLUMN IF NOT EXISTS photo_url TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS digital_signature BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50);
ALTER TABLE users ADD COLUMN IF NOT EXISTS card_holder VARCHAR(100);
ALTER TABLE users ADD COLUMN IF NOT EXISTS card_last4 VARCHAR(4);
ALTER TABLE users ADD COLUMN IF NOT EXISTS card_expiry VARCHAR(7);
ALTER TABLE users ADD COLUMN IF NOT EXISTS card_type VARCHAR(20);
ALTER TABLE users ADD COLUMN IF NOT EXISTS contract_number VARCHAR(50);
ALTER TABLE users ADD COLUMN IF NOT EXISTS schedule VARCHAR(100);
ALTER TABLE users ADD COLUMN IF NOT EXISTS work_days VARCHAR(100);
ALTER TABLE users ADD COLUMN IF NOT EXISTS job_description TEXT;

-- ═══════════════════════════════════════════
-- PASO 2: Actualizar categorías de productos
-- Según hoja "PRODUCTOS" del Excel
-- ═══════════════════════════════════════════

ALTER TABLE products DROP CONSTRAINT IF EXISTS products_category_check;
ALTER TABLE products ADD COLUMN IF NOT EXISTS cost DECIMAL(10,2) DEFAULT 0;
ALTER TABLE products ALTER COLUMN category TYPE VARCHAR(50);

-- ═══════════════════════════════════════════
-- PASO 3: Actualizar planes de membresía
-- Más campos para los paquetes reales
-- ═══════════════════════════════════════════

ALTER TABLE membership_plans ADD COLUMN IF NOT EXISTS plan_type VARCHAR(30) DEFAULT 'mensualidad';
ALTER TABLE membership_plans ADD COLUMN IF NOT EXISTS includes TEXT;
ALTER TABLE membership_plans ADD COLUMN IF NOT EXISTS restrictions TEXT;
ALTER TABLE membership_plans ADD COLUMN IF NOT EXISTS schedule VARCHAR(100);
ALTER TABLE membership_plans ADD COLUMN IF NOT EXISTS variant VARCHAR(30);

-- ═══════════════════════════════════════════
-- PASO 4: Servicios con más detalle
-- ═══════════════════════════════════════════

ALTER TABLE class_types ADD COLUMN IF NOT EXISTS requires_reservation BOOLEAN DEFAULT false;
ALTER TABLE class_types ADD COLUMN IF NOT EXISTS service_type VARCHAR(30) DEFAULT 'class';

-- ═══════════════════════════════════════════
-- PASO 5: Corte de caja mejorado
-- ═══════════════════════════════════════════

ALTER TABLE cash_registers ADD COLUMN IF NOT EXISTS total_cash_sales DECIMAL(10,2) DEFAULT 0;
ALTER TABLE cash_registers ADD COLUMN IF NOT EXISTS total_card_sales DECIMAL(10,2) DEFAULT 0;
ALTER TABLE cash_registers ADD COLUMN IF NOT EXISTS total_transfer_sales DECIMAL(10,2) DEFAULT 0;
ALTER TABLE cash_registers ADD COLUMN IF NOT EXISTS total_memberships_sold INT DEFAULT 0;
ALTER TABLE cash_registers ADD COLUMN IF NOT EXISTS total_products_sold INT DEFAULT 0;
ALTER TABLE cash_registers ADD COLUMN IF NOT EXISTS total_services_sold INT DEFAULT 0;

-- ═══════════════════════════════════════════
-- PASO 6: Tabla de pases por día
-- "¿Permiten accesos por día? SI"
-- ═══════════════════════════════════════════

CREATE TABLE IF NOT EXISTS day_passes (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID REFERENCES users(id),
  name        VARCHAR(200),
  amount      DECIMAL(10,2) NOT NULL,
  valid_date  DATE NOT NULL DEFAULT CURRENT_DATE,
  used        BOOLEAN DEFAULT false,
  created_by  UUID REFERENCES users(id),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

`;

async function runMigrationV3() {
  try {
    console.log('[KÚX] Ejecutando migración V3 (datos reales del negocio)...');
    await pool.query(migrationV3);
    console.log('[KÚX] ✓ Migración V3 completada:');
    console.log('  ✓ Campos extendidos de cliente (INE, dirección, contacto emergencia, etc.)');
    console.log('  ✓ Costo de productos agregado');
    console.log('  ✓ Planes con variantes (estudiante, pareja)');
    console.log('  ✓ Servicios con reservación');
    console.log('  ✓ Corte de caja detallado');
    console.log('  ✓ Pases por día');
  } catch (err) {
    console.error('[KÚX] ✕ Error en migración V3:', err.message);
  } finally {
    await pool.end();
  }
}

runMigrationV3();
