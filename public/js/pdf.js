// public/js/pdf.js
//
// Construye los PDFs con jsPDF (cargado por CDN en index.html, expone
// window.jspdf.jsPDF). Todo corre en el navegador: no hay generación de
// PDF del lado del servidor.
//
//   buildExamPDF(temaNumero, preguntas)   → 1 examen, sin respuesta marcada
//   buildAnswerKeyPDF(temasObj)           → 1 PDF con las respuestas de los 3 temas
//   triggerDownload(doc, filename)        → dispara la descarga

"use strict";

const LETTERS_PDF = ["A", "B", "C", "D"];
const PAGE = { width: 595.28, height: 841.89, margin: 50 };
const LINE_H = 13;

function newDoc() {
  const { jsPDF } = window.jspdf;
  return new jsPDF({ unit: "pt", format: "a4" });
}

function ensureSpace(doc, y, needed) {
  if (y + needed > PAGE.height - PAGE.margin) {
    doc.addPage();
    return PAGE.margin;
  }
  return y;
}

function buildExamPDF(temaNumero, preguntas) {
  const doc = newDoc();
  const maxWidth = PAGE.width - PAGE.margin * 2;
  let y = PAGE.margin;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(`Evaluación — Tema ${temaNumero}`, PAGE.margin, y);
  y += 22;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text("Nombre y apellido: ______________________________________", PAGE.margin, y);
  y += 14;
  doc.text("Curso: ____________        Fecha: ____ / ____ / ________", PAGE.margin, y);
  y += 22;

  doc.setDrawColor(180, 180, 180);
  doc.line(PAGE.margin, y, PAGE.width - PAGE.margin, y);
  y += 18;

  preguntas.forEach((item, i) => {
    const qLines = doc.splitTextToSize(`${i + 1}. ${item.q}`, maxWidth);
    y = ensureSpace(doc, y, qLines.length * LINE_H + 4 * LINE_H);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(qLines, PAGE.margin, y);
    y += qLines.length * LINE_H + 3;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10.5);
    item.opts.forEach((opt, j) => {
      const optLines = doc.splitTextToSize(`${LETTERS_PDF[j]})  ${opt}`, maxWidth - 18);
      y = ensureSpace(doc, y, optLines.length * LINE_H);
      doc.text(optLines, PAGE.margin + 18, y);
      y += optLines.length * LINE_H;
    });
    y += 10;
  });

  return doc;
}

function buildAnswerKeyPDF(temasObj) {
  const doc = newDoc();
  const maxWidth = PAGE.width - PAGE.margin * 2;
  let y = PAGE.margin;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("Hoja de corrección", PAGE.margin, y);
  y += 26;

  Object.keys(temasObj).forEach((temaNumero) => {
    y = ensureSpace(doc, y, 26);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text(`Tema ${temaNumero}`, PAGE.margin, y);
    y += 18;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10.5);
    temasObj[temaNumero].forEach((item, i) => {
      const letra = LETTERS_PDF[item.ans];
      const linea = `${i + 1}. ${letra})  ${item.opts[item.ans]}`;
      const lines = doc.splitTextToSize(linea, maxWidth);
      y = ensureSpace(doc, y, lines.length * LINE_H);
      doc.text(lines, PAGE.margin, y);
      y += lines.length * LINE_H;
    });
    y += 16;
  });

  return doc;
}

function triggerDownload(doc, filename) {
  doc.save(filename);
}
