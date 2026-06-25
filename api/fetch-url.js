// api/fetch-url.js
// POST { url: "https://..." }
// -> { text: "...", error?: "..." }
// Baja la URL desde el servidor de Vercel — sin problemas de CORS,
// sin límite de timeout del browser. No llama a Gemini.

const { jsonResponse, htmlToText } = require("./lib/helpers");

const MAX_TEXTO = 25000;

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") return jsonResponse(res, 200, {});
  if (req.method !== "POST") return jsonResponse(res, 405, { error: "Usá POST." });

  const { url } = req.body || {};
  if (!url) return jsonResponse(res, 400, { error: "Falta la URL." });

  try {
    const r = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "es-AR,es;q=0.9,en;q=0.8",
        "Cache-Control": "no-cache",
      },
      signal: AbortSignal.timeout(20000),
    });

    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const html = await r.text();
    const text = htmlToText(html).slice(0, MAX_TEXTO);
    if (!text || text.length < 50) throw new Error("La página no tiene texto legible.");

    return jsonResponse(res, 200, { text });
  } catch (err) {
    return jsonResponse(res, 200, {
      text: null,
      error: `${err.message} — usá "Pegar texto" para esta fuente.`,
    });
  }
};
