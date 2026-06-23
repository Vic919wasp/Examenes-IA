// public/js/app.js
//
// Índice rápido:
//   1. Estado global y helpers                         L. 10-55
//   2. Filas de fuentes (web / PDF)                    L. 57-112
//   3. PASO 1 — Analizar fuentes → lista de temas      L. 114-175
//   4. PASO 2 — Seleccionar temas + generar            L. 177-255
//   5. PASO 3 — Mostrar descarga de PDFs               L. 257-290
//   6. Init                                             L. 292-308

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
        placeholder: "Pegá acá el texto del material de estudio (copiado de la página web, un apunte, etc.)",
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
    setError("analizar-error", "Completá al menos una fuente (página web o PDF).");
    return;
  }

  btn.disabled = true;
  setStatus("analizar-status", "Bajando el contenido…");
  document.getElementById("card-temas").style.display = "none";
  document.getElementById("card-descarga").style.display = "none";

  try {
    // 1. Bajar texto de las URLs server-side (evita CORS)
    const urlErrors = [];
    if (sources.some((s) => s.type === "url")) {
      const { texts = [], advertencias = [] } = await apiPost("fetch-sources", { sources });
      sourceTextsCache = texts;
      if (advertencias.length) urlErrors.push(...advertencias);
    }

    // 1b. Textos pegados manualmente → van directo al cache
    sources.filter((s) => s.type === "text").forEach((s, i) => {
      sourceTextsCache.push({ index: i, text: s.text, url: "texto pegado manualmente" });
    });

    // 2. Separar PDFs
    sourcePdfsCache = sources
      .filter((s) => s.type === "pdf")
      .map((s) => ({ filename: s.filename, mimeType: s.mimeType, base64: s.base64 }));

    if (!sourceTextsCache.length && !sourcePdfsCache.length) {
      const detalle = urlErrors.length
        ? urlErrors.join(" — ") + " → Usá la opción \"Pegar texto\" para ese sitio."
        : "Completá al menos una fuente con contenido válido.";
      throw new Error(detalle);
    }

    // Mostrar advertencias de URLs bloqueadas pero continuar si hay otras fuentes
    if (urlErrors.length) {
      setError("analizar-error", urlErrors.join(" — ") + " (se continúa con las otras fuentes)");
    }

    // 3. Gemini extrae los temas (server-side, 60s timeout en Vercel)
    setStatus("analizar-status", "Analizando temas con IA…");
    const { topics } = await apiPost("extract-topics", {
      sourceTexts: sourceTextsCache,
      sourcePdfs: sourcePdfsCache,
    });

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
    setError("generar-error", "Volvé al paso 1 y analizá el contenido primero.");
    return;
  }

  btn.disabled = true;
  document.getElementById("card-descarga").style.display = "none";
  document.getElementById("progreso-container").style.display = "block";

  const progBar = document.getElementById("progreso-bar");
  const progTxt = document.getElementById("progreso-txt");
  const contexto = document.getElementById("contexto").value.trim();
  const temas = {};
  const advertencias = [];

  try {
    for (let v = 1; v <= TOTAL_VERSIONES; v++) {
      progTxt.textContent = `Generando versión ${v} de ${TOTAL_VERSIONES}…`;
      progBar.style.width = `${Math.round(((v - 1) / TOTAL_VERSIONES) * 100)}%`;

      const data = await apiPost("generate-version", {
        sourceTexts: sourceTextsCache,
        sourcePdfs: sourcePdfsCache,
        temasSeleccionados: seleccionados,
        versionNum: v,
        totalVersiones: TOTAL_VERSIONES,
        contexto,
      });

      temas[String(v)] = data.preguntas || [];
      if (temas[String(v)].length < PREGUNTAS_POR_VERSION) {
        advertencias.push(`Versión ${v}: ${temas[String(v)].length}/${PREGUNTAS_POR_VERSION} preguntas.`);
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

/* ===================== 5. PASO 3: DESCARGA ===================== */

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

/* ===================== DESCARGA ZIP ===================== */

async function descargarZip(temas) {
  const btn = document.querySelector("#downloads .btn:last-child");
  if (btn) { btn.disabled = true; btn.textContent = "Generando ZIP…"; }

  try {
    const zip = new JSZip();

    // Agregar cada versión del examen
    Object.keys(temas).forEach((v) => {
      const doc = buildExamPDF(v, temas[v]);
      const pdfBytes = doc.output("arraybuffer");
      zip.file(`Examen-Version${v}.pdf`, pdfBytes);
    });

    // Agregar la hoja de respuestas
    const respDoc = buildAnswerKeyPDF(temas);
    zip.file("Respuestas.pdf", respDoc.output("arraybuffer"));

    // Generar y descargar el ZIP
    const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "Examenes.zip";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = "⬇️ Descargar ZIP con los 4 PDFs"; }
  }
}

/* ===================== 6. INIT ===================== */

document.addEventListener("DOMContentLoaded", () => {
  setupSources();
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
