/* =====================================================================
 * YouTube Script Lab — converter.js
 * Motor OFFLINE de texto → JSON de guion.
 *
 * No usa LLM, no llama a ninguna API. Es JavaScript puro con heurísticas
 * basadas en reglas léxicas y estructurales para:
 *   1. Limpiar ruido (markdown, bullets, headers, énfasis, timestamps).
 *   2. Detectar tipo de bloque (voice/visual/screen/sfx/pause/cta/source)
 *      via marcadores explícitos [VOZ], etiquetas "VOZ:", keywords y
 *      patrones estructurales (ALL CAPS, URLs, listas, diálogos).
 *   3. Inferir metadata del proyecto (título, promesa, formato, género,
 *      duración objetivo) a partir del contenido.
 *
 * Expone: window.Converter.textToScript(rawText) → { project, blocks }
 * ===================================================================== */

window.Converter = (function () {
  'use strict';

  /* ===================================================================
   * 1. LÉXICOS — keywords en español (con tolerancia a acentos)
   * =================================================================== */

  const VISUAL_STARTERS = [
    'mostrar', 'muestro', 'muestra', 'muestran', 'mirá', 'mira', 'miramos',
    'ves ', 'vemos ', 'vean ', 'visualiz', 'ver ',
    'cámara', 'camara', 'plano ', 'zoom', 'paneo', 'ángulo', 'primer plano',
    'foto', 'imagen', 'imágenes', 'imagenes', 'gráfico', 'grafico', 'mapa',
    'dibujo', 'animación', 'animacion', 'recreación', 'recreacion',
    'archivo', 'b-roll', 'broll', 'b roll',
    'sobreimpres', 'tabla', 'esquema', 'diagrama',
    'corte a', 'fundido', 'transición vis', 'transicion vis',
    'timeline', 'línea de tiempo', 'linea de tiempo',
    'insert', 'inserto', 'pantalla dividida', 'split screen',
    'archivo de', 'footage', 'clip'
  ];

  const SFX_KEYWORDS = [
    'golpe', 'impacto', 'golpe musical', 'hit', 'drop',
    'silencio', 'pausa sonora', 'mute',
    'música', 'musica', 'música de', 'musica de', 'riser', 'build-up', 'build up',
    'stinger', 'sting', 'jingle', 'whoosh', 'swoosh', 'boom', 'subidón', 'subidon',
    'ambiente', 'sonido ambiente', 'sonido de fondo',
    'fx', 'efecto', 'efectos', 'efecto sonoro', 'efectos sonoros',
    'corte sonoro', 'transición son', 'transicion son'
  ];

  const PAUSE_KEYWORDS = [
    'pausa', 'pausa dramática', 'pausa dramatica', 'pausa breve',
    'beat', 'beat dramático', 'beat dramatico',
    'silencio', 'silencio breve', 'silencio dramático',
    'respiración', 'respiracion', 'respiro', 'respira'
  ];

  const CTA_KEYWORDS = [
    'comenta', 'comentá', 'comentalo', 'comentálo',
    'dejá un comentario', 'deja un comentario', 'dejá en comentarios',
    'dejanos un comentario', 'déjenlo en comentarios', 'dejen un comentario',
    'suscrib', 'suscribite', 'suscribete', 'suscribanse', 'suscríbete',
    'dale like', 'dale un like', 'like si', 'likes', 'dame like',
    'patrocinador', 'sponsor', 'auspiciante',
    'end screen', 'pantalla final', 'video siguiente', 'otro video',
    'mi canal', 'seguime', 'sígueme', 'seguir el canal', 'seguinos',
    'no olvides', 'no te olvides de', 'activá la campanita', 'activa la campanita'
  ];

  const SOURCE_KEYWORDS_REGEX = /\b(fuente|según|segun|estudio|paper|investigación|investigacion|informe|reporte|dataset|cita|citado|doi|arxiv|referencia|recurso)\b/i;
  const URL_REGEX = /https?:\/\/\S+/i;
  const TIMESTAMP_REGEX = /\b(\d{1,2}:\d{2}(?::\d{2})?)\b/;

  const PROMISE_PATTERNS = [
    /vas a ver\s+[^.!?]+[.!?]/i,
    /vamos a ver\s+[^.!?]+[.!?]/i,
    /te muestro\s+[^.!?]+[.!?]/i,
    /te voy a mostrar\s+[^.!?]+[.!?]/i,
    /al final\s+[^.!?]+[.!?]/i,
    /entenderás\s+[^.!?]+[.!?]/i,
    /aprenderás\s+[^.!?]+[.!?]/i,
    /descubrirás\s+[^.!?]+[.!?]/i,
    /vas a entender\s+[^.!?]+[.!?]/i,
    /la verdad sobre\s+[^.!?]+[.!?]/i,
    /el secreto de\s+[^.!?]+[.!?]/i,
    /la razón por la que\s+[^.!?]+[.!?]/i,
    /por qué\s+[^.!?]+[.!?]/i,
    /cómo\s+[^.!?]+[.!?]/i,
    /hoy vas a\s+[^.!?]+[.!?]/i
  ];

  /* ===================================================================
   * 2. MARCADORES EXPLÍCITOS — [TIPO] y "TIPO:"
   * =================================================================== */

  const EXPLICIT_BRACKET_MARKERS = [
    { re: /^\s*\[\s*(voz|voice|v|narración|narracion|narrador|vo|nar)\s*\]\s*/i, type: 'voice' },
    { re: /^\s*\[\s*(visual|b-roll|broll|b roll|vídeo|video|viseo|vis)\s*\]\s*/i, type: 'visual' },
    { re: /^\s*\[\s*(pantalla|screen|texto|txt|on-screen)\s*\d*\s*\]\s*/i, type: 'screen' },
    { re: /^\s*\[\s*(sfx|música|musica|music|fx|efecto|efectos|audio)\s*\d*\s*\]\s*/i, type: 'sfx' },
    { re: /^\s*\[\s*(pausa|pause|beat|silencio|silence|wait)\s*\d*\s*\]\s*/i, type: 'pause' },
    { re: /^\s*\[\s*(cta|llamado|call|end screen|endscreen)\s*\d*\s*\]\s*/i, type: 'cta' },
    { re: /^\s*\[\s*(fuente|source|dato|referencia|src|ref)\s*\d*\s*\]\s*/i, type: 'source' }
  ];

  const LABEL_MARKERS = [
    { re: /^\s*(vo|voz|narrador|narración|narracion|narration|narradora)\s*[:\-—]\s*/i, type: 'voice' },
    { re: /^\s*(visual|b-roll|broll|video|vídeo|viseo)\s*[:\-—]\s*/i, type: 'visual' },
    { re: /^\s*(pantalla|screen|texto|on-screen)\s*[:\-—]\s*/i, type: 'screen' },
    { re: /^\s*(sfx|fx|música|musica|music|efecto|efectos|audio)\s*[:\-—]\s*/i, type: 'sfx' },
    { re: /^\s*(pausa|pause|beat|silencio)\s*[:\-—]\s*/i, type: 'pause' },
    { re: /^\s*(cta|llamado)\s*[:\-—]\s*/i, type: 'cta' },
    { re: /^\s*(fuente|source|dato|referencia)\s*[:\-—]\s*/i, type: 'source' }
  ];

  function stripExplicitMarker(text) {
    let t = text;
    for (const m of EXPLICIT_BRACKET_MARKERS) {
      if (m.re.test(t)) return { type: m.type, text: t.replace(m.re, '') };
    }
    for (const m of LABEL_MARKERS) {
      if (m.re.test(t)) return { type: m.type, text: t.replace(m.re, '') };
    }
    return { type: null, text: t };
  }

  /* ===================================================================
   * 3. LIMPIEZA DE RUIDO
   * =================================================================== */

  function cleanNoise(text) {
    if (!text) return '';
    let t = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    // Strip markdown ATX headers pero conservar texto
    t = t.replace(/^#{1,6}\s*/gm, '');
    // Strip setext-style headers (=== y --- bajo una línea)
    t = t.replace(/^(.+)\n=+$/gm, '$1');
    t = t.replace(/^(.+)\n-+$/gm, '$1');
    // Strip horizontal rules
    t = t.replace(/^[\-\*_]{3,}$/gm, '');
    // Strip énfasis markdown (conservar texto)
    t = t.replace(/\*\*([^*]+)\*\*/g, '$1');
    t = t.replace(/__([^_]+)__/g, '$1');
    t = t.replace(/(?<!\w)\*([^*\n]+)\*(?!\w)/g, '$1');
    t = t.replace(/(?<!\w)_([^_\n]+)_(?!\w)/g, '$1');
    // Strip inline code backticks (conservar texto)
    t = t.replace(/`([^`\n]+)`/g, '$1');
    // Strip leading bullet markers
    t = t.replace(/^[\s]*[\-\*•‣◦▪►●○]\s+/gm, '');
    // Strip leading numbered list markers (1. 2. 3. or 1) 2) 3))
    t = t.replace(/^[\s]*\d+[\.\)]\s+/gm, '');
    // Strip timestamps al inicio de línea [00:00:30] o (00:00:30) o 00:00:30
    t = t.replace(/^\s*(?:\[|\()?\s*\d{1,2}:\d{2}(?::\d{2})?\s*(?:\]|\))?\s*[:\-—]?\s+/gm, '');
    // Strip blockquote markers
    t = t.replace(/^[\s]*>\s?/gm, '');
    // Strip trailing whitespace por línea
    t = t.replace(/[ \t]+$/gm, '');
    // Colapsar 3+ newlines a 2
    t = t.replace(/\n{3,}/g, '\n\n');
    // Trim global
    t = t.replace(/^\s+|\s+$/g, '');
    return t;
  }

  /* ===================================================================
   * 4. DETECCIÓN DE ESTRUCTURA
   * =================================================================== */

  // ¿Es texto TODO EN MAYÚSCULAS y corto (≤8 palabras)? → screen
  function isAllCapsShort(s) {
    const words = s.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0 || words.length > 8) return false;
    const letters = s.replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/g, '');
    if (letters.length < 3) return false;
    const upper = letters.replace(/[^A-ZÁÉÍÓÚÜÑ]/g, '');
    return upper.length / letters.length >= 0.6;
  }

  function containsAny(text, keywords) {
    const lower = text.toLowerCase();
    return keywords.some(k => lower.includes(k));
  }
  function startsWithAny(text, keywords) {
    const lower = text.toLowerCase().replace(/^\s+/, '');
    return keywords.some(k => lower.startsWith(k));
  }

  /* ===================================================================
   * 5. CLASIFICACIÓN DE BLOQUE
   * =================================================================== */

  function classifyBlock(rawText) {
    if (!rawText || !rawText.trim()) return null;

    // 1. Marcador explícito [TIPO] o "TIPO:"
    const { type: explicitType, text: stripped } = stripExplicitMarker(rawText);
    if (explicitType) {
      const t = stripped.trim();
      if (!t) return null;
      // Pause explícita con duración opcional: "Pausa 2s" o "[PAUSA 3]"
      if (explicitType === 'pause') {
        const m = t.match(/(\d+(?:[.,]\d+)?)\s*(s|seg|segundos)?/i);
        const seconds = m ? parseFloat(m[1].replace(',', '.')) : 2;
        return { type: 'pause', text: t, addsTime: true, seconds };
      }
      return { type: explicitType, text: t };
    }

    const t = stripped.trim();
    if (!t) return null;

    // 2. Source: URL o keywords de fuente
    if (URL_REGEX.test(t) || SOURCE_KEYWORDS_REGEX.test(t)) {
      return { type: 'source', text: t };
    }

    // 3. SFX (antes que pause — "golpe grave + silencio breve" es SFX, no pause)
    if (t.length < 150 && (startsWithAny(t, SFX_KEYWORDS) || containsAny(t, ['golpe musical', 'riser', 'stinger', 'whoosh', 'swoosh', 'boom', 'jingle', 'sting']))) {
      return { type: 'sfx', text: t };
    }

    // 4. Pause: very short, EMPIEZA con pause word, o ellipsis/em-dash puro
    //    (más estricto: ya no matchea por "contains" para evitar comerse SFX
    //    como "golpe + silencio")
    const lowerT = t.toLowerCase();
    if (
      (t.length < 80 && startsWithAny(t, PAUSE_KEYWORDS)) ||
      /^[\.\…]{2,}$/.test(t) || /^[—–-]$/.test(t) ||
      /^(pausa|beat|silencio)\.?\s*$/i.test(t)
    ) {
      const m = lowerT.match(/(\d+(?:[.,]\d+)?)\s*(s|seg|segundos)?/);
      const seconds = m ? parseFloat(m[1].replace(',', '.')) : 2;
      return { type: 'pause', text: t, addsTime: true, seconds };
    }

    // 5. Screen: ALL CAPS short text
    if (isAllCapsShort(t)) {
      return { type: 'screen', text: t };
    }
    // O texto entre corchetes [text] ≤10 palabras → screen
    const bracketMatch = t.match(/^\[([^\]]+)\]$/);
    if (bracketMatch) {
      const inner = bracketMatch[1].trim();
      if (inner.split(/\s+/).length <= 10) {
        return { type: 'screen', text: inner.toUpperCase() };
      }
    }
    // O texto entre comillas "corto" ≤8 palabras → screen
    const quoteMatch = t.match(/^["«"]([^"»"]+)["»»]$/);
    if (quoteMatch) {
      const inner = quoteMatch[1].trim();
      if (inner.split(/\s+/).length <= 8) {
        return { type: 'screen', text: inner.toUpperCase() };
      }
    }

    // 6. CTA: keywords de llamado, texto relativamente corto
    if (containsAny(t, CTA_KEYWORDS) && t.length < 400) {
      return { type: 'cta', text: t };
    }

    // 7. Visual: empieza con verbo/nombre de visual, texto descriptivo
    if (t.length < 500 && startsWithAny(t, VISUAL_STARTERS)) {
      return { type: 'visual', text: t };
    }
    // O contiene "se ve" / "aparece en pantalla" / "mostramos"
    if (t.length < 500 && /\b(se ve|se ven|aparece en pantalla|aparecen en pantalla|mostramos|podemos ver|podés ver|podes ver)\b/i.test(t)) {
      return { type: 'visual', text: t };
    }

    // 8. Default: voice
    return { type: 'voice', text: t };
  }

  /* ===================================================================
   * 6. SPLIT DE PÁRRAFOS
   * =================================================================== */

  function splitParagraphs(text) {
    if (!text) return [];
    const parts = text.split(/\n{2,}/);
    const out = [];

    for (const p of parts) {
      const trimmed = p.trim();
      if (!trimmed) continue;

      const lines = trimmed.split(/\n/).map(l => l.trim()).filter(Boolean);

      // Si son 3+ líneas cortas (≤100 chars c/u) → lista: cada línea es su propio bloque
      if (lines.length >= 3 && lines.every(l => l.length < 100)) {
        for (const l of lines) {
          if (l.trim()) out.push(l);
        }
      }
      // Si son 2 líneas y la 2da es corta (parece subtítulo/título) → dos bloques separados
      else if (lines.length === 2 && lines[1].length < 60 && lines[0].length < 200) {
        out.push(lines[0]);
        out.push(lines[1]);
      }
      // Párrafo único — preservar como un bloque (colapsar newlines internos)
      else {
        out.push(trimmed.replace(/\n/g, ' ').replace(/\s+/g, ' '));
      }
    }
    return out;
  }

  /* ===================================================================
   * 7. DETECCIÓN DE METADATA DEL PROYECTO
   * =================================================================== */

  function detectProject(rawText, blocks) {
    const text = rawText || '';
    const allText = blocks.map(b => b.text).join(' ');
    const wordCount = (allText.match(/\S+/g) || []).length;

    /* --- Título --- */
    let title = '';
    const firstLine = text.split(/\n/).map(l => l.trim()).find(l => l.length > 0);
    if (firstLine) {
      const cleaned = firstLine
        .replace(/^#+\s*/, '')
        .replace(/^\*+|\*+$/g, '')
        .replace(/^["«"]|["»»]$/g, '')
        .trim();
      if (cleaned.length > 0 && cleaned.length <= 100) {
        // ALL CAPS → título
        if (cleaned === cleaned.toUpperCase() && /[A-ZÁÉÍÓÚÜÑ]/.test(cleaned)) {
          title = cleaned;
        }
        // Corto y no termina en puntuación de oración → título
        else if (cleaned.length <= 80 && !/[.!?]$/.test(cleaned) && !cleaned.includes('\n')) {
          title = cleaned;
        }
      }
    }

    /* --- Promesa --- */
    let promise = '';
    const voiceBlocks = blocks.filter(b => b.type === 'voice').slice(0, 3);
    for (const vb of voiceBlocks) {
      for (const re of PROMISE_PATTERNS) {
        const m = vb.text.match(re);
        if (m) { promise = m[0].trim(); break; }
      }
      if (promise) break;
    }
    if (!promise && voiceBlocks.length > 0) {
      const first = voiceBlocks[0].text;
      const sentences = first.split(/(?<=[.!?])\s+/);
      promise = sentences.slice(0, 2).join(' ').trim();
      if (promise.length > 220) promise = promise.substring(0, 220) + '...';
    }

    /* --- Audiencia --- */
    // No se puede detectar confiablemente; dejar vacío para que el usuario lo complete
    const audience = '';

    /* --- Formato --- */
    const lowerAll = allText.toLowerCase();
    let format = 'long';
    if (wordCount < 300) format = 'short';
    if (/\b(en vivo|directo|stream|live stream|en directo)\b/i.test(lowerAll)) format = 'live';

    /* --- Género --- */
    // Score por keyword counting
    const genreKw = {
      tutorial:      ['tutorial', 'cómo hacer', 'como hacer', 'paso a paso', 'guía', 'guia', 'aprende', 'aprendé', 'cómo usar', 'como usar', 'instrucciones', 'tutorial de'],
      ensayo:        ['ensayo', 'opinión', 'opinion', 'reflexión', 'reflexion', 'pienso que', 'creo que', 'desde mi punto de vista', 'análisis personal', 'analisis personal', 'mi opinión', 'mi opinion'],
      review:        ['review', 'análisis', 'analisis', 'pros y contras', 'pro y contras', 'evaluación', 'evaluacion', 'veredicto', 'calificación', 'calificacion', 'puntos a favor', 'puntos en contra', 'reseña', 'resenha'],
      documental:    ['historia', 'documental', 'caso', 'crónica', 'cronica', 'investigación', 'investigacion', 'archivo', 'suceso', 'acontecimiento', 'biografía', 'biografia', 'ocurrió en', 'ocurrio en', 'en el año'],
      entretenimiento:['entretenimiento', 'humor', 'comedia', 'sketch', 'parodia', 'viral', 'trend', 'challenge', 'reto', 'broma', 'experimento', 'top 10', 'top10', 'curiosidades']
    };
    const scores = { tutorial: 0, ensayo: 0, review: 0, documental: 0, entretenimiento: 0 };
    for (const [g, kws] of Object.entries(genreKw)) {
      for (const kw of kws) {
        // Regex con tolerancia a acentos
        const re = new RegExp(escapeAcentos(kw), 'gi');
        const matches = allText.match(re);
        if (matches) scores[g] += matches.length;
      }
    }
    let genre = 'entretenimiento';
    let maxScore = 0;
    for (const [g, s] of Object.entries(scores)) {
      if (s > maxScore) { maxScore = s; genre = g; }
    }

    /* --- targetMinutes --- */
    const voiceWords = blocks
      .filter(b => b.type === 'voice' || b.type === 'cta')
      .reduce((s, b) => s + (b.text.match(/\S+/g) || []).length, 0);
    const targetMinutes = Math.max(0.25, Math.round((voiceWords / 150) * 4) / 4);

    return {
      title,
      promise,
      audience,
      format,
      genre,
      targetMinutes,
      wpm: 150,
      realRetention: ''
    };
  }

  function escapeAcentos(s) {
    return s.replace(/[aáeéiíoóuúüñ]/gi, ch => {
      const lower = ch.toLowerCase();
      const map = { a: 'a[áa]?', e: 'e[ée]?', i: 'i[íi]?', o: 'o[óo]?', u: 'u[úüu]?', ñ: 'ñ' };
      return map[lower] || ch;
    }).replace(/\s+/g, '\\s+');
  }

  /* ===================================================================
   * 8. POST-PROCESAMIENTO
   * =================================================================== */

  function postProcessBlocks(blocks) {
    // 1. Filtrar vacíos
    let out = blocks.filter(b => b.text && b.text.trim());

    // 2. Si el primer bloque es voice y arranca con saludo/CTA →
    //    separar el saludo como su propio bloque voice (no borrar, decisión del usuario)
    if (out.length > 0 && out[0].type === 'voice') {
      const first = out[0].text;
      const greetingMatch = first.match(/^(hola\s+[a-záéíóúüñ\s,!?]+|bienvenidos?\s+[a-záéíóúüñ\s,!?]*|buenas\s+[a-záéíóúüñ\s,!?]*)/i);
      if (greetingMatch && greetingMatch[0].length < 80 && first.length > greetingMatch[0].length + 20) {
        const greeting = greetingMatch[0].trim();
        const rest = first.substring(greetingMatch[0].length).trim();
        if (rest) {
          out[0] = { ...out[0], text: rest };
          out.unshift({ id: uid(), type: 'voice', text: greeting, addsTime: false, seconds: 0 });
        }
      }
    }

    // 3. Normalizar addsTime/seconds por defecto según tipo
    out = out.map(b => {
      const defaults = {
        voice:  { addsTime: false, seconds: 0 },
        visual: { addsTime: false, seconds: 0 },
        screen: { addsTime: false, seconds: 0 },
        sfx:    { addsTime: false, seconds: 0 },
        pause:  { addsTime: true,  seconds: b.seconds || 2 },
        cta:    { addsTime: false, seconds: 0 },
        source: { addsTime: false, seconds: 0 }
      };
      return { ...defaults[b.type], ...b };
    });

    return out;
  }

  /* ===================================================================
   * 9. ENTRY POINT
   * =================================================================== */

  function textToScript(rawText) {
    if (!rawText || !rawText.trim()) {
      return { project: emptyProject(), blocks: [] };
    }

    const cleaned = cleanNoise(rawText);
    const paragraphs = splitParagraphs(cleaned);

    const rawBlocks = [];
    for (const p of paragraphs) {
      const b = classifyBlock(p);
      if (b && b.text && b.text.trim()) {
        rawBlocks.push({ id: uid(), ...b });
      }
    }

    const blocks = postProcessBlocks(rawBlocks);

    // Detectar proyecto
    const project = detectProject(rawText, blocks);

    // Si el primer bloque de voz coincide exactamente con el título detectado,
    // removerlo de los bloques (ya está como metadata del proyecto).
    if (project.title && blocks.length > 0) {
      const first = blocks[0];
      if (first.type === 'voice' && first.text.trim() === project.title.trim()) {
        blocks.shift();
      }
    }

    return { project, blocks };
  }

  function emptyProject() {
    return {
      title: '', promise: '', audience: '',
      format: 'long', genre: 'entretenimiento',
      targetMinutes: 12, wpm: 150, realRetention: ''
    };
  }

  function uid() {
    return Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);
  }

  /* ===================================================================
   * 10. DESCRIPCIÓN PARA UI (resumen ejecutivo del resultado)
   * =================================================================== */

  function describe(result) {
    if (!result.blocks.length) return 'Sin bloques detectados.';
    const counts = {};
    for (const b of result.blocks) counts[b.type] = (counts[b.type] || 0) + 1;
    const parts = Object.entries(counts).map(([t, n]) => `${t}: ${n}`);
    const title = result.project.title ? `"${result.project.title.substring(0, 40)}"` : 'sin título';
    return `${result.blocks.length} bloques (${parts.join(', ')}) · ${title} · ${result.project.format}/${result.project.genre} · objetivo ${result.project.targetMinutes} min`;
  }

  return { textToScript, describe, cleanNoise, classifyBlock, splitParagraphs };
})();
