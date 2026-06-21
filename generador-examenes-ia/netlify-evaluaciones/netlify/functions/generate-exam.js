// netlify/functions/generate-exam.js
//
// POST {
//   contexto: "texto libre opcional (materia, nivel, aclaraciones)",
//   sources: [
//     { type: "url", url: "https://..." },
//     { type: "pdf", filename: "apunte.pdf", mimeType: "application/pdf", base64: "..." }
//   ] // 1 a 3 elementos
// }
// -> { temas: { "1": [ {q, opts:[4], ans}, ... 15 ], "2": [...15], "3": [...15] } }
//
// Las fuentes son el MATERIAL DE ESTUDIO sobre el que la IA arma las
// preguntas. Para URLs, esta función baja el HTML server-side y lo
// convierte a texto plano. Para PDFs, se los pasa a Gemini directamente
// (lectura nativa de documentos), sin extraer texto a mano.

const { generateContent, jsonResponse, extractJson } = require("./lib/gemini");
const { htmlToText } = require("./lib/html-to-text");

const MAX_SOURCES = 3;
const PREGUNTAS_POR_TEMA = 15;
const CANTIDAD_TEMAS = 3;
const MAX_TEXTO_POR_FUENTE = 20000; // caracteres, para no pasarnos de contexto

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

  const { contexto = "", sources = [] } = body;

  if (!Array.isArray(sources) || sources.length === 0) {
    return jsonResponse(400, { error: "Necesitás al menos 1 fuente (URL o PDF)." });
  }
  if (sources.length > MAX_SOURCES) {
    return jsonResponse(400, { error: `Máximo ${MAX_SOURCES} fuentes.` });
  }

  // Arma las "partes" multimodales para Gemini: texto de las URLs + PDFs inline.
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
        parts.push({ text: `--- Fuente ${i + 1} (página web: ${src.url}) ---\n${texto}` });
      } catch (err) {
        advertencias.push(`No se pudo leer la fuente ${i + 1} (${src.url}): ${err.message}`);
      }
    } else if (src.type === "pdf") {
      if (!src.base64) continue;
      parts.push({
        inlineData: { mimeType: src.mimeType || "application/pdf", data: src.base64 },
      });
      parts.push({ text: `(El archivo adjunto de arriba es la Fuente ${i + 1}: ${src.filename || "PDF"}.)` });
    }
  }

  if (parts.length === 0) {
    return jsonResponse(400, {
      error: "No se pudo leer ninguna fuente.",
      advertencias,
    });
  }

  const prompt = `Sos un profesor armando una evaluación de opción múltiple a partir del material de
estudio adjunto (puede incluir texto de páginas web y/o documentos PDF).
${contexto ? `Contexto adicional dado por el profesor: "${contexto}"` : ""}

Generá ${CANTIDAD_TEMAS} versiones distintas del examen (Tema 1, Tema 2, Tema 3),
cada una con EXACTAMENTE ${PREGUNTAS_POR_TEMA} preguntas de opción múltiple en
español rioplatense (Argentina), basadas en el contenido provisto.

Reglas estrictas:
- Cada pregunta tiene EXACTAMENTE 4 opciones, una sola correcta.
- "ans" es el índice (0 a 3) de la opción correcta dentro de "opts".
- Las opciones incorrectas deben ser plausibles, no absurdas.
- Las preguntas deben cubrir distintas partes del material (no te concentres
  en un solo párrafo o sección).
- Los 3 temas deben cubrir contenidos equivalentes pero con preguntas
  DIFERENTES entre sí (no repitas la misma pregunta en más de un tema).
- Respondé ÚNICAMENTE con un JSON válido, sin texto adicional, con este
  formato exacto:
{
  "1": [ {"q":"texto de la pregunta","opts":["a","b","c","d"],"ans":0}, ... (${PREGUNTAS_POR_TEMA} preguntas) ],
  "2": [ ... (${PREGUNTAS_POR_TEMA} preguntas) ],
  "3": [ ... (${PREGUNTAS_POR_TEMA} preguntas) ]
}`;

  try {
    const text = await generateContent(prompt, parts, { json: true });
    const parsed = extractJson(text);

    const temas = {};
    for (const key of ["1", "2", "3"]) {
      const lista = Array.isArray(parsed[key]) ? parsed[key] : [];
      temas[key] = lista
        .filter((p) => p && typeof p.q === "string" && Array.isArray(p.opts) && p.opts.length === 4)
        .slice(0, PREGUNTAS_POR_TEMA)
        .map((p) => ({
          q: String(p.q).trim(),
          opts: p.opts.map((o) => String(o).trim()),
          ans: Number.isInteger(p.ans) && p.ans >= 0 && p.ans <= 3 ? p.ans : 0,
        }));
    }

    const incompletos = Object.entries(temas).filter(([, qs]) => qs.length < PREGUNTAS_POR_TEMA);
    if (incompletos.length) {
      incompletos.forEach(([k, qs]) =>
        advertencias.push(`Tema ${k} salió con ${qs.length}/${PREGUNTAS_POR_TEMA} preguntas (la IA generó menos de las pedidas).`)
      );
    }

    return jsonResponse(200, { temas, advertencias });
  } catch (err) {
    return jsonResponse(err.statusCode || 500, {
      error: err.message || "Error generando el examen.",
      advertencias,
    });
  }
};
