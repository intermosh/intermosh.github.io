/* =====================================================================
 * YouTube Script Lab — model.js
 * Cálculo puro: análisis del guion, scores, retención, riesgos.
 *
 * Dependencias: window.Config (TYPES, STOP, SYNONYM_FAMILIES)
 * Expone: window.Model
 *
 * CONVENCIÓN DE COMENTARIOS:
 *   // VALIDADO: <fuente> — la constante/fórmula tiene respaldo empírico
 *   // SIN VALIDAR — heurística, ajustar con datos propios del canal
 *   // APOYO DIRECCIONAL: <fuente> — la dirección está respaldada pero
 *   //                                 la magnitud es heurística
 * ===================================================================== */

window.Model = (function () {
  'use strict';

  const { TYPES, STOP, SYNONYM_FAMILIES } = window.Config;

  /* ---- Utilidades de texto (sin estado) ---- */
  function strip(s) { return (s || '').replace(/<[^>]+>/g, ' ').replace(/https?:\/\/\S+/g, ' URL ').replace(/\s+/g, ' ').trim(); }
  function getWords(s) { return strip(s).match(/[\p{L}\p{N}]+(?:['’´-][\p{L}\p{N}]+)*/gu) || []; }
  function countWords(s) { return getWords(s).length; }
  function sentences(s) { const arr = strip(s).split(/[.!?¿¡;:]+/).map(x => x.trim()).filter(x => x.length > 2); return arr.length ? arr : ['']; }
  function countSyllables(word) {
    word = (word || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zñü]/g, '');
    if (!word) return 0;
    let c = 0, prev = false;
    const vowels = 'aeiouü';
    for (let i = 0; i < word.length; i++) {
      let v = vowels.includes(word[i]) || (word[i] === 'y' && i === word.length - 1);
      if (v && !prev) c++;
      prev = v;
    }
    return Math.max(1, c);
  }
  function totalSyllables(s) { return getWords(s).reduce((a, w) => a + countSyllables(w), 0); }

  /* ---- Legibilidad Fernández-Huerta ----
   * VALIDADO: Fernández-Huerta (1959); revisión SciELO 2008.
   * Fórmula original: 206.84 − 60·(sílabas/palabra) − 1.02·(palabras/frase).
   * Ver window.Config.SOURCES[6].
   * ------------------------------------------------------- */
  function fernandezHuerta(text) {
    const w = countWords(text), sent = sentences(text).length;
    if (w < 1) return 0;
    const spw = totalSyllables(text) / w;
    const wps = w / sent;
    return clamp(206.84 - 60 * spw - 1.02 * wps, 0, 100);
  }
  function avgSentenceWords(text) { return countWords(text) / Math.max(1, sentences(text).length); }
  function longSentences(text) { return sentences(text).filter(s => countWords(s) > 28).length; }

  /* ---- Tokens y overlap léxico ----
   * SIN VALIDAR — heurística, ajustar con datos propios del canal.
   * ------------------------------------------------------- */
  function tokens(s) { return getWords(s).map(w => w.toLowerCase()).filter(w => w.length > 3 && !STOP.has(w)); }
  function setOverlap(A, B) { if (!A.size || !B.size) return 0; let hit = 0; A.forEach(x => { if (B.has(x)) hit++; }); return hit / Math.min(A.size, B.size); }
  function overlapScore(a, b) { return setOverlap(new Set(tokens(a)), new Set(tokens(b))); }
  function normalizeToken(w) { return (w || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9ñü]/g, ''); }
  function tokenVariants(token) {
    let w = normalizeToken(token);
    if (!w || w.length < 3 || STOP.has(w)) return [];
    const out = new Set([w]);
    const bases = [w];
    if (w.endsWith('es') && w.length > 5) bases.push(w.slice(0, -2));
    else if (w.endsWith('s') && w.length > 4) bases.push(w.slice(0, -1));
    bases.forEach(x => {
      out.add(x);
      ['aciones','iciones','uciones','aciones','iciones','uciones','acion','icion','ucion','ciones','siones','cion','sion','mente','idades','idad','able','ible'].forEach(suf => { if (x.endsWith(suf) && x.length > suf.length + 3) out.add(x.slice(0, -suf.length)); });
      ['ariamos','eriamos','iriamos','aremos','eremos','iremos','arian','erían','irian','ando','iendo','ados','adas','idos','idas','aron','ieron','aban','aras','eras','iras','ado','ada','ido','ida','aba','ian','ar','er','ir'].forEach(suf => { const ns = normalizeToken(suf); if (x.endsWith(ns) && x.length > ns.length + 3) out.add(x.slice(0, -ns.length)); });
      if (x.length > 5 && /[aeo]$/.test(x)) out.add(x.slice(0, -1));
    });
    return Array.from(out).filter(v => v.length > 2 && !STOP.has(v));
  }
  function expandedTokenSet(text) {
    const out = new Set();
    tokens(text).forEach(t => tokenVariants(t).forEach(v => out.add(v)));
    SYNONYM_FAMILIES.forEach(f => { const match = f.some(root => Array.from(out).some(v => v.startsWith(root))); if (match) f.forEach(root => out.add(root)); });
    return out;
  }
  function rootOverlapScore(a, b) { return setOverlap(expandedTokenSet(a), expandedTokenSet(b)); }
  function promiseSignal(a, b) {
    const exact = overlapScore(a, b);
    const rooted = rootOverlapScore(a, b);
    return Math.max(exact, rooted * .9, exact * .55 + rooted * .45);
  }

  /* ---- Duración por bloque ----
   * WPM por defecto 150 para voz conversacional en español.
   * SIN VALIDAR como benchmark óptimo — ajustar según locutor.
   * ------------------------------------------------------- */
  function blockDuration(block, wpm) {
    const wc = countWords(block.text);
    const sec = Number(block.seconds) || 0;
    if (block.type === 'source') return 0;
    if (block.type === 'voice' || block.type === 'cta') return wc > 0 ? (wc / wpm) * 60 : 0;
    if (block.type === 'pause') return sec || 2.5;
    if (block.addsTime) {
      if (block.type === 'visual') return sec || Math.max(3, (wc / 170) * 60);
      if (block.type === 'screen') return sec || Math.max(2, (wc / 200) * 60);
      if (block.type === 'sfx') return sec || 2.2;
    }
    return 0;
  }

  /* ---- Utilidades de formato ---- */
  function formatTime(sec) {
    sec = Math.max(0, Math.round(sec || 0));
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
  }
  function pct(n) { return `${Math.round(n)}%`; }
  function round5(n) { return Math.round(n / 5) * 5; }
  function bandBounds(value, spread = 8, min = 0, max = 100) { let lo = round5(clamp(value - spread, min, max)), hi = round5(clamp(value + spread, min, max)); if (hi <= lo) hi = clamp(lo + 5, min, max); return { lo, hi }; }
  function bandText(value, suffix = '%', spread = 8) { const b = bandBounds(value, spread, 0, 100); return `${b.lo}–${b.hi}${suffix}`; }
  function scoreBandText(value) { return bandText(value, ''); }
  function scoreBandLabel(v) { return v >= 78 ? 'Listo' : v >= 60 ? 'Buen rumbo' : v >= 40 ? 'Revisar' : 'Bajo'; }
  function timeBandFromPct(totalSec, pctValue) { const b = bandBounds(pctValue, 8, 0, 100); return `${formatTime(totalSec * b.lo / 100)}–${formatTime(totalSec * b.hi / 100)}`; }
  function hoursBandFromPct(totalSec, pctValue) { const b = bandBounds(pctValue, 8, 0, 100), lo = totalSec * b.lo / 100 * 1000 / 3600, hi = totalSec * b.hi / 100 * 1000 / 3600; return `${lo.toFixed(1)}–${hi.toFixed(1)} h`; }

  /* ---- Misc ---- */
  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }

  /* ---- Calibración con retención real del canal ---- */
  function calibratedRetention(project) {
    const v = Number(project.realRetention);
    return Number.isFinite(v) && v > 0 && v <= 100 ? v : null;
  }

  /* ---- Análisis principal ----
   * Toma el estado {project, blocks} y los benchmarks activos
   * (opcionales, para override por bucket recalibrado) y devuelve un
   * objeto con todos los scores y la curva simulada.
   * ------------------------------------------------------- */
  function analyze(state, activeBenchmarks = null) {
    const p = state.project;
    const wpm = Number(p.wpm) || 150;
    let time = 0, voiceSec = 0, parallelEvents = 0, sourceCount = 0, ctaCount = 0, visualFirst30 = 0;
    let timeline = [], voiceText = '', allText = '', blockStats = [];

    state.blocks.forEach((block) => {
      const dur = blockDuration(block, wpm);
      const start = time;
      const wc = countWords(block.text);
      if (dur > 0) time += dur;
      if (['voice', 'cta'].includes(block.type)) { voiceSec += dur; voiceText += ' ' + block.text; allText += ' ' + block.text; }
      else if (block.type === 'source') { sourceCount++; allText += ' ' + block.text; }
      else { allText += ' ' + block.text; }
      if (['visual', 'screen', 'sfx', 'pause'].includes(block.type)) { parallelEvents++; if (start <= 30) visualFirst30++; }
      if (block.type === 'cta') ctaCount++;
      timeline.push({ i: timeline.length, id: block.id, type: block.type, start, duration: dur, end: start + dur, text: block.text, words: wc, addsTime: block.addsTime });
      blockStats.push({ words: wc, duration: dur, start, avgSent: avgSentenceWords(block.text), longSent: longSentences(block.text) });
    });

    const totalSec = Math.max(time, .1), minutes = totalSec / 60;
    const allWords = countWords(allText), voiceWords = countWords(voiceText);
    const titlePromise = (p.title || '') + ' ' + (p.promise || '');

    const introText = getIntroText(timeline, wpm);
    const hook = hookScore(introText, timeline, titlePromise, visualFirst30);
    const fh = fernandezHuerta(voiceText || allText);
    const avgSent = avgSentenceWords(voiceText || allText);
    const longSent = longSentences(voiceText || allText);
    const filler = countFillers(voiceText);

    /* --- clarity ---
     * SIN VALIDAR — el peso *.88 sobre FH es heurístico; los ajustes
     * +16/+7/−12 por longitud de oración son heurísticos (APOYO DIRECCIONAL:
     * Markel, Technical Communication, recomienda 15–20 palabras/oración).
     * La penalización −1.2/filler es heurística y parcialmente contradicha
     * por Carlson et al. (2024) que encuentran umbral, no modelo lineal.
     * Ver window.Config.HEURISTICS.
     * ------------------------------------------------------- */
    const clarity = clamp(
      fh * .88 + (avgSent <= 18 ? 16 : avgSent <= 24 ? 7 : -12) - longSent * 2 - filler * 1.2,
      0, 100
    );

    const longestVoice = Math.max(0, ...timeline.filter(x => ['voice', 'cta'].includes(x.type)).map(x => x.duration));
    const voiceBlocks = timeline.filter(x => ['voice', 'cta'].includes(x.type)).length;
    const interruptsPerMin = minutes > 0 ? parallelEvents / minutes : 0;

    /* --- visualScore & pacingScore ---
     * SIN VALIDAR — todos los coeficientes (82 base, ×13 desvío, −0.55/s,
     * +8/−8 apoyo visual; 72 base, +1.7 evento, cap +18, −0.75 bloque
     * largo, −0.35 avg voz) son heurísticos.
     * APOYO DIRECCIONAL: targets 3/8 interrupciones-min vs. Cutting et al.
     * (2016) que reporta ~14/min cine contemporáneo y ~8/min cine silente.
     * ------------------------------------------------------- */
    const visualScore = clamp(
      82 - Math.abs(interruptsPerMin - (p.format === 'short' ? 8 : 3)) * 13 - Math.max(0, longestVoice - 55) * .55 + (visualFirst30 ? 8 : -8),
      0, 100
    );
    const pacingScore = clamp(
      72 + Math.min(18, parallelEvents * 1.7) - Math.max(0, longestVoice - 45) * .75 - Math.max(0, (voiceBlocks ? voiceSec / voiceBlocks : 0) - 38) * .35,
      0, 100
    );

    let risks = [];
    buildRisks(risks, timeline, blockStats, { titlePromise, introText, visualFirst30, totalSec, voiceWords, allWords, allText, fh, avgSent, longSent, sourceCount, ctaCount, interruptsPerMin, longestVoice }, state);

    const promiseScore = clamp(promiseSignal(titlePromise, introText) * 100, 0, 100);
    const ctaScore = scoreCTA(timeline, totalSec);
    const sourceScore = scoreSources(sourceCount, voiceText, allText);
    const calibration = calibratedRetention(p);
    const retention = retentionModel({ totalSec, hook: hook.score, pacing: pacingScore, clarity, visual: visualScore, promise: promiseScore, risks, format: p.format, genre: p.genre, calibration, activeBenchmarks });

    const targetSec = (Number(p.targetMinutes) || 12) * 60;
    const delta = totalSec - targetSec;
    /* SIN VALIDAR — multiplier ×120 es heurístico. */
    const durationScore = clamp(100 - Math.abs(delta) / Math.max(60, targetSec) * 120, 0, 100);
    /* SIN VALIDAR — 55 baseline y pendiente 3.1 son heurísticos. */
    const retentionScore = clamp(55 + (retention.apv - retention.benchmark) * 3.1, 0, 100);
    /* SIN VALIDAR — pesos normalizados a mano (suman 1.00).
     * Reflejan prioridad editorial, no data empírica.
     * ------------------------------------------------------- */
    const preflight = clamp(
      hook.score * .23 + retentionScore * .24 + pacingScore * .15 + clarity * .12 + visualScore * .11 + promiseScore * .08 + ctaScore * .04 + sourceScore * .03,
      0, 100
    );

    return {
      timeline, blockStats, totalSec, minutes, voiceSec, voiceWords, allWords,
      hook, fh, avgSent, longSent, clarity, pacingScore, visualScore,
      interruptsPerMin, longestVoice, parallelEvents, sourceCount, ctaCount,
      promiseScore, ctaScore, sourceScore, retention, preflight,
      targetSec, delta, risks, durationScore, calibration, calibrated: calibration !== null
    };
  }

  function getIntroText(timeline, wpm) {
    let out = [];
    timeline.forEach(x => {
      if (!['voice', 'cta'].includes(x.type) || x.start >= 30) return;
      let words = getWords(x.text);
      if (x.duration > 0 && x.end > 30) {
        const frac = clamp((30 - x.start) / x.duration, 0, 1);
        words = words.slice(0, Math.max(1, Math.round(words.length * frac)));
      }
      out.push(words.join(' '));
    });
    return out.join(' ');
  }

  function countFillers(text) {
    const m = strip(text).toLowerCase().match(/\b(básicamente|basicamente|realmente|literalmente|simplemente|obviamente|en realidad|un poco|muy muy|cabe destacar|vale la pena mencionar)\b/g);
    return m ? m.length : 0;
  }

  /* ---- hookScore ----
   * TODOS los bonus/penalizaciones son SIN VALIDAR como magnitudes.
   * APOYO DIRECCIONAL:
   *  - +12 tensión/curiosidad: Loewenstein (1994) information-gap theory.
   *  - +9 value promise: Retention Rabbit 2025 (+18% retención con valor
   *    claro en primeros 15s, pero la magnitud +9 es heurística).
   *  - −7 oraciones largas: Markel, Technical Communication (15–20 pal/oración).
   *  - +9/+5/−7 apoyo visual: Cutting et al. (2016) sobre pacing.
   * Ver window.Config.HEURISTICS para el catálogo completo.
   * ------------------------------------------------------- */
  function hookScore(text, timeline, titlePromise, visualFirst30) {
    const wc = countWords(text), sent = avgSentenceWords(text), low = strip(text).toLowerCase();
    let score = 45, notes = [];
    if (wc >= 35 && wc <= 95) { score += 13; notes.push('hook con longitud útil'); }
    else if (wc < 20) { score -= 15; notes.push('primeros 30s con poca promesa verbal'); }
    else if (wc > 120) { score -= 8; notes.push('hook demasiado cargado'); }

    if (/[¿?]/.test(text)) { score += 9; notes.push('abre una pregunta'); }
    if (/\b(pero|sin embargo|nadie|secreto|mentira|error|problema|verdad|nunca|misterio|riesgo|cambió|cambio|por qué|como|cómo)\b/i.test(text)) { score += 12; notes.push('tensión/curiosidad explícita'); }
    if (/\b\d+\b|\b(hoy vas a|te muestro|vamos a ver|al final|la razón|resultado|caso|prueba)\b/i.test(text)) { score += 9; notes.push('promete valor concreto'); }

    const exactOv = overlapScore(titlePromise, text), ov = promiseSignal(titlePromise, text);
    if (ov > .38) { score += 14; notes.push('señal léxica aproximada fuerte con título/promesa'); }
    else if (ov > .18) { score += 7; notes.push('señal léxica aproximada parcial con promesa'); }
    else if (titlePromise.trim()) { score -= 11; notes.push('promesa del título poco visible al inicio'); }

    if (/\b(hola|bienvenidos|bienvenido|suscríbete|suscribete|like|dale like|mi canal|patrocinador|sponsor)\b/i.test(low)) { score -= 15; notes.push('intro/filler/CTA temprano'); }
    if (sent > 24) { score -= 7; notes.push('oraciones largas en el hook'); }
    if (visualFirst30 >= 2) { score += 9; notes.push('pattern interrupt visual temprano'); }
    else if (visualFirst30 === 1) { score += 5; notes.push('un apoyo visual temprano'); }
    else { score -= 7; notes.push('sin apoyo visual en primeros 30s'); }

    return { score: clamp(score, 0, 100), words: wc, avgSentence: sent, notes, overlap: ov * 100, exactOverlap: exactOv * 100, rootOverlap: rootOverlapScore(titlePromise, text) * 100 };
  }

  /* ---- buildRisks / risk ----
   * Umbrales y timestamps son heurísticos (SIN VALIDAR), pero cada riesgo
   * incluye acción concreta para el escritor.
   * ------------------------------------------------------- */
  function buildRisks(risks, timeline, stats, ctx, state) {
    const early = ctx.introText.toLowerCase();
    if (ctx.titlePromise.trim() && promiseSignal(ctx.titlePromise, ctx.introText) < .18) risk(risks, 'bad', 0, 'Promesa poco visible en los primeros 30s', 'El título/thumbnail puede atraer un click, pero el inicio no repite suficiente la promesa.', 'Reescribí la primera frase para nombrar el conflicto o resultado prometido.');
    if (/\b(hola|bienvenidos|bienvenido|suscríbete|suscribete|dale like|patrocinador|sponsor)\b/i.test(early)) risk(risks, 'bad', 0, 'Fricción temprana', 'Saludos largos, CTA o sponsor antes de entregar valor suelen generar caída de intro.', 'Arrancá con la escena, dato o contradicción; mové CTA/sponsor después del primer payoff.');
    if (ctx.visualFirst30 === 0) risk(risks, 'warn', 10, 'Primeros 30s sin interrupción visual', 'El hook depende sólo de voz.', 'Agregá B-roll, texto de 3–6 palabras, gráfico o cambio sonoro antes del segundo 10–15.');

    timeline.forEach((x, idx) => {
      const st = stats[idx];
      if (['voice', 'cta'].includes(x.type) && x.duration > 65) risk(risks, x.duration > 95 ? 'bad' : 'warn', x.start, 'Bloque de voz largo', `Este bloque dura ${formatTime(x.duration)} sin un corte estructural claro.`, 'Dividilo en 2–3 bloques y agregá un visual, pregunta o micro-payoff.');
      if (['voice', 'cta'].includes(x.type) && st.avgSent > 26) risk(risks, 'warn', x.start, 'Oraciones largas', `Promedio del bloque: ${st.avgSent.toFixed(1)} palabras por frase.`, 'Cortá frases. Una idea fuerte por oración mejora locución y subtítulos.');
      if (st.longSent > 0) risk(risks, 'warn', x.start, 'Frases muy extensas', `${st.longSent} frase(s) superan 28 palabras.`, 'Convertí subordinadas en frases cortas con pausas.');
    });

    const target = (Number(state.project.targetMinutes) || 12) * 60;
    if (ctx.totalSec > target * 1.22) risk(risks, 'warn', ctx.totalSec * .7, 'Duración sobre objetivo', `El guion se pasa ${formatTime(ctx.totalSec - target)} del objetivo.`, 'Recortá bloques que no abran/paguen una promesa.');
    if (ctx.totalSec < target * .65 && ctx.voiceWords > 0) risk(risks, 'warn', ctx.totalSec * .5, 'Guion muy corto para el objetivo', `Faltan cerca de ${formatTime(target - ctx.totalSec)}.`, 'Sumá ejemplos, evidencia o desarrollo; no rellenes con intro.');
    if (ctx.sourceCount === 0 && (/\b(estudio|dato|cifra|investigación|investigacion|según|segun|porcentaje|\d+%)\b/i.test(ctx.allText))) risk(risks, 'warn', ctx.totalSec * .55, 'Datos sin fuente', 'Hay lenguaje de evidencia, pero no bloques de fuente.', 'Agregá un bloque “Fuente/dato” junto a cada claim importante.');
    if (ctx.ctaCount === 0) risk(risks, 'warn', ctx.totalSec * .86, 'Sin CTA o end screen', 'No se detectó CTA.', 'Agregá un CTA al final o después de un payoff, no al comienzo.');
    if (ctx.interruptsPerMin < 1.4 && ctx.totalSec > 180) risk(risks, 'warn', ctx.totalSec * .45, 'Baja densidad visual', `${ctx.interruptsPerMin.toFixed(1)} interrupciones/minuto.`, 'Marcá B-roll, gráficos o texto cada 15–35s según género.');
  }
  function risk(arr, severity, time, title, detail, action) { arr.push({ severity, time, title, detail, action }); }

  /* ---- scoreCTA ----
   * SIN VALIDAR — umbrales 70%/25% y magnitudes +20/−22 son heurísticos.
   * ------------------------------------------------------- */
  function scoreCTA(timeline, totalSec) {
    const ctas = timeline.filter(x => x.type === 'cta');
    if (!ctas.length) return 40;
    let score = 65;
    ctas.forEach(c => {
      const pos = c.start / Math.max(1, totalSec);
      if (pos > .70) score += 20;
      else if (pos < .25) score -= 22;
      else score += 5;
    });
    return clamp(score, 0, 100);
  }

  /* ---- scoreSources ----
   * SIN VALIDAR — bonus +12/bloque (cap +18) es heurístico.
   * ------------------------------------------------------- */
  function scoreSources(count, voice, all) {
    let claims = (all.match(/\b(\d+%?|estudio|según|segun|informe|paper|investigación|investigacion|cifra|dato)\b/gi) || []).length;
    if (count === 0) return claims > 2 ? 35 : 58;
    return clamp(55 + count * 12 + Math.min(18, claims * 2), 0, 100);
  }

  /* ---- benchmarkAPV ----
   * Prioridades:
   *   1. manualCalibration (per-video, desde el campo realRetention del proyecto)
   *   2. activeBenchmarks[format][genre] (per-bucket, recalibrado desde Datos Reales)
   *   3. heurística por duración + género (fallback)
   *
   * SIN VALIDAR como punto estimado.
   * APOYO DIRECCIONAL: los 6 umbrales caen dentro (a veces en el borde
   * inferior) de los rangos publicados por humbleandbrag 2026 y
   * prepublish.ai 2026, pero ningún source reproduce estos decimales.
   * Shorts 0.82 cae dentro del rango socialvideoplaza (80–90%) y
   * prepublish.ai (70–85%). Live 0.24 NO tiene source publicada.
   * Calibrar con APV promedio del canal (campo realRetention en UI o
   * recalibración por bucket en tab Datos Reales).
   * ------------------------------------------------------- */
  function benchmarkAPV(totalSec, format, genre, calibration = null, activeBenchmarks = null) {
    // Prioridad 1: calibración manual per-video
    if (calibration !== null) return clamp(calibration / 100, .05, .95);
    // Prioridad 2: calibración por bucket (format+genre) desde Datos Reales
    if (activeBenchmarks && activeBenchmarks[format] && activeBenchmarks[format][genre] != null) {
      return activeBenchmarks[format][genre];
    }
    // Prioridad 3: heurística por duración + género
    if (format === 'short') return .82;
    if (format === 'live') return .24;
    let b = totalSec <= 180 ? .62 : totalSec <= 300 ? .55 : totalSec <= 600 ? .47 : totalSec <= 900 ? .41 : totalSec <= 1800 ? .34 : .30;
    if (genre === 'tutorial') b += .03;
    if (genre === 'entretenimiento') b += .02;
    if (genre === 'ensayo') b -= .02;
    return clamp(b, .18, .78);
  }

  /* ---- recalibrateBucket (función pura) ----
   * Dada la lista de registros reales, un par (format, genre) y el valor
   * actual del benchmark (fracción 0-1), calcula el nuevo valor según las
   * reglas duras:
   *   - requiere >= CALIBRATION_CONFIG.MIN_SAMPLES registros
   *   - nuevo valor = promedio de APV reales del bucket
   *   - cambio limitado a ±CALIBRATION_CONFIG.MAX_DELTA_PCT puntos
   *     porcentuales respecto al valor actual
   *   - si se excede el tope, aplica el tope y marca wasCapped=true
   *     con una nota de ajuste pendiente
   *
   * NO toca los pesos del preflight (hook*.23, etc.) — esos quedan fijos.
   * Devuelve { ok, oldValue, newValue, average, sampleCount, wasCapped, note, reason? }.
   * ------------------------------------------------------- */
  function recalibrateBucket(realScores, format, genre, currentValue, minSamples, maxDeltaPct) {
    const samples = realScores.filter(r =>
      r.format === format && r.genre === genre && Number.isFinite(r.real_apv_pct) && r.real_apv_pct > 0
    );
    if (samples.length < minSamples) {
      return {
        ok: false,
        reason: `Faltan registros: tenés ${samples.length} de ${minSamples} requeridos para el bucket ${format}+${genre}.`,
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
      newValueFraction = clamp(currentValue + direction * (maxDeltaPct / 100), 0.05, 0.95);
      wasCapped = true;
      const remainingPct = Math.abs(avgPct - newValueFraction * 100);
      note = `Promedio real ${avgPct.toFixed(1)}% excede el tope de ±${maxDeltaPct}pp respecto al valor actual ${currentPct.toFixed(1)}%. Se aplicó el tope (${(newValueFraction * 100).toFixed(1)}%). Ajuste pendiente: ${remainingPct.toFixed(1)}pp — ejecutá otra recalibración más adelante para mover el resto.`;
    } else {
      note = `Promedio real ${avgPct.toFixed(1)}% aplicado sin tope (delta ${deltaPct >= 0 ? '+' : ''}${deltaPct.toFixed(1)}pp respecto a ${currentPct.toFixed(1)}%).`;
    }
    return {
      ok: true,
      oldValue: currentValue,
      newValue: newValueFraction,
      average: avgFraction,
      sampleCount: samples.length,
      wasCapped,
      note,
      rawDeltaPct: deltaPct
    };
  }

  /* ---- retentionModel ----
   * VALIDADO cualitativamente: la FORMA nose-body-tail está documentada
   * en Altman & Jiménez (2019) y YouTube Help 9314415.
   * SIN VALIDAR: la interpolación algebraica específica (lineal + easeOut
   * exponente 1.8), los coeficientes del target, el intercepto .48 de r30,
   * y la reconstrucción de endR. Ver window.Config.HEURISTICS.
   * ------------------------------------------------------- */
  function retentionModel(o) {
    const base = benchmarkAPV(o.totalSec, o.format, o.genre, o.calibration ?? null, o.activeBenchmarks ?? null);
    const severe = o.risks.filter(r => r.severity === 'bad').length;
    const warn = o.risks.filter(r => r.severity === 'warn').length;

    /* SIN VALIDAR — coeficientes 0.0015/0.0012/0.0007/0.001/0.0011 y
     * penalizaciones −0.012/−0.004 son heurísticos. */
    let target = base
      + (o.hook - 60) * .0015
      + (o.pacing - 60) * .0012
      + (o.clarity - 60) * .0007
      + (o.visual - 60) * .001
      + (o.promise - 60) * .0011
      - severe * .012
      - warn * .004;
    target = clamp(target, o.format === 'short' ? .45 : .18, .88);

    /* SIN VALIDAR — intercepto .48 y coeficientes son heurísticos. */
    let r30 = clamp(.48 + o.hook * .0032 + o.promise * .0012 + o.visual * .0009 - severe * .012, .35, .89);

    const T = Math.max(1, o.totalSec);
    let endR = target;
    /* SIN VALIDAR — reconstrucción algebraica de endR para que el área
     * bajo la curva coincida con el target. No aparece en literatura. */
    if (T > 30) {
      const pre = 15 * (1 + r30);
      endR = 2 * (target * T - pre) / (T - 30) - r30;
      endR = clamp(endR, .06, Math.max(.08, r30 - .03));
    }

    /* Construcción de la curva: easeOut en primeros 30s, lineal post-30s.
     * Forma cualitativa VALIDADA; interpolación específica SIN VALIDAR. */
    let pts = [];
    const N = 90;
    for (let i = 0; i <= N; i++) {
      const t = T * i / N;
      let r;
      if (T <= 30) { r = 1 - (1 - target) * Math.pow(t / T, .75); }
      else if (t <= 30) { r = 1 - (1 - r30) * easeOut(t / 30); }
      else { const pr = (t - 30) / (T - 30); r = r30 + (endR - r30) * pr; }
      /* SIN VALIDAR — amplitud y ancho de dips son heurísticos. */
      o.risks.forEach(rs => {
        const amp = rs.severity === 'bad' ? .045 : .025;
        const width = rs.severity === 'bad' ? 38 : 28;
        r -= amp * Math.exp(-Math.pow(t - rs.time, 2) / (2 * width * width));
      });
      pts.push({ time: t, retention: clamp(r, .04, 1) });
    }
    pts[0].retention = 1;

    const apv = curveAvg(pts, T) * 100;
    return {
      points: pts,
      apv,
      avd: T * apv / 100,
      watch1000: T * apv / 100 * 1000 / 3600,
      r30: (valueAt(pts, Math.min(30, T)) * 100),
      benchmark: base * 100,
      target: target * 100
    };
  }

  function easeOut(x) { return 1 - Math.pow(1 - clamp(x, 0, 1), 1.8); }
  function curveAvg(pts, T) {
    if (pts.length < 2) return pts[0]?.retention || 0;
    let area = 0;
    for (let i = 1; i < pts.length; i++) {
      area += (pts[i].time - pts[i - 1].time) * (pts[i].retention + pts[i - 1].retention) / 2;
    }
    return area / T;
  }
  function valueAt(pts, t) {
    let p = pts[0];
    for (let i = 1; i < pts.length; i++) {
      if (pts[i].time >= t) {
        const a = pts[i - 1], b = pts[i], f = (t - a.time) / (b.time - a.time || 1);
        return a.retention + (b.retention - a.retention) * f;
      }
      p = pts[i];
    }
    return p.retention;
  }

  return {
    // text utils
    strip, getWords, countWords, sentences, countSyllables, totalSyllables,
    fernandezHuerta, avgSentenceWords, longSentences,
    tokens, setOverlap, overlapScore, normalizeToken, tokenVariants,
    expandedTokenSet, rootOverlapScore, promiseSignal,
    // duration / format
    blockDuration, formatTime, pct, round5, bandBounds, bandText,
    scoreBandText, scoreBandLabel, timeBandFromPct, hoursBandFromPct,
    clamp,
    // analysis
    calibratedRetention, analyze, getIntroText, countFillers,
    hookScore, buildRisks, risk, scoreCTA, scoreSources,
    benchmarkAPV, retentionModel, easeOut, curveAvg, valueAt,
    recalibrateBucket
  };
})();
