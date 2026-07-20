/* scoring.js — Heuristic scoring engine for ScriptLab.
   Computes the Índice de Calidad Narrativa (ICN) from project state.
   Pure functions: input = project data, output = analysis object.
   No DOM access — fully testable in isolation.

   Also owns: analysisDirty/cachedAnalysis (internal memoization),
   and markAnalysisDirty() (called by save/import/new operations). */

/* ===== Internal analysis cache (not observable state) ===== */
let _analysisDirty = true;
let _cachedAnalysis = null;

function markAnalysisDirty() { _analysisDirty = true; _cachedAnalysis = null; }

/* ===== Heuristics catalog (for UI display) ===== */
const HEURISTICS = [
  { name: 'Fernández-Huerta', kind: 'Validada', formula: '206.84 − 60×sílabas/palabra − 1.02×palabras/frase', source: 'Fernández-Huerta (1959), adaptación española de Flesch.' },
  { name: 'Hook', kind: 'Heurística', formula: 'Longitud, pregunta y alineación con promesa', source: 'Regla transparente configurable.' },
  { name: 'Ritmo visual', kind: 'Heurística', formula: 'Notas visuales y giros por duración', source: 'Referencia direccional: Cutting et al. (2016).' },
  { name: 'CTA', kind: 'Heurística', formula: 'Presencia de cierre o siguiente acción', source: 'Regla estructural interna.' }
];

/* ===== Syllable counting (Spanish) ===== */
const syllables = w => {
  w = (w || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zñü]/g, '');
  let n = 0, last = false;
  for (const c of w) {
    const v = 'aeiouü'.includes(c);
    if (v && !last) n++;
    last = v;
  }
  return Math.max(1, n);
};

/* ===== Fernández-Huerta readability (1959) ===== */
const fernandezHuerta = text => {
  const ws = (text || '').match(/[\p{L}]+/gu) || [];
  const ss = (text || '').split(/[.!?]+/).filter(x => x.trim()).length || 1;
  if (!ws.length) return 0;
  return Math.max(0, Math.min(100,
    206.84 - 60 * (ws.reduce((n, w) => n + syllables(w), 0) / ws.length) - 1.02 * (ws.length / ss)
  ));
};

/* ===== Overlap detection (shared words ≥ 4 chars) ===== */
function overlap(a, b) {
  let x = new Set((a || '').toLowerCase().match(/[\p{L}]{4,}/gu) || []);
  let y = new Set((b || '').toLowerCase().match(/[\p{L}]{4,}/gu) || []);
  return [...x].some(w => y.has(w));
}

/* ===== Per-block quality label ===== */
function quality(b, a) {
  if (!b.content && b.type !== 'VISUAL') return ['Vacío', 'bad'];
  let r = a.r.find(x => x[2] === b.id);
  return r ? [r[0] === 'bad' ? 'Crítico' : 'Revisar', r[0]] : ['Óptimo', 'good'];
}

/* ===== Main analysis computation ===== */
function computeAnalysis() {
  const proj = getProject();
  let text = proj.blocks.map(b => b.content).join(' ');
  let hook = proj.blocks.find(b => b.type === 'HOOK');
  let sent = text.split(/[.!?]+/).filter(Boolean);
  let avg = W(text) / Math.max(1, sent.length);
  let visual = proj.blocks.filter(b => b.type === 'VISUAL' || b.type === 'GIRO').length;
  let r = [];

  /* Hook: detectar si el primer bloque funciona como hook aunque no tenga tipo HOOK */
  const firstBlock = proj.blocks[0];
  const hasHookType = !!hook;
  const firstIsHooky = firstBlock && firstBlock.content && (
    firstBlock.content.match(/[?¿]/) ||
    W(firstBlock.content) < 30 ||
    /nunca|siempre|secreto|error|truc[oa]|incre[ií]ble|sorprendente|clave|esencial/i.test(firstBlock.content)
  );
  const effectiveHook = hook || ((!hasHookType && firstIsHooky) ? firstBlock : null);

  if (!effectiveHook) r.push(['bad', 'Sin Hook definido']);
  if (effectiveHook && W(effectiveHook.content) < 12) r.push(['bad', 'Hook demasiado corto']);
  if (effectiveHook && proj.promise && !overlap(effectiveHook.content, proj.promise))
    r.push(['warn', 'La promesa no aparece en el Hook']);
  if (avg > 25) r.push(['warn', 'Oraciones extensas']);
  if (avg < 8) r.push(['warn', 'Oraciones demasiado cortas (estilo infantil)']);
  if (D(text) > 180 && visual < 2) r.push(['warn', 'Ritmo visual bajo']);
  if (!proj.blocks.some(b => b.type === 'CTA')) r.push(['warn', 'Sin CTA']);
  proj.blocks.forEach(b => {
    if (!b.content && b.type !== 'VISUAL') r.push(['bad', T[b.type][0] + ' vacío', b.id]);
    if (D(b.content) > 65 && ['SEGMENTO', 'CONTEXTO'].includes(b.type))
      r.push(['warn', 'Bloque de voz largo', b.id]);
  });

  /* Hook score */
  let hs;
  if (!effectiveHook) {
    hs = 5;
  } else {
    hs = 20;
    const wc = W(effectiveHook.content);
    hs += wc >= 15 && wc <= 80 ? 20 : wc >= 10 ? 10 : 5;
    if (/[?¿]/.test(effectiveHook.content)) hs += 15;
    if (/\d/.test(effectiveHook.content) && wc > 10) hs += 10;
    if (effectiveHook === firstBlock && !hasHookType) hs = Math.round(hs * 0.7);
    if (proj.promise && overlap(effectiveHook.content, proj.promise)) hs += 20;
    if (/ahora|hoy|descubr[ií]|secreto|nunca|siempre|error|truc[oa]|incre[ií]ble|sorprendente|importante|clave|esencial/i.test(effectiveHook.content)) hs += 10;
    hs = Math.min(100, hs);
  }

  /* Legibilidad FH */
  let fh = fernandezHuerta(text);
  let cl;
  if (fh > 90) cl = Math.max(30, 60 - (fh - 90) * 3);
  else if (fh >= 60) cl = Math.min(100, 70 + (fh - 60) * 0.5 - Math.max(0, avg - 18) * 2);
  else if (fh >= 40) cl = Math.max(20, 50 - (60 - fh) * 0.8);
  else cl = Math.max(10, 30 - (40 - fh));

  /* Ritmo: incluir varianza de longitud de oraciones */
  const sentLens = sent.map(s => W(s));
  const sentMean = sentLens.reduce((a, b) => a + b, 0) / Math.max(1, sentLens.length);
  const sentVar = sentLens.reduce((s, l) => s + (l - sentMean) ** 2, 0) / Math.max(1, sentLens.length);
  const sentCV = Math.sqrt(sentVar) / (sentMean || 1);
  let pa = Math.min(100, 25 + visual * 12 + (sentCV > 0.3 && sentCV < 1 ? 15 : sentCV <= 0.3 ? 0 : 5) + Math.min(20, sentLens.length > 3 ? 10 : 5));

  /* Promesa */
  let pr = effectiveHook && proj.promise ? (overlap(effectiveHook.content, proj.promise) ? 75 : 20) : 20;

  /* ICN score */
  let score;
  score = Math.round(hs * .31 + cl * .22 + pa * .22 + pr * .17 + (proj.blocks.some(b => b.type === 'CTA') ? 8 : 0));
  const rawIcn = Math.round(Math.max(0, Math.min(100, score)));

  /* Calibration blending */
  const cal = getCalRecords();
  const recent = cal.slice(-5);
  const reference = recent.length >= 5 ? recent.reduce((sum, x) => sum + Number(x.apv || 0), 0) / recent.length : null;
  const icn = reference === null ? rawIcn : Math.round(rawIcn * .7 + reference * .3);

  return { hs: Math.round(hs), cl: Math.round(cl), pa: Math.round(pa), pr, score: icn, rawIcn, calibrated: reference !== null, reference: reference && Math.round(reference), r };
}

/* Cached analysis wrapper */
function analysis() {
  if (!_analysisDirty && _cachedAnalysis) return _cachedAnalysis;
  _cachedAnalysis = computeAnalysis();
  _analysisDirty = false;
  return _cachedAnalysis;
}