const WINDOW_MS = 10 * 60 * 1000;
const MAX_REQUESTS = 5;
const recentRequests = new Map();

const allowedSubjects = new Set(["Diagnostic", "Premier échange", "Question"]);
const allowedSizes = new Set(["", "Moins de 10", "10 à 49", "50 à 200", "Plus de 200"]);

function respond(res, status, payload) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  return res.status(status).json(payload);
}

function clean(value, max) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[char]));
}

function rateLimited(ip, now) {
  const entry = recentRequests.get(ip);
  if (entry && now - entry.start < WINDOW_MS && entry.count >= MAX_REQUESTS) return true;
  if (!entry || now - entry.start >= WINDOW_MS) recentRequests.set(ip, { start: now, count: 1 });
  else entry.count += 1;
  if (recentRequests.size > 5000) {
    for (const [key, value] of recentRequests) {
      if (now - value.start >= WINDOW_MS) recentRequests.delete(key);
    }
  }
  return false;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return respond(res, 405, { error: "Méthode non autorisée." });
  }

  const origin = req.headers.origin;
  const allowedOrigins = new Set([
    "https://socboard.fr",
    "https://www.socboard.fr",
    ...(process.env.SITE_ORIGIN ? [process.env.SITE_ORIGIN] : []),
    ...(process.env.VERCEL_URL ? [`https://${process.env.VERCEL_URL}`] : [])
  ]);
  if (!origin || !allowedOrigins.has(origin)) {
    return respond(res, 403, { error: "Origine non autorisée." });
  }

  if (!String(req.headers["content-type"] || "").toLowerCase().startsWith("application/json")) {
    return respond(res, 415, { error: "Format de requête non pris en charge." });
  }
  const contentLength = Number(req.headers["content-length"] || 0);
  if (contentLength > 12000) return respond(res, 413, { error: "Demande trop volumineuse." });

  const body = typeof req.body === "string" ? (() => {
    try { return JSON.parse(req.body); } catch (_) { return null; }
  })() : req.body;
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return respond(res, 400, { error: "Demande invalide." });
  }

  const now = Date.now();
  const ip = String(req.headers["x-real-ip"] || req.headers["x-vercel-forwarded-for"] || "unknown").slice(0, 80);
  if (rateLimited(ip, now)) return respond(res, 429, { error: "Trop de demandes. Réessayez dans quelques minutes." });

  // Champ piège : les robots sont ignorés sans révéler le filtre.
  if (clean(body.website, 200)) return respond(res, 200, { ok: true });

  const data = {
    subject: clean(body["Objet"], 40),
    name: clean(body["Nom"], 100),
    company: clean(body["Entreprise"], 150),
    email: clean(body["E-mail"], 254),
    phone: clean(body["Téléphone"], 40),
    sector: clean(body["Secteur"], 120),
    size: clean(body["Effectif"], 30),
    message: clean(body["Message"], 3000)
  };
  if (Buffer.byteLength(JSON.stringify(body), "utf8") > 12000) {
    return respond(res, 413, { error: "Demande trop volumineuse." });
  }
  if (!allowedSubjects.has(data.subject) || !data.name || !data.company ||
      !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(data.email) ||
      !allowedSizes.has(data.size) || /[\r\n]/.test(data.email)) {
    return respond(res, 400, { error: "Vérifiez les informations obligatoires du formulaire." });
  }

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.CONTACT_FROM_EMAIL;
  if (!apiKey || !from) return respond(res, 503, { error: "Le service d’envoi n’est pas encore configuré." });

  const rows = [
    ["Demande", data.subject], ["Nom", data.name], ["Entreprise", data.company],
    ["E-mail", data.email], ["Téléphone", data.phone], ["Secteur", data.sector],
    ["Effectif", data.size], ["Message", data.message]
  ];
  const text = rows.map(([label, value]) => `${label} : ${value || "Non renseigné"}`).join("\n");
  const html = `<div style="font-family:Arial,sans-serif;line-height:1.6"><h2>Nouvelle demande SOCBoard</h2><dl>${rows.map(([label, value]) => `<dt style="font-weight:bold;margin-top:12px">${escapeHtml(label)}</dt><dd style="margin:0;white-space:pre-wrap">${escapeHtml(value || "Non renseigné")}</dd>`).join("")}</dl></div>`;

  try {
    const abort = new AbortController();
    const timeout = setTimeout(() => abort.abort(), 8000);
    let result;
    try {
      result = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        signal: abort.signal,
        body: JSON.stringify({
          from,
          to: ["youssou@socboard.fr"],
          reply_to: data.email,
          subject: `Demande SOCBoard — ${data.subject}`,
          text,
          html
        })
      });
    } finally {
      clearTimeout(timeout);
    }
    if (!result.ok) return respond(res, 502, { error: "L’envoi a échoué. Réessayez dans un instant." });
    return respond(res, 200, { ok: true });
  } catch (_) {
    return respond(res, 502, { error: "L’envoi a échoué. Réessayez dans un instant." });
  }
}
