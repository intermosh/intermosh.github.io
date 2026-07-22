# ScriptLab

**Analítica para guiones de YouTube.**

ScriptLab es un editor por bloques que mide la estructura, el ritmo y la retención estimada de guiones de video. No genera texto. No envía datos a ningún servidor. Todo se ejecuta en tu navegador.

> **Estado:** Feature Freeze · v5
> **Stack:** Vanilla JavaScript · ES Modules · Web Workers · Sin framework · Sin build step

---

## Qué hace

- Organiza tu guion en bloques narrativos: HOOK, CONTEXTO, EVIDENCIA, GIRO, VISUAL, CTA.
- Calcula métricas en tiempo real mientras escribís.
- Proyecta retención estimada con curva por bloque.
- Analiza carga cognitiva, legibilidad y estructura.
- Opcionalmente, ejecuta análisis semántico con modelos de IA locales (embeddings + sentimiento).

## Qué NO hace

- No genera texto ni sugiere contenido.
- No envía tu guion a ningún servidor.
- No requiere cuenta, login ni registro.
- No recopila datos de ningún tipo.

---

## Captura

```
┌─────────────────────────────────────────────────────────┐
│  ScriptLab   ◌ Heurístico   ✦ 12 bloques     [Exportar]│
├────────────────────────┬────────────────────────────────┤
│                        │  ┌──────┐  ┌──────┐            │
│  [HOOK] Apertura       │  │  78  │  │  64% │            │
│  "¿Sabías que el 90%   │  │Salud│  │Retenc│            │
│   de los guiones..."   │  └──────┘  └──────┘            │
│                        │                                │
│  [CONTEXTO]            │  Retención estimada            │
│  Antecedentes del      │  ╭──────────────────╮          │
│  tema...               │  │ ╲                │          │
│                        │  │   ╲    ╭──────╮  │          │
│  [EVIDENCIA]           │  │     ╲──╯      ╰──│          │
│  Datos y respaldo...   │  ╰──────────────────╯          │
│                        │  0:00              12:30       │
│  [GIRO]                │                                │
│  Pattern interrupt...  │  Hook ████████ 85/100          │
│                        │  Ritmo ██████░░ 62/100         │
│  [CTA]                 │  Claridad ███████░ 75/100      │
│  Suscribite...         │  Promesa █████░░░ 55/100       │
└────────────────────────┴────────────────────────────────┘
```

---

## Instalación

No hay nada que instalar. Abrís `index.html` en un servidor HTTP local:

```bash
# Opción 1: Python
python3 -m http.server 8080

# Opción 2: Node.js
npx serve .

# Opción 3: PHP
php -S localhost:8080
```

Abrir:

```
http://localhost:8080/
```

> ScriptLab no funciona con `file://` porque los navegadores bloquean los imports de ES modules y workers en ese contexto.

---

## Estructura

```
├── index.html              Landing page
├── scriptlab.html          Aplicación principal
├── main.js                 Bootstrap + eventos
├── state.js                Estado centralizado + constantes
├── scoring.js              Motor ICN (Salud del guion)
├── retention-engine.js     Motor de retención + carga cognitiva
├── render.js               Todo el DOM + gráficos SVG
├── workers.js              Orquestación Web Workers
├── ai-worker.js            Embeddings (multilingual-e5-small)
├── sentiment-worker.js     Sentimiento (robertuito-sentiment-analysis)
├── retention-worker.js     Wrapper de retención
├── ai-shared.js            Primitivas puras compartidas
├── export-import.js        Import/export (JSON, MD, HTML, TXT, PDF)
├── db.js                   IndexedDB
├── styles.css              Estilos
├── sw.js                   Service Worker (offline)
├── diagnostics.js          Diagnóstico de entorno
├── scriptlab-v5-contract.md  Documento técnico definitivo
└── benchmarks/             Guiones de prueba
```

---

## Modos de análisis

### Heurístico (default)

Métricas instantáneas sin descarga de modelos. Calcula:

- **Salud del guion (ICN):** hook, claridad, ritmo, promesa, CTA.
- **Retención estimada (APV):** 8 factores ponderados con citas académicas.
- **Curva de retención:** por bloque, con detección de puntos de fuga.
- **Carga cognitiva:** ritmo de habla, densidad temática, descansos.
- **Estructura:** presencia de tipos de bloque esenciales.

### Modo IA (opcional)

Descarga modelos una vez (~110 MB). Después corre localmente vía WebAssembly:

- **Embeddings** (`Xenova/multilingual-e5-small`): alineación hook↔promesa, repetición, ideas centrales, ritmo de temas, cobertura semántica.
- **Sentimiento** (`Xenova/robertuito-sentiment-analysis`): arco emocional, engagement, momentum, saltos tonales.

Los modelos se cachean en el navegador. No se vuelven a descargar.

---

## Exportación

| Formato | Contenido |
|---|---|
| **JSON** | Completo, re-importable |
| **Markdown** | Guion legible |
| **HTML** | Dashboard con gráficas SVG |
| **PDF** | vía print del navegador |
| **Texto plano** | Solo texto |
| **Diagnóstico** | Métricas completas (JSON/TXT/HTML/PDF) |

---

## Métricas y fuentes

Cada número en el motor tiene una fórmula documentada y una cita de fuente. Las etiquetas epistemológicas son:

| Etiqueta | Significado |
|---|---|
| **Validado** | Fórmula publicada con respaldo académico |
| **Calculado** | Matemática sobre datos reales del guion |
| **Heurístico** | Regla transparente con justificación cualitativa |

Los pesos del modelo de retención están en `retention-engine.js` con citas inline. El detalle completo está en [`scriptlab-v5-contract.md`](scriptlab-v5-contract.md).

---

## Privacidad

- Todo el procesamiento ocurre en tu navegador.
- No hay backend, no hay telemetría, no hay tracking.
- Los datos se guardan en IndexedDB (local).
- Los modelos de IA se cachean en Cache Storage (local).
- No se envía texto a ningún servidor externo.

---

## Requisitos

- Navegador moderno con soporte para ES Modules, Web Workers e IndexedDB.
- Servidor HTTP local (no `file://`).
- Para Modo IA: conexión inicial para descargar los modelos.

---

## Creación

**ScriptLab** por [KRANK](https://www.youtube.com/@intermosh) de [Intermosh](https://www.youtube.com/@intermosh).

- YouTube: [@intermosh](https://www.youtube.com/@intermosh)
- GitHub: [intermosh](https://github.com/intermosh)

---

## Licencia

No se ha declarado una licencia. Los derechos de autor permanecen reservados por defecto.
