// netlify/functions/generate-version.js
//
// POST {
//   sourceTexts: [ {index, text, url} ],   // texto ya extraído por fetch-sources
//   sourcePdfs:  [ {filename, mimeType, base64} ],  // PDFs directo del browser
//   temasSeleccionados: ["tema1", ...],
//   versionNum: 1 | 2 | 3,
//   totalVersiones: 3,
//   contexto: ""
// }
// -> { preguntas: [{q, opts:[4], ans}, ...x15] }
//
// Solo llama a Gemini para generar 15 preguntas → entra en los 10 seg del plan free.

const { generateContent, jsonResponse, extractJson } = require("./lib/gemini");

const PREGUNTAS = 15;

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return jsonResponse(200, {});
  if (event.httpMethod !== "POST") return jsonResponse(405, { error: "Método no permitido." });

  let body;
  try { body = JSON.parse(event.body || "{}"); }
  catch { return jsonResponse(400, { error: "JSON inválido." }); }

  const {
    sourceTexts = [],
    sourcePdfs = [],
    temasSeleccionados = [],
    versionNum = 1,
    totalVersiones = 3,
    contexto = "",
  } = body;

  if (!temasSeleccionados.length) {
    return jsonResponse(400, { error: "Seleccioná al menos un tema." });
  }
  if (!sourceTexts.length && !sourcePdfs.length) {
    return jsonResponse(400, { error: "No hay material de estudio." });
  }

  // Armar las partes multimodales para Gemini
  const parts = [];
  for (const src of sourceTexts) {
    parts.push({ text: `--- Material (${src.url || `Fuente ${src.index + 1}`}) ---\n${src.text}` });
  }
  for (const pdf of sourcePdfs) {
    parts.push({ inlineData: { mimeType: pdf.mimeType || "application/pdf", data: pdf.base64 } });
    parts.push({ text: `(Documento adjunto: ${pdf.filename || "PDF"})` });
  }

  const listaTemasStr = temasSeleccionados.map((t, i) => `  ${i + 1}. ${t}`).join("\n");

  const prompt = `Sos un profesor armando la VERSIÓN ${versionNum} de ${totalVersiones} de un examen
de opción múltiple, basado en el material adjunto.
${contexto ? `Contexto: "${contexto}"` : ""}

Temas seleccionados:
${listaTemasStr}

Esta versión debe tener preguntas DISTINTAS a las otras versiones del mismo examen
(distinta redacción, distintos aspectos).
Basate EXCLUSIVAMENTE en el contenido del material provisto.

Generá EXACTAMENTE ${PREGUNTAS} preguntas en español rioplatense (Argentina),
distribuidas entre los temas seleccionados.

Reglas:
- Cada pregunta tiene EXACTAMENTE 4 opciones, una sola correcta.
- "ans" es el índice (0–3) de la opción correcta.
- Opciones incorrectas plausibles, no absurdas.

Respondé ÚNICAMENTE con un array JSON, sin texto adicional:
[ {"q":"...","opts":["a","b","c","d"],"ans":2}, ... ]`;

  try {
    const text = await generateContent(prompt, parts, { json: true });
    const parsed = extractJson(text);
    const lista = Array.isArray(parsed) ? parsed : [];
    const preguntas = lista
      .filter((p) => p && typeof p.q === "string" && Array.isArray(p.opts) && p.opts.length === 4)
      .slice(0, PREGUNTAS)
      .map((p) => ({
        q: String(p.q).trim(),
        opts: p.opts.map((o) => String(o).trim()),
        ans: Number.isInteger(p.ans) && p.ans >= 0 && p.ans <= 3 ? p.ans : 0,
      }));

    return jsonResponse(200, { preguntas });
  } catch (err) {
    return jsonResponse(err.statusCode || 500, { error: err.message || "Error generando preguntas." });
  }
};
