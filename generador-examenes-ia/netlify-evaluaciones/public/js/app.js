// public/js/app.js
//
// Índice rápido:
//   1. Helpers chicos (el(), fileToBase64)              L. 14-40
//   2. Filas de fuentes (Fuente 1/2/3: web o PDF)         L. 42-100
//   3. Generar examen (llamada a la function + render)    L. 102-180
//   4. Init                                                L. 182-190

"use strict";

const MAX_SOURCES = 3;
const sourcesState = [null, null, null]; // cada slot: null | {type:'url', url} | {type:'pdf', filename, mimeType, base64}

/* ===================== 1. HELPERS ===================== */

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

/* ===================== 2. FILAS DE FUENTES ===================== */

function renderSourceRow(index) {
  const row = el("div", { class: "source-row" });

  row.appendChild(el("label", {}, `Fuente ${index + 1}${index === 0 ? "" : " (opcional)"}`));

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
      const urlInput = el("input", {
        type: "text",
        placeholder: "https://...",
        oninput: (e) => {
          sourcesState[index] = e.target.value.trim() ? { type: "url", url: e.target.value.trim() } : null;
        },
      });
      inputArea.appendChild(urlInput);
    } else if (typeSelect.value === "pdf") {
      const fileInput = el("input", { type: "file", accept: "application/pdf" });
      const status = el("span", { class: "muted", style: "display:block; margin-top:4px;" });
      fileInput.addEventListener("change", async () => {
        const file = fileInput.files[0];
        if (!file) { sourcesState[index] = null; status.textContent = ""; return; }
        if (file.size > 6 * 1024 * 1024) {
          status.textContent = "⚠️ El PDF pesa más de 6 MB, puede fallar. Probá con uno más liviano.";
        } else {
          status.textContent = "";
        }
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

/* ===================== 3. GENERAR EXAMEN ===================== */

async function generarExamen() {
  const statusEl = document.getElementById("gen-status");
  const errorEl = document.getElementById("gen-error");
  const btn = document.getElementById("btn-generate");
  const resultadoCard = document.getElementById("resultado-card");

  errorEl.innerHTML = "";
  const sources = sourcesState.filter(Boolean);

  if (sources.length === 0) {
    errorEl.appendChild(el("div", { class: "error-box" }, "Completá al menos una fuente (página web o PDF)."));
    return;
  }

  btn.disabled = true;
  statusEl.textContent = "Generando… puede tardar 20-40 segundos.";
  resultadoCard.style.display = "none";

  try {
    const res = await fetch("/api/generate-exam", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contexto: document.getElementById("contexto").value.trim(),
        sources,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `Error ${res.status}`);

    mostrarResultado(data.temas, data.advertencias || []);
  } catch (e) {
    errorEl.innerHTML = "";
    errorEl.appendChild(el("div", { class: "error-box" }, e.message));
  } finally {
    btn.disabled = false;
    statusEl.textContent = "";
  }
}

function mostrarResultado(temas, advertencias) {
  const resultadoCard = document.getElementById("resultado-card");
  const resumen = document.getElementById("resultado-resumen");
  const advDiv = document.getElementById("resultado-advertencias");
  const downloads = document.getElementById("downloads");

  const counts = Object.keys(temas).map((k) => `Tema ${k}: ${temas[k].length}/15 preguntas`);
  resumen.textContent = counts.join("  ·  ");

  advDiv.innerHTML = "";
  if (advertencias.length) {
    advDiv.appendChild(el("div", { class: "error-box" }, advertencias.join(" — ")));
  }

  downloads.innerHTML = "";

  Object.keys(temas).forEach((temaNumero) => {
    const preguntas = temas[temaNumero];
    downloads.appendChild(
      el("button", {
        class: "btn secondary",
        onclick: () => {
          const doc = buildExamPDF(temaNumero, preguntas);
          triggerDownload(doc, `Examen-Tema${temaNumero}.pdf`);
        },
      }, `📄 Descargar Tema ${temaNumero}`)
    );
  });

  downloads.appendChild(
    el("button", {
      class: "btn secondary",
      onclick: () => {
        const doc = buildAnswerKeyPDF(temas);
        triggerDownload(doc, "Respuestas.pdf");
      },
    }, "✅ Descargar respuestas")
  );

  downloads.appendChild(
    el("button", {
      class: "btn",
      onclick: () => {
        Object.keys(temas).forEach((temaNumero) => {
          buildExamPDF(temaNumero, temas[temaNumero]).save(`Examen-Tema${temaNumero}.pdf`);
        });
        buildAnswerKeyPDF(temas).save("Respuestas.pdf");
      },
    }, "⬇️ Descargar los 4 PDFs")
  );

  resultadoCard.style.display = "block";
  resultadoCard.scrollIntoView({ behavior: "smooth", block: "start" });
}

/* ===================== 4. INIT ===================== */

document.addEventListener("DOMContentLoaded", () => {
  setupSources();
  document.getElementById("btn-generate").addEventListener("click", generarExamen);
});
