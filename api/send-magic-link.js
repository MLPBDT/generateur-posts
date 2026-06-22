// api/send-magic-link.js — Génère un token unique et envoie un email avec le lien de connexion.

async function kvSet(key, value, expirationSeconds) {
  const url = process.env.KV_REST_API_URL || process.env.STORAGE_KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.STORAGE_KV_REST_API_TOKEN;
  let endpoint = `${url}/set/${encodeURIComponent(key)}/${encodeURIComponent(value)}`;
  if (expirationSeconds) endpoint += `/EX/${expirationSeconds}`;
  await fetch(endpoint, { headers: { Authorization: `Bearer ${token}` } });
}

function generateToken() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let token = '';
  for (let i = 0; i < 32; i++) {
    token += chars[Math.floor(Math.random() * chars.length)];
  }
  return token;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const { email } = req.body;
    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: "Email invalide" });
    }

    const cleanEmail = email.trim().toLowerCase();
    const token = generateToken();

    // Le token expire dans 15 minutes (900 secondes) et est lié à l'email
    await kvSet(`magic:${token}`, cleanEmail, 900);

    const origin = req.headers.origin || `https://${req.headers.host}`;
    const magicLink = `${origin}/api/verify-magic-link?token=${token}`;

    const emailHtml = `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px">
        <h2 style="color:#0f0f0f">Connexion à PostIA ✦</h2>
        <p style="color:#444;font-size:15px;line-height:1.6">
          Clique sur le bouton ci-dessous pour te connecter. Ce lien est valable 15 minutes.
        </p>
        <a href="${magicLink}" style="display:inline-block;background:#c8f135;color:#000;text-decoration:none;font-weight:bold;padding:14px 28px;border-radius:10px;margin:16px 0">
          Me connecter à PostIA
        </a>
        <p style="color:#888;font-size:13px;margin-top:20px">
          Si tu n'as pas demandé ce lien, ignore simplement cet email.
        </p>
      </div>
    `;

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + process.env.RESEND_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "PostIA <onboarding@resend.dev>",
        to: cleanEmail,
        subject: "Ton lien de connexion PostIA",
        html: emailHtml,
      }),
    });

    if (!resendRes.ok) {
      const errText = await resendRes.text();
      throw new Error("Erreur envoi email: " + errText.substring(0, 200));
    }

    return res.status(200).json({ sent: true });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
