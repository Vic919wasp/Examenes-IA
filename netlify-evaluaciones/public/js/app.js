// public/js/app.js
//
// Índice rápido:
//   1. Estado global y helpers                      L. 12-50
//   2. Filas de fuentes (web / PDF)                  L. 52-110
//   3. PASO 1 — Analizar fuentes → lista de temas   L. 112-160
//   4. PASO 2 — Seleccionar temas + generar         L. 162-230
//   5. PASO 3 — Mostrar descarga de PDFs             L. 232-270
//   6. Init                                           L. 272-290

"use strict";

/* ===================== 1. ESTADO Y HELPERS ===================== */

const MAX_SOURCES = 3;
const sourcesState = [null, null, null];
let topicsDetectados = [];

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

    if (typeSelect.value === "url") {
      const inp = el("input", {
        type: "text",
        placeholder: "https://...",
        oninput: (e) => {
          sourcesState[index] = e.target.value.trim()
            ? { type: "url", url: e.target.value.trim() }
            : null;
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
          ? "⚠️ PDF mayor a 6 MB, puede fallar. Probá con uno más liviano."
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
  for (let i = 0; i < MAX_SOURCES; i++) {
    container.appendChild(renderSourceRow(i));
  }
}

/* ===================== 3. PASO 1: ANALIZAR FUENTES → TEMAS ===================== */

async function analizarFuentes() {
  const btn = document.getElementById("btn-analizar");
  const statusEl = document.getElementById("analizar-status");
  const errorEl = document.getElementById("analizar-error");

  errorEl.innerHTML = "";
  const sources = sourcesState.filter(Boolean);

  if (sources.length === 0) {
    errorEl.appendChild(el("div", { class: "error-box" }, "Completá al menos una fuente (página web o PDF)."));
    return;
  }

  btn.disabled = true;
  statusEl.textContent = "Analizando el material… puede tardar unos segundos.";
  document.getElementById("card-temas").style.display = "none";
  document.getElementById("card-descarga").style.display = "none";

  try {
    const data = await apiPost("extract-topics", { sources });

    if (data.advertencias && data.advertencias.length) {
      errorEl.appendChild(el("div", { class: "error-box" }, data.advertencias.join(" — ")));
    }

    topicsDetectados = data.topics;
    mostrarTemas(topicsDetectados);
    statusEl.textContent = "";
  } catch (e) {
    errorEl.innerHTML = "";
    errorEl.appendChild(el("div", { class: "error-box" }, e.message));
    statusEl.textContent = "";
  } finally {
    btn.disabled = false;
  }
}

function mostrarTemas(topics) {
  const cardTemas = document.getElementById("card-temas");
  const list = document.getElementById("topics-list");
  const hint = document.getElementById("temas-hint");

  hint.textContent = `Se encontraron ${topics.length} temas. Seleccioná los que querés incluir en el examen:`;
  list.innerHTML = "";

  topics.forEach((topic, i) => {
    const id = `topic-${i}`;
    const label = el("label", { class: "topic-option", for: id }, [
      el("input", { type: "checkbox", id, value: topic, class: "topic-check", checked: "" }),
      el("span", {}, topic),
    ]);
    list.appendChild(label);
  });

  cardTemas.style.display = "block";
  cardTemas.scrollIntoView({ behavior: "smooth", block: "start" });
}

/* ===================== 4. PASO 2: SELECCIONAR TEMAS + GENERAR ===================== */

function temasSeleccionados() {
  return Array.from(document.querySelectorAll(".topic-check:checked")).map((cb) => cb.value);
}

async function generarExamen() {
  const btn = document.getElementById("btn-generar");
  const statusEl = document.getElementById("generar-status");
  const errorEl = document.getElementById("generar-error");

  errorEl.innerHTML = "";
  const seleccionados = temasSeleccionados();

  if (seleccionados.length === 0) {
    errorEl.appendChild(el("div", { class: "error-box" }, "Seleccioná al menos un tema."));
    return;
  }

  const sources = sourcesState.filter(Boolean);
  if (sources.length === 0) {
    errorEl.appendChild(el("div", { class: "error-box" }, "Las fuentes ya no están disponibles. Recargá la página." ));
    return;
  }

  btn.disabled = true;
  statusEl.textContent = `Generando 3 versiones × 15 preguntas sobre ${seleccionados.length} tema(s)… puede tardar 30-50 segundos.`;
  document.getElementById("card-descarga").style.display = "none";

  try {
    const data = await apiPost("generate-exam", {
      sources,
      temasSeleccionados: seleccionados,
      contexto: document.getElementById("contexto").value.trim(),
    });
    mostrarDescarga(data.temas, data.advertencias || []);
    statusEl.textContent = "";
  } catch (e) {
    errorEl.innerHTML = "";
    errorEl.appendChild(el("div", { class: "error-box" }, e.message));
    statusEl.textContent = "";
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

  const counts = Object.keys(temas).map((k) => `Versión ${k}: ${temas[k].length}/15 preguntas`);
  resumen.textContent = counts.join("  ·  ");

  advDiv.innerHTML = "";
  if (advertencias.length) {
    advDiv.appendChild(el("div", { class: "error-box" }, advertencias.join(" — ")));
  }

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
        setTimeout(() => triggerDownload(buildAnswerKeyPDF(temas), "Respuestas.pdf"), 500);
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
