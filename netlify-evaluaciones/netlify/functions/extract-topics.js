// netlify/functions/extract-topics.js
//
// POST {
//   sources: [
//     { type: "url", url: "https://..." },
//     { type: "pdf", filename: "...", mimeType: "application/pdf", base64: "..." }
//   ]
// }
// -> { topics: ["Tema 1: ...", "Arquitectura de Von Neumann", ...] }
//
// PASO 1 del flujo: la IA lee todo el material y extrae los temas/unidades/
// capítulos que contiene. El usuario luego elige cuáles incluir antes de
// generar las preguntas.

const { generateContent, jsonResponse, extractJson } = require("./lib/gemini");
const { htmlToText } = require("./lib/html-to-text");

const MAX_SOURCES = 3;
const MAX_TEXTO_POR_FUENTE = 20000;

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return jsonResponse(200, {});
  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { error: "Método no permitido. Usá POST." });
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return jsonResponse(400, { error: "JSON inválido en el body." });
  }

  const { sources = [] } = body;
  if (!Array.isArray(sources) || sources.length === 0) {
    return jsonResponse(400, { error: "Necesitás al menos 1 fuente (URL o PDF)." });
  }
  if (sources.length > MAX_SOURCES) {
    return jsonResponse(400, { error: `Máximo ${MAX_SOURCES} fuentes.` });
  }

  const parts = [];
  const advertencias = [];

  for (const [i, src] of sources.entries()) {
    if (src.type === "url") {
      if (!src.url) continue;
      try {
        const res = await fetch(src.url, {
          headers: { "User-Agent": "Mozilla/5.0 (compatible; EvaluacionesIA/1.0)" },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const html = await res.text();
        const texto = htmlToText(html).slice(0, MAX_TEXTO_POR_FUENTE);
        if (!texto) throw new Error("Sin contenido de texto legible.");
        parts.push({ text: `--- Fuente ${i + 1} (${src.url}) ---\n${texto}` });
      } catch (err) {
        advertencias.push(`No se pudo leer la fuente ${i + 1} (${src.url}): ${err.message}`);
      }
    } else if (src.type === "pdf") {
      if (!src.base64) continue;
      parts.push({ inlineData: { mimeType: src.mimeType || "application/pdf", data: src.base64 } });
      parts.push({ text: `(El documento adjunto anterior es la Fuente ${i + 1}: ${src.filename || "PDF"}.)` });
    }
  }

  if (parts.length === 0) {
    return jsonResponse(400, { error: "No se pudo leer ninguna fuente.", advertencias });
  }

  const prompt = `Analizá el material de estudio adjunto (puede incluir texto de páginas web y/o PDFs).

Identificá y listá todos los TEMAS, UNIDADES, CAPÍTULOS o EJES TEMÁTICOS principales que cubre
el material. Sé específico: no pongas "Introducción" genérica, sino el tema real que trata
(ej: "Arquitectura de Von Neumann", "Tipos de licencias de software", "Estructuras algorítmicas").

Si el material está organizado en unidades o capítulos con nombres propios, usá esos nombres.
Si no, identificá los temas conceptuales claramente diferenciados.

Respondé ÚNICAMENTE con un JSON válido, sin texto adicional, con este formato exacto:
{ "topics": ["tema 1", "tema 2", "tema 3", ...] }

Máximo 20 temas. Si el material es muy extenso, priorizá los temas con más contenido.`;

  try {
    const text = await generateContent(prompt, parts, { json: true });
    const parsed = extractJson(text);
    const topics = Array.isArray(parsed.topics)
      ? parsed.topics.filter((t) => typeof t === "string" && t.trim()).map((t) => t.trim())
      : [];

    if (topics.length === 0) {
      return jsonResponse(500, { error: "La IA no pudo identificar temas en el material provisto." });
    }

    return jsonResponse(200, { topics, advertencias });
  } catch (err) {
    return jsonResponse(err.statusCode || 500, {
      error: err.message || "Error analizando el material.",
      advertencias,
    });
  }
};
