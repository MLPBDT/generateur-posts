// api/check-status.js — Vérifie si un email a un abonnement actif.
// Le front appelle cet endpoint pour savoir s'il doit débloquer la fiche entreprise.

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "Email manquant" });

    const url = process.env.KV_REST_API_URL || process.env.STORAGE_KV_REST_API_URL;
    const token = process.env.KV_REST_API_TOKEN || process.env.STORAGE_KV_REST_API_TOKEN;

    const key = `user:${email.toLowerCase()}`;
    const response = await fetch(`${url}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await response.json();

    const isPaid = data.result === 'active';
    return res.status(200).json({ isPaid });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
