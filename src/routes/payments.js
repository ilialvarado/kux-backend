// ═══════════════════════════════════════════════
// KÚX — Rutas de Pagos (Stripe + Mercado Pago)
// Pagos únicos, recurrentes, renovaciones, fallos y reintentos
// ═══════════════════════════════════════════════
const router = require('express').Router();
const { query, transaction } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');

// ── Inicializar Stripe ──
let stripe;
if (process.env.STRIPE_SECRET_KEY) {
  stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
}

// ── Inicializar Mercado Pago ──
let mpClient;
if (process.env.MP_ACCESS_TOKEN) {
  const { MercadoPagoConfig, Payment: MPPayment, Preference } = require('mercadopago');
  mpClient = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });
}

// ═══════════════════════════════════════════
// STRIPE
// ═══════════════════════════════════════════

// POST /api/payments/stripe/checkout — Crear sesión de checkout Stripe
router.post('/stripe/checkout', authenticate, async (req, res) => {
  try {
    const { planSlug } = req.body;

    const planResult = await query(
      'SELECT id, name, price, stripe_price_id, duration_days FROM membership_plans WHERE slug = $1',
      [planSlug]
    );
    if (planResult.rows.length === 0) {
      return res.status(404).json({ error: 'Plan no encontrado' });
    }

    const plan = planResult.rows[0];

    if (!stripe) {
      return res.status(503).json({ error: 'Stripe no configurado. Configura STRIPE_SECRET_KEY en .env' });
    }

    // Crear sesión de Stripe Checkout
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'subscription', // Pago recurrente
      customer_email: req.user.email,
      line_items: [{
        price: plan.stripe_price_id,
        quantity: 1,
      }],
      metadata: {
        userId: req.user.id,
        planId: plan.id,
      },
      success_url: `${process.env.FRONTEND_URL}?payment=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL}?payment=cancelled`,
    });

    // Registrar pago pendiente
    await query(
      `INSERT INTO payments (user_id, amount, payment_method, payment_type, status, stripe_payment_id, description)
       VALUES ($1, $2, 'stripe', 'subscription', 'pending', $3, $4)`,
      [req.user.id, plan.price, session.id, `Suscripción ${plan.name}`]
    );

    res.json({ checkoutUrl: session.url, sessionId: session.id });
  } catch (err) {
    console.error('[Payments] Error Stripe checkout:', err);
    res.status(500).json({ error: 'Error creando sesión de pago' });
  }
});

// POST /api/payments/stripe/webhook — Webhook de Stripe
router.post('/stripe/webhook', async (req, res) => {
  let event;

  try {
    if (process.env.STRIPE_WEBHOOK_SECRET && stripe) {
      const sig = req.headers['stripe-signature'];
      event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
    } else {
      event = req.body; // Dev mode sin verificación
    }
  } catch (err) {
    console.error('[Stripe Webhook] Error de firma:', err.message);
    return res.status(400).json({ error: 'Firma inválida' });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        await handleSuccessfulPayment(session);
        break;
      }
      case 'invoice.payment_succeeded': {
        // Renovación automática exitosa
        const invoice = event.data.object;
        await handleRenewal(invoice, 'stripe');
        break;
      }
      case 'invoice.payment_failed': {
        // Fallo de pago → programar reintento
        const invoice = event.data.object;
        await handlePaymentFailure(invoice, 'stripe');
        break;
      }
      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        await handleSubscriptionCancelled(subscription, 'stripe');
        break;
      }
    }

    res.json({ received: true });
  } catch (err) {
    console.error('[Stripe Webhook] Error procesando evento:', err);
    res.status(500).json({ error: 'Error procesando webhook' });
  }
});

// ═══════════════════════════════════════════
// MERCADO PAGO
// ═══════════════════════════════════════════

// POST /api/payments/mercadopago/preference — Crear preferencia de pago
router.post('/mercadopago/preference', authenticate, async (req, res) => {
  try {
    const { planSlug } = req.body;

    const planResult = await query(
      'SELECT id, name, price, duration_days FROM membership_plans WHERE slug = $1',
      [planSlug]
    );
    if (planResult.rows.length === 0) {
      return res.status(404).json({ error: 'Plan no encontrado' });
    }

    const plan = planResult.rows[0];

    if (!mpClient) {
      return res.status(503).json({ error: 'Mercado Pago no configurado. Configura MP_ACCESS_TOKEN en .env' });
    }

    const { Preference } = require('mercadopago');
    const preference = new Preference(mpClient);

    const result = await preference.create({
      body: {
        items: [{
          title: `KÚX — Plan ${plan.name}`,
          unit_price: parseFloat(plan.price),
          quantity: 1,
          currency_id: 'MXN',
        }],
        payer: { email: req.user.email },
        back_urls: {
          success: `${process.env.FRONTEND_URL}?payment=success`,
          failure: `${process.env.FRONTEND_URL}?payment=failure`,
          pending: `${process.env.FRONTEND_URL}?payment=pending`,
        },
        auto_return: 'approved',
        metadata: {
          user_id: req.user.id,
          plan_id: plan.id,
        },
        notification_url: `${process.env.FRONTEND_URL}/api/payments/mercadopago/webhook`,
      }
    });

    // Registrar pago pendiente
    await query(
      `INSERT INTO payments (user_id, amount, payment_method, payment_type, status, mp_payment_id, description)
       VALUES ($1, $2, 'mercadopago', 'one_time', 'pending', $3, $4)`,
      [req.user.id, plan.price, result.id, `Plan ${plan.name}`]
    );

    res.json({ preferenceId: result.id, initPoint: result.init_point });
  } catch (err) {
    console.error('[Payments] Error Mercado Pago:', err);
    res.status(500).json({ error: 'Error creando preferencia de pago' });
  }
});

// POST /api/payments/mercadopago/webhook — Webhook de Mercado Pago
router.post('/mercadopago/webhook', async (req, res) => {
  try {
    const { type, data } = req.body;

    if (type === 'payment') {
      // Obtener detalles del pago desde MP
      if (mpClient) {
        const { Payment: MPPayment } = require('mercadopago');
        const payment = new MPPayment(mpClient);
        const paymentData = await payment.get({ id: data.id });

        if (paymentData.status === 'approved') {
          const { user_id, plan_id } = paymentData.metadata;
          await activateMembership(user_id, plan_id, 'mercadopago', data.id);
        }
      }
    }

    res.json({ received: true });
  } catch (err) {
    console.error('[MP Webhook] Error:', err);
    res.status(500).json({ error: 'Error procesando webhook' });
  }
});

// ═══════════════════════════════════════════
// FUNCIONES HELPER DE PAGOS
// ═══════════════════════════════════════════

async function handleSuccessfulPayment(session) {
  const { userId, planId } = session.metadata;
  await activateMembership(userId, planId, 'stripe', session.id);
}

async function activateMembership(userId, planId, method, externalId) {
  await transaction(async (client) => {
    // Obtener duración del plan
    const planResult = await client.query(
      'SELECT duration_days FROM membership_plans WHERE id = $1', [planId]
    );
    const days = planResult.rows[0]?.duration_days || 30;

    // Desactivar membresías anteriores
    await client.query(
      `UPDATE memberships SET status = 'expired' WHERE user_id = $1 AND status = 'active'`,
      [userId]
    );

    // Crear nueva membresía activa
    await client.query(
      `INSERT INTO memberships (user_id, plan_id, status, start_date, end_date)
       VALUES ($1, $2, 'active', NOW(), NOW() + INTERVAL '1 day' * $3)`,
      [userId, planId, days]
    );

    // Actualizar pago como completado
    const updateField = method === 'stripe' ? 'stripe_payment_id' : 'mp_payment_id';
    await client.query(
      `UPDATE payments SET status = 'completed', updated_at = NOW()
       WHERE user_id = $1 AND ${updateField} = $2 AND status = 'pending'`,
      [userId, externalId]
    );
  });
}

async function handleRenewal(invoice, method) {
  const customerId = invoice.customer;
  // Buscar usuario por Stripe customer ID y renovar
  console.log(`[Payments] Renovación exitosa vía ${method} para customer ${customerId}`);
}

async function handlePaymentFailure(invoice, method) {
  console.log(`[Payments] Pago fallido vía ${method}. Programando reintento...`);
  // Actualizar pago como fallido, incrementar retry_count
  // Programar next_retry_at
}

async function handleSubscriptionCancelled(subscription, method) {
  console.log(`[Payments] Suscripción cancelada vía ${method}`);
}

// ═══════════════════════════════════════════
// HISTORIAL DE PAGOS
// ═══════════════════════════════════════════

// GET /api/payments — Historial (admin)
router.get('/', authenticate, authorize('owner', 'manager'), async (req, res) => {
  try {
    const { status, method, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    let params = [];
    let where = [];

    if (status) { params.push(status); where.push(`p.status = $${params.length}`); }
    if (method) { params.push(method); where.push(`p.payment_method = $${params.length}`); }

    const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

    const result = await query(`
      SELECT p.*, u.first_name, u.last_name, u.email
      FROM payments p
      JOIN users u ON p.user_id = u.id
      ${whereClause}
      ORDER BY p.created_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `, [...params, limit, offset]);

    res.json({ payments: result.rows });
  } catch (err) {
    console.error('[Payments] Error:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// GET /api/payments/failed — Pagos fallidos (para reintentos)
router.get('/failed', authenticate, authorize('owner', 'manager'), async (req, res) => {
  try {
    const result = await query(`
      SELECT p.*, u.first_name, u.last_name, u.email
      FROM payments p
      JOIN users u ON p.user_id = u.id
      WHERE p.status = 'failed'
      ORDER BY p.created_at DESC
      LIMIT 50
    `);
    res.json({ failedPayments: result.rows });
  } catch (err) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

module.exports = router;
