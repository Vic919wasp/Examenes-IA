// api/get-key.js
// GET -> { key: "AIza..." }
// La API key vive en las variables de entorno de Vercel (nunca en el código).
// El browser la pide al cargar la página y la guarda en memoria.

const { jsonResponse } = require("./lib/helpers");

module.exports = function handler(req, res) {
  if (req.method === "OPTIONS") return jsonResponse(res, 200, {});
  jsonResponse(res, 200, { key: process.env.GEMINI_API_KEY || "" });
};
