// netlify/functions/lib/html-to-text.js
//
// Extractor de texto muy simple, sin dependencias externas (cheerio/jsdom),
// pensado para meter el contenido de una página web en el prompt de Gemini.
// No intenta ser perfecto: saca scripts/estilos, tags, y decodifica
// entidades comunes. Es suficiente para dar contexto a la IA.

function htmlToText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(br|p|div|li|h[1-6]|tr)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .trim();
}

module.exports = { htmlToText };
