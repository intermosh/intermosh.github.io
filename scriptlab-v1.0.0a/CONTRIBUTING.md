# Contribuir a ScriptLab

¡Gracias por querer mejorar ScriptLab! Esta guía te deja productivo en minutos.

## Setup

Sin dependencias ni build: vanilla JS + CSS + Web Workers (Transformers.js por CDN solo en Modo IA).

```bash
git clone <repo> && cd scriptlab
python3 -m http.server 8000     # o: npm start
# → http://localhost:8000/scriptlab.html

npm test                        # = node tests/run-tests.mjs → debe dar 94/94
```

> `npm run benchmark` (`tests/run-benchmark-paso2.mjs`) es **local-only**: compara
> contra las builds de referencia `arena`/`mimo` y los 4 guiones originales, que
> no se publican en el repo. El CI corre solo la suite principal.

## ⚠ Regla de oro: el motor está sellado

Los 4 módulos de diagnóstico son **lógica pura protegida por 94 tests**:

- `js/scoring.js` — ICN / Salud del guion
- `js/retention-engine.js` — APV, curva, factores, arco→APV, carga cognitiva
- `js/sentiment-engine.js` — arco emocional (chunking, missing ≠ 0)
- `js/ai-shared.js` — sílabas RAE, Fernández-Huerta, sanitizers

**No los modifiques sin correr la suite antes y después** (debe seguir 94/94 o
más). Si el cambio altera valores esperados, tiene que venir con tests nuevos
que fijen el nuevo comportamiento y una entrada en el changelog.

### Proponer cambios de métricas (pesos/fórmulas)

1. **Research primero**: abrí un issue con números y fuentes verificables
   (papers, estudios con N y fecha). El estándar de evidencia está en
   [`docs/RESEARCH-PASO3.md`](./docs/RESEARCH-PASO3.md).
2. **Los números se presentan antes de tocar el motor.** Se evalúa juntos.
3. Ejemplo del filtro aplicado: P3/P4 se propusieron y se **rechazaron** por
   falta de respaldo; E1/E2 entraron con DOI y valores fijados en tests.
4. Todo peso sin respaldo queda marcado `[NO VALIDADO]` — la honestidad
   metodológica es una feature del proyecto, no un defecto.

## Estructura del repo

Ver el árbol comentado en el [`README.md`](./README.md#estructura-del-repositorio).

## Estilo

- Código y comentarios en **español**; el copy de UI en **español rioplatense**
  (voseo: "eenfocá", "medí", "quedate").
- Sin frameworks ni bundlers a propósito: si tu PR agrega una dependencia,
  justificalo fuerte en la descripción.
- Comentarios citan fuente y motivo (`combined-2.0 (E2): Wistia CTA study…`),
  no solo el "qué".

## Flujo de PR

1. Fork + rama descriptiva (`fix/scroll-flash-safari`, `metricas/fuente-pacing`).
2. Commits chicos y descriptivos, en español.
3. `npm test` en verde; si tocás UI, adjuntá capturas (antes/después).
4. Entrada en `CHANGELOG.md` (sección Unreleased) si el cambio es visible.
5. El template del PR tiene el checklist completo.

## Reportar bugs

Usá el template de issue 🐞. Incluí navegador, modo (heurístico/IA) y, si
podés, el JSON exportado del guion (sin datos sensibles). Todo se procesa
localmente, así que el bug casi siempre se reproduce con ese JSON.

## Código de conducta

Este proyecto sigue el [Código de Conducta](./CODE_OF_CONDUCT.md)
(Contributor Covenant 2.1, en español).
