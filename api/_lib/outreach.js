// Prospection email B2B : boîte dédiée (Google Workspace, SMTP), faible volume, 3 messages max, règles CNIL B2B.
import nodemailer from "nodemailer";
import { kv } from "./kv.js";
import { allProspects, saveProspect, isSuppressed, shortName } from "./prospects.js";
import { sign, SITE, APP, LEGAL } from "./util.js";

const DAY = 864e5;
const GAP = { sent1: 4 * DAY, sent2: 6 * DAY }; // J0, J+4, J+10

function boxes() {
  const users = (process.env.OUTREACH_SMTP_USERS || "").split(",").map((s) => s.trim()).filter(Boolean);
  const pw = (process.env.OUTREACH_SMTP_PASSWORDS || "").split(",").map((s) => s.trim());
  return users.map((u, i) => ({ user: u, pass: pw[i] || pw[0] }));
}
const transport = (b) => nodemailer.createTransport({ host: process.env.OUTREACH_SMTP_HOST || "smtp.gmail.com", port: Number(process.env.OUTREACH_SMTP_PORT || 587), secure: Number(process.env.OUTREACH_SMTP_PORT) === 465, auth: { user: b.user, pass: b.pass } });

export const demoUrl = (p, step) => `${SITE()}/demo/${p.slug}?s=${step}`;
export const stopToken = (p) => sign({ e: p.email, s: p.slug });
const stopUrl = (p) => `${SITE()}/stop/${stopToken(p)}`;
const sender = () => (process.env.OUTREACH_SENDER_NAME || "Mattéo — PostIA").split("—")[0].trim();
const fmtRating = (r) => (r == null ? null : String(r).replace(".", ","));

export function composeEmail(p0, step) {
  const name = shortName(p0.name);
  const me = sender();
  const host = (() => { try { return new URL(p0.website || "").hostname.replace(/^www\./, ""); } catch { return "votre site internet"; } })();
  const footer = `\n\n--\n${me} · PostIA · ${LEGAL.name} · SIRET ${LEGAL.siret} · ${LEGAL.address}\n` +
    `Pourquoi ce message : votre adresse professionnelle est publiée sur ${host} et ce message concerne votre activité. ` +
    `Pour ne plus recevoir aucun message : ${stopUrl(p0)} — Vos droits : ${SITE()}/confidentialite`;
  const proof = p0.rating && p0.reviewCount ? ` (${fmtRating(p0.rating)}/5 sur ${p0.reviewCount} avis Google, bravo)` : "";
  const liked = p0.liked ? `\n\nVos clients parlent surtout de : ${p0.liked.charAt(0).toLowerCase() + p0.liked.slice(1)}. C'est le fil rouge des posts.` : "";
  const subject1 = `3 posts prêts pour ${name}`;
  if (step === 1) return {
    subject: subject1,
    text: `Bonjour,\n\nJe suis Mattéo, je développe PostIA, un outil qui écrit les publications Instagram, Facebook et Google des commerces indépendants.\n\nJe me suis permis de préparer 3 publications pour ${name}, à partir de ce que vos clients disent de vous${proof}.${liked}\n\nElles sont prêtes à copier-coller, c'est offert et sans inscription :\n${demoUrl(p0, 1)}\n\nSi le style vous plaît, PostIA en écrit autant que vous voulez en 30 secondes : 14 €/mois, 7 jours d'essai gratuit, sans engagement.\n\nBonne journée,\n${me}${footer}`,
  };
  if (step === 2) return {
    subject: `Re: ${subject1}`,
    text: `Bonjour,\n\nPetite relance au cas où mon message serait passé à la trappe : vos 3 publications sont toujours là, prêtes à poster :\n${demoUrl(p0, 2)}\n\nMême si l'outil ne vous intéresse pas, gardez-les, elles sont à vous.\n\n${me}${footer}`,
  };
  return {
    subject: `Dernier message — ${name}`,
    text: `Bonjour,\n\nJe ne vous écrirai plus après celui-ci. Si un jour vous manquez d'idées ou de temps pour vos réseaux, PostIA écrit vos posts en 30 secondes à partir d'une simple description de votre commerce : ${demoUrl(p0, 3)}\n\nBonne continuation,\n${me}${footer}`,
  };
}

const parisNow = () => {
  const d = new Date();
  return { hour: Number(d.toLocaleString("en-GB", { timeZone: "Europe/Paris", hour: "2-digit", hour12: false })), dow: d.toLocaleString("en-GB", { timeZone: "Europe/Paris", weekday: "short" }), day: d.toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" }) };
};

export async function runOutreach({ dryRun = false, log = () => {}, maxPerRun = 2 } = {}) {
  if (!dryRun && process.env.OUTREACH_ENABLED !== "1") { log("Prospection désactivée (OUTREACH_ENABLED ≠ 1)."); return 0; }
  const { hour, dow, day } = parisNow();
  if (!dryRun && (hour < 9 || hour > 17 || dow === "Sat" || dow === "Sun")) { log("Hors plage d'envoi (lun-ven 9h-18h)."); return 0; }
  const bx = boxes();
  if (!bx.length && !dryRun) { log("Aucune boîte d'envoi (OUTREACH_SMTP_USERS)."); return 0; }
  const limit = Number(process.env.OUTREACH_DAILY_LIMIT_PER_BOX || 5);
  const now = Date.now();
  const due = (await allProspects()).filter((p) => p.email && (
    (p.status === "ready" && p.posts?.length) ||
    (p.status === "sent1" && now - +new Date(p.lastSentAt) > GAP.sent1) ||
    (p.status === "sent2" && now - +new Date(p.lastSentAt) > GAP.sent2)
  ));
  // relances d'abord (même boîte), puis les nouveaux du plus ancien au plus récent
  due.sort((a, b) => Number(b.status !== "ready") - Number(a.status !== "ready") || String(a.createdAt).localeCompare(String(b.createdAt)));
  let sent = 0;
  for (const p of due) {
    if (sent >= maxPerRun) break;
    if (await isSuppressed(p.email)) { p.status = "unsubscribed"; await saveProspect(p); continue; }
    const box = (p.box && bx.find((b) => b.user === p.box)) || bx[sent % Math.max(1, bx.length)];
    const countKey = `outreach-count:${day}:${box?.user || "dry"}`;
    if (!dryRun && ((await kv.get(countKey)) || 0) >= limit) { log(`Limite du jour atteinte (${limit}).`); break; }
    const step = p.status === "ready" ? 1 : p.status === "sent1" ? 2 : 3;
    const m = composeEmail(p, step);
    if (dryRun) { log(`[simulation] ${p.email} — ${m.subject}`); sent++; continue; }
    try {
      await transport(box).sendMail({
        from: `"${sender().replace(/"/g, "")}" <${box.user}>`, to: p.email, subject: m.subject, text: m.text,
        headers: { "List-Unsubscribe": `<${APP()}/api/pro?a=stop&t=${stopToken(p)}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
      });
      p.status = step === 1 ? "sent1" : step === 2 ? "sent2" : "sent3";
      p.lastSentAt = new Date().toISOString(); p.box = box.user;
      await saveProspect(p);
      await kv.incr(countKey, 60 * 60 * 36);
      sent++;
      log(`→ ${p.email} (message ${step})`);
    } catch (e) {
      const rcpt = e.command === "RCPT TO" || /user unknown|does not exist|no such user|mailbox unavailable|recipient address rejected|invalid recipient/i.test(e.message);
      if (rcpt && e.responseCode >= 500) { p.status = "bounced"; p.bounceReason = String(e.message).slice(0, 200); await saveProspect(p); log(`! ${p.email} : adresse refusée`); continue; }
      const msg = `ERREUR SMTP ${box.user} [${e.code || ""} ${e.responseCode || ""}] ${e.message}`;
      log(msg); await kv.set("outreach:lastError", { at: new Date().toISOString(), msg }, 60 * 60 * 24 * 7);
      break;
    }
  }
  return sent;
}

export async function smtpTest(to, log) {
  const bx = boxes();
  if (!bx.length) { log("Aucune boîte : OUTREACH_SMTP_USERS vide"); return; }
  for (const b of bx) {
    try {
      const t = transport(b); await t.verify();
      await t.sendMail({ from: `"${sender()}" <${b.user}>`, to, subject: `Bonjour de la part de PostIA`, text: `Bonjour,\n\nCeci est un message de vérification de la boîte ${b.user}.\nOuvre-le → ⋮ → Afficher l'original : SPF, DKIM et DMARC doivent être PASS.\n\n${sender()}` });
      await kv.del("outreach:lastError");
      log(`OK ${b.user} → message de test envoyé à ${to}`);
    } catch (e) { log(`ERREUR ${b.user} [${e.code || ""} ${e.responseCode || ""}] ${e.message}`); }
  }
}
