# YouTube Script Lab

Editor de guiones para YouTube con análisis de retención, ritmo, legibilidad y un "preflight" que da un score direccional. No es una herramienta de análisis de canal ni un predictor de views.

El proyecto vive en un único directorio: HTML, CSS y JavaScript plano. Sin bundler, sin dependencias npm, sin backend, sin llamadas a APIs externas. Se abre con doble clic en `index.html` y funciona.

## Qué es

- Un editor de guiones por bloques tipados (voz, visual, texto en pantalla, SFX, pausa, CTA, fuente).
- Un motor heurístico que calcula duración estimada, hook score, claridad (Fernández-Huerta adaptada), ritmo visual y una curva de retención simulada.
- Un sistema de calibración: si cargás tus métricas reales post-publicación, podés ajustar el benchmark de APV por par (formato, género) en lugar de usar los valores genéricos por defecto.
- Un visor `visor.html` con 4 estilos de lectura (Bloques, Cinematográfico, Despejado, Grabación) y modo dark/light.
- Un conversor offline de texto plano a JSON de guion — no usa LLM, no llama a ninguna API. Es JavaScript con reglas léxicas y estructurales.

## Qué no es

- No predice views, suscriptores ni CTR. El score de preflight no es una predicción de rendimiento.
- No se conecta a YouTube Studio. Los datos reales (APV, retención a 30s, CTR) los cargás a mano desde Analytics.
- No usa machine learning. Las heurísticas son reglas escritas a mano. La mayoría de las constantes numéricas del motor (umbrales, pesos, bonus) **no tienen respaldo empírico directo** — el catálogo `HEURISTICS` en `js/config.js` documenta cada una con su estado de validación.
- No es un sustituto del juicio editorial. Si el motor marca algo como "riesgo" y vos tenés una razón artística para hacerlo, hacelo igual.
- No exporta a formatos de edición de video (Premiere, DaVinci, etc.) — solo TXT, JSON y HTML standalone.

## Cómo se usa

### 1. Editor (`index.html`)

Abrilo con doble clic o serví el directorio con `python3 -m http.server 8000`. Ambos funcionan.

- **Proyecto**: título, promesa, audiencia, formato (long/short/live), género, duración objetivo, WPM. El campo "Retención real" te deja calibrar manualmente con el APV de un video comparable del canal.
- **Bloques**: agregá bloques con la barra de botones. Cada tipo tiene color y comportamiento distinto. La voz define el runtime; los visuales/SFX/pausa son eventos paralelos salvo que marques "suma tiempo".
- **Sidebar derecho**: gauge con el score de preflight, indicador siempre visible de calibración, quick-stats (duración, voz, APV/AVD direccional, ritmo visual, legibilidad FH, fuentes, CTA), y 5 tabs:
  - **Curva**: gráfico de retención simulada con benchmark y riesgos marcados.
  - **Tiempos**: timeline de bloques.
  - **Riesgos**: lista con timestamp y acción concreta.
  - **Checklist**: verificaciones rápidas (hook, CTA, fuentes, ritmo, duración).
  - **Research**: dos secciones separadas — "Validado con fuente" (3 constantes con cita) y "Heurística sin validar" (33 constantes sin respaldo directo). Más abajo, listado de 17 fuentes consultadas.
  - **Datos Reales**: formulario para cargar métricas post-publicación + tabla de buckets + comparación predicho vs real + historial de recalibraciones.

### 2. Convertir texto (botón ✨)

Modal con dos paneles. Pegás un texto fuente (artículo, transcripción, notas) en el izquierdo; el derecho muestra el JSON convertido en vivo (350ms de debounce).

El conversor detecta:

- **Tipos de bloque** por marcadores explícitos (`[VOZ]`, `[VISUAL]`, `[SFX]`, `[PAUSA 2]`, `[CTA]`, `[FUENTE]`), etiquetas con dos puntos (`VOZ:`, `VISUAL:`), keywords ("mostrar", "golpe musical", "suscribite"), patrones estructurales (ALL CAPS corto, URLs, listas) y orden de prioridad.
- **Metadata del proyecto**: título (primera línea corta o ALL CAPS), promesa (patrones "vas a ver / te muestro / al final / por qué"), formato (short si <300 palabras, live si menciona "en vivo"), género (scoring por keywords con tolerancia a acentos), targetMinutes (voice words / 150 WPM).
- **Limpieza de ruido**: strip de markdown (headers, énfasis, bullets), timestamps, blockquotes.

Botones: **🔄 Convertir** (manual), **Limpiar**, **📋 Copiar JSON**, **Importar al editor** (reemplaza el guion actual con confirmación).

### 3. Vista previa (botón 👁)

Abre `visor.html` en otra pestaña con el guion actual. El visor tiene:

- **4 estilos**:
  - **Bloques**: tarjetas con borde de color por tipo, header con número + tipo + duración. Default.
  - **Cinematográfico**: tipo de bloque como etiqueta vertical en el margen izquierdo, voz en tipografía grande, visuales en itálica.
  - **Despejado**: mucho whitespace, voz en grande (1.28rem), visuales como notas al pie con borde izquierdo, CTA separado con línea punteada.
  - **Grabación**: voz centrada, mono, grande (1.5rem, max 22ch), visuales en mayúsculas pequeñas. Pensado para leer en vivo desde un teleprompter.
- **Dark / Light**: paletas optimizadas para lectura desde monitor (estilo GitHub dark/light).
- Las preferencias (estilo + tema) se persisten en `localStorage`.

### 4. Exportar (dropdown ⤓ Exportar ▾)

- **📝 TXT**: texto plano con bloques numerados.
- **{ } JSON**: estado completo del proyecto + bloques + análisis.
- **📄 HTML**: standalone — un archivo `.html` con el CSS+JS+JSON del guion embebidos. Se abre con doble clic, funciona sin servidor, hereda los 4 estilos y el dark/light del visor. Útil para enviar a un colega que no tiene el editor.

### 5. Datos Reales + Recalibración

El tab **Datos Reales** te deja cargar métricas reales post-publicación y usarlas para recalibrar el benchmark de APV por par (formato, género).

**Formulario por video**: título, fecha, formato, género, duración real, APV real %, retención a 30s % (opcional), CTR % (opcional), APV predicho por el preflight % (opcional), referencia al guion (texto libre).

**Tabla de buckets** (3 formatos × 5 géneros = 15): muestra `n/5`, promedio real, valor actual, estado (calibrado o heurístico), botón Recalibrar. El botón queda deshabilitado hasta tener 5+ registros en el bucket.

**Comparación predicho vs real**: delta absoluto, sin colorear bien/mal.

**Historial append-only**: cada recalibración queda registrada con valor viejo, nuevo, fecha, n muestras y nota (incluye "cap" si se aplicó tope ±8pp).

Reglas de recalibración (no opcionales):

- Deshabilitado hasta 5+ registros por bucket.
- Nuevo valor = promedio de APV reales del bucket.
- Cambio limitado a ±8 puntos porcentuales por recalibración. Si el promedio excede el tope, aplica el tope y deja nota de ajuste pendiente.
- Los pesos del preflight (`hook·0.23`, `retención·0.24`, etc.) **no se tocan** automáticamente — solo el benchmark base.
- Siempre con confirmación explícita del usuario. Nunca corre en background ni al cargar la página.
- Cada recalibración se appendea al historial. Nunca se sobreescribe.

## Estructura

```
editor/
├── index.html              markup + carga de scripts en orden
├── visor.html              visor standalone con 4 estilos + dark/light
├── css/
│   └── styles.css          volcado del <style> original
├── js/
│   ├── config.js           constantes (TYPES, SOURCES, HEURISTICS, CALIBRATION_CONFIG, BENCHMARK_BUCKETS, EXAMPLE_STATE)
│   ├── model.js            cálculo puro (analyze, hookScore, retentionModel, benchmarkAPV, fernandezHuerta, buildRisks, recalibrateBucket)
│   ├── render.js           todo lo que toca el DOM (renderBlocks, renderMetrics, renderCurve, renderRisks, renderChecklist, renderSources, renderRealData)
│   ├── converter.js        motor offline de texto → JSON
│   ├── visor-assets.js     CSS+JS del visor como strings (para exportHtml)
│   └── app.js              estado, persistencia, binding, import/export, init
└── data/
    ├── example-script.json  espejo descargable del ejemplo
    ├── real_scores.json     seed vacío (la data viva está en localStorage)
    └── recab_history.json   seed vacío (la data viva está en localStorage)
```

Orden de carga: `config → model → render → visor-assets → converter → app`. Cada archivo expone un objeto global (`window.Config`, `window.Model`, `window.Render`, `window.VisorAssets`, `window.Converter`, `window.App`).

## Almacenamiento

Cuatro keys distintas en `localStorage` — nunca se mezclan:

| Key | Contenido |
|-----|-----------|
| `yt-script-lab-v1` | Estado del guion (proyecto + bloques) |
| `yt-script-lab-real-scores-v1` | Registros de métricas reales post-publicación |
| `yt-script-lab-benchmarks-v1` | Benchmarks activos por (formato, género) |
| `yt-script-lab-recab-history-v1` | Historial append-only de recalibraciones |
| `yt-script-lab-visor-pending` | Guion pendiente de leer por el visor (transient) |
| `yt-script-lab-visor-prefs` | Preferencias de estilo + tema del visor |
| `yt-script-lab-metrics-visible` | Visibilidad del panel de métricas |

No hay sync entre navegadores ni backup automático. Si querés mover data a otra máquina, usá Exportar JSON.

## Sobre la honestidad de los números

El score-card muestra siempre (texto visible, no tooltip):

> **⚠ Simulación heurística** basada en reglas de escritura y, donde fue posible, en datos publicados — **no en datos de tu canal**. Comparalo con tus métricas reales de YouTube Studio.

Junto al preflight hay un indicador siempre visible del estado de calibración:

- `Sin calibrar (benchmark genérico)` — heurística sin datos del canal.
- `n=X videos, calibrado (format+genre)` — benchmark recalibrado con datos reales.
- `Calibrado con este video (n=1, realRetention manual)` — override manual del campo realRetention.

### Qué está validado empíricamente

Pocas cosas. El catálogo completo está en `js/config.js → HEURISTICS` y en el tab **Research** de la UI.

**Validado con fuente** (3 entradas):

- **Fórmula de Fernández-Huerta** (`206.84 − 60·(sílabas/palabra) − 1.02·(palabras/frase)`) — adaptación de Flesch Reading Ease al español, Fernández-Huerta 1959.
- **Definiciones de métricas YouTube Analytics API** (averageViewDuration, averageViewPercentage, estimatedMinutesWatched, audienceWatchRatio, relativeRetentionPerformance) — documentación oficial de Google Developers.
- **Forma cualitativa de la curva de retención** (nose-body-tail: caída inicial fuerte, caída gradual, inflexión final) — Altman & Jiménez 2019, ValueTools/ACM. La forma es válida; la interpolación algebraica específica (lineal + easeOut exponente 1.8) **no** está validada.

**Heurística sin validar** (33 entradas). Algunos ejemplos:

- Bonus por rango 35–95 palabras del hook (+13), <20 (−15), >120 (−8)
- Bonus por abrir con pregunta (+9), por palabra de tensión/curiosidad (+12), por promesa de valor concreto (+9)
- Umbrales de solapamiento léxico título↔hook (>.38 = +14, >.18 = +7, bajo = −11)
- Umbrales de APV esperado por duración (≤180s→0.62, ≤300→0.55, ≤600→0.47, ≤900→0.41, ≤1800→0.34, resto→0.30)
- Ajustes por género (tutorial +0.03, entretenimiento +0.02, ensayo −0.02)
- APV para Shorts (0.82) y Live (0.24)
- Coeficientes del modelo de retención (hook 0.0015, pacing 0.0012, clarity 0.0007, visual 0.001, promise 0.0011)
- Fórmula de r30 (`0.48 + hook·0.0032 + promise·0.0012 + visual·0.0009`)
- Pesos del preflight (`hook·0.23 + retención·0.24 + pacing·0.15 + clarity·0.12 + visual·0.11 + promise·0.08 + cta·0.04 + source·0.03`)

Algunas tienen **apoyo direccional** de fuentes contextuales (Loewenstein 1994 para curiosity gaps, Cutting et al. 2016 para pacing cinematográfico, Carlson et al. 2024 para fillers, Retention Rabbit 2025 / humbleandbrag 2026 / prepublish.ai 2026 para rangos de APV por duración). Pero la magnitud específica de cada constante es heurística.

La lista completa de fuentes consultadas está en `js/config.js → SOURCES` (17 entradas: 7 validadas + 10 contextuales) y en el tab Research de la UI.

### Qué no se va a "aprender" de tus datos reales

La recalibración solo toca `benchmarkAPV[formato][género]`. Los scores de texto (hook, clarity, pacing, promise, cta, source) y los pesos del preflight quedan fijos. La razón es honesta: para correlacionar esos scores con retención real de forma estadísticamente significativa necesitarías muchísimos más videos de los que un canal individual publica en el corto plazo. Pretender aprenderlos con 5 videos sería overfitting vestido de ciencia.

## Limitaciones conocidas

- **Idioma**: las heurísticas de texto (stop-words, familias de sinónimos, keywords del conversor, detección de géneros) están escritas para español rioplatense. Para otros idiomas o variantes regionales van a dar resultados mixtos.
- **Conversor**: es un clasificador basado en reglas. Funciona bien con texto estructurado (artículos, guiones con marcadores explícitos, transcripciones con pausas marcadas). Funciona mal con prosa narrativa sin pistas tipográficas. No espera ser un sustituto de un LLM; espera ser una opción offline que no envía tu texto a ningún servidor.
- **Curva de retención simulada**: la forma cualitativa (nose-body-tail) está documentada en literatura, pero la interpolación específica que usa el motor es arbitraria. Tratala como aproximación direccional, no como predicción.
- **Ritmo visual (3/min para long, 8/min para shorts)**: Cutting et al. (2016) reporta ~14 cortes/min en cine contemporáneo y ~8/min en cine silente. Los 3/min para video largo están por debajo de cualquier baseline documentado. Ajustá con datos propios.
- **Fillers**: el motor usa un modelo lineal `−1.2` por filler. Carlson et al. (2024) encuentran un efecto umbral (≤5/min aceptable, 12/min significativamente peor), no lineal. El modelo del motor probablemente sobre-penaliza fillers a baja densidad.
- **Sin sync**: la data vive en `localStorage` del navegador. Si limpiás la caché o cambiás de navegador, perdés todo. Exportá JSON regularmente.
- **Sin multi-usuario**: no hay cuentas, no hay permisos. Una sola persona por navegador.

## Cómo extenderlo

- **Agregar un tipo de bloque**: editá `TYPES` en `js/config.js` (label, color, placeholder), agregá la duración en `blockDuration` de `js/model.js`, agregá el render en `js/render.js`. El conversor y el visor lo van a ignorar salvo que los edites también.
- **Cambiar pesos del preflight**: editá la fórmula en `analyze()` de `js/model.js`. Si lo hacés, actualizá la entrada correspondiente en `HEURISTICS` (`js/config.js`) para que el tab Research siga siendo honesto.
- **Agregar un estilo al visor**: agregá una clase `.style-tal {...}` en `visor.html` y en el `<style>` embebido en `js/visor-assets.js`. Agregá el botón en la toolbar. Regenerá `visor-assets.js` con el script `scripts/extract_original.py` (o editá a mano).
- **Calibrar con datos propios**: usá el tab Datos Reales. No edites `benchmarkAPV` a mano salvo que sepas lo que estás haciendo — el sistema de recalibración existe precisamente para que no tengas que tocar código.

## Licencia

El código es tuyo para usar y modificar. No hay licencia formal todavía — si lo vas a usar en un contexto comercial, escribí al autor. Las fuentes citadas en `SOURCES` tienen sus propias licencias y deben respetarse.

## Estado del proyecto

Prototipo funcional, no producto. Las decisiones de diseño priorizaron honestidad sobre convinencia: el disclaimer siempre visible, el catálogo `HEURISTICS` que separa lo validado de lo que no, la recalibración que se niega a tocar pesos del preflight automáticamente. Si encontrás un bug o querés mejorar una heurística, abrí un issue o mandá un PR.
