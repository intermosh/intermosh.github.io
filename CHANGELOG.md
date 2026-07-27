# Changelog
Todos los cambios notables en este proyecto se documentarán en este archivo.

El formato está basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.0.0/),
y este proyecto se adhiere a [Semantic Versioning](https://semver.org/lang/es/).

## [1.0.1] - 2026-07-25
### Añadido
- **Historial de Deshacer/Rehacer**: Implementado atajos `Ctrl+Z`, `Ctrl+Shift+Z` y `Ctrl+Y` con un historial de hasta 30 estados en memoria.
- **Onboarding Interactivo**: Los nuevos usuarios ahora ven un proyecto de ejemplo interactivo en lugar de una pantalla vacía, explicando los tipos de bloques y cómo funciona el análisis.
- **Indicador de Autoguardado**: Feedback visual sutil (`Guardando...` / `✓ Guardado`) en la esquina inferior derecha.
- **Nuevos Formatos de Exportación**: 
  - **CSV**: Exportación de guion con métricas bloque por bloque (palabras, duración estimada, retención, valencia, tono).
  - **TXT**: Exportación de guion limpio y en texto plano, y exportación de reportes de diagnóstico.
  - **HTML & PDF (Fancy)**: Reportes de diagnóstico y de guiones que clonan el DOM original e incluyen los gráficos de anillos, arco emocional y chips estructurales. Cuentan con soporte *Dark Mode* integrado.
- **Landing Page (Marketing)**: Nuevo archivo `index.html` con un diseño "One-Page" enfocado en los beneficios del software open source, IA local y privacidad, redirigiendo a la app.
- **Soporte de Navegadores Legacy**: Fallback robusto para `crypto.randomUUID` brindando compatibilidad con navegadores antiguos (Chrome < 92, Safari < 15.4).

### Cambiado
- **Estructura de Directorios**: Limpieza profunda de la raíz. Todos los scripts se reubicaron en `/js/` y los estilos en `/css/`. El Service Worker (`sw.js`) permanece en la raíz por políticas de alcance (scope).
- **Renombre de App**: La aplicación principal ahora reside en `scriptlab.html` (previamente `index.html`).
- **Promedios Vectoriales Ponderados**: El sistema de segmentación (*chunking*) para textos largos en los Workers de IA ahora agrega los *embeddings* usando un promedio ponderado basado en el número de palabras, logrando alta precisión semántica.
- **Integración Arco Emocional**: La retención estimada (APV) ahora integra el *Arco Emocional* dinámicamente con un peso del 11% si se ha activado el Modo IA, evaluando saltos tonales y el engagement emocional de las narrativas.
- **Traducción Integral**: Los reportes de diagnóstico y errores generados por la IA fueron completamente traducidos del inglés al español para mantener consistencia.

### Corregido
- **Condiciones de Carrera (Data Races) Críticas**: Se separó el identificador de mensajería (`requestId`) de los Web Workers en canales independientes (`sentimentRequestId`, `retentionRequestId`, `embedRequestId`). Escribir rápido ya no cancela ni bloquea la interfaz de manera cruzada.
- **Truncamiento Silencioso (IA)**: El modelo ya no trunca guiones largos (>512 tokens) silenciosamente. Se implementó una lógica jerárquica con fragmentación inteligente y reporte de coberturas de análisis.
- **Fallas de Análisis Ocultas**: Si un texto específico es demasiado largo o no tiene signos de puntuación, el sistema aplica divisiones forzadas por espacios como seguridad. Si aún así la IA rechaza el texto, el sistema visualiza un estado de `N/D` (punto hueco) transparente y emite un *Warning*, en lugar de corromper la métrica global tratándolo como un "0".
- **ReferenceError en Reportes**: Corregida una variable mal instanciada que congelaba la pestaña de "Analizar a fondo".
- **Destello de Selección (UX)**: Los errores detectados en el Reporte Semántico ahora son clicleables. Hacen *scroll* automático a la zona afectada en el Canvas y el bloque parpadea.