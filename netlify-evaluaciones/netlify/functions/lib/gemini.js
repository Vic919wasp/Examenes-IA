// netlify/functions/lib/gemini.js
//
// Cliente compartido de Gemini para las funciones serverless.
// Requiere GEMINI_API_KEY configurada en Netlify (Site configuration >
// Environment variables) o en .env para `netlify dev`.
//
// Usa el SDK oficial vigente "@google/genai" (el paquete anterior
// "@google/generative-ai" está deprecado desde 2025).

const { GoogleGenAI } = require("@google/genai");

const DEFAULT_MODEL = "gemini-2.5-flash";

function getClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    const err = new Error(
      "Falta GEMINI_API_KEY. Configurala en Netlify > Site configuration > Environment variables."
    );
    err.statusCode = 500;
    throw err;
  }
  return new GoogleGenAI({ apiKey });
}

function modelName() {
  return process.env.GEMINI_MODEL || DEFAULT_MODEL;
}

/**
 * Genera contenido a partir de un prompt de texto + una lista opcional de
 * "partes" adicionales (texto extraído de páginas web, PDFs en base64, etc).
 *
 * parts: array de:
 *   { text: "..." }
 *   { inlineData: { mimeType: "application/pdf", data: "<base64>" } }
 */
async function generateContent(promptText, parts = [], { json = false } = {}) {
  const ai = getClient();
  const response = await ai.models.generateContent({
    model: modelName(),
    contents: [
      {
        role: "user",
        parts: [{ text: promptText }, ...parts],
      },
    ],
    ...(json ? { config: { responseMimeType: "application/json" } } : {}),
  });
  return response.text;
}

/** Respuesta JSON estándar para las functions (con CORS abierto). */
function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
    },
    body: JSON.stringify(body),
  };
}

/** Extrae el primer bloque JSON de un texto (por si el modelo agrega texto extra). */
function extractJson(text) {
  const cleaned = text.replace(/```json|```/g, "").trim();
  const candidates = [cleaned.indexOf("["), cleaned.indexOf("{")].filter((i) => i !== -1);
  const start = candidates.length ? Math.min(...candidates) : -1;
  const end = Math.max(cleaned.lastIndexOf("]"), cleaned.lastIndexOf("}"));
  const slice = start !== -1 && end !== -1 ? cleaned.slice(start, end + 1) : cleaned;
  return JSON.parse(slice);
}

module.exports = { generateContent, jsonResponse, extractJson, DEFAULT_MODEL };
