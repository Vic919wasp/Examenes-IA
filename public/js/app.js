// public/js/app.js
//
// Índice rápido:
//   1. Estado global y helpers                              L.  11-65
//   2. Filas de fuentes (URL / PDF / Pegar texto)           L.  67-130
//   3. PASO 1 — Analizar fuentes → lista de temas (Gemini) L. 132-205
//   4. PASO 2 — Seleccionar temas + generar (Gemini)        L. 207-285
//   5. PASO 3 — Botones de descarga individual              L. 287-325
//   6. Descarga ZIP                                          L. 327-360
//   7. Init (carga API key + eventos)                        L. 362-385

"use strict";

/* ===================== 1. ESTADO Y HELPERS ===================== */

const MAX_SOURCES = 3;
const TOTAL_VERSIONES = 3;
const PREGUNTAS_POR_VERSION = 15;

const sourcesState = [null, null, null];
let sourceTextsCache = [];
let sourcePdfsCache = [];

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") node.className = v;
    else if (k === "html") node.innerHTML = v;
    else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  for (const c of [].concat(children)) {
    if (c == null) continue;
    node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  }
  return node;
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function apiPost(path, body) {
  const res = await fetch(`/api/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
  return data;
}

function setStatus(id, msg) { const e = document.getElementById(id); if (e) e.textContent = msg; }
function setError(id, msg) {
  const e = document.getElementById(id);
  if (!e) return;
  e.innerHTML = "";
  if (msg) e.appendChild(el("div", { class: "error-box" }, msg));
}

function buildParts(texts, pdfs) {
  const parts = [];
  for (const src of texts) parts.push({ text: `--- Material (${src.url}) ---\n${src.text}` });
  for (const pdf of pdfs) {
    parts.push({ inlineData: { mimeType: pdf.mimeType || "application/pdf", data: pdf.base64 } });
    parts.push({ text: `(Documento: ${pdf.filename || "PDF"})` });
  }
  return parts;
}

/* ===================== 2. FILAS DE FUENTES ===================== */

function renderSourceRow(index) {
  const row = el("div", { class: "source-row" });
  row.appendChild(el("label", {}, `Fuente ${index + 1}${index > 0 ? " (opcional)" : ""}`));

  const typeSelect = el("select", { class: "source-type" }, [
    el("option", { value: "" }, "— Sin usar —"),
    el("option", { value: "url" }, "Página web (URL)"),
    el("option", { value: "pdf" }, "Archivo PDF"),
    el("option", { value: "text" }, "Pegar texto"),
  ]);

  const inputArea = el("div", { class: "source-input" });

  typeSelect.addEventListener("change", () => {
    inputArea.innerHTML = "";
    sourcesState[index] = null;
    sourceTextsCache = [];

    if (typeSelect.value === "url") {
      const inp = el("input", {
        type: "text", placeholder: "https://...",
        oninput: (e) => {
          sourcesState[index] = e.target.value.trim()
            ? { type: "url", url: e.target.value.trim() } : null;
          sourceTextsCache = [];
        },
      });
      inputArea.appendChild(inp);

    } else if (typeSelect.value === "pdf") {
      const fileInput = el("input", { type: "file", accept: "application/pdf" });
      const statusSpan = el("span", { class: "muted", style: "display:block; margin-top:4px" });
      fileInput.addEventListener("change", async () => {
        const file = fileInput.files[0];
        if (!file) { sourcesState[index] = null; statusSpan.textContent = ""; return; }
        statusSpan.textContent = file.size > 6 * 1024 * 1024
          ? "⚠️ PDF mayor a 6 MB, puede tardar." : `✓ ${file.name}`;
        const base64 = await fileToBase64(file);
        sourcesState[index] = { type: "pdf", filename: file.name, mimeType: "application/pdf", base64 };
      });
      inputArea.appendChild(fileInput);
      inputArea.appendChild(statusSpan);

    } else if (typeSelect.value === "text") {
      const textarea = el("textarea", {
        placeholder: "Pegá acá el texto del material (copiado de la página web, un apunte, etc.)",
        rows: "6",
        style: "width:100%; font-size:13px; padding:8px; border:1px solid var(--line); border-radius:var(--radius); resize:vertical;",
        oninput: (e) => {
          sourcesState[index] = e.target.value.trim()
            ? { type: "text", text: e.target.value.trim() } : null;
        },
      });
      inputArea.appendChild(textarea);
    }
  });

  row.appendChild(typeSelect);
  row.appendChild(inputArea);
  return row;
}

function setupSources() {
  const container = document.getElementById("sources");
  for (let i = 0; i < MAX_SOURCES; i++) container.appendChild(renderSourceRow(i));
}

/* ===================== 3. PASO 1: ANALIZAR → TEMAS ===================== */

async function analizarFuentes() {
  const btn = document.getElementById("btn-analizar");
  setError("analizar-error", "");
  sourceTextsCache = [];
  sourcePdfsCache = [];

  const sources = sourcesState.filter(Boolean);
  if (!sources.length) {
    setError("analizar-error", "Completá al menos una fuente.");
    return;
  }

  btn.disabled = true;
  document.getElementById("card-temas").style.display = "none";
  document.getElementById("card-descarga").style.display = "none";

  const urlErrors = [];

  try {
    // URLs: bajadas server-side por Vercel (sin CORS, sin límite de browser)
    for (const [i, src] of sources.entries()) {
      if (src.type !== "url") continue;
      setStatus("analizar-status", `Descargando fuente ${i + 1}…`);
      const data = await apiPost("fetch-url", { url: src.url });
      if (data.text) {
        sourceTextsCache.push({ index: i, text: data.text, url: src.url });
      } else {
        urlErrors.push(`Fuente ${i + 1}: ${data.error || "no se pudo leer"}`);
      }
    }

    // Textos pegados manualmente
    sources.filter((s) => s.type === "text").forEach((s, i) => {
      sourceTextsCache.push({ index: i, text: s.text, url: "texto pegado" });
    });

    // PDFs
    sourcePdfsCache = sources.filter((s) => s.type === "pdf")
      .map((s) => ({ filename: s.filename, mimeType: s.mimeType, base64: s.base64 }));

    if (!sourceTextsCache.length && !sourcePdfsCache.length) {
      throw new Error(urlErrors.join(" — ") || "Sin contenido válido.");
    }
    if (urlErrors.length) setError("analizar-error", urlErrors.join(" — "));

    // Gemini extrae los temas (directo desde el browser, sin timeout de servidor)
    setStatus("analizar-status", "Analizando temas con IA…");
    const parts = buildParts(sourceTextsCache, sourcePdfsCache);

    const prompt = `Analizá el material adjunto e identificá todos los TEMAS, UNIDADES o EJES
TEMÁTICOS principales. Sé específico (ej: "Arquitectura de Von Neumann", no "Introducción").
Si hay capítulos con nombres propios, usalos.

Respondé ÚNICAMENTE con JSON válido:
{ "topics": ["tema 1", "tema 2", ...] }
Máximo 20 temas.`;

    const text = await geminiGenerate(prompt, parts, { json: true });
    const parsed = extractJson(text);
    const topics = Array.isArray(parsed.topics)
      ? parsed.topics.filter((t) => typeof t === "string" && t.trim()).map((t) => t.trim())
      : [];

    if (!topics.length) throw new Error("La IA no encontró temas en el material.");
    mostrarTemas(topics);

  } catch (e) {
    setError("analizar-error", e.message);
  } finally {
    btn.disabled = false;
    setStatus("analizar-status", "");
  }
}

function mostrarTemas(topics) {
  const card = document.getElementById("card-temas");
  const list = document.getElementById("topics-list");
  document.getElementById("temas-hint").textContent =
    `Se encontraron ${topics.length} temas. Seleccioná los que querés incluir:`;
  list.innerHTML = "";
  topics.forEach((topic, i) => {
    const id = `topic-${i}`;
    list.appendChild(el("label", { class: "topic-option", for: id }, [
      el("input", { type: "checkbox", id, value: topic, class: "topic-check", checked: "" }),
      el("span", {}, topic),
    ]));
  });
  card.style.display = "block";
  card.scrollIntoView({ behavior: "smooth", block: "start" });
}

/* ===================== 4. PASO 2: GENERAR ===================== */

function temasSeleccionados() {
  return Array.from(document.querySelectorAll(".topic-check:checked")).map((cb) => cb.value);
}

async function generarExamen() {
  const btn = document.getElementById("btn-generar");
  setError("generar-error", "");

  const seleccionados = temasSeleccionados();
  if (!seleccionados.length) { setError("generar-error", "Seleccioná al menos un tema."); return; }
  if (!sourceTextsCache.length && !sourcePdfsCache.length) {
    setError("generar-error", "Volvé al paso 1 y analizá el contenido primero."); return;
  }

  btn.disabled = true;
  document.getElementById("card-descarga").style.display = "none";
  document.getElementById("progreso-container").style.display = "block";

  const progBar = document.getElementById("progreso-bar");
  const progTxt = document.getElementById("progreso-txt");
  const contexto = document.getElementById("contexto").value.trim();
  const listaTemasStr = seleccionados.map((t, i) => `  ${i + 1}. ${t}`).join("\n");
  const parts = buildParts(sourceTextsCache, sourcePdfsCache);
  const temas = {};
  const advertencias = [];

  try {
    for (let v = 1; v <= TOTAL_VERSIONES; v++) {
      progTxt.textContent = `Generando versión ${v} de ${TOTAL_VERSIONES}…`;
      progBar.style.width = `${Math.round(((v - 1) / TOTAL_VERSIONES) * 100)}%`;

      const prompt = `Sos un profesor armando la VERSIÓN ${v} de ${TOTAL_VERSIONES} de un examen
de opción múltiple basado en el material adjunto.
${contexto ? `Contexto: "${contexto}"` : ""}

Temas seleccionados:
${listaTemasStr}

Preguntas DISTINTAS a otras versiones. Basate EXCLUSIVAMENTE en el material.
Generá EXACTAMENTE ${PREGUNTAS_POR_VERSION} preguntas en español rioplatense (Argentina).

Reglas:
- EXACTAMENTE 4 opciones, una sola correcta.
- "ans" es el índice (0–3) de la correcta.
- Opciones incorrectas plausibles.

Respondé ÚNICAMENTE con un array JSON:
[ {"q":"...","opts":["a","b","c","d"],"ans":2}, ... (${PREGUNTAS_POR_VERSION} items) ]`;

      const text = await geminiGenerate(prompt, parts, { json: true });
      const parsed = extractJson(text);
      const lista = (Array.isArray(parsed) ? parsed : [])
        .filter((p) => p && typeof p.q === "string" && Array.isArray(p.opts) && p.opts.length === 4)
        .slice(0, PREGUNTAS_POR_VERSION)
        .map((p) => ({
          q: String(p.q).trim(),
          opts: p.opts.map((o) => String(o).trim()),
          ans: Number.isInteger(p.ans) && p.ans >= 0 && p.ans <= 3 ? p.ans : 0,
        }));

      temas[String(v)] = lista;
      if (lista.length < PREGUNTAS_POR_VERSION) {
        advertencias.push(`Versión ${v}: ${lista.length}/${PREGUNTAS_POR_VERSION} preguntas.`);
      }
      progBar.style.width = `${Math.round((v / TOTAL_VERSIONES) * 100)}%`;
    }

    progTxt.textContent = "¡Listo!";
    setTimeout(() => { document.getElementById("progreso-container").style.display = "none"; }, 1500);
    mostrarDescarga(temas, advertencias);

  } catch (e) {
    setError("generar-error", e.message);
    document.getElementById("progreso-container").style.display = "none";
  } finally {
    btn.disabled = false;
  }
}

/* ===================== 5. DESCARGA INDIVIDUAL ===================== */

function mostrarDescarga(temas, advertencias) {
  const card = document.getElementById("card-descarga");
  document.getElementById("descarga-resumen").textContent =
    Object.keys(temas).map((k) => `Versión ${k}: ${temas[k].length}/15 preguntas`).join("  ·  ");

  const advDiv = document.getElementById("descarga-advertencias");
  advDiv.innerHTML = "";
  if (advertencias.length) advDiv.appendChild(el("div", { class: "error-box" }, advertencias.join(" — ")));

  const downloads = document.getElementById("downloads");
  downloads.innerHTML = "";

  Object.keys(temas).forEach((v) => {
    downloads.appendChild(el("button", {
      class: "btn secondary",
      onclick: () => triggerDownload(buildExamPDF(v, temas[v]), `Examen-Version${v}.pdf`),
    }, `📄 Versión ${v}`));
  });

  downloads.appendChild(el("button", {
    class: "btn secondary",
    onclick: () => triggerDownload(buildAnswerKeyPDF(temas), "Respuestas.pdf"),
  }, "✅ Respuestas"));

  downloads.appendChild(el("button", {
    class: "btn",
    onclick: () => descargarZip(temas),
  }, "⬇️ Descargar ZIP con los 4 PDFs"));

  card.style.display = "block";
  card.scrollIntoView({ behavior: "smooth", block: "start" });
}

/* ===================== 6. DESCARGA ZIP ===================== */

async function descargarZip(temas) {
  const btn = document.querySelector("#downloads .btn:last-child");
  if (btn) { btn.disabled = true; btn.textContent = "Generando ZIP…"; }
  try {
    const zip = new JSZip();
    Object.keys(temas).forEach((v) => {
      zip.file(`Examen-Version${v}.pdf`, buildExamPDF(v, temas[v]).output("arraybuffer"));
    });
    zip.file("Respuestas.pdf", buildAnswerKeyPDF(temas).output("arraybuffer"));
    const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "Examenes.zip";
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = "⬇️ Descargar ZIP con los 4 PDFs"; }
  }
}

/* ===================== 7. INIT ===================== */

document.addEventListener("DOMContentLoaded", async () => {
  setupSources();

  // Cargar la API key desde Vercel (variable de entorno, nunca expuesta en el código)
  try {
    const res = await fetch("/api/get-key");
    const data = await res.json();
    if (data.key) window._geminiKey = data.key;
  } catch (_) { /* silencioso, Gemini dará error claro si falta */ }

  document.getElementById("btn-analizar").addEventListener("click", analizarFuentes);
  document.getElementById("btn-generar").addEventListener("click", generarExamen);
  document.getElementById("btn-todos").addEventListener("click", () =>
    document.querySelectorAll(".topic-check").forEach((cb) => { cb.checked = true; }));
  document.getElementById("btn-ninguno").addEventListener("click", () =>
    document.querySelectorAll(".topic-check").forEach((cb) => { cb.checked = false; }));
  document.getElementById("btn-volver").addEventListener("click", () => {
    document.getElementById("card-temas").style.display = "none";
    document.getElementById("card-descarga").style.display = "none";
    document.getElementById("card-fuentes").scrollIntoView({ behavior: "smooth" });
  });
});
