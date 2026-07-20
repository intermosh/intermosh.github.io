# Plan de Mejoras UX/UI v2 — ScriptLab v4

**Fecha:** 2026-07-20
**Estado:** Pendiente de aprobación

---

## M1 — Separación visible Heurístico vs IA

**Qué:** El Reader muestra u oculta secciones según `state.p.aiMode`.

**Reglas:**
| Sección | Heurístico (`basic`) | IA (`embeddings`) |
|---|---|---|
| Anillo Salud + desglose (Hook/Claridad/Ritmo/Promesa) | ✅ | ✅ |
| Anillo Retención + curva | ✅ | ✅ |
| Estructura (chips) | ✅ | ✅ |
| Tiempo guion vs objetivo | ✅ | ✅ |
| Botón "Analizar a fondo" | ❌ `hidden` | ✅ |
| Arco emocional (ECG) | ❌ `hidden` | ✅ |
| Alineación IA (en desglose) | ❌ `hidden` | ✅ |
| Diagnóstico semántico (M5) | ❌ `hidden` | ✅ |

**Implementación:**
- Nueva función `applyAIModeVisibility(mode)` en `render.js`, llamada desde `render()` y desde los handlers de cambio de modo en `main.js`.
- Usa `el.hidden = true/false` en los elementos: `#run-deep`, `#sentiment-section`, `#deep-section`, y filas de desglose IA.

**Archivos:** `render.js` (nueva función + llamada en `render`), `main.js` (llamada en handlers mode-basic/mode-ai).

---

## M2 — Retención estimada funcional en Heurístico

**Qué:** La retención se calcula y muestra en ambos modos (ya es 100% heurística).

**Implementación:**
- `scheduleRetention()` se llama automáticamente desde `render()` al cambiar bloques (verificar que no requiera `state.worker`).
- `initRetentionWorker()` ya se llama en `boot()` — funciona en ambos modos.

**Archivos:** `render.js` (llamar `scheduleRetention` en `render()`), `workers.js` (verificar guard de `scheduleRetention`).

---

## M3 — Curva de retención siempre visible (SVG inline)

**Qué:** Reemplazar el `<canvas>` colapsado de Chart.js por un **SVG inline siempre visible** debajo del porcentaje de retención.

**Diseño:**
```
Retención estimada    54%
[curva SVG siempre visible]
  ▓▓▓░░     ▓▓░     ▓░    ░
  Hook    Desarrollo    CTA
  ● punto rojo = riesgo de fuga
```

**Implementación:**
- `renderRetentionCurve(curve)` en `render.js` genera SVG inline (sin Chart.js): polyline con área sombreada, puntos coloreados (verde/rojo según `isDropRisk`), labels de bloque debajo.
- Quitar dependencia de Chart.js para esta curva (más rápido, más liviano).
- El `<details>` de "8 factores" queda como desplegable opcional.

**Archivos:** `render.js` (nueva función SVG), `index.html` (cambiar contenedor), `styles.css` (estilos del SVG).

---

## M4 — Botón "Analizar a fondo" solo en Modo IA

**Qué:** `#run-deep` y `#deep-section` se ocultan con `hidden` cuando `aiMode === 'basic'`.

**Implementación:**
- Parte de `applyAIModeVisibility()` (M1).
- En modo heurístico, el espacio que ocupaba se reemplaza con un mensaje: *"Activá el Modo IA para análisis semántico profundo"*.

**Archivos:** cubierto por M1.

---

## M5 — Diagnóstico Semántico en desplegable

**Qué:** La sección tier 2 (Repetición, Ideas, Ritmo, Cobertura) se mueve dentro de un `<details>` colapsado por defecto.

**Diseño:**
```
▶ Diagnóstico semántico (Analizar a fondo primero)
  ↳ clic expande ↓
  Repetición: 2 pares · 1 contraste
  Ideas centrales: 5 oraciones
  Ritmo de temas: 2.3/min
  Cobertura: ✓ Hook ✓ Contexto ✗ Evidencia
```

**Implementación:**
- En `index.html`, envolver el contenido de `#deep-section` en un `<details>`.
- El botón "Analizar a fondo" queda fuera del `<details>` (visible arriba).

**Archivos:** `index.html` (reestructura), `styles.css` (estilos del details).

---

## M6 — Arco emocional más entendible

**Qué:** El ECG actual es hermético. La mejora:

**Cambios:**
1. **Título explicativo:** "Arco emocional — cómo cambia el tono bloque por bloque"
2. **Mini-leyenda:** tres puntos de color con texto: `🟢 Positivo  🟡 Neutral  🔴 Negativo`
3. **Tooltips en cada punto:** "Bloque 3 (Evidencia) — Positivo (+0.72)"
4. **Agregados con glosa:**
   - Engagement: "Variación emocional del guion. Más alta = más dinámico."
   - Momentum: "Si termina más positivo o negativo de lo que empezó."
   - Saltos tonales: "Cambios bruscos de tono. Pocos = flujo natural."
5. **El SVG ECG:** más alto (80px en vez de 64px) para mejor legibilidad.

**Archivos:** `render.js` (`renderSentimentArc`), `styles.css`.

---

## M7 — Medidor de tiempo total vs objetivo

**Qué:** Nueva fila en el desglose de salud que muestra el tiempo calculado del guion vs el objetivo.

**Diseño:**
```
Tiempo del guion    3:45 / 5:00 objetivo
████████████████░░░░░░  75%
```

**Lógica:**
- `blockTime = sum(durationInSeconds(block.content, wpm))` para cada bloque.
- `targetTime = state.p.targetDuration`.
- Si no hay objetivo (`0`), mostrar solo `3:45` sin barra.

**Ubicación:** entre el desglose de salud y la curva de retención.

**Archivos:** `render.js` (cálculo + render), `index.html` (contenedor), `styles.css`.

---

## Orden de aplicación

```
M2 (retención en heurístico)  ←  primero, verifica base funcional
  ↓
M1 + M4 (visibilidad por modo)  ←  gobierna qué se muestra
  ↓
M7 (medidor de tiempo)
  ↓
M3 (curva SVG siempre visible)
  ↓
M6 (arco emocional mejorado)
  ↓
M5 (diagnóstico en desplegable)
```

## Decisiones pendientes

### D16 — ¿Chart.js se mantiene para algo?
Si la curva de retención pasa a SVG inline (M3), Chart.js ya no se usa para nada crítico. ¿Lo eliminamos completamente (menos peso, sin CDN) o lo dejamos como fallback para futuras features? *Mi recomendación: eliminarlo. Es una dependencia externa menos.*

### D17 — ¿Los "8 factores" de retención se siguen mostrando?
Actualmente están en un `<details>`. Con la curva SVG siempre visible (M3), ¿los 8 factores quedan como están (desplegable opcional) o se eliminan? *Mi recomendación: mantenerlos como desplegable opcional para quien quiere profundizar.*

### D18 — Bug de pesos (emotionalArc no usado)
Encontré que `WEIGHTS.emotionalArc = 0.11` está definido pero no se suma en `computeRetentionPrediction`. ¿Lo arreglo en esta pasada o lo dejo para la ronda de bugs? *Mi recomendación: arreglarlo ahora (es un cálculo incorrecto del APV).*
