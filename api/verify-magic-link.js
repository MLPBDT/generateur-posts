// api/verify-magic-link.js — Vérifie le lien magique, crée une session de 30 jours, redirige vers l'app.
import { kv } from "./_lib/kv.js";
import { randomToken } from "./_lib/util.js";

export default async function handler(req, res) {
  const go = (loc) => { res.writeHead(302, { Location: loc }); res.end(); };
  try {
    const { token } = req.query;
    if (!token) return go("/?auth_error=missing_token");
    const email = await kv.get(`magic:${token}`);
    if (!email) return go("/?auth_error=expired");
    await kv.del(`magic:${token}`); // usage unique
    const sessionToken = randomToken(48);
    await kv.set(`session:${sessionToken}`, email, 60 * 60 * 24 * 30);
    return go(`/?session=${sessionToken}`);
  } catch {
    return go("/?auth_error=server_error");
  }
}
