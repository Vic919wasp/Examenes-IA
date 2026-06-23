// api/fetch-sources.js
// POST { sources: [{type:"url", url}|{type:"pdf"}] }
// -> { texts: [{index, text, url}], advertencias:[] }
// Solo baja HTML de URLs y lo limpia. Sin Gemini → muy rápido.

const { htmlToText } = require("./lib/html-to-text");
const { jsonResponse } = require("./lib/gemini");

const MAX_TEXTO = 20000;

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") return jsonResponse(res, 200, {});
  if (req.method !== "POST") return jsonResponse(res, 405, { error: "Método no permitido." });

  const { sources = [] } = req.body || {};
  const texts = [];
  const advertencias = [];

  for (const [i, src] of sources.entries()) {
    if (src.type !== "url" || !src.url) continue;
    try {
      const r = await fetch(src.url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "es-AR,es;q=0.9,en;q=0.8",
          "Accept-Encoding": "gzip, deflate, br",
          "Cache-Control": "no-cache",
        },
        signal: AbortSignal.timeout(8000),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const html = await r.text();
      const text = htmlToText(html).slice(0, MAX_TEXTO);
      if (!text) throw new Error("Sin contenido legible.");
      texts.push({ index: i, text, url: src.url });
    } catch (err) {
      advertencias.push(`Fuente ${i + 1} (${src.url}): ${err.message}`);
    }
  }

  return jsonResponse(res, 200, { texts, advertencias });
};
