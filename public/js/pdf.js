// public/js/pdf.js
// buildExamPDF(temaNumero, preguntas) → PDF del examen sin respuestas
// buildAnswerKeyPDF(temasObj)         → PDF de la hoja de corrección
// triggerDownload(doc, filename)      → dispara la descarga

"use strict";

const LETTERS_PDF = ["A", "B", "C", "D"];
const PAGE = { width: 595.28, height: 841.89, marginX: 55, marginY: 50 };
const LINE_H = 13.5;
const TEXT_W = PAGE.width - PAGE.marginX * 2;
const OPT_INDENT = 18;
const OPT_W = TEXT_W - OPT_INDENT;

function newDoc() {
  const { jsPDF } = window.jspdf;
  return new jsPDF({ unit: "pt", format: "a4" });
}

function ensureSpace(doc, y, needed) {
  if (y + needed > PAGE.height - PAGE.marginY) {
    doc.addPage();
    return PAGE.marginY;
  }
  return y;
}

// Limpia caracteres que jsPDF (Helvetica) no puede renderizar correctamente:
// comillas tipográficas, guiones largos, elipsis, y cualquier carácter fuera
// del rango Latin-1 (como letras griegas o cirílicas).
function sanitizeForPDF(text) {
  return String(text)
    .replace(/[\u2018\u2019\u02BC]/g, "'")   // comillas simples tipográficas
    .replace(/[\u201C\u201D\u00AB\u00BB]/g, '"') // comillas dobles tipográficas
    .replace(/[\u2013\u2014]/g, "-")          // guión en y em
    .replace(/\u2026/g, "...")                 // puntos suspensivos
    .replace(/[^\x00-\xFF]/g, (c) => {        // caracteres fuera de Latin-1:
      // intenta transliterar griegos conocidos, resto → '?'
      const map = {
        α:"a",β:"b",γ:"g",δ:"d",ε:"e",ζ:"z",η:"e",θ:"th",ι:"i",κ:"k",
        λ:"l",μ:"m",ν:"n",ξ:"x",ο:"o",π:"p",ρ:"r",σ:"s",τ:"t",υ:"y",
        φ:"ph",χ:"ch",ψ:"ps",ω:"o",
        Α:"A",Β:"B",Γ:"G",Δ:"D",Ε:"E",Ζ:"Z",Η:"E",Θ:"Th",Ι:"I",Κ:"K",
        Λ:"L",Μ:"M",Ν:"N",Ξ:"X",Ο:"O",Π:"P",Ρ:"R",Σ:"S",Τ:"T",Υ:"Y",
        Φ:"Ph",Χ:"Ch",Ψ:"Ps",Ω:"O",
      };
      return map[c] || "?";
    });
}

function buildExamPDF(temaNumero, preguntas) {
  const doc = newDoc();
  let y = PAGE.marginY;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text(`Evaluación — Versión ${temaNumero}`, PAGE.marginX, y);
  y += 22;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text("Nombre y apellido: ______________________________________", PAGE.marginX, y);
  y += 14;
  doc.text("Curso: ____________        Fecha: ____ / ____ / ________", PAGE.marginX, y);
  y += 20;

  doc.setDrawColor(180, 180, 180);
  doc.line(PAGE.marginX, y, PAGE.width - PAGE.marginX, y);
  y += 16;

  preguntas.forEach((item, i) => {
    const qText = sanitizeForPDF(`${i + 1}. ${item.q}`);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10.5);
    const qLines = doc.splitTextToSize(qText, TEXT_W);
    y = ensureSpace(doc, y, qLines.length * LINE_H + 4 * LINE_H + 6);
    doc.text(qLines, PAGE.marginX, y);
    y += qLines.length * LINE_H + 4;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    item.opts.forEach((opt, j) => {
      const optText = sanitizeForPDF(`${LETTERS_PDF[j]})  ${opt}`);
      const optLines = doc.splitTextToSize(optText, OPT_W);
      y = ensureSpace(doc, y, optLines.length * LINE_H);
      doc.text(optLines, PAGE.marginX + OPT_INDENT, y);
      y += optLines.length * LINE_H;
    });
    y += 9;
  });

  return doc;
}

function buildAnswerKeyPDF(temasObj) {
  const doc = newDoc();
  let y = PAGE.marginY;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text("Hoja de corrección", PAGE.marginX, y);
  y += 26;

  Object.keys(temasObj).forEach((temaNumero) => {
    y = ensureSpace(doc, y, 26);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text(`Versión ${temaNumero}`, PAGE.marginX, y);
    y += 17;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    temasObj[temaNumero].forEach((item, i) => {
      const letra = LETTERS_PDF[item.ans];
      const linea = sanitizeForPDF(`${i + 1}. ${letra})  ${item.opts[item.ans]}`);
      const lines = doc.splitTextToSize(linea, TEXT_W);
      y = ensureSpace(doc, y, lines.length * LINE_H);
      doc.text(lines, PAGE.marginX, y);
      y += lines.length * LINE_H;
    });
    y += 16;
  });

  return doc;
}

function triggerDownload(doc, filename) {
  doc.save(filename);
}
