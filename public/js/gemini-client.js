// gemini-client.js — llama a Gemini directo desde el browser.
// La key la inyecta el GitHub Action en config.js como window.GEMINI_API_KEY.
"use strict";
const _EP = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";
async function geminiGenerate(prompt, parts = [], { json = false } = {}) {
  const key = window.GEMINI_API_KEY || "";
  if (!key) throw new Error("API key no configurada. Revisá el secreto GEMINI_API_KEY en GitHub.");
  const body = {
    contents: [{ role: "user", parts: [{ text: prompt }, ...parts] }],
    ...(json ? { generationConfig: { responseMimeType: "application/json" } } : {}),
  };
  const res = await fetch(`${_EP}?key=${key}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
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
  const c = text.replace(/```json|```/g, "").trim();
  const s = Math.min(...[c.indexOf("["), c.indexOf("{")].filter(i => i !== -1));
  const e = Math.max(c.lastIndexOf("]"), c.lastIndexOf("}"));
  return JSON.parse(s >= 0 && e >= 0 ? c.slice(s, e + 1) : c);
}
