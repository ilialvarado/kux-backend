// ═══════════════════════════════════════════════════════════
// KÚX — Servidor Principal v2.0
// Ecosistema digital: Backend + POS + Web + Pagos + Check-in
// Modo: Red local (LAN) — funciona sin internet
// Roles: owner, manager, staff, client
// ═══════════════════════════════════════════════════════════
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const os = require('os');

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0'; // Escuchar en TODAS las interfaces de red (LAN + localhost)

// ═══ MIDDLEWARE GLOBAL ═══
app.use(helmet());
app.use(morgan('dev'));

// CORS: Permitir conexiones desde cualquier dispositivo en la red local
app.use(cors({
  origin: function(origin, callback) {
    // En red local, permitir cualquier origen (tablets, PCs del gym)
    callback(null, true);
  },
  credentials: true,
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500, // Más alto para red local con múltiples dispositivos
  message: { error: 'Demasiadas solicitudes. Intenta de nuevo en 15 minutos.' }
});
app.use('/api/', limiter);

// Body parsing
app.use('/api/payments/stripe/webhook', express.raw({ type: 'application/json' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ═══ RUTAS API ═══
app.use('/api/auth',        require('./routes/auth'));
app.use('/api/members',     require('./routes/members'));
app.use('/api/payments',    require('./routes/payments'));
app.use('/api/classes',     require('./routes/classes'));
app.use('/api/checkins',    require('./routes/checkins'));
app.use('/api/sales',       require('./routes/sales'));
app.use('/api/products',    require('./routes/products'));
app.use('/api/qr',          require('./routes/qr'));
app.use('/api/reports',     require('./routes/reports'));
app.use('/api/fingerprint', require('./routes/fingerprint'));

// ═══ PERMISOS — Consultar qué puede hacer cada rol ═══
const { authenticate } = require('./middleware/auth');
const { query } = require('./config/database');

app.get('/api/permissions/me', authenticate, async (req, res) => {
  try {
    const result = await query(
      'SELECT module, can_view, can_create, can_edit, can_delete FROM role_permissions WHERE role = $1',
      [req.user.role]
    );
    res.json({
      role: req.user.role,
      permissions: result.rows
    });
  } catch (err) {
    // Fallback si la tabla no existe aún
    res.json({ role: req.user.role, permissions: [] });
  }
});

// ═══ HEALTH CHECK ═══
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'KÚX Backend',
    version: '2.0.0',
    timestamp: new Date().toISOString(),
    roles: ['owner', 'manager', 'staff', 'client'],
    modules: ['auth', 'members', 'payments', 'classes', 'checkins', 'sales', 'products', 'reports', 'fingerprint', 'permissions'],
    network: 'LAN mode — no internet required'
  });
});

// ═══ ERROR HANDLING ═══
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint no encontrado' });
});

app.use((err, req, res, next) => {
  console.error('[KÚX] Error no manejado:', err);
  res.status(500).json({ error: 'Error interno del servidor' });
});

// ═══ OBTENER IP LOCAL ═══
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

// ═══ INICIAR SERVIDOR EN RED LOCAL ═══
app.listen(PORT, HOST, () => {
  const localIP = getLocalIP();
  console.log(`
  ╔═══════════════════════════════════════════════╗
  ║          KÚX Backend v2.0.0                  ║
  ║   Modo: RED LOCAL (sin internet)             ║
  ╠═══════════════════════════════════════════════╣
  ║                                               ║
  ║   Acceso local:  http://localhost:${PORT}        ║
  ║   Acceso LAN:    http://${localIP}:${PORT}   ║
  ║                                               ║
  ║   Roles del sistema:                          ║
  ║   👑 Owner    — Control total                 ║
  ║   📊 Manager  — Reportes + miembros           ║
  ║   💼 Staff    — POS + Check-in               ║
  ║   👤 Client   — Su cuenta personal            ║
  ║                                               ║
  ║   Módulos activos:                            ║
  ║   ✓ Auth         /api/auth                   ║
  ║   ✓ Members      /api/members                ║
  ║   ✓ Payments     /api/payments               ║
  ║   ✓ Classes      /api/classes                ║
  ║   ✓ Check-ins    /api/checkins               ║
  ║   ✓ POS/Sales    /api/sales                  ║
  ║   ✓ Products     /api/products               ║
  ║   ✓ Reports      /api/reports                ║
  ║   ✓ Fingerprint  /api/fingerprint            ║
  ║   ✓ Permissions  /api/permissions            ║
  ║                                               ║
  ║   Para otras PCs/tablets en el gym:           ║
  ║   Usar http://${localIP}:${PORT}             ║
  ╚═══════════════════════════════════════════════╝
  `);
});

module.exports = app;
