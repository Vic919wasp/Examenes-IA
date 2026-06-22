# Generador de Exámenes IA

Subís hasta **3 fuentes** (páginas web y/o archivos PDF) con el material de
estudio. Gemini lee ese material y genera **3 temas de examen** multiple
choice de **15 preguntas cada uno**. Descargás 4 PDFs:

- `Examen-Tema1.pdf`, `Examen-Tema2.pdf`, `Examen-Tema3.pdf` — listos para
  imprimir, sin marcar la respuesta correcta.
- `Respuestas.pdf` — la grilla de corrección de los 3 temas.

Todo corre en Netlify: el sitio estático en `public/`, una sola función
serverless que habla con Gemini, y los PDFs se arman **en el navegador**
(con jsPDF), sin librerías de PDF del lado del servidor.

## 1. Cómo se usa

1. Completás 1 a 3 fuentes: cada una es una página web (pegás la URL) o un
   PDF (lo subís). Podés combinar — por ejemplo Fuente 1 = una URL, Fuente 2
   = un PDF.
2. Opcional: un campo de texto libre con contexto ("3° año, nivel medio,
   enfocarse en los capítulos 4 y 5", etc.).
3. Click **"Generar examen"** — tarda entre 20 y 40 segundos (Gemini lee
   todo el material y arma 45 preguntas).
4. Descargás los 4 PDFs con los botones que aparecen.

## 2. Estructura del proyecto

```
public/
  index.html        → la página (un solo flujo, sin pestañas)
  css/styles.css
  js/app.js          → filas de fuentes + llamada a la función + UI de descarga
  js/pdf.js          → arma los PDFs en el navegador con jsPDF (CDN)

netlify/functions/
  generate-exam.js   → única función: recibe las fuentes, llama a Gemini,
                        devuelve los 3 temas x 15 preguntas en JSON
  lib/gemini.js       → cliente compartido de Gemini (@google/genai)
  lib/html-to-text.js → limpia el HTML de las páginas web antes de mandarlo a la IA

netlify.toml         → publish="public", functions, redirect /api/* → functions
package.json         → dependencia: @google/genai
```

### Cómo lee cada tipo de fuente

- **Página web**: la función baja el HTML del lado del servidor (evita
  problemas de CORS) y lo limpia a texto plano antes de mandarlo a Gemini.
- **PDF**: se manda el archivo directamente a Gemini (lectura nativa de
  documentos) — no se extrae texto a mano, así que tablas/imágenes dentro
  del PDF también aportan contexto.

## 3. Conseguir la API key de Gemini

1. [Google AI Studio](https://aistudio.google.com/apikey) → generá una key gratis.
2. La vas a cargar como variable de entorno en Netlify (paso 5).

Modelo por defecto: `gemini-2.5-flash`. Cambiable con `GEMINI_MODEL` si tu
cuenta tiene acceso a otro (por ejemplo `gemini-3.5-flash`).

## 4. Probar localmente

```bash
npm install
cp .env.example .env
# completá GEMINI_API_KEY en .env
npx netlify dev
```

## 5. Desplegar en Netlify

### Opción A — repo de Git (recomendado)

1. Subí esta carpeta a un repo de GitHub.
2. Netlify → **Add new site → Import an existing project** → elegí el repo.
3. No hace falta tocar build settings, `netlify.toml` ya define todo.
4. **Site configuration → Environment variables** → agregá `GEMINI_API_KEY`
   con tu clave.
5. Si la variable la agregaste después del primer deploy: **Deploys →
   Trigger deploy → Deploy site (without cache)**.

### Opción B — Netlify CLI

```bash
npm install -g netlify-cli
netlify login
netlify init
netlify env:set GEMINI_API_KEY "tu-api-key"
netlify deploy --prod
```

## 6. Límites conocidos

- **Tamaño de PDFs subidos**: las funciones de Netlify tienen un límite de
  tamaño de request (~6 MB). El front avisa si un PDF pesa más de 6 MB, pero
  la forma más segura de evitar errores es usar PDFs livianos (apuntes de
  texto, no escaneos pesados de alta resolución).
- **Páginas web con mucho JavaScript**: la función baja el HTML "crudo" del
  servidor — si una página arma su contenido con JavaScript en el navegador
  (sitios muy dinámicos), puede traer poco texto útil. Funciona mejor con
  artículos, apuntes y páginas de contenido estático.
- **Cantidad de preguntas generadas**: a veces la IA puede devolver menos de
  15 preguntas en algún tema (raro, pero puede pasar con material muy corto).
  El sitio te avisa en pantalla si esto ocurre — revisá el PDF antes de
  imprimirlo.
- **Revisar antes de imprimir**: como con cualquier generación por IA,
  conviene leer las preguntas generadas antes de usarlas en una evaluación
  real (podés abrir los PDFs y chequear antes de fotocopiar).
