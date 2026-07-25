# Changelog

Todos los cambios notables del proyecto se documentan acá.
Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/).

> La historia técnica completa de la build (auditoría arena/mimo, merge,
> decisiones PASO 1–3 y los 10 fixes finales) está en
> [`docs/CHANGELOG-COMBINED.md`](./docs/CHANGELOG-COMBINED.md).

## [Unreleased]

## [1.0.0a] — 2026-07-22

Primera release pública. Motor de diagnóstico `combined-2.0.0` ·
versión de app `1.0.0a` (`APP_VERSION` en `js/state.js`).

### Motor de diagnóstico

- **ICN / Salud** — `hook×0.31 + claridad×0.22 + ritmo×0.22 + promesa×0.17 + 8×(calidadCTA/100)`.
  Bonus de CTA **escalado por calidad** (E2; Wistia CTA study: mid-roll
  16.95 % vs post-roll 10.98 %). Sin CTA real = +0 (elimina el crédito
  fantasma del default heredado).
- **APV / Retención** — 9 factores; el **arco emocional entra con peso 0.11**
  cuando hay análisis IA disponible (E1; Berger et al. 2026, JAMS/Springer;
  Song et al. 2023, eNeuro): `0.4·flips + 0.4·engagement + 0.2·momentum⁺`.
  Sin arco: N/D y renormalización ÷0.89 (retrocompatible con 1.0).
- **Arco emocional** — valencias robertuito por bloque de voz (sin notas
  VISUAL); missing ≠ 0; chunking híbrido.
- **Legibilidad** — sílabas con reglas RAE + Fernández-Huerta (crudo; null
  si <3 palabras).
- **Citas corregidas (P5)** — eliminadas referencias no verificables que
  venían de fábrica ("Think with Google +47 % AVD", "Backlinko caída
  30–45 s").

### App y exportaciones

- Consolidación de la auditoría de dos builds (`arena` + `mimo`): motor mimo
  como base + rescates (sanitizers, chunking, sílabas RAE, modo IA honesto).
- Repo organizado: `/js`, `/css`, `/docs`, `/tests`.
- `metricas.html`: desglose web de pesos, fórmulas y fuentes con links.
- Landing `index.html` con tabla comparativa de competidores.
- Menú de exportación agrupado: GUION (JSON/HTML/MD/TXT/**CSV**/PDF) y
  DIAGNÓSTICO (JSON/TXT/**CSV**/HTML/PDF).
- **Export HTML reescrito**: onepage 100 % autocontenida con el look & feel
  de la app (anillos, curva clickeable, factores, ECG del arco) — doble click
  y se ve.
- **Problemas detectados clickeables**: scroll suave + destello al bloque
  responsable (riesgos de retención y hallazgos del análisis IA).
- Leyenda del arco con puntos de color (`.lg-dot` tenía los nodos en el DOM
  pero nunca tuvo regla CSS).
- Header compacto (meta-bar en línea, 52 px como la barra de Bloques).
- Import/export JSON v4 compatible con guiones de las builds anteriores.

### Fixed (encontrados por la verificación E2E en Chromium real)

- **DIAGNÓSTICO → HTML** ahora genera la misma onepage rica que GUION → HTML
  (anillos, curva, factores, ECG, bloques anclables, stamps de versión).
  Antes era un documento de texto con estilos sueltos, sin gráficas ni metadatos.
- **`sw.js` faltante**: la app registraba un Service Worker inexistente
  (404 en cada carga). Agregado: network-first + shell offline.
- **"Problemas detectados" stale**: tras importar un guion podía mostrar
  hallazgos del proyecto anterior (`resetAIResults()` no limpiaba
  `_redundancyResult`/`_gapsResult`/`_densityResult`/`_extractiveResult`).

### Calidad

- **94/94 tests** en Node (`node tests/run-tests.mjs`), con valores fijados
  para E1 (arco→APV) y E2 (CTA escalado) desde combined-2.0.0.
- Benchmark reproducible con 4 guiones de referencia: Salud 18/67/81/67 ·
  APV heurístico 31/68/80/63 (malo/medio/espectacular/mentes perturbadas).
- CI con GitHub Actions (Node 20 y 22); workflow E2E manual (`e2e.yml`).
- **E2E en Chromium headless real (puppeteer-core + chrome-headless-shell 151):**
  28/28 checks heurísticos + 9/9 fase IA. Paridad Node↔browser exacta
  (ICN/APV 18/31 % y 46/54 %), exports verificados en navegador (BOM por
  bytes, onepage 0 recursos externos en `file://`, clicks con flash), fase IA
  con modelos reales (robertuito: POS +0.96 / NEG −0.98; APV dual 54 % → 48 %;
  issue clickeable con select+flash). Reporte: `docs/PRUEBAS-E2E-V1.0.0a.md`.

### Infraestructura de release

- `LICENSE` (MIT), `CONTRIBUTING.md`, `SECURITY.md`,
  `CODE_OF_CONDUCT.md` (Contributor Covenant 2.1, español).
- Templates de issues (bug / mejora) y de Pull Request; `.gitignore`,
  `.gitattributes`; `package.json` (`npm test`, `npm start`).
- Favicon SVG + logo del repo; metadatos `app-version` en los HTML.
- `sw.js` — Service Worker (network-first): la shell queda **offline**.
- `tests/e2e/` — drivers de navegador real (puppeteer) + fixtures; `docs/e2e/` — capturas.

### Limitaciones conocidas

- E2E cubierto en Chromium 151 (ver `docs/PRUEBAS-E2E-V1.0.0a.md`); Safari
  y Firefox sin validación automática todavía. La descarga de ~110 MB es
  sensible a entornos con RAM ≤ 2 GB (OOM) — con swap no hubo problema.
- Pesos aún marcados `[NO VALIDADO]`: listado honesto en
  [`docs/RESEARCH-PASO3.md`](./docs/RESEARCH-PASO3.md) §3.1.
- El benchmark 3-vías (`npm run benchmark`) es local-only: depende de las
  builds de referencia y guiones originales, que no se publican.

[Unreleased]: ./CHANGELOG.md
[1.0.0a]: ./docs/releases/v1.0.0a.md
