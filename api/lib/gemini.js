// api/lib/gemini.js
// Cliente de Gemini para las funciones serverless de Vercel.
// La API key viene de la variable de entorno GEMINI_API_KEY —
// el docente nunca la ve ni la toca.

const MODEL = "gemini-2.5-flash";
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

async function geminiGenerate(promptText, parts = [], { json = false } = {}) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Falta GEMINI_API_KEY en las variables de entorno de Vercel.");

  const allParts = [{ text: promptText }, ...parts];
  const body = {
    contents: [{ role: "user", parts: allParts }],
    ...(json ? { generationConfig: { responseMimeType: "application/json" } } : {}),
  };

  const res = await fetch(`${ENDPOINT}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Error ${res.status} de Gemini`);
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini no devolvió respuesta.");
  return text;
}

function extractJson(text) {
  const cleaned = text.replace(/```json|```/g, "").trim();
  const candidates = [cleaned.indexOf("["), cleaned.indexOf("{")].filter((i) => i !== -1);
  const start = candidates.length ? Math.min(...candidates) : -1;
  const end = Math.max(cleaned.lastIndexOf("]"), cleaned.lastIndexOf("}"));
  const slice = start !== -1 && end !== -1 ? cleaned.slice(start, end + 1) : cleaned;
  return JSON.parse(slice);
}

function jsonResponse(res, statusCode, body) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.status(statusCode).json(body);
}

module.exports = { geminiGenerate, extractJson, jsonResponse };
