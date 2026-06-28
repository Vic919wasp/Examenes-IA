// api/fetch-url.js
// POST { url: "https://..." } → { text: "..." } | { error: "..." }
// Corre en los servidores de Vercel: sin CORS, sin límite de timeout de browser.
// Usa headers de Chrome real para que la mayoría de los sitios lo acepten.

const { jsonResponse, htmlToText } = require("./lib/helpers");

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "es-AR,es;q=0.9,en;q=0.8",
  "Cache-Control": "no-cache",
};

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") return jsonResponse(res, 200, {});
  if (req.method !== "POST") return jsonResponse(res, 405, { error: "Usá POST." });

  const { url } = req.body || {};
  if (!url) return jsonResponse(res, 400, { error: "Falta la URL." });

  try {
    const r = await fetch(url, {
      headers: HEADERS,
      signal: AbortSignal.timeout(20000),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const html = await r.text();
    const text = htmlToText(html).slice(0, 25000);
    if (!text || text.length < 50) throw new Error("La página no tiene texto legible.");
    return jsonResponse(res, 200, { text });
  } catch (err) {
    return jsonResponse(res, 200, { text: null, error: err.message });
  }
};
