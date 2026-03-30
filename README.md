# KÚX Backend — Ecosistema Digital de Gimnasio

## Arquitectura del Sistema

```
┌─────────────┐     ┌──────────────┐     ┌──────────────────┐
│  Sitio Web  │────▶│              │────▶│   PostgreSQL     │
│  + Área     │     │              │     │   (Base de datos) │
│  Cliente    │     │              │     └──────────────────┘
└─────────────┘     │              │
                    │   Backend    │     ┌──────────────────┐
┌─────────────┐     │   Node.js    │────▶│  Stripe          │
│    POS      │────▶│   Express    │     │  Mercado Pago    │
│  (Punto de  │     │              │     └──────────────────┘
│   venta)    │     │              │
└─────────────┘     │              │     ┌──────────────────┐
                    │  /api/*      │────▶│  Panel Admin     │
┌─────────────┐     │              │     │  Reportes        │
│  Check-in   │────▶│              │     └──────────────────┘
│  Digital QR │     └──────────────┘
└─────────────┘
```

## Requisitos Previos

- **Node.js** v18+
- **PostgreSQL** v14+
- Cuenta de **Stripe** (para pagos con tarjeta)
- Cuenta de **Mercado Pago** (para pagos locales MX)

## Instalación Rápida

```bash
# 1. Clonar e instalar dependencias
cd kux-backend
npm install

# 2. Configurar variables de entorno
cp .env.example .env
# Editar .env con tus credenciales

# 3. Crear la base de datos en PostgreSQL
psql -U postgres -c "CREATE DATABASE kux_db;"
psql -U postgres -c "CREATE USER kux_admin WITH PASSWORD 'tu_password';"
psql -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE kux_db TO kux_admin;"

# 4. Ejecutar migraciones (crear tablas)
npm run migrate

# 5. Insertar datos iniciales
npm run seed

# 6. Iniciar el servidor
npm run dev
```

## Estructura del Proyecto

```
kux-backend/
├── .env.example              # Variables de entorno
├── package.json
└── src/
    ├── server.js             # Entry point — Express app
    ├── config/
    │   └── database.js       # Conexión a PostgreSQL (pool)
    ├── middleware/
    │   └── auth.js           # JWT authenticate + authorize(roles)
    ├── routes/
    │   ├── auth.js           # POST /register, /login, GET /me
    │   ├── members.js        # CRUD de miembros (admin/staff)
    │   ├── payments.js       # Stripe + Mercado Pago webhooks
    │   ├── checkins.js       # Validar QR, log de entradas
    │   ├── classes.js        # Clases grupales + reservas
    │   ├── sales.js          # POS: ventas, corte de caja
    │   ├── products.js       # Catálogo de productos
    │   └── reports.js        # Dashboard, revenue, churn, ARPM
    └── migrations/
        ├── run.js            # Crear todas las tablas
        └── seed.js           # Datos iniciales de desarrollo
```

## Endpoints API

### Autenticación
| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/api/auth/register` | Registrar nuevo cliente |
| POST | `/api/auth/login` | Iniciar sesión → JWT |
| GET | `/api/auth/me` | Perfil del usuario autenticado |

### Miembros (admin/staff)
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/members` | Listar miembros (filtros: status, search) |
| POST | `/api/members` | Crear nuevo miembro |
| GET | `/api/members/:id` | Detalle de un miembro |

### Pagos
| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/api/payments/stripe/checkout` | Crear sesión Stripe Checkout |
| POST | `/api/payments/stripe/webhook` | Webhook de Stripe |
| POST | `/api/payments/mercadopago/preference` | Crear preferencia MP |
| POST | `/api/payments/mercadopago/webhook` | Webhook de Mercado Pago |
| GET | `/api/payments` | Historial de pagos (admin) |
| GET | `/api/payments/failed` | Pagos fallidos |

### Check-in Digital
| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/api/checkins/validate` | Validar QR en recepción |
| GET | `/api/checkins` | Log de check-ins del día |
| GET | `/api/checkins/heatmap` | Mapa de asistencia semanal |

### Clases
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/classes` | Listar clases programadas |
| POST | `/api/classes` | Crear clase (admin) |
| POST | `/api/classes/:id/book` | Reservar lugar en clase |

### POS (Punto de Venta)
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/sales` | Historial de ventas |
| POST | `/api/sales` | Registrar venta |
| POST | `/api/sales/cash-register/open` | Abrir caja |
| POST | `/api/sales/cash-register/:id/close` | Corte de caja |

### Productos
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/products` | Catálogo (filtro por categoría) |
| POST | `/api/products` | Crear producto (admin) |

### Reportes
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/reports/dashboard` | KPIs principales |
| GET | `/api/reports/revenue` | Ingresos mensuales |
| GET | `/api/reports/attendance` | Reporte de asistencia |
| GET | `/api/reports/churn` | Tasa de cancelación |
| GET | `/api/reports/arpm` | Ingreso promedio por miembro |
| GET | `/api/reports/sales/today` | Ventas del día |

## Base de Datos — Tablas

| Tabla | Descripción |
|-------|-------------|
| `users` | Clientes, staff y admins con QR único |
| `membership_plans` | Planes: Basic, Pro, Elite |
| `memberships` | Membresía activa de cada usuario |
| `payments` | Historial de todos los pagos |
| `subscriptions` | Suscripciones recurrentes |
| `class_types` | Tipos de clase (Fuerza, Yoga, etc.) |
| `class_schedules` | Horarios programados |
| `class_bookings` | Reservas de alumnos |
| `checkins` | Log de entradas con QR |
| `products` | Catálogo de productos |
| `pos_sales` | Ventas del punto de venta |
| `pos_sale_items` | Items de cada venta |
| `cash_registers` | Cortes de caja |

## Conectar el Frontend

En tu archivo `kux-website.html`, cambia la constante `API_BASE`:

```javascript
const API_BASE = 'http://localhost:3000'; // ← tu backend
```

Y descomenta los `fetch()` en las funciones `apiGet()` y `apiPost()`.

## Flujo de Check-in (QR)

```
1. Cliente llega a KÚX
2. Escanea su QR en recepción
3. POST /api/checkins/validate { qrCode: "QR-KUX-001" }
4. Backend busca usuario por QR
5. Verifica membresía activa y no vencida
6. Si OK → allowed: true, registra entrada
7. Si NO → allowed: false, registra bloqueo con razón
```

## Flujo de Pago (Stripe)

```
1. Cliente selecciona plan en el sitio web
2. POST /api/payments/stripe/checkout { planSlug: "pro" }
3. Backend crea Stripe Checkout Session
4. Cliente paga en Stripe
5. Stripe envía webhook → POST /api/payments/stripe/webhook
6. Backend activa membresía automáticamente
7. Renovaciones automáticas via invoice.payment_succeeded
8. Fallos → reintento programado via invoice.payment_failed
```

## Credenciales de Desarrollo

| Rol | Email | Password |
|-----|-------|----------|
| Admin | admin@kux.com | admin123 |
| Staff | alex@kux.com | staff123 |
| Cliente | carlos@email.com | client123 |
