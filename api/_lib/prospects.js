// Prospection PostIA : Google Places → email public du commerce → 3 posts personnalisés → page démo privée.
import crypto from "crypto";
import { kv, cmd } from "./kv.js";
import { chatJson } from "./ai.js";

const DAY = 864e5;
const TTL = 60 * 60 * 24 * 120;

// Commerces visuels qui ont besoin de publier, hors Var (le Var est prospecté par FichePilote).
const TRADES = ["restaurant", "pizzeria", "boulangerie pâtisserie", "fleuriste", "salon de coiffure", "barbier", "institut de beauté", "onglerie", "caviste", "boutique de vêtements", "coffee shop", "glacier", "traiteur", "épicerie fine", "salle de sport", "toiletteur pour chien", "salon de tatouage", "chocolatier"];
const CITIES = ["Marseille", "Aix-en-Provence", "Nice", "Montpellier", "Lyon", "Bordeaux", "Toulouse", "Nantes", "Lille", "Rennes", "Strasbourg", "Grenoble", "Avignon", "Nîmes", "Tours", "Angers", "Dijon", "Reims", "Clermont-Ferrand", "Annecy", "Perpignan", "Pau", "La Rochelle", "Caen", "Rouen", "Metz", "Orléans", "Limoges", "Le Mans", "Brest", "Besançon", "Poitiers", "Bayonne", "Valence", "Chambéry"];
// city-major order: every trade of one city, then the next city
export const QUERIES = CITIES.flatMap((city) => TRADES.map((trade) => ({ trade, city })));

export const slugify = (s) => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50);
export const shortName = (n) => { const s = String(n).split(/\s[-–|·]\s|\s\(|,/)[0].trim(); return s.length >= 3 ? s : n; };

// ---------- storage ----------
export async function getProspect(slug) { return kv.get(`prospect:${slug}`); }
export async function saveProspect(p) {
  await kv.set(`prospect:${p.slug}`, p, TTL);
  await kv.sadd("prospects", p.slug);
  if (p.email) await kv.set(`prospect-email:${p.email}`, p.slug, TTL);
}
export async function allProspects() {
  const slugs = await kv.smembers("prospects");
  const out = [];
  for (let i = 0; i < slugs.length; i += 100) out.push(...(await kv.mget(slugs.slice(i, i + 100).map((s) => `prospect:${s}`))));
  return out.filter(Boolean);
}
export async function isSuppressed(email) { return kv.sismember("suppression", email.toLowerCase().trim()); }
export async function suppress(email) { await kv.sadd("suppression", email.toLowerCase().trim()); }

// emails already contacted by the other businesses sharing this database (FichePilote, Marchés Malins)
async function contactedElsewhere(email) {
  for (const key of ["prospect-emails", "mm:prospect-emails"]) {
    try { if ((await cmd("SISMEMBER", key, email)) === 1) return true; } catch { /* ignore */ }
  }
  return false;
}

// ---------- Google Places ----------
const LIGHT = "places.id,places.displayName,places.formattedAddress,places.addressComponents,places.rating,places.userRatingCount,places.websiteUri,places.primaryTypeDisplayName,places.businessStatus";
function toPlace(p) {
  const city = (p.addressComponents || []).find((c) => (c.types || []).includes("locality"))?.longText
    || (p.formattedAddress || "").split(",").slice(-2, -1)[0]?.replace(/\d{5}/, "").trim() || "";
  return {
    placeId: p.id, name: p.displayName?.text || "", city, category: p.primaryTypeDisplayName?.text || null,
    rating: p.rating ?? null, reviewCount: p.userRatingCount ?? 0, website: p.websiteUri || null, businessStatus: p.businessStatus || null,
    summary: p.editorialSummary?.text || null,
    reviews: (p.reviews || []).map((r) => ({ rating: r.rating, text: (r.originalText?.text || r.text?.text || "").slice(0, 500) })).filter((r) => r.text),
  };
}
async function textSearch(query) {
  const r = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: { "content-type": "application/json", "X-Goog-Api-Key": process.env.GOOGLE_PLACES_API_KEY || "", "X-Goog-FieldMask": LIGHT },
    body: JSON.stringify({ textQuery: query, languageCode: "fr", regionCode: "FR", pageSize: 20 }),
  });
  if (!r.ok) throw new Error(`Places ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return ((await r.json()).places || []).map(toPlace);
}
async function placeDetails(placeId) {
  const r = await fetch(`https://places.googleapis.com/v1/places/${placeId}?languageCode=fr`, {
    headers: { "X-Goog-Api-Key": process.env.GOOGLE_PLACES_API_KEY || "", "X-Goog-FieldMask": "id,displayName,formattedAddress,addressComponents,rating,userRatingCount,websiteUri,primaryTypeDisplayName,businessStatus,editorialSummary,reviews" },
  });
  if (!r.ok) throw new Error(`Places détails ${r.status}`);
  return toPlace(await r.json());
}

// ---------- public business email ----------
const FREEMAIL = /@(gmail|googlemail|hotmail|outlook|live|yahoo|orange|wanadoo|free|sfr|laposte|icloud|me|aol|bbox|neuf|numericable)\./i;
const GENERIC = /^(contact|info|infos|bonjour|hello|accueil|commande|commandes|reservation|reservations|resa|booking|restaurant|resto|boutique|shop|salon|atelier|admin|direction|gerance|equipe|team|boulangerie|fleurs|cave)[\w.-]*@/i;
const BAD = /@(google|facebook|instagram|wix|wixpress|sentry|godaddy|ovh|squarespace|shopify|thefork|lafourchette|ubereats|deliveroo|planity)\.|\.(png|jpe?g|gif|webp|svg)$|example\.|sentry|wixpress|domain\.|votre|your|email@|nom@|@2x|^(dpo|rgpd|privacy|jobs|recrutement|rh|noreply|no-reply)@/i;
const PLATFORM = /(^|\.)(google|business\.site|facebook|instagram|wix|wixsite|linktr\.ee|pagesjaunes|solocal|jimdo|webnode|square\.site|yelp|tripadvisor|thefork|lafourchette|ubereats|deliveroo|planity|treatwell|kiute|calendly|sumup|zenchef|guestonline|site-solocal|mapstr)\b/i;

export async function findEmail(website, bizName) {
  if (!website) return null;
  let host;
  try { host = new URL(website).hostname.replace(/^www\./, ""); } catch { return null; }
  if (PLATFORM.test(host)) return null;
  const pages = [website, ...["/contact", "/mentions-legales", "/nous-contacter"].map((p) => new URL(p, website).href)];
  const found = new Set();
  for (const url of pages) {
    try {
      const r = await fetch(url, { headers: { "user-agent": "Mozilla/5.0 (compatible; PostIABot/1.0)" }, signal: AbortSignal.timeout(8000), redirect: "follow" });
      if (!r.ok) continue;
      const h = (await r.text()).replace(/&#64;|\[at\]|\(at\)/gi, "@");
      for (const m of h.matchAll(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g)) found.add(m[0].toLowerCase());
    } catch { /* ignore */ }
    if (found.size) break;
  }
  const nameTok = slugify(bizName).split("-").filter((t) => t.length >= 4);
  const ok = [...found].filter((e) => !BAD.test(e)).filter((e) => {
    const [local, dom] = e.split("@");
    if (dom === host || dom.endsWith("." + host)) return true;
    if (FREEMAIL.test(e)) return GENERIC.test(e) || nameTok.some((t) => local.includes(t));
    return false;
  });
  return ok.sort((a, b) => Number(GENERIC.test(b)) - Number(GENERIC.test(a)))[0] || null;
}
async function hasMx(email) {
  try { const dns = await import("dns/promises"); return (await dns.resolveMx(email.split("@")[1])).length > 0; } catch { return false; }
}

// ---------- sourcing ----------
export async function sourceOne(q, log, left) {
  const query = `${q.trade} ${q.city}`;
  const places = await textSearch(query);
  let added = 0;
  for (const p of places) {
    if (left() < 12000) break;
    if (await kv.sismember("places", p.placeId)) continue;
    await kv.sadd("places", p.placeId);
    if (p.businessStatus && p.businessStatus !== "OPERATIONAL") continue;
    if (p.reviewCount < 20) continue; // commerce actif, assez d'avis pour personnaliser
    const email = await findEmail(p.website, p.name);
    if (!email) { log(`- ${p.name} : pas d'email public`); continue; }
    if (await isSuppressed(email) || await kv.get(`prospect-email:${email}`) || await contactedElsewhere(email)) { log(`- ${p.name} : déjà contacté`); continue; }
    if (!(await hasMx(email))) { log(`- ${p.name} : domaine email sans serveur`); continue; }
    const slug = `${slugify(`${shortName(p.name)}-${p.city}`) || "commerce"}-${crypto.randomBytes(3).toString("hex")}`;
    await saveProspect({
      slug, placeId: p.placeId, name: p.name, city: p.city, category: p.category, trade: q.trade,
      rating: p.rating, reviewCount: p.reviewCount, website: p.website, email, status: "pending", posts: [], createdAt: new Date().toISOString(), source: query,
    });
    added++;
    log(`+ ${p.name} (${email})`);
  }
  return added;
}

// ---------- personalised demo: 3 ready-to-post publications ----------
export async function makeDemo(p) {
  const d = await placeDetails(p.placeId);
  const reviews = d.reviews.slice(0, 5).map((r) => `- (${r.rating}/5) ${r.text}`).join("\n");
  const out = await chatJson([
    { role: "system", content: `Tu es community manager pour des commerces indépendants français. Tu écris des publications prêtes à poster, chaleureuses, concrètes, avec 2 à 5 emojis pertinents et 4 à 7 hashtags (dont la ville). Règles strictes : n'invente AUCUN prix, horaire, promotion, nom de personne, numéro ou adresse ; ne cite pas les avis mot pour mot et ne nomme aucun client ; appuie-toi sur ce que les clients apprécient vraiment. Réponds en JSON : {"aime": "ce que les clients apprécient le plus, en 6 à 12 mots, sans guillemets", "posts": [{"reseau": "Instagram"|"Facebook"|"Google", "angle": "2 à 4 mots", "texte": "..."}]}` },
    { role: "user", content: `Commerce : ${shortName(p.name)}\nActivité : ${d.category || p.category || p.trade}\nVille : ${p.city}\n${d.summary ? `Description Google : ${d.summary}\n` : ""}Note Google : ${d.rating ?? "?"}/5 (${d.reviewCount} avis)\nExtraits d'avis récents (pour t'inspirer, ne pas citer) :\n${reviews || "(aucun)"}\n\nÉcris 3 publications : 1 Instagram (accroche forte, mise en avant de ce que les clients adorent), 1 Facebook (ton convivial et local, question ou anecdote pour faire réagir), 1 fiche Google (sobre, 2-3 phrases, appel à venir ou à réserver). Chaque texte fait 300 à 600 caractères, hashtags inclus (pas de hashtags pour Google).` },
  ]);
  const posts = (out.posts || []).filter((x) => x && x.texte).slice(0, 3).map((x) => ({ network: String(x.reseau || "Instagram"), angle: String(x.angle || ""), text: String(x.texte).trim() }));
  if (posts.length < 2) throw new Error("IA : pas assez de posts");
  p.posts = posts;
  p.liked = String(out.aime || "").replace(/["«»]/g, "").trim().slice(0, 120) || null;
  p.rating = d.rating ?? p.rating; p.reviewCount = d.reviewCount || p.reviewCount;
  p.status = "ready";
  return p;
}
