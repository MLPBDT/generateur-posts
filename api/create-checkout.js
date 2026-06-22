// api/create-checkout.js — Crée une session de paiement Stripe Checkout
// avec 7 jours d'essai gratuit, puis facturation récurrente mensuelle.

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const { plan } = req.body; // 'starter' ou 'pro'

    const PRICE_IDS = {
      starter: process.env.STRIPE_PRICE_STARTER,
      pro: process.env.STRIPE_PRICE_PRO,
    };

    const priceId = PRICE_IDS[plan];
    if (!priceId) {
      return res.status(400).json({ error: "Plan invalide" });
    }

    const origin = req.headers.origin || `https://${req.headers.host}`;

    const params = new URLSearchParams();
    params.append("mode", "subscription");
    params.append("payment_method_types[0]", "card");
    params.append("line_items[0][price]", priceId);
    params.append("line_items[0][quantity]", "1");
    params.append("subscription_data[trial_period_days]", "7");
    params.append("success_url", `${origin}/?success=true&plan=${plan}`);
    params.append("cancel_url", `${origin}/?canceled=true`);
    params.append("allow_promotion_codes", "true");

    const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + process.env.STRIPE_SECRET_KEY,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error?.message || "Erreur Stripe");
    }

    return res.status(200).json({ url: data.url });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
