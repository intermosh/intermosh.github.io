# ScriptLab AI

Editor por bloques para analizar la arquitectura de guiones de YouTube.

ScriptLab permite ordenar un guion como un flujo narrativo, revisar señales de estructura y ritmo, y —de forma opcional— ejecutar análisis semántico con modelos IA locales. No genera texto ni reemplaza el criterio del autor.

> **Estado:** Feature Freeze · v4  
> **Arquitectura:** Vanilla JavaScript + ES Modules · sin framework · sin build step

## Qué incluye

- Editor visual por bloques: `HOOK`, `CONTEXTO`, `EVIDENCIA`, `SEGMENTO`, `GIRO`, `VISUAL` y `CTA`.
- Métricas heurísticas en tiempo real:
  - Salud del guion / ICN.
  - Duración y ritmo.
  - Claridad basada en Fernández-Huerta.
  - Carga cognitiva orientativa.
  - Estructura, riesgos y curva de retención.
- Modo IA opcional, ejecutado en el navegador:
  - Alineación entre hook y promesa.
  - Repetición semántica.
  - Ideas centrales.
  - Ritmo de temas.
  - Cobertura semántica.
  - Arco emocional por bloque.
- Calibración con métricas reales de YouTube Studio.
- Importación y exportación en JSON, Markdown y HTML.
- Persistencia local mediante IndexedDB.
- Tema oscuro y claro.
- Sin backend, login ni telemetría.

## Estado epistemológico

ScriptLab distingue entre:

- **Validado:** fórmulas publicadas con respaldo académico, como la fórmula de legibilidad de Fernández-Huerta.
- **Calculado:** resultados matemáticos derivados del contenido del guion, como duración, conteos o similitud semántica.
- **Heurístico:** reglas y proyecciones orientativas, como el índice compuesto de salud o la retención estimada.

La retención estimada no es una predicción validada de comportamiento de audiencia. Los pesos, fuentes, fórmulas y limitaciones están documentados en [`SCRIPT-LAB-METRICAS-Y-FUENTES.md`](uploads/SCRIPT-LAB-METRICAS-Y-FUENTES.md).

## Requisitos

- Navegador moderno con soporte para ES Modules, Web Workers e IndexedDB.
- Servidor HTTP local o HTTPS.
- Para el Modo IA: conexión inicial para descargar transformers.js y los modelos locales.

La aplicación **no funciona correctamente mediante `file://`**, porque los navegadores bloquean determinados imports de módulos y workers en ese contexto.

## Ejecutar localmente

Desde la raíz del repositorio:

```bash
python3 -m http.server 8080
```

Abrir:

```text
http://localhost:8080/uploads/scriptlab.html
```

También se puede servir la carpeta `uploads/` directamente:

```bash
cd uploads
python3 -m http.server 8080
```

Y abrir:

```text
http://localhost:8080/scriptlab.html
```

## Modo IA

El modo heurístico es el predeterminado y no requiere descarga.

Al activar el Modo IA, ScriptLab verifica la disponibilidad local de los modelos. Si no están disponibles, muestra la descarga y activa el modo operativo después de que ambos modelos hayan cargado correctamente.

Modelos utilizados:

- [`Xenova/multilingual-e5-small`](https://huggingface.co/Xenova/multilingual-e5-small): embeddings.
- [`Xenova/robertuito-sentiment-analysis`](https://huggingface.co/Xenova/robertuito-sentiment-analysis): sentimiento en español.

Transformers.js se carga dinámicamente desde jsDelivr dentro de los workers. Los textos analizados no se envían a un backend de ScriptLab.

## Estructura del proyecto

```text
uploads/
├── index.html                  # landing page
├── scriptlab.html              # interfaz principal (app)
├── main.js                # bootstrap y eventos
├── state.js               # estado y constantes
├── scoring.js             # ICN
├── retention-engine.js    # retención y carga cognitiva
├── workers.js             # ciclo de vida y mensajería
├── ai-worker.js           # embeddings y análisis semántico
├── sentiment-worker.js    # arco emocional
├── retention-worker.js    # wrapper de retención
├── render.js              # render completo del DOM
├── export-import.js       # importación y exportación
├── db.js                  # IndexedDB
├── ai-shared.js           # primitivas compartidas
├── styles.css             # estilos de la aplicación
├── sw.js                  # Service Worker
└── diagnostics.js         # diagnóstico de entorno

benchmarks/                # guiones de prueba ScriptLab
```

`render.js` se mantiene intencionalmente como un único archivo durante Feature Freeze.

## Benchmarks

La carpeta [`benchmarks/`](benchmarks/) contiene cuatro proyectos JSON para stress testing de los análisis:

- Cinematic Platformers — caso pobre.
- Creación de ScriptLab — caso excelente.
- Software abandonado — caso normal.
- IA pequeña en una netbook del gobierno de 2 GB — caso bueno.

Las etiquetas de rendimiento son categorías de diseño para comparar el comportamiento del sistema. No representan APV real ni validación de audiencia.

## Desarrollo y verificación

No hay build step. Para comprobar la sintaxis de los módulos:

```bash
for file in uploads/*.js; do
  node --check "$file"
done
```

Los cambios funcionales deben reflejarse en [`scriptlab-v5-contract.md`](uploads/scriptlab-v5-contract.md). El estado ejecutivo del producto está en [`SUMARIO.md`](uploads/SUMARIO.md).

## Restricciones conocidas

- El análisis IA depende de la disponibilidad del navegador, WASM, Cache Storage y del CDN inicial.
- Las métricas heurísticas no sustituyen datos reales de YouTube Studio.
- La calibración necesita registros reales; los benchmarks no deben utilizarse como APV simulado.
- No hay backend ni sincronización entre dispositivos.
- NER, generación de texto y reescritura están fuera de alcance.

## Licencia

No se ha declarado una licencia de software en este repositorio. Hasta que se agregue una, los derechos de autor permanecen reservados por defecto.
