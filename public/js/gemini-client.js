// public/js/gemini-client.js
// L.1-8   constantes
// L.10-16 getApiKey: lee la key cargada desde /api/get-key
// L.18-42 geminiGenerate(prompt, parts, {json}) → string
// L.44-52 extractJson(text) → objeto/array JS

"use strict";

const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

// La key la carga app.js al inicio desde /api/get-key y la guarda acá
window._geminiKey = "";

function getApiKey() {
  return window._geminiKey || "";
}

async function geminiGenerate(promptText, parts = [], { json = false } = {}) {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error("API key no disponible. Recargá la página.");

  const body = {
    contents: [{ role: "user", parts: [{ text: promptText }, ...parts] }],
    ...(json ? { generationConfig: { responseMimeType: "application/json" } } : {}),
  };

  const res = await fetch(`${GEMINI_ENDPOINT}?key=${apiKey}`, {
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
