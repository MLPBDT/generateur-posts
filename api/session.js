// api/session.js — Résout un token de session en email.
import { kv } from "./_lib/kv.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });
  try {
    const { sessionToken } = req.body || {};
    if (!sessionToken) return res.status(400).json({ error: "Token manquant" });
    const email = await kv.get(`session:${sessionToken}`);
    return res.status(200).json({ email: email || null });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
