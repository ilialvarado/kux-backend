// ═══════════════════════════════════════════════
// KÚX — Migración: Creación de tablas
// Basado en: PLANEACIÓN_SISTEMA.pdf
// ═══════════════════════════════════════════════
//
// MAPEO DEL SISTEMA (del PDF):
//   Cliente → Sitio web / Área de cliente
//                         ↕
//   Cliente → Punto de venta → Backend/API → Base de datos
//                                    ↕
//   Cliente → Check-in digital  → Stripe / Mercado Pago
//                                    ↕
//                              Panel admin / reportes
//
// Este archivo crea todas las tablas necesarias para los 5 módulos.
// ═══════════════════════════════════════════════

require('dotenv').config();
const { pool } = require('../config/database');

const migration = `

-- ═══════════════════════════════════════════
-- EXTENSIONES
-- ═══════════════════════════════════════════
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ═══════════════════════════════════════════
-- MÓDULO 1: USUARIOS (clientes, staff, admin)
-- ═══════════════════════════════════════════

CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email         VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role          VARCHAR(20) NOT NULL DEFAULT 'client'
                  CHECK (role IN ('client', 'staff', 'admin')),
  first_name    VARCHAR(100) NOT NULL,
  last_name     VARCHAR(100) NOT NULL,
  phone         VARCHAR(20),
  avatar_url    TEXT,
  qr_code       VARCHAR(100) UNIQUE,         -- QR único por usuario para check-in
  is_active     BOOLEAN DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_qr ON users(qr_code);

-- ═══════════════════════════════════════════
-- MÓDULO 2: MEMBRESÍAS (tipos, vigencias, estados)
-- ═══════════════════════════════════════════

CREATE TABLE IF NOT EXISTS membership_plans (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          VARCHAR(50) NOT NULL,           -- BASIC, PRO, ELITE
  slug          VARCHAR(50) UNIQUE NOT NULL,
  price         DECIMAL(10,2) NOT NULL,
  currency      VARCHAR(3) DEFAULT 'MXN',
  duration_days INT NOT NULL DEFAULT 30,        -- Duración en días
  features      JSONB DEFAULT '[]',             -- Lista de features incluidos
  is_active     BOOLEAN DEFAULT true,
  sort_order    INT DEFAULT 0,
  stripe_price_id    VARCHAR(100),              -- ID del precio en Stripe
  mp_plan_id         VARCHAR(100),              -- ID del plan en Mercado Pago
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS memberships (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_id       UUID NOT NULL REFERENCES membership_plans(id),
  status        VARCHAR(20) NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active', 'expired', 'frozen', 'cancelled', 'pending')),
  start_date    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  end_date      TIMESTAMPTZ NOT NULL,
  auto_renew    BOOLEAN DEFAULT true,
  cancelled_at  TIMESTAMPTZ,
  frozen_at     TIMESTAMPTZ,
  frozen_until  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_memberships_user ON memberships(user_id);
CREATE INDEX idx_memberships_status ON memberships(status);
CREATE INDEX idx_memberships_end_date ON memberships(end_date);

-- ═══════════════════════════════════════════
-- MÓDULO 3: PAGOS (historial, suscripciones)
-- Integración con Stripe + Mercado Pago
-- ═══════════════════════════════════════════

CREATE TABLE IF NOT EXISTS payments (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  membership_id   UUID REFERENCES memberships(id),
  amount          DECIMAL(10,2) NOT NULL,
  currency        VARCHAR(3) DEFAULT 'MXN',
  status          VARCHAR(20) NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'completed', 'failed', 'refunded', 'cancelled')),
  payment_method  VARCHAR(30) NOT NULL
                    CHECK (payment_method IN ('stripe', 'mercadopago', 'cash', 'transfer', 'pos')),
  payment_type    VARCHAR(20) NOT NULL DEFAULT 'one_time'
                    CHECK (payment_type IN ('one_time', 'subscription', 'renewal', 'product')),
  -- IDs de las pasarelas
  stripe_payment_id     VARCHAR(255),
  stripe_subscription_id VARCHAR(255),
  mp_payment_id         VARCHAR(255),
  mp_subscription_id    VARCHAR(255),
  -- Metadata
  description     TEXT,
  metadata        JSONB DEFAULT '{}',
  retry_count     INT DEFAULT 0,                -- Reintentos en pagos fallidos
  next_retry_at   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_payments_user ON payments(user_id);
CREATE INDEX idx_payments_status ON payments(status);
CREATE INDEX idx_payments_method ON payments(payment_method);
CREATE INDEX idx_payments_created ON payments(created_at DESC);

-- Suscripciones (pagos recurrentes)
CREATE TABLE IF NOT EXISTS subscriptions (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  membership_id     UUID REFERENCES memberships(id),
  plan_id           UUID NOT NULL REFERENCES membership_plans(id),
  status            VARCHAR(20) NOT NULL DEFAULT 'active'
                      CHECK (status IN ('active', 'paused', 'cancelled', 'past_due')),
  payment_method    VARCHAR(30) NOT NULL,
  stripe_sub_id     VARCHAR(255),
  mp_sub_id         VARCHAR(255),
  current_period_start TIMESTAMPTZ,
  current_period_end   TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN DEFAULT false,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_subscriptions_user ON subscriptions(user_id);
CREATE INDEX idx_subscriptions_status ON subscriptions(status);

-- ═══════════════════════════════════════════
-- MÓDULO 4: CLASES / SERVICIOS
-- ═══════════════════════════════════════════

CREATE TABLE IF NOT EXISTS class_types (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        VARCHAR(100) NOT NULL,             -- Fuerza, Boxeo, Yoga, Pilates, Cardio
  slug        VARCHAR(100) UNIQUE NOT NULL,
  description TEXT,
  color       VARCHAR(7),                        -- Color HEX para el calendario
  duration_min INT DEFAULT 60,
  max_capacity INT DEFAULT 25,
  is_active   BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS class_schedules (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  class_type_id UUID NOT NULL REFERENCES class_types(id),
  instructor_id UUID NOT NULL REFERENCES users(id),
  day_of_week   INT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),  -- 0=Lunes
  start_time    TIME NOT NULL,
  end_time      TIME NOT NULL,
  max_capacity  INT,                             -- Override del tipo de clase
  is_active     BOOLEAN DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_schedules_day ON class_schedules(day_of_week);
CREATE INDEX idx_schedules_instructor ON class_schedules(instructor_id);

CREATE TABLE IF NOT EXISTS class_bookings (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  schedule_id   UUID NOT NULL REFERENCES class_schedules(id),
  user_id       UUID NOT NULL REFERENCES users(id),
  class_date    DATE NOT NULL,
  status        VARCHAR(20) DEFAULT 'confirmed'
                  CHECK (status IN ('confirmed', 'cancelled', 'attended', 'no_show')),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(schedule_id, user_id, class_date)
);

CREATE INDEX idx_bookings_user ON class_bookings(user_id);
CREATE INDEX idx_bookings_date ON class_bookings(class_date);

-- ═══════════════════════════════════════════
-- MÓDULO 5: CHECK-IN DIGITAL
-- QR por usuario → Validación → Registro → Bloqueo si inactivo
-- ═══════════════════════════════════════════

CREATE TABLE IF NOT EXISTS checkins (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID NOT NULL REFERENCES users(id),
  qr_code       VARCHAR(100) NOT NULL,
  status        VARCHAR(20) NOT NULL DEFAULT 'allowed'
                  CHECK (status IN ('allowed', 'blocked')),
  blocked_reason VARCHAR(100),                    -- 'membership_expired', 'frozen', etc.
  checked_in_at TIMESTAMPTZ DEFAULT NOW(),
  location      VARCHAR(100) DEFAULT 'recepcion'
);

CREATE INDEX idx_checkins_user ON checkins(user_id);
CREATE INDEX idx_checkins_date ON checkins(checked_in_at DESC);
CREATE INDEX idx_checkins_qr ON checkins(qr_code);

-- ═══════════════════════════════════════════
-- POS: PRODUCTOS (punto de venta)
-- ═══════════════════════════════════════════

CREATE TABLE IF NOT EXISTS products (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        VARCHAR(200) NOT NULL,
  slug        VARCHAR(200) UNIQUE NOT NULL,
  description TEXT,
  category    VARCHAR(50) NOT NULL
                CHECK (category IN ('ropa', 'suplementos', 'accesorios', 'bebidas', 'otros')),
  price       DECIMAL(10,2) NOT NULL,
  currency    VARCHAR(3) DEFAULT 'MXN',
  stock       INT DEFAULT 0,
  image_url   TEXT,
  emoji       VARCHAR(10),
  is_active   BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_products_category ON products(category);

-- Ventas POS
CREATE TABLE IF NOT EXISTS pos_sales (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  staff_id      UUID NOT NULL REFERENCES users(id),       -- Quién vendió
  client_id     UUID REFERENCES users(id),                 -- Cliente (puede ser NULL si es walk-in)
  subtotal      DECIMAL(10,2) NOT NULL,
  discount      DECIMAL(10,2) DEFAULT 0,
  total         DECIMAL(10,2) NOT NULL,
  payment_method VARCHAR(30) NOT NULL,
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pos_sale_items (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sale_id     UUID NOT NULL REFERENCES pos_sales(id) ON DELETE CASCADE,
  product_id  UUID REFERENCES products(id),
  plan_id     UUID REFERENCES membership_plans(id),        -- Si es venta de membresía
  name        VARCHAR(200) NOT NULL,
  quantity    INT NOT NULL DEFAULT 1,
  unit_price  DECIMAL(10,2) NOT NULL,
  total       DECIMAL(10,2) NOT NULL
);

-- Cortes de caja
CREATE TABLE IF NOT EXISTS cash_registers (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  staff_id      UUID NOT NULL REFERENCES users(id),
  opened_at     TIMESTAMPTZ DEFAULT NOW(),
  closed_at     TIMESTAMPTZ,
  opening_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  closing_amount DECIMAL(10,2),
  expected_amount DECIMAL(10,2),
  difference    DECIMAL(10,2),
  notes         TEXT,
  status        VARCHAR(20) DEFAULT 'open'
                  CHECK (status IN ('open', 'closed'))
);

-- ═══════════════════════════════════════════
-- REPORTES: Vistas materializadas para performance
-- ═══════════════════════════════════════════

-- Vista: Ingresos mensuales
CREATE OR REPLACE VIEW v_monthly_revenue AS
SELECT
  DATE_TRUNC('month', created_at) AS month,
  payment_method,
  COUNT(*) AS total_transactions,
  SUM(amount) AS total_revenue
FROM payments
WHERE status = 'completed'
GROUP BY DATE_TRUNC('month', created_at), payment_method
ORDER BY month DESC;

-- Vista: Check-ins diarios
CREATE OR REPLACE VIEW v_daily_checkins AS
SELECT
  DATE(checked_in_at) AS day,
  COUNT(*) AS total_checkins,
  COUNT(*) FILTER (WHERE status = 'allowed') AS allowed,
  COUNT(*) FILTER (WHERE status = 'blocked') AS blocked,
  COUNT(DISTINCT user_id) AS unique_users
FROM checkins
GROUP BY DATE(checked_in_at)
ORDER BY day DESC;

-- Vista: Distribución de membresías
CREATE OR REPLACE VIEW v_membership_distribution AS
SELECT
  mp.name AS plan_name,
  m.status,
  COUNT(*) AS total
FROM memberships m
JOIN membership_plans mp ON m.plan_id = mp.id
GROUP BY mp.name, m.status;

-- Vista: Churn mensual
CREATE OR REPLACE VIEW v_monthly_churn AS
SELECT
  DATE_TRUNC('month', cancelled_at) AS month,
  COUNT(*) AS cancellations,
  (SELECT COUNT(*) FROM memberships WHERE status = 'active') AS current_active
FROM memberships
WHERE cancelled_at IS NOT NULL
GROUP BY DATE_TRUNC('month', cancelled_at)
ORDER BY month DESC;

-- ═══════════════════════════════════════════
-- FUNCIÓN: Actualizar updated_at automáticamente
-- ═══════════════════════════════════════════
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers para updated_at
CREATE TRIGGER trg_users_updated BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_memberships_updated BEFORE UPDATE ON memberships
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_payments_updated BEFORE UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_subscriptions_updated BEFORE UPDATE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

`;

async function runMigration() {
  try {
    console.log('[KÚX] Ejecutando migración...');
    await pool.query(migration);
    console.log('[KÚX] ✓ Todas las tablas creadas exitosamente');
  } catch (err) {
    console.error('[KÚX] ✕ Error en migración:', err.message);
  } finally {
    await pool.end();
  }
}

runMigration();
