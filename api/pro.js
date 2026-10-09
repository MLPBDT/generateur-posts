// api/pro.js — un seul point d'entrée (limite de fonctions Vercel) pour :
//   ?a=welcome  retour de paiement Stripe → connexion automatique
//   ?a=demo     page démo privée d'un prospect            (/demo/:slug)
//   ?a=stop     désinscription en un clic                  (/stop/:t)
//   ?a=cron     tâche planifiée (cron-job.org, ?key=CRON_SECRET)
//   ?a=admin    pilotage (/admin-pro)
import crypto from "crypto";
import { kv, cmd, logEvent } from "./_lib/kv.js";
import { esc, html, redirect, verify, randomToken, SITE, APP, LEGAL } from "./_lib/util.js";
import { getProspect, saveProspect, allProspects, suppress, sourceOne, makeDemo, QUERIES, shortName } from "./_lib/prospects.js";
import { runOutreach, smtpTest, composeEmail, stopToken } from "./_lib/outreach.js";

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  const a = req.query.a;
  try {
    if (a === "welcome") return await welcome(req, res);
    if (a === "demo") return await demo(req, res);
    if (a === "stop") return await stop(req, res);
    if (a === "cron") return await cron(req, res);
    if (a === "admin") return await admin(req, res);
    return html(res, 404, page("Introuvable", `<p>Page introuvable.</p>`));
  } catch (e) {
    console.error(e);
    if (a === "cron") return res.status(500).json({ error: e.message });
    return html(res, 500, page("Erreur", `<p>Une erreur est survenue. Réessayez dans un instant.</p><p class="muted">${esc(e.message)}</p>`));
  }
}

// ---------------------------------------------------------------- layout
const CSS = `*{box-sizing:border-box;margin:0;padding:0}body{font-family:Inter,system-ui,sans-serif;background:#0f0f0f;color:#f0f0f0;line-height:1.55;padding:24px 16px 48px}
.wrap{max-width:760px;margin:0 auto}a{color:#c8f135}.logo{font-weight:700;color:#c8f135;font-size:18px;text-decoration:none}
h1{font-size:28px;line-height:1.2;margin:18px 0 6px}h2{font-size:20px;margin:28px 0 12px}.muted{color:#888;font-size:14px}
.card{background:#1a1a1a;border:1px solid #2a2a2a;border-radius:14px;padding:18px;margin:12px 0}.tag{display:inline-block;font-size:12px;font-weight:600;color:#000;background:#c8f135;border-radius:99px;padding:3px 10px}
.post{white-space:pre-wrap;margin:12px 0 14px;font-size:15px}.btn{display:inline-block;background:#c8f135;color:#000;font-weight:700;text-decoration:none;border:0;border-radius:10px;padding:13px 22px;font-size:15px;cursor:pointer}
.btn2{background:transparent;color:#c8f135;border:1px solid #c8f135;border-radius:10px;padding:8px 14px;font-weight:600;cursor:pointer;font-size:13px}
.hero{background:linear-gradient(135deg,#1d2410,#121212);border:1px solid #2f3a17;border-radius:16px;padding:22px;margin-top:14px}
.cta{text-align:center;padding:26px 18px}table{width:100%;border-collapse:collapse;font-size:13px}td,th{border-bottom:1px solid #2a2a2a;padding:6px 4px;text-align:left;vertical-align:top}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px}.stat{background:#1a1a1a;border:1px solid #2a2a2a;border-radius:12px;padding:12px}.stat b{font-size:22px;display:block}
pre{white-space:pre-wrap;font-size:12px;background:#111;border:1px solid #2a2a2a;border-radius:10px;padding:12px;margin-top:10px}input{background:#111;border:1px solid #333;color:#fff;border-radius:8px;padding:10px;font-size:15px}
.foot{margin-top:36px;font-size:12px;color:#666}`;
function page(title, body, { noindex = true, wide = false } = {}) {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${noindex ? '<meta name="robots" content="noindex,nofollow">' : ""}<title>${esc(title)}</title><link rel="icon" href="${SITE()}/favicon.svg"><style>${CSS}${wide ? ".wrap{max-width:1150px}" : ""}</style></head><body><div class="wrap"><a class="logo" href="${SITE()}">PostIA ✦</a>${body}</div></body></html>`;
}

// ---------------------------------------------------------------- Stripe return
async function welcome(req, res) {
  const cs = String(req.query.cs || "");
  if (!/^cs_[A-Za-z0-9_]+$/.test(cs)) return redirect(res, "/?success=true");
  const r = await fetch(`https://api.stripe.com/v1/checkout/sessions/${cs}`, { headers: { Authorization: "Bearer " + process.env.STRIPE_SECRET_KEY } });
  const s = await r.json();
  const email = (s.customer_details?.email || s.customer_email || "").toLowerCase();
  if (!r.ok || s.status !== "complete" || !email) return redirect(res, "/?success=true");
  if ((await kv.get(`user:${email}`)) !== "active") await kv.set(`user:${email}`, "active"); // au cas où le webhook arrive après
  const token = randomToken(48);
  await kv.set(`session:${token}`, email, 60 * 60 * 24 * 30);
  return redirect(res, `/?session=${token}&welcome=1`);
}

// ---------------------------------------------------------------- demo page
const NET_ICON = { instagram: "📸 Instagram", facebook: "👍 Facebook", google: "📍 Fiche Google" };
async function demo(req, res) {
  const slug = String(req.query.slug || "");
  const p = /^[a-z0-9-]{3,80}$/.test(slug) ? await getProspect(slug) : null;
  if (!p || !p.posts?.length) return html(res, 404, page("Page expirée", `<h1>Cette page a expiré</h1><p class="muted">Vous pouvez générer vos posts gratuitement sur <a href="${APP()}">PostIA</a>.</p>`));
  if (!isAdmin(req)) {
    p.views = (p.views || 0) + 1; p.lastViewAt = new Date().toISOString();
    if (p.views === 1) await logEvent("demo_view", { p: p.slug, name: p.name, s: req.query.s || null });
    await saveProspect(p);
  }
  const name = shortName(p.name);
  const biz = `${p.category || p.trade || "commerce"} ${name} à ${p.city}${p.liked ? `, apprécié pour ${p.liked}` : ""}`.slice(0, 180);
  const app = `${APP()}/?ref=${encodeURIComponent(p.slug)}&biz=${encodeURIComponent(biz)}`;
  const cards = p.posts.map((x, i) => `<div class="card"><span class="tag">${esc(NET_ICON[x.network.toLowerCase()] || x.network)}</span>${x.angle ? ` <span class="muted">· ${esc(x.angle)}</span>` : ""}
    <div class="post" id="p${i}">${esc(x.text)}</div><button class="btn2" onclick="cp(${i},this)">Copier le texte</button></div>`).join("");
  const body = `<div class="hero"><div class="muted" style="color:#b8d86a">Préparé pour</div><h1>${esc(name)}</h1>
    <div class="muted">${esc([p.category, p.city].filter(Boolean).join(" · "))}${p.rating ? ` · ${String(p.rating).replace(".", ",")}/5 sur Google (${p.reviewCount} avis)` : ""}</div>
    ${p.liked ? `<p style="margin-top:12px">Ce que vos clients aiment : <b>${esc(p.liked)}</b>. C'est le fil rouge des publications ci-dessous.</p>` : ""}</div>
    <h2>Vos 3 publications, prêtes à poster</h2><p class="muted">Copiez, collez, publiez. C'est offert, même si vous n'utilisez jamais PostIA.</p>${cards}
    <div class="card cta"><h2 style="margin-top:0">Des posts comme ça, quand vous voulez, en 30 secondes</h2>
    <p class="muted" style="margin-bottom:18px">Décrivez une nouveauté, une promo ou un événement : PostIA écrit vos posts Instagram, Facebook, TikTok et Google, avec vos photos ou une image IA. 3 essais gratuits sans inscription, puis 14 €/mois avec 7 jours d'essai.</p>
    <a class="btn" href="${esc(app)}">Créer mes prochains posts gratuitement →</a></div>
    <p class="foot">Page privée non référencée, supprimée automatiquement sous 4 mois. Informations issues de votre fiche Google publique. Éditeur : ${esc(LEGAL.name)}, SIRET ${esc(LEGAL.siret)}. <a href="${SITE()}/confidentialite">Confidentialité</a> · <a href="${SITE()}/stop/${esc(stopToken(p))}">Ne plus recevoir de message</a></p>
    <script>function cp(i,b){navigator.clipboard.writeText(document.getElementById('p'+i).innerText).then(function(){b.textContent='Copié ✓';setTimeout(function(){b.textContent='Copier le texte'},1800)})}</script>`;
  return html(res, 200, page(`3 publications pour ${name} — PostIA`, body));
}

// ---------------------------------------------------------------- unsubscribe
async function stop(req, res) {
  const d = verify(req.query.t);
  if (!d?.e) return html(res, 400, page("Lien invalide", `<h1>Lien invalide ou expiré</h1><p class="muted">Écrivez-nous en répondant au message reçu : nous vous retirerons immédiatement.</p>`));
  if (req.method === "POST" || req.query.ok === "1") {
    await suppress(d.e);
    const p = d.s ? await getProspect(d.s) : null;
    if (p) { p.status = "unsubscribed"; await saveProspect(p); }
    await logEvent("unsubscribe", { email: d.e });
    if (req.method === "POST" && !req.query.ok) return res.status(200).json({ ok: true });
    return html(res, 200, page("Désinscription confirmée", `<h1>C'est fait</h1><p>${esc(d.e)} ne recevra plus aucun message de PostIA. Désolé pour le dérangement.</p>`));
  }
  return html(res, 200, page("Se désinscrire", `<h1>Ne plus recevoir de message</h1><p>Adresse : <b>${esc(d.e)}</b></p><form method="post" action="${APP()}/api/pro?a=stop&ok=1&t=${esc(req.query.t)}" style="margin-top:18px"><button class="btn">Confirmer la désinscription</button></form>`));
}

// ---------------------------------------------------------------- scheduled work
async function tick(log, left, opts = {}) {
  // 1) envois (relances d'abord)
  if (!opts.noSend) await runOutreach({ log, maxPerRun: 2 });
  // 2) démos personnalisées pour les nouveaux prospects (1 appel IA chacun)
  const all = await allProspects();
  const pending = all.filter((p) => p.status === "pending" && !(p.demoFailed >= 2)).sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  for (const p of pending.slice(0, 2)) {
    if (left() < 25000) break;
    try { await makeDemo(p); await saveProspect(p); log(`✓ démo prête : ${p.name}`); }
    catch (e) { p.demoFailed = (p.demoFailed || 0) + 1; if (p.demoFailed >= 2) p.status = "excluded"; await saveProspect(p); log(`! démo ${p.name} : ${e.message}`); }
  }
  // 3) nouveaux prospects si la réserve baisse (peu d'appels Google par jour)
  const pool = all.filter((p) => p.status === "ready" || p.status === "pending").length;
  const day = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" });
  const searches = Number((await kv.get(`searches:${day}`)) || 0);
  const maxSearches = Number(process.env.PROSPECT_SEARCHES_PER_DAY || 6);
  if ((opts.forceSource || pool < Number(process.env.PROSPECT_POOL || 15)) && searches < maxSearches && left() > 25000) {
    if (!process.env.GOOGLE_PLACES_API_KEY) { log("GOOGLE_PLACES_API_KEY manquante"); return; }
    const i = Number((await kv.get("rot:query")) || 0);
    const q = QUERIES[i % QUERIES.length];
    await kv.set("rot:query", i + 1);
    await kv.incr(`searches:${day}`, 60 * 60 * 36);
    log(`recherche : ${q.trade} ${q.city}`);
    const n = await sourceOne(q, log, left);
    log(`${n} prospect(s) ajouté(s)`);
  }
}

async function cron(req, res) {
  if (!process.env.CRON_SECRET || req.query.key !== process.env.CRON_SECRET) return res.status(401).json({ error: "clé invalide" });
  const t0 = Date.now(); const logs = [];
  await tick((s) => logs.push(s), () => 55000 - (Date.now() - t0));
  await kv.set("cron:last", { at: new Date().toISOString(), logs: logs.slice(-40) }, 60 * 60 * 24 * 7);
  return res.status(200).json({ ok: true, logs });
}

// ---------------------------------------------------------------- admin
const adminCookie = () => crypto.createHmac("sha256", process.env.ADMIN_PASSWORD || "x").update("postia-admin").digest("hex").slice(0, 40);
function isAdmin(req) {
  if (!process.env.ADMIN_PASSWORD) return false;
  const c = String(req.headers.cookie || "").split(/;\s*/).find((x) => x.startsWith("po_admin="));
  return c?.slice(9) === adminCookie();
}

async function admin(req, res) {
  const self = "/admin-pro";
  if (!process.env.ADMIN_PASSWORD) return html(res, 200, page("Admin", `<h1>Admin</h1><p>Ajoutez la variable ADMIN_PASSWORD dans Vercel puis redéployez.</p>`));
  if (!isAdmin(req)) {
    if (req.method === "POST" && req.body?.password != null) {
      const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0];
      if ((await kv.incr(`login-try:${ip}`, 900)) > 10) return html(res, 429, page("Admin", `<p>Trop d'essais, réessayez dans 15 minutes.</p>`));
      if (req.body.password === process.env.ADMIN_PASSWORD) {
        res.setHeader("set-cookie", `po_admin=${adminCookie()}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${60 * 60 * 24 * 60}`);
        return redirect(res, self);
      }
    }
    return html(res, 200, page("Admin PostIA", `<h1>Admin</h1><form method="post" action="${self}" style="margin-top:16px"><input type="password" name="password" placeholder="Mot de passe" autofocus> <button class="btn">Entrer</button></form>`));
  }

  let out = null;
  if (req.method === "POST") {
    const t0 = Date.now(); const logs = []; const log = (s) => logs.push(s); const left = () => 55000 - (Date.now() - t0);
    const b = req.body || {};
    if (b.job === "tick") await tick(log, left, { noSend: true });
    if (b.job === "source") await tick(log, left, { noSend: true, forceSource: true });
    if (b.job === "dry") await runOutreach({ dryRun: true, log, maxPerRun: 20 });
    if (b.job === "send") await runOutreach({ log, maxPerRun: 2 });
    if (b.job === "smtp") await smtpTest(process.env.ADMIN_EMAIL || "mattfau83@gmail.com", log);
    if (b.job === "preview") {
      const p = (await allProspects()).find((x) => x.status === "ready" && x.posts?.length);
      if (p) { const m = composeEmail(p, 1); log(`À : ${p.email}\nObjet : ${m.subject}\n\n${m.text}`); } else log("Aucun prospect prêt.");
    }
    if (b.job === "set" && b.slug) {
      const p = await getProspect(b.slug);
      if (p && ["replied", "excluded", "ready", "converted"].includes(b.status)) { p.status = b.status; await saveProspect(p); log(`${p.name} → ${b.status}`); }
      if (p && b.status === "unsubscribed") { await suppress(p.email); p.status = "unsubscribed"; await saveProspect(p); log(`${p.name} désinscrit`); }
    }
    out = { job: b.job, logs };
  }

  const all = (await allProspects()).sort((a, b) => String(b.lastSentAt || b.createdAt).localeCompare(String(a.lastSentAt || a.createdAt)));
  const by = (s) => all.filter((p) => p.status === s).length;
  const contacted = all.filter((p) => /^sent|replied|converted|unsubscribed|bounced/.test(p.status) && p.lastSentAt);
  const viewed = contacted.filter((p) => p.views > 0).length;
  const customers = await kv.smembers("customers").catch(() => []);
  const active = (await Promise.all(customers.map((e) => kv.get(`user:${e}`)))).filter((s) => s === "active").length;
  const lastErr = await kv.get("outreach:lastError");
  const lastCron = await kv.get("cron:last");
  const events = await kv.lrange("events", 0, 15);
  const env = ["KV_REST_API_URL", "GROQ_API_KEY", "GOOGLE_PLACES_API_KEY", "OUTREACH_SMTP_USERS", "OUTREACH_SMTP_PASSWORDS", "OUTREACH_ENABLED", "CRON_SECRET", "APP_SECRET", "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "EMAIL_FROM"]
    .map((k) => `${k} ${process.env[k] || (k === "KV_REST_API_URL" && (process.env.UPSTASH_REDIS_REST_URL || process.env.STORAGE_KV_REST_API_URL)) ? "✓" : "✗"}`).join(" · ");
  const btn = (job, label) => `<form method="post" action="${self}" style="display:inline"><input type="hidden" name="job" value="${job}"><button class="btn2">${label}</button></form>`;
  const act = (p) => ["replied:a répondu", "excluded:exclure", "unsubscribed:désinscrire", "ready:remettre prêt", "converted:client"].map((x) => { const [s, l] = x.split(":"); return `<form method="post" action="${self}" style="display:inline"><input type="hidden" name="job" value="set"><input type="hidden" name="slug" value="${esc(p.slug)}"><input type="hidden" name="status" value="${s}"><button class="btn2" style="padding:2px 6px;font-size:11px">${l}</button></form>`; }).join(" ");
  const rows = all.slice(0, 150).map((p) => `<tr><td>${p.posts?.length ? `<a href="${APP()}/demo/${esc(p.slug)}" target="_blank">${esc(shortName(p.name))}</a>` : esc(shortName(p.name))}<div class="muted">${esc(p.trade || "")} · ${esc(p.city)}</div></td><td>${esc(p.email)}</td><td>${esc(p.status)}${p.bounceReason ? ` <span class="muted" title="${esc(p.bounceReason)}">(?)</span>` : ""}</td><td>${p.views || 0}</td><td>${p.lastSentAt ? new Date(p.lastSentAt).toLocaleDateString("fr-FR") : ""}</td><td>${act(p)}</td></tr>`).join("");
  const body = `<h1>Pilotage PostIA</h1>
  ${lastErr ? `<div class="card" style="border-color:#a33;background:#2a1212"><b>Envoi bloqué</b> — ${esc(lastErr.msg)} <span class="muted">(${new Date(lastErr.at).toLocaleString("fr-FR")})</span></div>` : ""}
  <div class="grid" style="margin-top:14px"><div class="stat"><b>${active}</b>abonnés actifs</div><div class="stat"><b>${contacted.length}</b>contactés</div><div class="stat"><b>${viewed}</b>démos vues${contacted.length ? ` (${Math.round((viewed / contacted.length) * 100)} %)` : ""}</div><div class="stat"><b>${by("replied")}</b>réponses</div><div class="stat"><b>${by("ready")}</b>prêts</div><div class="stat"><b>${by("pending")}</b>démo à faire</div><div class="stat"><b>${by("unsubscribed") + by("bounced")}</b>désinscrits / rejetés</div></div>
  <div class="card"><b>Lancer :</b> ${btn("tick", "Cycle (démos + prospects)")} ${btn("source", "Chercher des prospects")} ${btn("preview", "Voir un email")} ${btn("dry", "Simulation envoi")} ${btn("send", "Envoyer maintenant (2)")} ${btn("smtp", "Tester SMTP")}
  ${out ? `<pre>${esc(out.job)} — ${new Date().toLocaleString("fr-FR")}\n${esc(out.logs.join("\n") || "(rien)")}</pre>` : ""}
  ${lastCron ? `<p class="muted" style="margin-top:10px">Dernier passage automatique : ${new Date(lastCron.at).toLocaleString("fr-FR", { timeZone: "Europe/Paris" })}${lastCron.logs?.length ? ` — ${esc(lastCron.logs.slice(-3).join(" / "))}` : ""}</p>` : `<p class="muted" style="margin-top:10px">Aucun passage automatique pour l'instant (cron-job.org).</p>`}</div>
  <div class="card muted" style="font-size:12px">${esc(env)}</div>
  ${events.length ? `<h2>Derniers événements</h2><div class="card" style="font-size:13px">${events.map((e) => `${new Date(e.at).toLocaleString("fr-FR", { timeZone: "Europe/Paris" })} — <b>${esc(e.type)}</b> ${esc(e.name || e.email || "")}`).join("<br>")}</div>` : ""}
  <h2>Prospects (${all.length})</h2><div class="card" style="overflow-x:auto"><table><tr><th>Commerce</th><th>Email</th><th>Statut</th><th>Vues</th><th>Envoi</th><th></th></tr>${rows}</table></div>`;
  return html(res, 200, page("Admin PostIA", body, { wide: true }));
}
