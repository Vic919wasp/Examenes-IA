// gemini-client.js — llama a Gemini directo desde el browser.
// La key viene de /api/get-key (variable GEMINI_API_KEY en Vercel).
// Usa el header x-goog-api-key (compatible con keys AQ. y AIza).
"use strict";
const _EP = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

async function geminiGenerate(prompt, parts = [], { json = false } = {}) {
  const key = window._geminiKey || "";
  if (!key) throw new Error("API key no disponible. Verificá GEMINI_API_KEY en Vercel.");

  const content = [{ text: prompt }, ...parts];
  const body = {
    contents: [{ role: "user", parts: content }],
    ...(json ? { generationConfig: { responseMimeType: "application/json" } } : {}),
  };

  const res = await fetch(_EP, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e?.error?.message || `Error ${res.status} de Gemini`);
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini no devolvió respuesta.");
  return text;
}

function extractJson(text) {
  // 1. Limpiar bloques de código markdown
  let c = text.replace(/```json|```/g, "").trim();

  // 2. Extraer el bloque JSON principal (array o objeto)
  const starts = [c.indexOf("["), c.indexOf("{")].filter(i => i !== -1);
  if (!starts.length) throw new Error("No se encontró JSON en la respuesta.");
  const s = Math.min(...starts);
  const e = Math.max(c.lastIndexOf("]"), c.lastIndexOf("}"));
  c = s >= 0 && e >= 0 ? c.slice(s, e + 1) : c;

  // 3. Intentar parsear directo
  try { return JSON.parse(c); } catch (_) {}

  // 4. Reparaciones comunes antes de reintentar:
  c = c
    // Saltos de línea literales dentro de strings → espacio
    .replace(/("(?:[^"\\]|\\.)*")|(\n)/g, (m, str, nl) => str ? str.replace(/\n/g, " ") : " ")
    // Comas finales antes de } o ]
    .replace(/,\s*([}\]])/g, "$1")
    // Comillas tipográficas → ASCII
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2018\u2019]/g, "'");

  return JSON.parse(c);
}
