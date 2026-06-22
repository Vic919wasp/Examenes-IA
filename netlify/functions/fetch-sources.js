// netlify/functions/fetch-sources.js
//
// POST { sources: [ {type:"url", url} | {type:"pdf"} ] }
// -> { texts: [ {index, text} ], advertencias:[] }
//
// Solo descarga y limpia el HTML de las URLs. Los PDFs los maneja
// el navegador (ya los tiene en base64), así que no pasan por acá.
// Sin llamadas a Gemini → responde en 1-3 segundos.

const { jsonResponse } = require("./lib/gemini");
const { htmlToText } = require("./lib/html-to-text");

const MAX_TEXTO = 20000;

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return jsonResponse(200, {});
  if (event.httpMethod !== "POST") return jsonResponse(405, { error: "Método no permitido." });

  let body;
  try { body = JSON.parse(event.body || "{}"); }
  catch { return jsonResponse(400, { error: "JSON inválido." }); }

  const { sources = [] } = body;
  const texts = [];
  const advertencias = [];

  for (const [i, src] of sources.entries()) {
    if (src.type !== "url" || !src.url) continue;
    try {
      const res = await fetch(src.url, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; EvaluacionesIA/1.0)" },
        signal: AbortSignal.timeout(7000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const html = await res.text();
      const text = htmlToText(html).slice(0, MAX_TEXTO);
      if (!text) throw new Error("Sin contenido legible.");
      texts.push({ index: i, text, url: src.url });
    } catch (err) {
      advertencias.push(`Fuente ${i + 1} (${src.url}): ${err.message}`);
    }
  }

  return jsonResponse(200, { texts, advertencias });
};
