# ScriptLab AI

ScriptLab es la primera suite gratuita y open-source de diagnóstico narrativo para creadores de YouTube. Permite ordenar un guion como un flujo narrativo, revisar señales de estructura y ritmo, y —de forma opcional— ejecutar análisis semántico con modelos IA 100% locales en tu navegador (sin enviar tus ideas a la nube).

> **Versión:** v1.0.1 RELEASE  
> **Arquitectura:** Vanilla JavaScript + ES Modules · sin framework · sin build step  
> **Privacidad:** Procesamiento IA Local (ONNX / WebAssembly)  

## Características

- **Editor visual por bloques:** `HOOK`, `CONTEXTO`, `EVIDENCIA`, `SEGMENTO`, `GIRO`, `VISUAL` y `CTA`.
- **Métricas heurísticas en tiempo real:**
  - Curva de Retención Estimada (APV).
  - Carga Cognitiva y Claridad (Fernández-Huerta adaptado al español).
  - Duración y ritmo.
- **Análisis Semántico Profundo (Modo IA):**
  - **Modelos locales:** Descarga y corre `Xenova/multilingual-e5-small` y `Xenova/robertuito-sentiment-analysis` directo en la RAM de tu navegador.
  - Detección de repetición y redundancia de ideas.
  - Evaluación del arco emocional y saltos de *engagement*.
  - Densidad temática y *gaps* de cobertura.

## Uso (Despliegue)

No requiere instalación, Node.js ni build step. ScriptLab es una aplicación estática *client-side*.
Solo sirve la carpeta raíz en cualquier servidor HTTP o platforma de hosting estático (GitHub Pages, Vercel, Netlify).

### Desarrollo local rápido (Python)
```bash
python3 -m http.server 8080
# Abre http://localhost:8080/scriptlab.html
```

### Node.js (npx)
```bash
npx serve .
# Abre http://localhost:3000/scriptlab.html
```

## Estructura de archivos

```text
├── index.html                  # Landing Page (Marketing/Onboarding)
├── scriptlab.html              # Interfaz principal (La App)
├── sw.js                       # Service Worker para funcionamiento offline
├── css/
│   └── styles.css              # Hoja de estilos principal
└── js/
    ├── main.js                 # Punto de entrada y orquestador
    ├── state.js                # Estado global y constantes
    ├── render.js               # Renderizado del DOM y gráficos
    ├── scoring.js              # Heurísticas e ICN
    ├── retention-engine.js     # Motor predictivo de retención APV
    ├── sentiment-engine.js     # Lógica matemática del arco emocional
    ├── workers.js              # Orquestador de Web Workers
    ├── ai-worker.js            # Worker de Embeddings (transformers.js)
    ├── sentiment-worker.js     # Worker de Clasificación (transformers.js)
    ├── retention-worker.js     # Worker asíncrono para UI fluida
    ├── ai-shared.js            # Funciones matemáticas y NLP puras
    ├── export-import.js        # Lógica de PDF, HTML, JSON y Markdown
    └── diagnostics.js          # Helpers de telemetría
```

## Calibración
La herramienta permite registrar métricas reales de tus videos publicados desde YouTube Studio. Acumulando 5 o más videos del mismo formato y género, el motor recalibrará sus pesos matemáticos para ajustarse a tu estilo de retención y público particular.

## Créditos y Licencia
Desarrollado por KRANK (@intermosh).
ScriptLab es Software Libre.
