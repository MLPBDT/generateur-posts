// api/verify-magic-link.js — Vérifie le token du lien magique, crée une session
// longue durée, et redirige vers l'app avec le token de session en query param.

async function kvGet(key) {
  const url = process.env.KV_REST_API_URL || process.env.STORAGE_KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.STORAGE_KV_REST_API_TOKEN;
  const response = await fetch(`${url}/get/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await response.json();
  return data.result;
}

async function kvSet(key, value, expirationSeconds) {
  const url = process.env.KV_REST_API_URL || process.env.STORAGE_KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.STORAGE_KV_REST_API_TOKEN;
  let endpoint = `${url}/set/${encodeURIComponent(key)}/${encodeURIComponent(value)}`;
  if (expirationSeconds) endpoint += `/EX/${expirationSeconds}`;
  await fetch(endpoint, { headers: { Authorization: `Bearer ${token}` } });
}

async function kvDel(key) {
  const url = process.env.KV_REST_API_URL || process.env.STORAGE_KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.STORAGE_KV_REST_API_TOKEN;
  await fetch(`${url}/del/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

function generateToken() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let token = '';
  for (let i = 0; i < 48; i++) {
    token += chars[Math.floor(Math.random() * chars.length)];
  }
  return token;
}

export default async function handler(req, res) {
  try {
    const { token } = req.query;
    if (!token) {
      res.writeHead(302, { Location: '/?auth_error=missing_token' });
      return res.end();
    }

    const email = await kvGet(`magic:${token}`);
    if (!email) {
      res.writeHead(302, { Location: '/?auth_error=expired' });
      return res.end();
    }

    // Le lien magique ne doit servir qu'une fois
    await kvDel(`magic:${token}`);

    // Crée une session longue durée (30 jours) liée à cet email
    const sessionToken = generateToken();
    await kvSet(`session:${sessionToken}`, email, 60 * 60 * 24 * 30);

    res.writeHead(302, { Location: `/?session=${sessionToken}` });
    return res.end();

  } catch (err) {
    res.writeHead(302, { Location: '/?auth_error=server_error' });
    return res.end();
  }
}
