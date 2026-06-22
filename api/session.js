// api/session.js — Résout un token de session en email, pour que le front
// sache qui est connecté sans avoir à redemander l'email à chaque fois.

async function kvGet(key) {
  const url = process.env.KV_REST_API_URL || process.env.STORAGE_KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.STORAGE_KV_REST_API_TOKEN;
  const response = await fetch(`${url}/get/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await response.json();
  return data.result;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const { sessionToken } = req.body;
    if (!sessionToken) return res.status(400).json({ error: "Token manquant" });

    const email = await kvGet(`session:${sessionToken}`);
    if (!email) return res.status(200).json({ email: null });

    return res.status(200).json({ email });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
