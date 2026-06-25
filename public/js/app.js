// app.js — lógica principal del Generador de Exámenes IA
// L.1-80   helpers (el, fileToBase64, fetchUrl, setStatus/Error, buildParts, estilos)
// L.82-145 filas de fuentes (URL / PDF / Pegar texto)
// L.147-220 PASO 1: analizar → temas
// L.222-315 PASO 2: generar + redistribuirRespuestas
// L.317-370 PASO 3: descarga individual + ZIP
// L.372-395 init
"use strict";

const MAX_SOURCES = 3, TOTAL_V = 3, PREGUNTAS = 15;
const sourcesState = [null, null, null];
let textsCache = [], pdfsCache = [];

// ── Estilos de preguntas ──────────────────────────────────────────────────────

const ESTILOS = {
  multiple: `Cada pregunta es DIRECTA: una oración que pregunta algo concreto con 4 opciones (A-D).`,
  comprension: `Cada pregunta debe incluir un párrafo breve del material (entre comillas o precedido
de "Leé el siguiente texto:"), seguido de UNA pregunta de comprensión sobre ese párrafo con 4 opciones.`,
  completar: `Cada pregunta es una ORACIÓN CON UN ESPACIO EN BLANCO (___) que se completa con la
opción correcta. Las 4 opciones son palabras o frases cortas que encajan en el espacio.`,
  vof: `Cada pregunta presenta CUATRO AFIRMACIONES sobre el tema. Solo UNA es verdadera; las otras
tres son falsas o incorrectas. El enunciado es: "¿Cuál de las siguientes afirmaciones es VERDADERA?"`,
  caso: `Cada pregunta describe una SITUACIÓN, ESCENARIO O EJEMPLO PRÁCTICO relacionado con el tema
y pregunta qué ocurre, cuál es la causa, qué decisión tomar o cómo se aplica el concepto. 4 opciones.`,
  mixto: `Usá una mezcla equilibrada de los siguientes estilos (2-3 preguntas de cada tipo):
  - Opción múltiple directa
  - Comprensión de un párrafo del material
  - Completar la frase con ___
  - Cuál de 4 afirmaciones es la verdadera
  - Caso práctico o situación a resolver`,
};

function getEstiloSeleccionado() {
  const btn = document.querySelector(".estilo-btn.active");
  return btn ? btn.dataset.estilo : "multiple";
}

function setupEstilos() {
  document.querySelectorAll(".estilo-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".estilo-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
    });
  });
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function el(tag, attrs = {}, children = []) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") n.className = v;
    else if (k === "html") n.innerHTML = v;
    else if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v);
  }
  [].concat(children).forEach(c => c != null && n.appendChild(typeof c === "string" ? document.createTextNode(c) : c));
  return n;
}

function fileToBase64(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result.split(",")[1]);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

function limpiarHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ").replace(/<(br|p|div|li|h[1-6]|tr)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ").replace(/\n\s*\n\s*\n+/g, "\n\n").trim();
}

// Baja una URL: directo → corsproxy.io → allorigins.win
async function fetchUrl(url) {
  const enc = encodeURIComponent(url);
  const tryFetch = async (src, parseJson) => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 15000);
    try {
      const r = await fetch(src, { signal: ctrl.signal });
      clearTimeout(t);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const raw = parseJson ? (await r.json()).contents : await r.text();
      return limpiarHtml(raw || "");
    } catch (e) { clearTimeout(t); throw e; }
  };
  for (const [src, json] of [
    [url, false],
    [`https://corsproxy.io/?url=${enc}`, false],
    [`https://api.allorigins.win/get?url=${enc}`, true],
  ]) {
    try { const t = await tryFetch(src, json); if (t.length > 80) return t.slice(0, 25000); } catch (_) {}
  }
  throw new Error(`No se pudo leer el sitio. Usá "Pegar texto" para esta fuente.`);
}

function setStatus(id, msg) { const e = document.getElementById(id); if (e) e.textContent = msg; }
function setError(id, msg) {
  const e = document.getElementById(id);
  if (!e) return;
  e.innerHTML = "";
  if (msg) e.appendChild(el("div", { class: "error-box" }, msg));
}

function buildParts(texts, pdfs) {
  return [
    ...texts.map(s => ({ text: `--- Material (${s.url}) ---\n${s.text}` })),
    ...pdfs.flatMap(p => [
      { inlineData: { mimeType: p.mimeType || "application/pdf", data: p.base64 } },
      { text: `(Documento: ${p.filename || "PDF"})` },
    ]),
  ];
}

// ── Filas de fuentes ──────────────────────────────────────────────────────────

function renderSourceRow(index) {
  const row = el("div", { class: "source-row" });
  row.appendChild(el("label", {}, `Fuente ${index + 1}${index > 0 ? " (opcional)" : ""}`));

  const sel = el("select", { class: "source-type" }, [
    el("option", { value: "" }, "— Sin usar —"),
    el("option", { value: "url" }, "Página web (URL)"),
    el("option", { value: "pdf" }, "Archivo PDF"),
    el("option", { value: "text" }, "Pegar texto"),
  ]);
  const area = el("div", { class: "source-input" });

  sel.addEventListener("change", () => {
    area.innerHTML = "";
    sourcesState[index] = null;
    textsCache = [];

    if (sel.value === "url") {
      area.appendChild(el("input", {
        type: "text", placeholder: "https://...",
        oninput: e => { sourcesState[index] = e.target.value.trim() ? { type: "url", url: e.target.value.trim() } : null; textsCache = []; },
      }));

    } else if (sel.value === "pdf") {
      const fi = el("input", { type: "file", accept: "application/pdf" });
      const st = el("span", { class: "muted", style: "display:block;margin-top:4px" });
      fi.addEventListener("change", async () => {
        const f = fi.files[0];
        if (!f) { sourcesState[index] = null; st.textContent = ""; return; }
        st.textContent = f.size > 6 * 1024 * 1024 ? "⚠️ PDF mayor a 6 MB, puede tardar." : `✓ ${f.name}`;
        sourcesState[index] = { type: "pdf", filename: f.name, mimeType: "application/pdf", base64: await fileToBase64(f) };
      });
      area.appendChild(fi); area.appendChild(st);

    } else if (sel.value === "text") {
      area.appendChild(el("textarea", {
        placeholder: "Pegá acá el texto del material...",
        rows: "6",
        style: "width:100%;font-size:13px;padding:8px;border:1px solid var(--line);border-radius:var(--radius);resize:vertical;",
        oninput: e => { sourcesState[index] = e.target.value.trim() ? { type: "text", text: e.target.value.trim() } : null; },
      }));
    }
  });

  row.appendChild(sel); row.appendChild(area);
  return row;
}

function setupSources() {
  const c = document.getElementById("sources");
  for (let i = 0; i < MAX_SOURCES; i++) c.appendChild(renderSourceRow(i));
}

// ── PASO 1: Analizar → temas ──────────────────────────────────────────────────

async function analizarFuentes() {
  const btn = document.getElementById("btn-analizar");
  setError("analizar-error", "");
  textsCache = []; pdfsCache = [];

  const sources = sourcesState.filter(Boolean);
  if (!sources.length) { setError("analizar-error", "Completá al menos una fuente."); return; }

  btn.disabled = true;
  document.getElementById("card-temas").style.display = "none";
  document.getElementById("card-descarga").style.display = "none";

  const urlErrors = [];
  try {
    for (const [i, src] of sources.entries()) {
      if (src.type !== "url") continue;
      setStatus("analizar-status", `Descargando fuente ${i + 1}…`);
      try {
        textsCache.push({ index: i, text: await fetchUrl(src.url), url: src.url });
      } catch (err) { urlErrors.push(`Fuente ${i + 1}: ${err.message}`); }
    }

    sources.filter(s => s.type === "text").forEach((s, i) =>
      textsCache.push({ index: i, text: s.text, url: "texto pegado" }));

    pdfsCache = sources.filter(s => s.type === "pdf")
      .map(s => ({ filename: s.filename, mimeType: s.mimeType, base64: s.base64 }));

    if (!textsCache.length && !pdfsCache.length)
      throw new Error(urlErrors.join(" — ") || "Sin contenido válido.");
    if (urlErrors.length) setError("analizar-error", urlErrors.join(" — "));

    setStatus("analizar-status", "Analizando temas con IA…");
    const text = await geminiGenerate(
      `Analizá el material e identificá los TEMAS o UNIDADES principales (máx 20). Sé específico.
Respondé ÚNICAMENTE con JSON: { "topics": ["tema 1", ...] }`,
      buildParts(textsCache, pdfsCache), { json: true }
    );
    const topics = (extractJson(text).topics || []).filter(t => typeof t === "string" && t.trim()).map(t => t.trim());
    if (!topics.length) throw new Error("La IA no encontró temas en el material.");
    mostrarTemas(topics);
  } catch (e) {
    setError("analizar-error", e.message);
  } finally {
    btn.disabled = false; setStatus("analizar-status", "");
  }
}

function mostrarTemas(topics) {
  document.getElementById("temas-hint").textContent =
    `Se encontraron ${topics.length} temas. Seleccioná los que querés incluir:`;
  const list = document.getElementById("topics-list");
  list.innerHTML = "";
  topics.forEach((t, i) => {
    list.appendChild(el("label", { class: "topic-option", for: `tp-${i}` }, [
      el("input", { type: "checkbox", id: `tp-${i}`, value: t, class: "topic-check", checked: "" }),
      el("span", {}, t),
    ]));
  });
  const card = document.getElementById("card-temas");
  card.style.display = "block";
  card.scrollIntoView({ behavior: "smooth", block: "start" });
}

// ── PASO 2: Generar ───────────────────────────────────────────────────────────

function redistribuirRespuestas(lista) {
  if (!lista.length) return lista;
  const freq = [0, 0, 0, 0];
  lista.forEach(p => freq[p.ans]++);
  if (Math.max(...freq) <= Math.ceil(lista.length * 0.5)) return lista;
  const n = lista.length;
  const slots = [0, 1, 2, 3].flatMap(pos =>
    Array(Math.floor(n / 4) + (pos < n % 4 ? 1 : 0)).fill(pos));
  return lista.map((p, i) => {
    const nPos = slots[i % slots.length];
    if (nPos === p.ans) return p;
    const opts = [...p.opts];
    const correcta = opts.splice(p.ans, 1)[0];
    opts.splice(nPos, 0, correcta);
    return { q: p.q, opts, ans: nPos };
  });
}

async function generarExamen() {
  const btn = document.getElementById("btn-generar");
  setError("generar-error", "");
  const sel = Array.from(document.querySelectorAll(".topic-check:checked")).map(cb => cb.value);
  if (!sel.length) { setError("generar-error", "Seleccioná al menos un tema."); return; }
  if (!textsCache.length && !pdfsCache.length) { setError("generar-error", "Analizá el contenido primero."); return; }

  btn.disabled = true;
  document.getElementById("card-descarga").style.display = "none";
  document.getElementById("progreso-container").style.display = "block";

  const progBar = document.getElementById("progreso-bar");
  const progTxt = document.getElementById("progreso-txt");
  const contexto = document.getElementById("contexto").value.trim();
  const listaTemas = sel.map((t, i) => `  ${i + 1}. ${t}`).join("\n");
  const estiloKey = getEstiloSeleccionado();
  const estiloInstruccion = ESTILOS[estiloKey] || ESTILOS.multiple;
  const parts = buildParts(textsCache, pdfsCache);
  const temas = {}, advertencias = [];

  try {
    for (let v = 1; v <= TOTAL_V; v++) {
      progTxt.textContent = `Generando versión ${v} de ${TOTAL_V}…`;
      progBar.style.width = `${Math.round(((v - 1) / TOTAL_V) * 100)}%`;

      const text = await geminiGenerate(`Sos un profesor. Armá la VERSIÓN ${v} de ${TOTAL_V} de un examen
de opción múltiple basado en el material adjunto.
${contexto ? `Contexto: "${contexto}"` : ""}
Temas:\n${listaTemas}

ESTILO DE PREGUNTAS A USAR:
${estiloInstruccion}

Reglas generales:
- EXACTAMENTE ${PREGUNTAS} preguntas en español rioplatense.
- Preguntas distintas a otras versiones. Solo del material provisto.
- Cada pregunta: 4 opciones, una correcta. "ans" = índice (0-3) de la correcta.
- Distribuí la posición correcta de forma equilibrada (aprox. igual cantidad en 0, 1, 2 y 3).
- Opciones incorrectas plausibles.

Respondé ÚNICAMENTE con array JSON:
[{"q":"...","opts":["a","b","c","d"],"ans":2},...]`, parts, { json: true });

      const parsed = extractJson(text);
      const lista = redistribuirRespuestas(
        (Array.isArray(parsed) ? parsed : [])
          .filter(p => p && typeof p.q === "string" && Array.isArray(p.opts) && p.opts.length === 4)
          .slice(0, PREGUNTAS)
          .map(p => ({
            q: String(p.q).trim(),
            opts: p.opts.map(o => String(o).trim()),
            ans: Number.isInteger(p.ans) && p.ans >= 0 && p.ans <= 3 ? p.ans : 0,
          }))
      );
      temas[String(v)] = lista;
      if (lista.length < PREGUNTAS) advertencias.push(`Versión ${v}: ${lista.length}/${PREGUNTAS} preguntas.`);
      progBar.style.width = `${Math.round((v / TOTAL_V) * 100)}%`;
    }
    progTxt.textContent = "¡Listo!";
    setTimeout(() => { document.getElementById("progreso-container").style.display = "none"; }, 1500);
    mostrarDescarga(temas, advertencias);
  } catch (e) {
    setError("generar-error", e.message);
    document.getElementById("progreso-container").style.display = "none";
  } finally { btn.disabled = false; }
}

// ── PASO 3: Descarga ──────────────────────────────────────────────────────────

function mostrarDescarga(temas, advertencias) {
  document.getElementById("descarga-resumen").textContent =
    Object.keys(temas).map(k => `Versión ${k}: ${temas[k].length}/15 preguntas`).join("  ·  ");
  const adv = document.getElementById("descarga-advertencias");
  adv.innerHTML = "";
  if (advertencias.length) adv.appendChild(el("div", { class: "error-box" }, advertencias.join(" — ")));

  const dl = document.getElementById("downloads");
  dl.innerHTML = "";
  Object.keys(temas).forEach(v =>
    dl.appendChild(el("button", { class: "btn secondary",
      onclick: () => triggerDownload(buildExamPDF(v, temas[v]), `Examen-Version${v}.pdf`) },
      `📄 Versión ${v}`)));
  dl.appendChild(el("button", { class: "btn secondary",
    onclick: () => triggerDownload(buildAnswerKeyPDF(temas), "Respuestas.pdf") }, "✅ Respuestas"));
  dl.appendChild(el("button", { class: "btn", onclick: () => descargarZip(temas) },
    "⬇️ Descargar ZIP con los 4 PDFs"));

  const card = document.getElementById("card-descarga");
  card.style.display = "block";
  card.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function descargarZip(temas) {
  const btn = document.querySelector("#downloads .btn:last-child");
  if (btn) { btn.disabled = true; btn.textContent = "Generando ZIP…"; }
  try {
    const zip = new JSZip();
    Object.keys(temas).forEach(v =>
      zip.file(`Examen-Version${v}.pdf`, buildExamPDF(v, temas[v]).output("arraybuffer")));
    zip.file("Respuestas.pdf", buildAnswerKeyPDF(temas).output("arraybuffer"));
    const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement("a"), { href: url, download: "Examenes.zip" });
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  } finally { if (btn) { btn.disabled = false; btn.textContent = "⬇️ Descargar ZIP con los 4 PDFs"; } }
}

// ── Init ──────────────────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", () => {
  setupSources();
  setupEstilos();
  document.getElementById("btn-analizar").addEventListener("click", analizarFuentes);
  document.getElementById("btn-generar").addEventListener("click", generarExamen);
  document.getElementById("btn-todos").addEventListener("click", () =>
    document.querySelectorAll(".topic-check").forEach(cb => { cb.checked = true; }));
  document.getElementById("btn-ninguno").addEventListener("click", () =>
    document.querySelectorAll(".topic-check").forEach(cb => { cb.checked = false; }));
  document.getElementById("btn-volver").addEventListener("click", () => {
    document.getElementById("card-temas").style.display = "none";
    document.getElementById("card-descarga").style.display = "none";
    document.getElementById("card-fuentes").scrollIntoView({ behavior: "smooth" });
  });
});
