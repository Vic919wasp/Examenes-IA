// api/extract-topics.js
// POST { sourceTexts:[{index,text,url}], sourcePdfs:[{filename,mimeType,base64}] }
// -> { topics: ["tema 1", ...], advertencias:[] }

const { geminiGenerate, extractJson, jsonResponse } = require("./lib/gemini");

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") return jsonResponse(res, 200, {});
  if (req.method !== "POST") return jsonResponse(res, 405, { error: "Método no permitido." });

  const { sourceTexts = [], sourcePdfs = [] } = req.body || {};

  const parts = [];
  for (const src of sourceTexts) {
    parts.push({ text: `--- Material (${src.url || `Fuente ${src.index + 1}`}) ---\n${src.text}` });
  }
  for (const pdf of sourcePdfs) {
    parts.push({ inlineData: { mimeType: pdf.mimeType || "application/pdf", data: pdf.base64 } });
    parts.push({ text: `(Documento: ${pdf.filename || "PDF"})` });
  }

  if (!parts.length) return jsonResponse(res, 400, { error: "Sin contenido para analizar." });

  const prompt = `Analizá el material adjunto e identificá todos los TEMAS, UNIDADES o EJES
TEMÁTICOS principales. Sé específico (ej: "Arquitectura de Von Neumann", no "Introducción").
Si hay capítulos con nombres propios, usalos.

Respondé ÚNICAMENTE con JSON válido:
{ "topics": ["tema 1", "tema 2", ...] }
Máximo 20 temas.`;

  try {
    const text = await geminiGenerate(prompt, parts, { json: true });
    const parsed = extractJson(text);
    const topics = Array.isArray(parsed.topics)
      ? parsed.topics.filter((t) => typeof t === "string" && t.trim()).map((t) => t.trim())
      : [];
    if (!topics.length) return jsonResponse(res, 500, { error: "No se encontraron temas en el material." });
    return jsonResponse(res, 200, { topics });
  } catch (err) {
    return jsonResponse(res, 500, { error: err.message });
  }
};
