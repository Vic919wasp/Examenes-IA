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
    if (!r.ok) {
      if (r.status === 403 || r.status === 503) {
        throw new Error(
          `Este sitio tiene protección anti-bots (Cloudflare) y bloquea la descarga automática. ` +
          `Alternativas: usá la página de Wikipedia sobre el tema, subí un PDF, o pegá el texto manualmente.`
        );
      }
      throw new Error(`El sitio respondió con error ${r.status}. Probá con otra fuente (Wikipedia, PDF o "Pegar texto").`);
    }
    const html = await r.text();
    const text = htmlToText(html).slice(0, 25000);
    if (!text || text.length < 50) throw new Error("La página no tiene texto legible (puede ser una app o un sitio muy visual). Probá con otra fuente.");
    return jsonResponse(res, 200, { text });
  } catch (err) {
    const msg = err.name === "TimeoutError" || err.name === "AbortError"
      ? "El sitio tardó demasiado en responder. Probá con otra fuente o pegá el texto manualmente."
      : err.message;
    return jsonResponse(res, 200, { text: null, error: msg });
  }
};
