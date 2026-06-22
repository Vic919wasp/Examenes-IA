// netlify/functions/generate-exam.js
//
// POST {
//   sources: [ { type:"url", url } | { type:"pdf", filename, mimeType, base64 } ],
//   temasSeleccionados: ["Tema A", "Tema B", ...],   // los que marcó el usuario
//   contexto: "texto libre opcional"
// }
// -> { temas: { "1": [{q, opts:[4], ans},...x15], "2":[...], "3":[...] }, advertencias:[] }
//
// PASO 2 del flujo: recibe las fuentes + los temas elegidos por el usuario
// y genera 3 versiones del examen de 15 preguntas c/u, todas basadas
// exclusivamente en los temas seleccionados.

const { generateContent, jsonResponse, extractJson } = require("./lib/gemini");
const { htmlToText } = require("./lib/html-to-text");

const MAX_SOURCES = 3;
const PREGUNTAS_POR_TEMA = 15;
const CANTIDAD_TEMAS = 3;
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

  const { contexto = "", sources = [], temasSeleccionados = [] } = body;

  if (!Array.isArray(sources) || sources.length === 0) {
    return jsonResponse(400, { error: "Necesitás al menos 1 fuente." });
  }
  if (!Array.isArray(temasSeleccionados) || temasSeleccionados.length === 0) {
    return jsonResponse(400, { error: "Seleccioná al menos un tema para generar el examen." });
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
      parts.push({ text: `(Fuente ${i + 1}: ${src.filename || "PDF"}.)` });
    }
  }

  if (parts.length === 0) {
    return jsonResponse(400, { error: "No se pudo leer ninguna fuente.", advertencias });
  }

  const listaTemasStr = temasSeleccionados.map((t, i) => `  ${i + 1}. ${t}`).join("\n");

  const prompt = `Sos un profesor armando una evaluación de opción múltiple a partir del material de
estudio adjunto (puede incluir texto de páginas web y/o documentos PDF).
${contexto ? `Contexto adicional: "${contexto}"` : ""}

El usuario seleccionó los siguientes temas sobre los que quiere que se basen las preguntas:
${listaTemasStr}

IMPORTANTE: Las preguntas deben basarse EXCLUSIVAMENTE en esos temas y en el contenido
del material provisto. No inventes información que no esté en el material.

Generá ${CANTIDAD_TEMAS} versiones distintas del examen (Versión 1, 2, 3), cada una con
EXACTAMENTE ${PREGUNTAS_POR_TEMA} preguntas de opción múltiple en español rioplatense
(Argentina). Distribuí las preguntas de forma equilibrada entre los temas seleccionados.

Reglas estrictas:
- Cada pregunta tiene EXACTAMENTE 4 opciones, una sola correcta.
- "ans" es el índice (0 a 3) de la opción correcta dentro de "opts".
- Las opciones incorrectas deben ser plausibles (no absurdas ni obvias).
- Las 3 versiones deben cubrir el mismo contenido pero con preguntas DISTINTAS entre sí.
- Respondé ÚNICAMENTE con un JSON válido, sin texto adicional:
{
  "1": [ {"q":"pregunta","opts":["a","b","c","d"],"ans":2}, ... (${PREGUNTAS_POR_TEMA} items) ],
  "2": [ ... (${PREGUNTAS_POR_TEMA} items) ],
  "3": [ ... (${PREGUNTAS_POR_TEMA} items) ]
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
    incompletos.forEach(([k, qs]) =>
      advertencias.push(`Versión ${k}: la IA generó ${qs.length}/${PREGUNTAS_POR_TEMA} preguntas.`)
    );

    return jsonResponse(200, { temas, advertencias });
  } catch (err) {
    return jsonResponse(err.statusCode || 500, {
      error: err.message || "Error generando el examen.",
      advertencias,
    });
  }
};
