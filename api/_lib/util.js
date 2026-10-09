import crypto from "crypto";

const SECRET = () => process.env.APP_SECRET || process.env.ADMIN_PASSWORD || "";

export function sign(payload, ttlSec = 60 * 60 * 24 * 365) {
  if (!SECRET()) throw new Error("APP_SECRET manquante");
  const body = Buffer.from(JSON.stringify({ ...payload, x: Math.floor(Date.now() / 1000) + ttlSec })).toString("base64url");
  const mac = crypto.createHmac("sha256", SECRET()).update(body).digest("base64url").slice(0, 32);
  return `${body}.${mac}`;
}
export function verify(token) {
  try {
    const [body, mac] = String(token || "").split(".");
    const exp = crypto.createHmac("sha256", SECRET()).update(body).digest("base64url").slice(0, 32);
    if (!SECRET() || !mac || mac.length !== exp.length || !crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(exp))) return null;
    const d = JSON.parse(Buffer.from(body, "base64url").toString());
    if (d.x && d.x < Date.now() / 1000) return null;
    return d;
  } catch { return null; }
}

export const randomToken = (n = 32) => crypto.randomBytes(n).toString("base64url").slice(0, n);
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export const SITE = () => (process.env.POSTIA_SITE_URL || "https://www.postia-app.fr").replace(/\/$/, "");
export const APP = () => (process.env.POSTIA_APP_URL || "https://generateur-posts.vercel.app").replace(/\/$/, "");

export const LEGAL = {
  name: process.env.BUSINESS_LEGAL_NAME || "Mattéo Fauvre — Entrepreneur individuel",
  siret: process.env.BUSINESS_SIRET || "106 017 197 00018",
  address: process.env.BUSINESS_ADDRESS || "112 impasse du Serpolet, 83210 La Farlède",
};

export function html(res, status, body) {
  res.statusCode = status;
  res.setHeader("content-type", "text/html; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(body);
}
export function redirect(res, url) { res.statusCode = 302; res.setHeader("location", url); res.end(); }
