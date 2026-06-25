# Generador de Exámenes IA

Herramienta para docentes. Cargás material de estudio (URLs o PDFs), la IA identifica los temas, elegís cuáles incluir y genera 3 versiones del examen + hoja de respuestas en PDF.

## Cómo desplegar

**1. Agregar la API key de Gemini como secreto del repo:**
Settings → Secrets and variables → Actions → New repository secret
- Name: `GEMINI_API_KEY`
- Value: tu clave (obtenela gratis en https://aistudio.google.com/apikey)

**2. Activar GitHub Pages:**
Settings → Pages → Source: **GitHub Actions**

Cada push a `main` redeploya el sitio automáticamente.

## Cómo usar

1. Ingresá 1 a 3 fuentes (URL, PDF o texto pegado).
2. Click **"Analizar contenido"** — la IA detecta los temas.
3. Seleccioná los temas que querés incluir.
4. Click **"Generar 3 versiones del examen"**.
5. Descargá el ZIP con los 4 PDFs (3 versiones + respuestas).

## Archivos

```
.github/workflows/deploy.yml  ← inyecta la API key y despliega
public/
  index.html                  ← página principal
  css/styles.css
  js/
    config.js                 ← generado por el Action (no commitear)
    gemini-client.js          ← llama a Gemini desde el browser
    app.js                    ← lógica principal
    pdf.js                    ← genera los PDFs con jsPDF
```
