// ═══════════════════════════════════════════════
// KÚX — Server v2.1 (Security Hardened)
// ═══════════════════════════════════════════════
const path = require('path');
const os = require('os');
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';

// ═══ SECURITY MIDDLEWARE ═══

// Helmet: HTTP security headers
app.use(helmet({
  contentSecurityPolicy: false, // Allow frontend to load from CDNs
  crossOriginEmbedderPolicy: false,
  hsts: { maxAge: 31536000, includeSubDomains: true },
}));

// Remove server fingerprint
app.disable('x-powered-by');

// Morgan logging (no sensitive data)
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('combined'));
}

// CORS: Restrict origins in production
const allowedOrigins = [
  'https://kux-gym.netlify.app',
  'http://localhost:5500',
  'http://localhost:3000',
  'http://127.0.0.1:5500',
];
if (process.env.FRONTEND_URL) {
  allowedOrigins.push(process.env.FRONTEND_URL);
}

app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (mobile apps, curl, Postman)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin) || process.env.NODE_ENV !== 'production') {
      return callback(null, true);
    }
    callback(new Error('CORS no permitido'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 86400, // Cache preflight for 24h
}));

// ═══ RATE LIMITING ═══

// General API rate limit
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas solicitudes. Intenta en 15 minutos.' },
  keyGenerator: (req) => req.ip,
});
app.use('/api/', generalLimiter);

// Strict rate limit for auth routes (prevent brute force)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10, // Only 10 login attempts per 15 min
  message: { error: 'Demasiados intentos de login. Espera 15 minutos.' },
  keyGenerator: (req) => req.ip,
  skipSuccessfulRequests: true, // Don't count successful logins
});
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);

// ═══ BODY PARSING WITH SIZE LIMITS ═══
app.use('/api/payments/stripe/webhook', express.raw({ type: 'application/json' }));
app.use(express.json({ limit: '1mb' })); // Limit payload size
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// ═══ INPUT SANITIZATION MIDDLEWARE ═══
const sanitizeInput = (req, res, next) => {
  if (req.body && typeof req.body === 'object') {
    const sanitize = (obj) => {
      for (const key in obj) {
        if (typeof obj[key] === 'string') {
          // Remove null bytes
          obj[key] = obj[key].replace(/\0/g, '');
          // Trim whitespace
          obj[key] = obj[key].trim();
          // Limit string length to prevent abuse
          if (obj[key].length > 10000) {
            obj[key] = obj[key].substring(0, 10000);
          }
        } else if (typeof obj[key] === 'object' && obj[key] !== null) {
          sanitize(obj[key]);
        }
      }
    };
    sanitize(req.body);
  }
  next();
};
app.use(sanitizeInput);

// ═══ SECURITY HEADERS ═══
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});

// ═══ API ROUTES ═══
app.use('/api/auth',        require('./routes/auth'));
app.use('/api/members',     require('./routes/members'));
app.use('/api/payments',    require('./routes/payments'));
app.use('/api/classes',     require('./routes/classes'));
app.use('/api/checkins',    require('./routes/checkins'));
app.use('/api/sales',       require('./routes/sales'));
app.use('/api/products',    require('./routes/products'));
app.use('/api/reports',     require('./routes/reports'));
app.use('/api/fingerprint', require('./routes/fingerprint'));
app.use('/api/qr',          require('./routes/qr'));

// ═══ PERMISSIONS ENDPOINT ═══
const { authenticate } = require('./middleware/auth');
app.get('/api/permissions/me', authenticate, async (req, res) => {
  try {
    const { query: dbQuery } = require('./config/database');
    const result = await dbQuery('SELECT * FROM role_permissions WHERE role = $1', [req.user.role]);
    res.json({ role: req.user.role, permissions: result.rows });
  } catch (err) {
    res.json({ role: req.user.role, permissions: [] });
  }
});

// ═══ HEALTH CHECK ═══
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
  });
});

// ═══ 404 HANDLER ═══
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint no encontrado' });
});

// ═══ GLOBAL ERROR HANDLER (no stack traces in production) ═══
app.use((err, req, res, next) => {
  console.error('[KUX Error]', err.message);
  
  if (err.message === 'CORS no permitido') {
    return res.status(403).json({ error: 'Origen no permitido' });
  }

  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production'
      ? 'Error interno del servidor'
      : err.message,
  });
});

// ═══ START SERVER ═══
app.listen(PORT, HOST, () => {
  const localIP = Object.values(os.networkInterfaces())
    .flat().find(i => i?.family === 'IPv4' && !i.internal)?.address || 'localhost';

  console.log(`
  ╔═══════════════════════════════════════════════╗
  ║   KÚX Backend v2.1 — Security Hardened       ║
  ║   Puerto: ${PORT}                              ║
  ║   Entorno: ${(process.env.NODE_ENV || 'development').padEnd(33)}║
  ║   Seguridad:                                  ║
  ║     ✓ Helmet (HTTP headers)                   ║
  ║     ✓ CORS restrictivo                        ║
  ║     ✓ Rate limiting (auth: 10/15min)          ║
  ║     ✓ Input sanitization                      ║
  ║     ✓ Body size limits                        ║
  ║     ✓ No stack traces en producción           ║
  ╚═══════════════════════════════════════════════╝
  `);
});

module.exports = app;
