// ═══════════════════════════════════════════════
// KÚX — Migración V2: 4 Roles + Huella Digital + Red Local
// Ejecutar: npm run migrate:v2
// ═══════════════════════════════════════════════
require('dotenv').config();
const { pool } = require('../config/database');

const migrationV2 = `

-- ═══════════════════════════════════════════
-- PASO 1: Expandir roles de usuario
-- Roles: owner (dueña), manager (gerente), staff (empleado), client (cliente)
-- ═══════════════════════════════════════════

-- Eliminar la restricción vieja de roles
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;

-- Agregar la nueva restricción con 4 roles
ALTER TABLE users ADD CONSTRAINT users_role_check 
  CHECK (role IN ('owner', 'manager', 'staff', 'client'));

-- Convertir el admin existente a owner
UPDATE users SET role = 'owner' WHERE role = 'admin';

-- ═══════════════════════════════════════════
-- PASO 2: Agregar campo de huella digital
-- fingerprint_hash: hash biométrico del lector de huellas
-- fingerprint_registered_at: cuándo se registró
-- ═══════════════════════════════════════════

ALTER TABLE users ADD COLUMN IF NOT EXISTS fingerprint_hash TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS fingerprint_registered_at TIMESTAMPTZ;

-- Índice único para que no se repitan huellas
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_fingerprint 
  ON users(fingerprint_hash) WHERE fingerprint_hash IS NOT NULL;

-- ═══════════════════════════════════════════
-- PASO 3: Agregar campo de método de check-in
-- Para saber si entró por QR o por huella
-- ═══════════════════════════════════════════

ALTER TABLE checkins ADD COLUMN IF NOT EXISTS checkin_method VARCHAR(20) DEFAULT 'qr'
  CHECK (checkin_method IN ('qr', 'fingerprint', 'manual'));

-- ═══════════════════════════════════════════
-- PASO 3b: Sistema de ENTRADA + SALIDA
-- checked_out_at: NULL = todavía adentro
-- checkin_type: entry o exit
-- ═══════════════════════════════════════════

ALTER TABLE checkins ADD COLUMN IF NOT EXISTS checked_out_at TIMESTAMPTZ;
ALTER TABLE checkins ADD COLUMN IF NOT EXISTS checkin_type VARCHAR(10) DEFAULT 'entry'
  CHECK (checkin_type IN ('entry', 'exit'));

-- ═══════════════════════════════════════════
-- PASO 4: Tabla de permisos por rol
-- Define exactamente qué puede hacer cada rol
-- ═══════════════════════════════════════════

CREATE TABLE IF NOT EXISTS role_permissions (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  role        VARCHAR(20) NOT NULL,
  module      VARCHAR(50) NOT NULL,
  can_view    BOOLEAN DEFAULT false,
  can_create  BOOLEAN DEFAULT false,
  can_edit    BOOLEAN DEFAULT false,
  can_delete  BOOLEAN DEFAULT false,
  UNIQUE(role, module)
);

-- Insertar permisos por defecto
INSERT INTO role_permissions (role, module, can_view, can_create, can_edit, can_delete) VALUES
  -- OWNER: TODO
  ('owner', 'dashboard',     true, true, true, true),
  ('owner', 'members',       true, true, true, true),
  ('owner', 'memberships',   true, true, true, true),
  ('owner', 'sales',         true, true, true, true),
  ('owner', 'payments',      true, true, true, true),
  ('owner', 'checkins',      true, true, true, true),
  ('owner', 'classes',       true, true, true, true),
  ('owner', 'products',      true, true, true, true),
  ('owner', 'reports',       true, true, true, true),
  ('owner', 'settings',      true, true, true, true),
  ('owner', 'staff_mgmt',    true, true, true, true),
  ('owner', 'pos',           true, true, true, true),
  
  -- MANAGER: Reportes + miembros + check-ins, NO config ni eliminar
  ('manager', 'dashboard',   true, false, false, false),
  ('manager', 'members',     true, true,  true,  false),
  ('manager', 'memberships', true, true,  true,  false),
  ('manager', 'sales',       true, false, false, false),
  ('manager', 'payments',    true, false, false, false),
  ('manager', 'checkins',    true, true,  false, false),
  ('manager', 'classes',     true, true,  true,  false),
  ('manager', 'products',    true, true,  true,  false),
  ('manager', 'reports',     true, false, false, false),
  ('manager', 'settings',    false, false, false, false),
  ('manager', 'staff_mgmt',  false, false, false, false),
  ('manager', 'pos',         true, true,  true,  false),
  
  -- STAFF: Solo POS y check-in
  ('staff', 'dashboard',     false, false, false, false),
  ('staff', 'members',       true,  true,  false, false),
  ('staff', 'memberships',   false, false, false, false),
  ('staff', 'sales',         false, false, false, false),
  ('staff', 'payments',      false, false, false, false),
  ('staff', 'checkins',      true,  true,  false, false),
  ('staff', 'classes',       true,  false, false, false),
  ('staff', 'products',      true,  false, false, false),
  ('staff', 'reports',       false, false, false, false),
  ('staff', 'settings',      false, false, false, false),
  ('staff', 'staff_mgmt',    false, false, false, false),
  ('staff', 'pos',           true,  true,  true,  false),
  
  -- CLIENT: Solo su propia cuenta
  ('client', 'dashboard',    false, false, false, false),
  ('client', 'members',      false, false, false, false),
  ('client', 'memberships',  true,  false, false, false),
  ('client', 'sales',        false, false, false, false),
  ('client', 'payments',     true,  false, false, false),
  ('client', 'checkins',     true,  false, false, false),
  ('client', 'classes',      true,  true,  false, false),
  ('client', 'products',     true,  false, false, false),
  ('client', 'reports',      false, false, false, false),
  ('client', 'settings',     false, false, false, false),
  ('client', 'staff_mgmt',   false, false, false, false),
  ('client', 'pos',          false, false, false, false)
ON CONFLICT (role, module) DO NOTHING;

-- ═══════════════════════════════════════════
-- PASO 5: Reforzar unicidad de QR
-- ═══════════════════════════════════════════

-- Ya existe el UNIQUE en qr_code, pero agregamos validación extra
CREATE OR REPLACE FUNCTION validate_qr_unique()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.qr_code IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM users WHERE qr_code = NEW.qr_code AND id != COALESCE(NEW.id, uuid_generate_v4())) THEN
      RAISE EXCEPTION 'El código QR ya está asignado a otro usuario';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_validate_qr ON users;
CREATE TRIGGER trg_validate_qr BEFORE INSERT OR UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION validate_qr_unique();

-- Lo mismo para huella digital
CREATE OR REPLACE FUNCTION validate_fingerprint_unique()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.fingerprint_hash IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM users WHERE fingerprint_hash = NEW.fingerprint_hash AND id != COALESCE(NEW.id, uuid_generate_v4())) THEN
      RAISE EXCEPTION 'Esta huella digital ya está registrada para otro usuario';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_validate_fingerprint ON users;
CREATE TRIGGER trg_validate_fingerprint BEFORE INSERT OR UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION validate_fingerprint_unique();

`;

async function runMigrationV2() {
  try {
    console.log('[KÚX] Ejecutando migración V2 (roles + huella + red local)...');
    await pool.query(migrationV2);
    console.log('[KÚX] ✓ Migración V2 completada:');
    console.log('  ✓ 4 roles: owner, manager, staff, client');
    console.log('  ✓ Campo fingerprint_hash agregado');
    console.log('  ✓ Método de check-in (qr/fingerprint/manual)');
    console.log('  ✓ Tabla role_permissions creada');
    console.log('  ✓ Triggers de unicidad QR + huella');
  } catch (err) {
    console.error('[KÚX] ✕ Error en migración V2:', err.message);
  } finally {
    await pool.end();
  }
}

runMigrationV2();
