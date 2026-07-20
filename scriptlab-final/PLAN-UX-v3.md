# Plan UX v3 — Reorganización del Reader + Bloques editables

**Fecha:** 2026-07-20
**Estado:** Pendiente de aprobación

---

## Estructura propuesta del Reader (de arriba a abajo)

```
┌─────────────────────────────────────┐
│  [●●●○]  Tiempo real listo          │  ← pips de estado
├─────────────────────────────────────┤
│   ╭─────╮   ╭─────╮                 │
│   │ 72  │   │ 54% │                 │  ← 2 anillos hero (siempre)
│   ╰─────╯   ╰─────╯                 │
│   Salud     Retención                │
├─────────────────────────────────────┤
│  Duración del guion                  │  ← Heurístico
│  3:45 / 5:00 objetivo                │
│  ████████████░░░░  75%              │
├─────────────────────────────────────┤
│  Curva de retención                  │  ← Heurístico
│  [SVG siempre visible]               │
│  ● estable  ● riesgo de fuga         │
├─────────────────────────────────────┤
│  Factores de retención               │  ← Heurístico, SIEMPRE visible
│  Hook 75 · Pacing 62 · Interrupts 80 │  (sin desplegar, con glosa corta)
│  Densidad 55 · Promesa 70 · FH 68    │
│  CTA 50 · Narrativa 60               │
│  Cada uno con línea explicativa:     │
│  "Hook: fuerza del gancho inicial"   │
├─────────────────────────────────────┤
│  Desglose de salud                   │  ← Heurístico
│  Hook ▓▓▓▓░  Claridad ▓▓▓░░          │
│  Ritmo ▓▓░░░  Promesa ▓▓▓▓░          │
├─────────────────────────────────────┤
│  Carga cognitiva                     │  ← Heurístico
│  68 · Moderada                       │
│  Ritmo pausado · Densidad óptima...  │
├─────────────────────────────────────┤
│  Estructura                          │  ← Heurístico
│  ✓ Hook ✓ Contexto ✗ Evidencia ✓ CTA│
├─────────────────────────────────────┤
│  ┄┄ PESTAÑAS ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄  │
│  [ Análisis IA ]  [ Tus datos ]      │
├─────────────────────────────────────┤
│  (contenido según pestaña activa)    │
└─────────────────────────────────────┘
```

---

## M1 — Reordenar columnas (heurístico arriba, IA en pestañas)

**Orden definitivo de arriba a abajo (heurístico, siempre visible):**

1. Pips de estado
2. Dos anillos (Salud + Retención)
3. Duración del guion vs objetivo
4. Curva de retención (SVG siempre visible)
5. **Factores de retención** (8 valores SIEMPRE visibles con glosa, sin `<details>`)
6. Desglose de salud (Hook/Claridad/Ritmo/Promesa)
7. Carga cognitiva
8. Estructura (chips ✓/✗)

**Después, 2 pestañas:**

### Pestaña 1: "Análisis IA"
Visible solo cuando `aiMode === 'embeddings'` Y modelos descargados.
Contenido:
- Botón "Analizar a fondo" (única acción)
- Estado: "contenido cambió, volvé a analizar" (invalidación)
- Arco emocional (ECG con leyenda + glosa)
- Diagnóstico semántico (repetición, ideas, ritmo, cobertura) en desplegable

### Pestaña 2: "Tus datos reales"
Visible siempre.
Contenido:
- Form de calibración (formato/género/APV/R30)
- Lista de registros guardados

---

## M2 — Factores de retención siempre visibles con glosa

**Cambiar de `<details>` a visualización permanente.**

Cada factor muestra:
```
Hook                    75
Fuerza del gancho inicial. ¿Capta atención?
████████████████████░░░░░░
```

Glosas (1 línea c/u, basadas en las fuentes del Apéndice A):

| Factor | Glosa |
|---|---|
| Hook | Fuerza del gancho inicial (pregunta, dato, urgencia). |
| Pacing | Variación de ritmo entre bloques cortos y largos. |
| Interrupts | Cambios visuales/narrativos que resetean la atención. |
| Densidad | Cantidad de temas nuevos por minuto. |
| Promesa | Si la promesa del hook se cumple en el cuerpo. |
| Legibilidad | Claridad del lenguaje (Fernández-Huerta). |
| CTA | Presencia y posición del llamado a la acción. |
| Narrativa | Completitud de la estructura (hook→evidencia→cierre). |

---

## M3 — Control de estado de análisis IA (invalidación)

**Reglas:**
- Al importar un archivo → `state.deepResult = null` + `state.aiResult = null` + `state.sentimentResult = null`
- Al crear proyecto nuevo → mismo reset
- Al editar un bloque → `state.deepResult = null` (las métricas heurísticas se recalculan automáticamente, pero el análisis profundo se invalida)
- El botón "Analizar a fondo" se rehabilita (pasa de "actualizado" a disponible)
- Visual: si `deepResult === null`, la sección muestra "contenido cambió, volvé a analizar a fondo"
- Si `deepResult !== null`, muestra "actualizado · clic para re-analizar"

**Esto evita:**
- Que métricas IA de un guion viejo se muestren sobre un guion nuevo
- Que el botón parezca ya ejecutado cuando el contenido cambió

---

## M4 — Bloques: cambio de tipo por clic

**Interacción:**
1. Clic en el nombre del tipo (ej: "Hook") → se convierte en `<select>` desplegable
2. Seleccionar otro tipo → aplica, actualiza color del borde izquierdo + label
3. Clic fuera o Escape → cancela, vuelve al texto

```
ANTES:  [Hook · 1]              ← texto estático
DESPUÉS: [Hook ▾ · 1]           ← clic → abre select
         ┌──────────┐
         │ Hook     │
         │ Contexto │
         │ Evidencia│
         │ Segmento │
         │ Giro     │
         │ Visual   │
         │ CTA      │
         └──────────┘
```

**Implementación:**
- En `render.js`, el `<span class="block-type">` se reemplaza por un `<select>` oculto que aparece al clic
- El `change` del select → `b.type = newValue` → `flowDirty = true` → `save()` → `render()`
- CSS: `.block-type-select` estilado como dropdown minimalista

---

## Decisiones pendientes

### D19 — ¿La pestaña "Análisis IA" desaparece en modo Heurístico o aparece bloqueada?

Opciones:
- **A) Desaparece:** en modo heurístico solo se ve "Tus datos". Al activar IA aparece la pestaña.
- **B) Aparece bloqueada:** se ve pero con overlay "Activá el Modo IA para usar esta pestaña".
- *Mi recomendación:* **B** — más claro para el usuario que la feature existe.

### D20 — ¿Los pesos del modelo predictivo se siguen mostrando?

Actualmente están en un `<details>` colapsable ("Pesos del modelo predictivo").
- *Mi recomendación:* **eliminarlo del Reader principal**. Es información técnica que ensucia. Si querés verlo, queda en el contrato/auditoría. Si lo querés mantener, lo movería dentro de la pestaña "Análisis IA" en un `<details>` muy al fondo.

### D21 — ¿El cambio de tipo de bloque es instantáneo o pide confirmación?

Cambiar de HOOK a SEGMENTO puede afectar métricas significativamente.
- **A) Instantáneo:** sin confirmación, el cambio aplica y se recalcula todo.
- **B) Con confirmación:** si el bloque tiene contenido, preguntar "¿Seguro?".
- *Mi recomendación:* **A** instantáneo — el usuario puede deshacer fácilmente.

### D22 — ¿Orden de las pestañas?

- *Mi recomendación:* **[Análisis IA] [Tus datos]** — IA primero porque es lo que más cambia, datos reales segundo.

### D23 — ¿La sección Estructura (chips ✓/✗) se queda donde está o se mueve a una pestaña?

La estructura es heurística (verificación por tipo de bloque). Podría:
- **A) Quedarse arriba** con las otras métricas heurísticas.
- **B) Moverse abajo** de todo, como cierre de la sección heurística.
- *Mi recomendación:* **B** — es un check rápido, no necesita protagonismo arriba.
