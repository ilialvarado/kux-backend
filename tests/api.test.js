// ═══════════════════════════════════════════════
// KÚX — Tests de Integración
// Cubre los 5 módulos del sistema
// ═══════════════════════════════════════════════
const request = require('supertest');
const app = require('../src/server');

let adminToken, staffToken, clientToken, testClientId;

// ═══ AUTH ═══
describe('Módulo 1: Autenticación', () => {
  test('POST /api/auth/register — registrar nuevo cliente', async () => {
    const res = await request(app).post('/api/auth/register').send({
      email: 'test_runner@kux.com',
      password: 'Test1234!',
      firstName: 'Test',
      lastName: 'Runner',
      phone: '+52 999 000 9999'
    });
    expect(res.status).toBe(201);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.qrCode).toMatch(/^QR-KUX-/);
    clientToken = res.body.token;
    testClientId = res.body.user.id;
  });

  test('POST /api/auth/register — email duplicado → 409', async () => {
    const res = await request(app).post('/api/auth/register').send({
      email: 'test_runner@kux.com',
      password: 'Test1234!',
      firstName: 'Dup',
      lastName: 'User'
    });
    expect(res.status).toBe(409);
  });

  test('POST /api/auth/login — login admin', async () => {
    const res = await request(app).post('/api/auth/login').send({
      email: 'admin@kux.com',
      password: 'admin123'
    });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.role).toBe('admin');
    adminToken = res.body.token;
  });

  test('POST /api/auth/login — login staff', async () => {
    const res = await request(app).post('/api/auth/login').send({
      email: 'alex@kux.com',
      password: 'staff123'
    });
    expect(res.status).toBe(200);
    staffToken = res.body.token;
  });

  test('POST /api/auth/login — credenciales inválidas → 401', async () => {
    const res = await request(app).post('/api/auth/login').send({
      email: 'admin@kux.com',
      password: 'wrongpass'
    });
    expect(res.status).toBe(401);
  });

  test('GET /api/auth/me — perfil autenticado', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${clientToken}`);
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe('test_runner@kux.com');
  });

  test('GET /api/auth/me — sin token → 401', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });
});

// ═══ MEMBERS ═══
describe('Módulo 2: Miembros', () => {
  test('GET /api/members — listar (admin)', async () => {
    const res = await request(app)
      .get('/api/members')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.members).toBeDefined();
    expect(res.body.pagination).toBeDefined();
  });

  test('GET /api/members — filtrar por status', async () => {
    const res = await request(app)
      .get('/api/members?status=active')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
  });

  test('GET /api/members — buscar por nombre', async () => {
    const res = await request(app)
      .get('/api/members?search=carlos')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
  });

  test('POST /api/members — crear miembro (staff)', async () => {
    const res = await request(app)
      .post('/api/members')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({
        email: 'nuevo_test@kux.com',
        firstName: 'Nuevo',
        lastName: 'Miembro',
        phone: '+52 999 888 7777',
        planSlug: 'basic'
      });
    expect(res.status).toBe(201);
    expect(res.body.member).toBeDefined();
    expect(res.body.tempPassword).toBeDefined();
  });

  test('GET /api/members — cliente no autorizado → 403', async () => {
    const res = await request(app)
      .get('/api/members')
      .set('Authorization', `Bearer ${clientToken}`);
    expect(res.status).toBe(403);
  });
});

// ═══ PRODUCTS ═══
describe('Módulo: Productos', () => {
  test('GET /api/products — catálogo público', async () => {
    const res = await request(app).get('/api/products');
    expect(res.status).toBe(200);
    expect(res.body.products.length).toBeGreaterThan(0);
  });

  test('GET /api/products?category=ropa — filtrar', async () => {
    const res = await request(app).get('/api/products?category=ropa');
    expect(res.status).toBe(200);
    res.body.products.forEach(p => expect(p.category).toBe('ropa'));
  });
});

// ═══ CLASSES ═══
describe('Módulo 4: Clases', () => {
  test('GET /api/classes — listar clases', async () => {
    const res = await request(app).get('/api/classes');
    expect(res.status).toBe(200);
    expect(res.body.classes).toBeDefined();
  });
});

// ═══ CHECKINS ═══
describe('Módulo 5: Check-in Digital', () => {
  test('POST /api/checkins/validate — QR válido con membresía', async () => {
    const res = await request(app)
      .post('/api/checkins/validate')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ qrCode: 'QR-KUX-001' });
    expect(res.status).toBe(200);
    // Puede ser allowed o blocked dependiendo de si tiene membresía en seed
    expect(res.body).toHaveProperty('allowed');
  });

  test('POST /api/checkins/validate — QR inexistente → not found', async () => {
    const res = await request(app)
      .post('/api/checkins/validate')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ qrCode: 'QR-FAKE-999' });
    expect(res.status).toBe(404);
    expect(res.body.allowed).toBe(false);
  });

  test('POST /api/checkins/validate — sin QR → 400', async () => {
    const res = await request(app)
      .post('/api/checkins/validate')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({});
    expect(res.status).toBe(400);
  });

  test('GET /api/checkins — log del día (staff)', async () => {
    const res = await request(app)
      .get('/api/checkins')
      .set('Authorization', `Bearer ${staffToken}`);
    expect(res.status).toBe(200);
    expect(res.body.checkins).toBeDefined();
    expect(res.body.stats).toBeDefined();
  });

  test('GET /api/checkins/heatmap — mapa de asistencia', async () => {
    const res = await request(app)
      .get('/api/checkins/heatmap')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.heatmap).toBeDefined();
  });
});

// ═══ PAYMENTS ═══
describe('Módulo 3: Pagos', () => {
  test('POST /api/payments/stripe/checkout — sin Stripe key → 503', async () => {
    const res = await request(app)
      .post('/api/payments/stripe/checkout')
      .set('Authorization', `Bearer ${clientToken}`)
      .send({ planSlug: 'pro' });
    // 503 si Stripe no configurado, 404 si plan no existe
    expect([404, 503]).toContain(res.status);
  });

  test('GET /api/payments — historial (admin)', async () => {
    const res = await request(app)
      .get('/api/payments')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.payments).toBeDefined();
  });

  test('GET /api/payments/failed — pagos fallidos', async () => {
    const res = await request(app)
      .get('/api/payments/failed')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
  });
});

// ═══ SALES / POS ═══
describe('Módulo POS: Ventas', () => {
  let registerId;

  test('POST /api/sales/cash-register/open — abrir caja', async () => {
    const res = await request(app)
      .post('/api/sales/cash-register/open')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ openingAmount: 500 });
    expect(res.status).toBe(201);
    expect(res.body.register).toBeDefined();
    registerId = res.body.register.id;
  });

  test('POST /api/sales — registrar venta', async () => {
    const res = await request(app)
      .post('/api/sales')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({
        items: [
          { name: 'Proteína Whey Gold', quantity: 1, unitPrice: 999 }
        ],
        paymentMethod: 'cash',
        discount: 0
      });
    expect(res.status).toBe(201);
    expect(res.body.saleId).toBeDefined();
  });

  test('GET /api/sales — historial', async () => {
    const res = await request(app)
      .get('/api/sales')
      .set('Authorization', `Bearer ${staffToken}`);
    expect(res.status).toBe(200);
    expect(res.body.sales).toBeDefined();
  });
});

// ═══ REPORTS ═══
describe('Módulo: Reportes', () => {
  test('GET /api/reports/dashboard — KPIs', async () => {
    const res = await request(app)
      .get('/api/reports/dashboard')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('activeMembers');
    expect(res.body).toHaveProperty('monthlyRevenue');
    expect(res.body).toHaveProperty('todayCheckins');
    expect(res.body).toHaveProperty('churnRate');
  });

  test('GET /api/reports/revenue — ingresos', async () => {
    const res = await request(app)
      .get('/api/reports/revenue')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
  });

  test('GET /api/reports/churn — tasa de cancelación', async () => {
    const res = await request(app)
      .get('/api/reports/churn')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
  });

  test('GET /api/reports/arpm — ingreso promedio por miembro', async () => {
    const res = await request(app)
      .get('/api/reports/arpm')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
  });

  test('GET /api/reports/attendance — asistencia', async () => {
    const res = await request(app)
      .get('/api/reports/attendance')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
  });

  test('GET /api/reports/sales/today — ventas del día', async () => {
    const res = await request(app)
      .get('/api/reports/sales/today')
      .set('Authorization', `Bearer ${staffToken}`);
    expect(res.status).toBe(200);
  });
});

// ═══ HEALTH ═══
describe('Health Check', () => {
  test('GET /api/health — status ok', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.modules).toContain('checkins');
  });

  test('GET /api/nonexistent → 404', async () => {
    const res = await request(app).get('/api/nonexistent');
    expect(res.status).toBe(404);
  });
});

// Cleanup
afterAll(async () => {
  const { pool } = require('../src/config/database');
  // Delete test user
  if (testClientId) {
    await pool.query('DELETE FROM users WHERE email IN ($1, $2)', ['test_runner@kux.com', 'nuevo_test@kux.com']);
  }
  await pool.end();
});
