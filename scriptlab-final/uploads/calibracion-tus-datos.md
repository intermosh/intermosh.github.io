# Guía de integración: Pestaña "Tus datos" con calibración

## 1. Resumen

Se reemplaza el formulario mínimo de calibración (formato + género + APV + R30) por un sistema completo de ingestión de métricas reales de YouTube Studio, organizado por **buckets (formato + género)**, con capacidad de **recalibrar** el benchmark base del modelo de retención usando los datos reales del usuario.

**Metodología fuente:** YouTube ScriptLab (reference app) — `model.js`, `render.js`, `app.js`.

---

## 2. Qué se agrega

### 2.1 Formulario expandido

El formulario de la pestaña "Tus datos" pasa de 4 campos a 10:

| Campo | Tipo | Obligatorio | Notas |
|---|---|---|---|
| Título del video | text | Sí | Identificador del registro |
| Fecha de publicación | date | No | Default: hoy |
| Formato | select | No | `long` / `short` |
| Género | select | No | `educativo` / `ensayo` / `tutorial` / `entretenimiento` |
| Duración real (seg) | number | Sí | Duración total del video publicado |
| APV real (%) | number | Sí | % de retención promedio de YouTube Studio |
| Retención a 30s (%) | number | No | R30 de YouTube Studio |
| CTR (%) | number | No | Click-through rate del thumbnail |
| APV predicho (%) | number | No | Para comparar predicción vs realidad |

### 2.2 Sistema de buckets

Los datos se agrupan por pares `(formato, género)`. ScriptLab define 8 buckets:

```
long+educativo    short+educativo
long+ensayo       short+ensayo
long+tutorial     short+tutorial
long+entretenimiento  short+entretenimiento
```

Cada bucket tiene:
- Conteo de registros reales
- Promedio de APV real
- Valor actual del benchmark (heurístico o calibrado)
- Estado visual (calibrado / heurístico)
- Botón "Recalibrar" (habilitado al alcanzar el mínimo)

### 2.3 Recalibración

Cuando un bucket acumula ≥5 registros, el usuario puede recalibrar. El proceso:

1. Calcula el promedio de APV real de los registros del bucket
2. Compara con el valor actual del benchmark
3. Limita el cambio a ±8 puntos porcentuales (cap)
4. Pide confirmación explícita al usuario
5. Actualiza `activeBenchmarks[format][genre]`
6. Registra en historial (append-only)

**Fórmula de recalibración:**
```
nuevoValor = promedio(real_apv_pct) / 100
si |nuevoValor - valorActual| > 0.08:
    nuevoValor = valorActual ± 0.08  (cap)
    marcar wasCapped = true
```

### 2.4 Tablas

**Buckets:** Por cada par formato+género, muestra muestras, promedio, valor actual, estado, botón.

**Predicho vs real:** Por cada video registrado, muestra título, bucket, duración, APV predicho, APV real, delta (pred − real), botón eliminar.

**Historial:** Registro cronológico de cada recalibración: bucket, fecha, valor viejo, valor nuevo, muestras, nota.

### 2.5 Indicador de calibración

Un badge junto al anillo de retención que muestra:
- `n=X videos, calibrado` (verde) — si el bucket tiene benchmark calibrado
- `n=X/5 para calibrar` (amarillo) — si tiene registros pero no alcanza el mínimo
- `Sin calibrar (benchmark genérico)` (amarillo) — si no hay registros

---

## 3. Archivos a modificar

### 3.1 `state.js`

**Agregar después de las constantes de bloque (`T`):**

```js
export const CALIBRATION_CONFIG = {
  MIN_SAMPLES: 5,
  MAX_DELTA_PCT: 8
};

export const BENCHMARK_BUCKETS = (() => {
  const formats = ['long', 'short'];
  const genres  = ['educativo', 'ensayo', 'tutorial', 'entretenimiento'];
  const out = [];
  formats.forEach(f => genres.forEach(g => out.push({ format: f, genre: g })));
  return out;
})();
```

**Agregar al objeto `state`:**

```js
  realScores: [],
  activeBenchmarks: {},
  recabHistory: [],
```

**Agregar función `recalibrateBucket` (al final del archivo, antes de los helpers):**

```js
export function recalibrateBucket(realScores, format, genre, currentValue, minSamples, maxDeltaPct) {
  const samples = realScores.filter(r =>
    r.format === format && r.genre === genre && Number.isFinite(r.real_apv_pct) && r.real_apv_pct > 0
  );
  if (samples.length < minSamples) {
    return {
      ok: false,
      reason: `Faltan registros: tenés ${samples.length} de ${minSamples} requeridos para ${format}+${genre}.`,
      sampleCount: samples.length
    };
  }
  const avgPct = samples.reduce((s, r) => s + r.real_apv_pct, 0) / samples.length;
  const avgFraction = avgPct / 100;
  const currentPct = currentValue * 100;
  const deltaPct = avgPct - currentPct;
  let newValueFraction = avgFraction;
  let wasCapped = false;
  let note = '';

  if (Math.abs(deltaPct) > maxDeltaPct) {
    const direction = deltaPct > 0 ? 1 : -1;
    newValueFraction = Math.max(0.05, Math.min(0.95, currentValue + direction * (maxDeltaPct / 100)));
    wasCapped = true;
    const remainingPct = Math.abs(avgPct - newValueFraction * 100);
    note = `Promedio real ${avgPct.toFixed(1)}% excede el tope de ±${maxDeltaPct}pp respecto al valor actual ${currentPct.toFixed(1)}%. Se aplicó el tope (${(newValueFraction * 100).toFixed(1)}%). Ajuste pendiente: ${remainingPct.toFixed(1)}pp.`;
  } else {
    note = `Promedio real ${avgPct.toFixed(1)}% aplicado (delta ${deltaPct >= 0 ? '+' : ''}${deltaPct.toFixed(1)}pp respecto a ${currentPct.toFixed(1)}%).`;
  }
  return {
    ok: true, oldValue: currentValue, newValue: newValueFraction,
    average: avgFraction, sampleCount: samples.length,
    wasCapped, note, rawDeltaPct: deltaPct
  };
}
```

---

### 3.2 `db.js`

**Incrementar versión del schema de 4 → 5** y agregar los 3 nuevos stores:

```js
const r = indexedDB.open('scriptlab-ai', 5);
r.onupgradeneeded = () => {
  const d = r.result;
  ['projects', 'snapshots', 'calibrations', 'settings', 'analysisCache', 'modelRegistry',
   'realScores', 'benchmarks', 'recabHistory']
    .forEach(n => { if (!d.objectStoreNames.contains(n)) d.createObjectStore(n, { keyPath: 'id' }); });
};
```

---

### 3.3 `index.html`

Reemplazar el contenido de la pestaña `#rtab-calibracion` con:

```html
<div class="rtab-panel" id="rtab-calibracion">

  <!-- Formulario -->
  <section class="sec">
    <div class="sec-h"><span class="sec-t">Agregar métrica real</span><span class="sec-hint">de YouTube Studio</span></div>
    <p class="cal-copy">Cargá los datos que ves en YouTube Studio después de publicar un video.</p>
    <form id="realScoreForm" class="cal-form">
      <label>Título del video *<input class="input" name="video_title" required placeholder="Ej: La mentira que cambió..."></label>
      <label>Fecha de publicación<input class="input" type="date" name="published_at"></label>
      <div class="cal-row">
        <label>Formato<select name="format"><option value="long">Video largo</option><option value="short">Short</option></select></label>
        <label>Género<select name="genre"><option value="educativo">Educativo</option><option value="ensayo">Ensayo</option><option value="tutorial">Tutorial</option><option value="entretenimiento">Entretenimiento</option></select></label>
      </div>
      <div class="cal-row">
        <label>Duración real (seg) *<input class="input" type="number" min="1" step="1" name="duration_sec" required placeholder="720"></label>
        <label>APV real (%) *<input class="input" type="number" min="1" max="100" step="0.1" name="real_apv_pct" required placeholder="42.5"></label>
      </div>
      <div class="cal-row">
        <label>Retención a 30s (%)<input class="input" type="number" min="1" max="100" step="0.1" name="real_r30_pct" placeholder="68"></label>
        <label>CTR (%)<input class="input" type="number" min="0" max="100" step="0.1" name="real_ctr_pct" placeholder="5.2"></label>
      </div>
      <label>APV predicho por ScriptLab (%)<input class="input" type="number" min="0" max="100" step="0.1" name="predicted_apv_pct" placeholder="45"></label>
      <div class="cal-actions">
        <button type="submit" class="cal-submit">Agregar registro</button>
        <button type="button" class="cal-cancel" id="realScoreCancel">Limpiar</button>
      </div>
    </form>
  </section>

  <!-- Buckets -->
  <section class="sec">
    <div class="sec-h"><span class="sec-t">Buckets por formato + género</span><span class="sec-hint">5 registros mínimo</span></div>
    <p class="cal-copy">Recalibrar ajusta el benchmark base del modelo de retención con tus datos reales.</p>
    <div id="cal-buckets"></div>
  </section>

  <!-- Predicho vs real -->
  <section class="sec">
    <div class="sec-h"><span class="sec-t">Predicho vs real</span><span class="sec-hint">por video</span></div>
    <div id="cal-comparison"></div>
  </section>

  <!-- Historial -->
  <section class="sec">
    <div class="sec-h"><span class="sec-t">Historial de recalibraciones</span><span class="sec-hint">append-only</span></div>
    <div id="cal-history"></div>
  </section>
</div>
```

Agregar badge de calibración al lado del anillo de retención:

```html
<div id="calibration-indicator" class="cal-indicator"></div>
```

---

### 3.4 `styles.css`

Reemplazar el bloque `.cal-copy` / `#calform` / `#caldata` con:

```css
.cal-copy{font-size:11px;color:var(--faint);margin:8px 0}
.cal-form{display:flex;flex-direction:column;gap:10px;margin-top:8px}
.cal-form label{display:flex;flex-direction:column;font-size:11px;color:var(--muted);gap:3px}
.cal-form .input,.cal-form select{background:var(--bg);border:1px solid var(--border);border-radius:var(--r-sm);padding:7px 10px;font-size:12px;color:var(--text)}
.cal-form .input:focus,.cal-form select:focus{outline:none;border-color:var(--purple)}
.cal-row{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.cal-actions{display:flex;gap:8px;margin-top:4px}
.cal-submit{background:var(--purple);color:#fff;padding:8px 18px;border-radius:var(--r-sm);font-size:12px;font-weight:600;transition:var(--tr)}
.cal-submit:hover{opacity:.88}
.cal-cancel{background:var(--panel2);color:var(--muted);padding:8px 14px;border-radius:var(--r-sm);font-size:12px;transition:var(--tr)}
.cal-cancel:hover{color:var(--text)}

.cal-bucket-table,.cal-compare-table,.cal-history-table{width:100%;font-size:11px;border-collapse:collapse}
.cal-bucket-table th,.cal-compare-table th,.cal-history-table th{text-align:left;color:var(--faint);font-weight:500;padding:5px 6px;border-bottom:1px solid var(--border)}
.cal-bucket-table td,.cal-compare-table td,.cal-history-table td{padding:5px 6px;border-bottom:1px solid var(--border);color:var(--muted)}
.cal-bucket-table tr:last-child td,.cal-compare-table tr:last-child td,.cal-history-table tr:last-child td{border-bottom:0}
.cal-recab-btn{background:var(--purple);color:#fff;padding:4px 10px;border-radius:var(--r-sm);font-size:10px;font-weight:600;transition:var(--tr)}
.cal-recab-btn:hover{opacity:.88}
.cal-recab-btn:disabled{opacity:.4;cursor:not-allowed}
.cal-del-btn{color:var(--faint);font-size:12px;padding:2px 6px;border-radius:4px;transition:var(--tr)}
.cal-del-btn:hover{color:var(--bad);background:rgba(255,104,121,.1)}
.cal-empty{font-size:11px;color:var(--faint);padding:10px 0;text-align:center}
.cal-indicator{margin-top:6px;text-align:center}
```

---

### 3.5 `render.js`

**Imports:** agregar `CALIBRATION_CONFIG`, `BENCHMARK_BUCKETS`, `recalibrateBucket` al import de `state.js`.

**Reemplazar `renderCal()`** con la versión completa (ver implementación en el código fuente). La función:
- Usa `state.realScores`, `state.activeBenchmarks`, `state.recabHistory` directamente (no consulta IndexedDB)
- Renderiza buckets, comparación e historial en sus contenedores `#cal-buckets`, `#cal-comparison`, `#cal-history`
- Actualiza `#calibration-indicator` con el estado del bucket actual

---

### 3.6 `main.js`

**Imports:** agregar `CALIBRATION_CONFIG`, `recalibrateBucket` de `state.js` y `del` de `db.js`.

**Boot:** cargar los 3 nuevos stores:

```js
state.realScores = await all('realScores');
state.activeBenchmarks = (await get('benchmarks', 'active'))?.data || {};
state.recabHistory = await all('recabHistory');
```

**Reemplazar el handler de `#calform`** con el handler de `#realScoreForm`:

```js
const realScoreForm = $('#realScoreForm');
if (realScoreForm) realScoreForm.onsubmit = async e => {
  e.preventDefault();
  const fd = new FormData(realScoreForm);
  const rec = {
    id: crypto.randomUUID(),
    logged_at: new Date().toISOString(),
    video_title: (fd.get('video_title') || '').toString().trim(),
    published_at: (fd.get('published_at') || '').toString().trim(),
    format: (fd.get('format') || 'long').toString(),
    genre: (fd.get('genre') || 'educativo').toString(),
    duration_sec: Number(fd.get('duration_sec')) || 0,
    real_apv_pct: Number(fd.get('real_apv_pct')) || 0,
    real_r30_pct: fd.get('real_r30_pct') ? Number(fd.get('real_r30_pct')) : null,
    real_ctr_pct: fd.get('real_ctr_pct') ? Number(fd.get('real_ctr_pct')) : null,
    predicted_apv_pct: fd.get('predicted_apv_pct') ? Number(fd.get('predicted_apv_pct')) : null
  };
  if (!rec.video_title || !rec.duration_sec || !rec.real_apv_pct) {
    alert('Faltan campos requeridos');
    return;
  }
  state.realScores.push(rec);
  await put('realScores', rec);
  realScoreForm.reset();
  renderCal();
  bindRealDataEvents();
};
```

**Agregar `bindRealDataEvents()`:** delega clicks en `[data-recab]` (recalibrar) y `[data-del-real]` (eliminar).

**Agregar `recalibrateBucketConfirm()`:** calcula, pide confirmación, aplica, guarda en benchmarks + historial.

---

## 4. Plan de integración con la arquitectura original

### 4.1 Flujo de datos

```
Usuario llena form → put('realScores', rec)
                   → state.realScores.push(rec)
                   → renderCal() re-renderiza las 3 tablas

Usuario clickea "Recalibrar":
  → recalibrateBucket(state.realScores, format, genre, currentValue, 5, 8)
  → confirm() al usuario
  → state.activeBenchmarks[format][genre] = newValue
  → put('benchmarks', { id: 'active', data: state.activeBenchmarks })
  → historial.append(...)
  → put('recabHistory', entry)
  → renderCal()

Retención se calcula:
  → retention-engine.js consulta state.activeBenchmarks
  → si hay benchmark calibrado para el bucket, lo usa en vez del heurístico
```

### 4.2 Integración con el modelo de retención (futuro)

El `retention-engine.js` actual usa un benchmark heurístico fijo. Para completar la integración:

1. Pasar `activeBenchmarks` como parámetro a `computeRetentionPrediction()`
2. Dentro del cálculo del APV, buscar `activeBenchmarks[format][genre]`
3. Si existe, usarlo como base en vez del heurístico por duración
4. El peso del benchmark en el APV final (~0.6 del score ponderado) se mantiene

```js
// En retention-engine.js, dentro de computeRetentionPrediction():
const baseBenchmark = activeBenchmarks?.[format]?.[genre]
  ?? heuristicAPV(totalSec, format, genre);
```

### 4.3 Dependencias

| Módulo | Depende de | Notas |
|---|---|---|
| `state.js` | nadie | Agrega constantes + función pura |
| `db.js` | nadie | 3 nuevos stores (schema v5) |
| `render.js` | `state.js` | `renderCal()` usa state directo |
| `main.js` | `state.js`, `db.js` | Boot + event handlers |
| `retention-engine.js` | `state.js` (futuro) | Consultar activeBenchmarks |

### 4.4 Riesgos

- **Migración de IndexedDB:** el upgrade de v4→v5 es automático (`onupgradeneeded`), pero si el usuario tiene datos en v4, los stores nuevos se crean vacíos. Los stores existentes no se tocan.
- **Bucket por defecto:** ScriptLab no tiene campo "formato" en el proyecto. El indicador usa `long+educativo` por defecto. Para completar, agregar `format` y `genre` al modelo de proyecto.
- **Cálculo de APV predicho:** el campo `predicted_apv_pct` del form es manual. Para automatizar, calcular el APV del análisis actual y pre-fill el campo.

---

## 5. Checklist de verificación

- [ ] Formulario guarda en IndexedDB (`realScores` store)
- [ ] Buckets table se renderiza con los 8 pares formato+género
- [ ] Recalibrar se habilita con ≥5 registros en el bucket
- [ ] Recalibrar pide confirmación y aplica ±8pp cap
- [ ] Historial se actualiza (append-only)
- [ ] Comparación muestra delta predicho vs real
- [ ] Indicador de calibración se actualiza junto al anillo
- [ ] `activeBenchmarks` persiste en IndexedDB entre sesiones
- [ ] Form se resetea después de agregar registro
- [ ] Fecha default se setea automáticamente
