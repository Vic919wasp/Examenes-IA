// public/js/app.js
//
// Índice rápido:
//   1. Estado global y helpers                        L. 12-55
//   2. Filas de fuentes (web / PDF)                   L. 57-115
//   3. PASO 1 — Analizar fuentes → lista de temas     L. 117-165
//   4. PASO 2 — Seleccionar temas + generar           L. 167-250
//   5. PASO 3 — Mostrar descarga de PDFs              L. 252-290
//   6. Init                                            L. 292-310

"use strict";

/* ===================== 1. ESTADO Y HELPERS ===================== */

const MAX_SOURCES = 3;
const TOTAL_VERSIONES = 3;
const sourcesState = [null, null, null]; // { type, url? } | { type, filename, mimeType, base64 }
let sourceTextsCache = [];               // textos extraídos de URLs (reutilizados en generación)

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

function setStatus(id, msg) {
  const el2 = document.getElementById(id);
  if (el2) el2.textContent = msg;
}

function setError(id, msg) {
  const cont = document.getElementById(id);
  if (!cont) return;
  cont.innerHTML = "";
  if (msg) cont.appendChild(el("div", { class: "error-box" }, msg));
}

/* ===================== 2. FILAS DE FUENTES ===================== */

function renderSourceRow(index) {
  const row = el("div", { class: "source-row" });
  row.appendChild(el("label", {}, `Fuente ${index + 1}${index > 0 ? " (opcional)" : ""}`));

  const typeSelect = el("select", { class: "source-type" }, [
    el("option", { value: "" }, "— Sin usar —"),
    el("option", { value: "url" }, "Página web (URL)"),
    el("option", { value: "pdf" }, "Archivo PDF"),
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
            ? { type: "url", url: e.target.value.trim() }
            : null;
          sourceTextsCache = [];
        },
      });
      inputArea.appendChild(inp);
    } else if (typeSelect.value === "pdf") {
      const fileInput = el("input", { type: "file", accept: "application/pdf" });
      const status = el("span", { class: "muted", style: "display:block; margin-top:4px" });
      fileInput.addEventListener("change", async () => {
        const file = fileInput.files[0];
        if (!file) { sourcesState[index] = null; status.textContent = ""; return; }
        status.textContent = file.size > 6 * 1024 * 1024
          ? "⚠️ PDF mayor a 6 MB, puede fallar."
          : `✓ ${file.name}`;
        const base64 = await fileToBase64(file);
        sourcesState[index] = { type: "pdf", filename: file.name, mimeType: "application/pdf", base64 };
      });
      inputArea.appendChild(fileInput);
      inputArea.appendChild(status);
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

  const sources = sourcesState.filter(Boolean);
  if (!sources.length) {
    setError("analizar-error", "Completá al menos una fuente (página web o PDF).");
    return;
  }

  btn.disabled = true;
  setStatus("analizar-status", "Analizando el material…");
  document.getElementById("card-temas").style.display = "none";
  document.getElementById("card-descarga").style.display = "none";

  try {
    // Primero bajamos los textos de URLs (función rápida, sin Gemini)
    const urlSources = sources.filter((s) => s.type === "url");
    if (urlSources.length) {
      const { texts, advertencias } = await apiPost("fetch-sources", { sources });
      sourceTextsCache = texts || [];
      if (advertencias && advertencias.length) {
        setError("analizar-error", advertencias.join(" — "));
      }
    }

    // Luego Gemini analiza los textos + PDFs para extraer temas
    const data = await apiPost("extract-topics", { sources });
    if (data.advertencias && data.advertencias.length && !document.getElementById("analizar-error").innerHTML) {
      setError("analizar-error", data.advertencias.join(" — "));
    }
    mostrarTemas(data.topics);
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
    `Se encontraron ${topics.length} temas. Seleccioná los que querés incluir en el examen:`;
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

/* ===================== 4. PASO 2: GENERAR (3 LLAMADAS SEPARADAS) ===================== */

function temasSeleccionados() {
  return Array.from(document.querySelectorAll(".topic-check:checked")).map((cb) => cb.value);
}

async function generarExamen() {
  const btn = document.getElementById("btn-generar");
  setError("generar-error", "");

  const seleccionados = temasSeleccionados();
  if (!seleccionados.length) {
    setError("generar-error", "Seleccioná al menos un tema.");
    return;
  }

  const sources = sourcesState.filter(Boolean);
  const sourcePdfs = sources.filter((s) => s.type === "pdf").map((s) => ({
    filename: s.filename, mimeType: s.mimeType, base64: s.base64,
  }));

  // Si no tenemos textos cacheados (p. ej. si se recargó la página), los volvemos a bajar
  if (!sourceTextsCache.length && sources.some((s) => s.type === "url")) {
    try {
      const { texts } = await apiPost("fetch-sources", { sources });
      sourceTextsCache = texts || [];
    } catch (e) {
      setError("generar-error", "No se pudieron leer las fuentes: " + e.message);
      return;
    }
  }

  btn.disabled = true;
  document.getElementById("card-descarga").style.display = "none";

  const progBar = document.getElementById("progreso-bar");
  const progTxt = document.getElementById("progreso-txt");
  document.getElementById("progreso-container").style.display = "block";

  const temas = {};
  const advertencias = [];
  const contexto = document.getElementById("contexto").value.trim();

  try {
    for (let v = 1; v <= TOTAL_VERSIONES; v++) {
      progTxt.textContent = `Generando versión ${v} de ${TOTAL_VERSIONES}…`;
      progBar.style.width = `${Math.round(((v - 1) / TOTAL_VERSIONES) * 100)}%`;

      const data = await apiPost("generate-version", {
        sourceTexts: sourceTextsCache,
        sourcePdfs,
        temasSeleccionados: seleccionados,
        versionNum: v,
        totalVersiones: TOTAL_VERSIONES,
        contexto,
      });

      temas[String(v)] = data.preguntas || [];
      if (data.advertencias) advertencias.push(...data.advertencias);

      progBar.style.width = `${Math.round((v / TOTAL_VERSIONES) * 100)}%`;
    }

    progTxt.textContent = "¡Listo!";
    setTimeout(() => { document.getElementById("progreso-container").style.display = "none"; }, 1200);
    mostrarDescarga(temas, advertencias);
  } catch (e) {
    setError("generar-error", e.message);
    document.getElementById("progreso-container").style.display = "none";
  } finally {
    btn.disabled = false;
  }
}

/* ===================== 5. PASO 3: DESCARGA PDFs ===================== */

function mostrarDescarga(temas, advertencias) {
  const card = document.getElementById("card-descarga");
  const resumen = document.getElementById("descarga-resumen");
  const advDiv = document.getElementById("descarga-advertencias");
  const downloads = document.getElementById("downloads");

  resumen.textContent = Object.keys(temas)
    .map((k) => `Versión ${k}: ${temas[k].length}/15 preguntas`).join("  ·  ");

  advDiv.innerHTML = "";
  if (advertencias.length) advDiv.appendChild(el("div", { class: "error-box" }, advertencias.join(" — ")));

  downloads.innerHTML = "";
  Object.keys(temas).forEach((v) => {
    downloads.appendChild(
      el("button", { class: "btn secondary", onclick: () => triggerDownload(buildExamPDF(v, temas[v]), `Examen-Version${v}.pdf`) },
        `📄 Versión ${v}`)
    );
  });
  downloads.appendChild(
    el("button", { class: "btn secondary", onclick: () => triggerDownload(buildAnswerKeyPDF(temas), "Respuestas.pdf") },
      "✅ Respuestas")
  );
  downloads.appendChild(
    el("button", {
      class: "btn",
      onclick: () => {
        Object.keys(temas).forEach((v) => triggerDownload(buildExamPDF(v, temas[v]), `Examen-Version${v}.pdf`));
        setTimeout(() => triggerDownload(buildAnswerKeyPDF(temas), "Respuestas.pdf"), 600);
      },
    }, "⬇️ Descargar los 4 PDFs")
  );

  card.style.display = "block";
  card.scrollIntoView({ behavior: "smooth", block: "start" });
}

/* ===================== 6. INIT ===================== */

document.addEventListener("DOMContentLoaded", () => {
  setupSources();
  document.getElementById("btn-analizar").addEventListener("click", analizarFuentes);
  document.getElementById("btn-generar").addEventListener("click", generarExamen);
  document.getElementById("btn-todos").addEventListener("click", () => {
    document.querySelectorAll(".topic-check").forEach((cb) => { cb.checked = true; });
  });
  document.getElementById("btn-ninguno").addEventListener("click", () => {
    document.querySelectorAll(".topic-check").forEach((cb) => { cb.checked = false; });
  });
  document.getElementById("btn-volver").addEventListener("click", () => {
    document.getElementById("card-temas").style.display = "none";
    document.getElementById("card-descarga").style.display = "none";
    document.getElementById("card-fuentes").scrollIntoView({ behavior: "smooth" });
  });
});
