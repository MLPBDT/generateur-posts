// api/check-status.js — Dit au front si la session connectée a un abonnement actif.
// On ne fait confiance qu'au jeton de session (pas à un email envoyé par le navigateur).
import { kv } from "./_lib/kv.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });
  try {
    const { sessionToken } = req.body || {};
    if (!sessionToken) return res.status(200).json({ isPaid: false });
    const email = await kv.get(`session:${sessionToken}`);
    if (!email) return res.status(200).json({ isPaid: false });
    const status = await kv.get(`user:${String(email).toLowerCase()}`);
    return res.status(200).json({ isPaid: status === "active", email });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
