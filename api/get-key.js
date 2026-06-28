// api/get-key.js
// GET → { key: "AIza..." }
// La key vive en las variables de entorno de Vercel, nunca en el código.
const { jsonResponse } = require("./lib/helpers");

module.exports = function handler(req, res) {
  if (req.method === "OPTIONS") return jsonResponse(res, 200, {});
  jsonResponse(res, 200, { key: process.env.GEMINI_API_KEY || "" });
};
