// api/generate-version.js
// POST { sourceTexts, sourcePdfs, temasSeleccionados, versionNum, totalVersiones, contexto }
// -> { preguntas: [{q, opts:[4], ans}] }
// El browser llama esto 3 veces (una por versión) mostrando progreso.

const { geminiGenerate, extractJson, jsonResponse } = require("./lib/gemini");

const PREGUNTAS = 15;

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") return jsonResponse(res, 200, {});
  if (req.method !== "POST") return jsonResponse(res, 405, { error: "Método no permitido." });

  const {
    sourceTexts = [], sourcePdfs = [],
    temasSeleccionados = [], versionNum = 1, totalVersiones = 3, contexto = "",
  } = req.body || {};

  if (!temasSeleccionados.length) return jsonResponse(res, 400, { error: "Seleccioná al menos un tema." });
  if (!sourceTexts.length && !sourcePdfs.length) return jsonResponse(res, 400, { error: "Sin material." });

  const parts = [];
  for (const src of sourceTexts) {
    parts.push({ text: `--- Material (${src.url || `Fuente ${src.index + 1}`}) ---\n${src.text}` });
  }
  for (const pdf of sourcePdfs) {
    parts.push({ inlineData: { mimeType: pdf.mimeType || "application/pdf", data: pdf.base64 } });
    parts.push({ text: `(Documento: ${pdf.filename || "PDF"})` });
  }

  const listaTemasStr = temasSeleccionados.map((t, i) => `  ${i + 1}. ${t}`).join("\n");

  const prompt = `Sos un profesor armando la VERSIÓN ${versionNum} de ${totalVersiones} de un examen
de opción múltiple basado en el material adjunto.
${contexto ? `Contexto: "${contexto}"` : ""}

Temas seleccionados:
${listaTemasStr}

Preguntas DISTINTAS a otras versiones. Basate EXCLUSIVAMENTE en el material provisto.
Generá EXACTAMENTE ${PREGUNTAS} preguntas en español rioplatense (Argentina).

Reglas:
- EXACTAMENTE 4 opciones por pregunta, una sola correcta.
- "ans" es el índice (0–3) de la correcta.
- Opciones incorrectas plausibles.

Respondé ÚNICAMENTE con un array JSON:
[ {"q":"...","opts":["a","b","c","d"],"ans":2}, ... (${PREGUNTAS} items) ]`;

  try {
    const text = await geminiGenerate(prompt, parts, { json: true });
    const parsed = extractJson(text);
    const preguntas = (Array.isArray(parsed) ? parsed : [])
      .filter((p) => p && typeof p.q === "string" && Array.isArray(p.opts) && p.opts.length === 4)
      .slice(0, PREGUNTAS)
      .map((p) => ({
        q: String(p.q).trim(),
        opts: p.opts.map((o) => String(o).trim()),
        ans: Number.isInteger(p.ans) && p.ans >= 0 && p.ans <= 3 ? p.ans : 0,
      }));
    return jsonResponse(res, 200, { preguntas });
  } catch (err) {
    return jsonResponse(res, 500, { error: err.message });
  }
};
