// api/stripe-webhook.js — Reçoit les événements Stripe et débloque l'accès du client.
//
// Stripe envoie ici une notification chaque fois qu'un paiement réussit, qu'un
// abonnement se termine, etc. On vérifie que ça vient bien de Stripe (signature),
// puis on enregistre le statut du client dans Upstash Redis (email -> plan).

export const config = {
  api: {
    bodyParser: false, // on a besoin du corps brut pour vérifier la signature Stripe
  },
};

async function getRawBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

// Vérifie la signature Stripe sans dépendance externe (HMAC SHA256 maison)
async function verifyStripeSignature(rawBody, sigHeader, secret) {
  const crypto = await import('crypto');
  const parts = sigHeader.split(',').reduce((acc, part) => {
    const [k, v] = part.split('=');
    acc[k] = v;
    return acc;
  }, {});

  const timestamp = parts.t;
  const signature = parts.v1;
  if (!timestamp || !signature) return false;

  const signedPayload = `${timestamp}.${rawBody.toString('utf8')}`;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(signedPayload, 'utf8')
    .digest('hex');

  // Comparaison à temps constant pour éviter les attaques de timing
  if (expected.length !== signature.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

async function kvSet(key, value) {
  const url = process.env.KV_REST_API_URL || process.env.STORAGE_KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.STORAGE_KV_REST_API_TOKEN;
  await fetch(`${url}/set/${encodeURIComponent(key)}/${encodeURIComponent(value)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const rawBody = await getRawBody(req);
    const sig = req.headers['stripe-signature'];
    const secret = process.env.STRIPE_WEBHOOK_SECRET;

    const isValid = await verifyStripeSignature(rawBody, sig, secret);
    if (!isValid) {
      return res.status(400).json({ error: "Signature invalide" });
    }

    const event = JSON.parse(rawBody.toString('utf8'));

    // ── Paiement initial réussi (fin de l'essai ou souscription directe) ──
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const email = session.customer_details?.email || session.customer_email;
      if (email) {
        await kvSet(`user:${email.toLowerCase()}`, 'active');
      }
    }

    // ── Abonnement annulé ou paiement échoué de façon définitive ──
    if (event.type === 'customer.subscription.deleted') {
      const sub = event.data.object;
      // On récupère l'email via le customer Stripe
      const customerRes = await fetch(`https://api.stripe.com/v1/customers/${sub.customer}`, {
        headers: { Authorization: 'Bearer ' + process.env.STRIPE_SECRET_KEY },
      });
      const customer = await customerRes.json();
      if (customer.email) {
        await kvSet(`user:${customer.email.toLowerCase()}`, 'inactive');
      }
    }

    return res.status(200).json({ received: true });

  } catch (err) {
    console.error('Webhook error:', err);
    return res.status(500).json({ error: err.message });
  }
}
