// Upstash Redis (REST) — tiny client shared by every endpoint.
// All PostIA keys are prefixed (default "po:") so the database can be shared with other projects.
const P = process.env.POSTIA_DB_PREFIX ?? "po:";

function creds() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || process.env.STORAGE_KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || process.env.STORAGE_KV_REST_API_TOKEN;
  if (!url || !token) throw new Error("Base de données non connectée (KV_REST_API_URL / KV_REST_API_TOKEN manquantes)");
  return { url, token };
}

// raw command, e.g. cmd("SET", "k", "v", "EX", 60) — keys are NOT prefixed here
export async function cmd(...args) {
  const { url, token } = creds();
  const r = await fetch(url, { method: "POST", headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(args.map(String)) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || d.error) throw new Error(`Redis ${r.status}: ${d.error || "erreur"}`);
  return d.result;
}

const k = (key) => P + key;
const enc = (v) => (typeof v === "string" ? v : JSON.stringify(v));
const dec = (v) => { if (v == null) return null; try { return JSON.parse(v); } catch { return v; } };

export const kv = {
  async get(key) { return dec(await cmd("GET", k(key))); },
  async set(key, value, ttlSec) { return ttlSec ? cmd("SET", k(key), enc(value), "EX", ttlSec) : cmd("SET", k(key), enc(value)); },
  async del(key) { return cmd("DEL", k(key)); },
  async incr(key, ttlSec) { const n = await cmd("INCR", k(key)); if (ttlSec && n === 1) await cmd("EXPIRE", k(key), ttlSec); return n; },
  async sadd(key, ...m) { if (m.length) return cmd("SADD", k(key), ...m); },
  async srem(key, m) { return cmd("SREM", k(key), m); },
  async smembers(key) { return (await cmd("SMEMBERS", k(key))) || []; },
  async sismember(key, m) { return (await cmd("SISMEMBER", k(key), m)) === 1; },
  async mget(keys) { if (!keys.length) return []; return ((await cmd("MGET", ...keys.map(k))) || []).map(dec); },
  async lpush(key, v, max = 200) { await cmd("LPUSH", k(key), enc(v)); await cmd("LTRIM", k(key), 0, max - 1); },
  async lrange(key, a = 0, b = 50) { return ((await cmd("LRANGE", k(key), a, b)) || []).map(dec); },
};

export async function logEvent(type, data = {}) {
  try { await kv.lpush("events", { type, at: new Date().toISOString(), ...data }, 300); } catch { /* best effort */ }
}
