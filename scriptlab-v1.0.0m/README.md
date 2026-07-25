# ScriptLab v1.0.0

Editor por bloques que analiza ritmo, retención y claridad de guiones de YouTube.

**100% local · Open-source · Sin servidores · IA en tu navegador**

---

## Qué hace

ScriptLab mide la arquitectura de tu guion con métricas reales, no opiniones:

- **Salud del guion** — Hook, claridad (Fernández-Huerta), ritmo narrativo, alineación con la promesa
- **Retención estimada (APV)** — Proyección basada en 8 factores con citas académicas
- **Curva de retención** — Por bloque, con detección de puntos de fuga
- **Arco emocional** — Modelo de sentimiento local (robertuito), engagement, momentum, saltos tonales
- **Carga cognitiva** — Miller 1956, Sweller 1988: ¿tu audiencia puede procesar lo que decís?
- **Análisis semántico** — Repetición, ideas centrales, ritmo de temas, cobertura (modo IA)

---

## Cómo funciona

1. Escribí o importá tu guion (Markdown, JSON, texto plano)
2. Las métricas aparecen en tiempo real
3. Activá el Modo IA (opcional, ~110 MB, descarga una vez)
4. Exportá en JSON, Markdown, HTML, texto plano o PDF

Sin cuentas. Sin servidores. Sin esperar.

---

## Arquitectura

```
scriptlab.html          ← App principal
index.html              ← Landing page
formula.html            ← Fórmulas, pesos y fuentes (auditable)
js/
  main.js               ← Bootstrap + eventos
  state.js              ← Estado global
  scoring.js            ← ICN (salud del guion)
  retention-engine.js   ← Motor de retención (8 factores, curvas)
  retention-worker.js   ← Web Worker de retención
  sentiment-worker.js   ← Web Worker de sentimiento (robertuito)
  ai-worker.js          ← Web Worker de embeddings (multilingual-e5)
  ai-shared.js          ← Primitivas puras (texto, FH, sílabas)
  render.js             ← Renderizado UI
  export-import.js      ← Exportación JSON/HTML/PDF/diagnóstico
  workers.js            ← Orquestación de workers
  db.js                 ← IndexedDB
  diagnostics.js        ← Detección de features del browser
  sw.js                 ← Service Worker (cache on-demand)
css/
  styles.css            ← Estilos
```

---

## Motor de retención

El APV se calcula como suma ponderada de 8 dimensiones:

| Peso | Dimensión | Fuente |
|------|-----------|--------|
| 0.25 | Hook | PrePublish 2026, Backlinko |
| 0.17 | Ritmo | Seidel 2024 Springer |
| 0.14 | Pattern Interrupts | Kahneman 1973, Sokolov 1963 |
| 0.11 | Arco Emocional | Song et al. 2023 eNeuro |
| 0.11 | Densidad | Miller 1956, Sweller 1988 |
| 0.09 | Promesa | PrePublish 2026 |
| 0.07 | Legibilidad | Fernández-Huerta 1959 |
| 0.03 | CTA | ClixieAI 2025, Wistia |
| 0.03 | Narrativa | Song 2023, Booker 2004 |

Ver [formula.html](formula.html) para el desglose completo con links a cada fuente.

---

## Modo IA

Descargá dos modelos (~110 MB) que se ejecutan localmente vía WebAssembly:

- **Xenova/multilingual-e5-small** — Embeddings multilingües para similitud semántica
- **Xenova/robertuito-sentiment-analysis** — Análisis de sentimiento en español

Todo se procesa en tu navegador. Ni una línea de texto se envía a un servidor.

---

## Privacidad

- Sin cuentas ni registros
- Sin tracking ni analytics
- Sin envío de datos a servidores
- Open-source, cada fórmula auditable
- Datos en IndexedDB (tu navegador)

---

## Competencia

| | ScriptLab | vidIQ | TubeBuddy | ChatGPT/Claude |
|---|---|---|---|---|
| Análisis por bloques | ✅ | ❌ | ❌ | ◐ |
| Retención estimada | ✅ 8 factores | ◐ | ◐ | ◐ |
| Arco emocional | ✅ Local | ❌ | ❌ | ◐ |
| Privacidad | ✅ 100% local | ❌ Cloud | ❌ Cloud | ❌ Cloud |
| Open-source | ✅ | ❌ | ❌ | ◐ |
| Precio | Gratis | USD 7.50+/mes | USD 4.99+/mes | USD 20+/mes |
| Español nativo | ✅ FH | ◐ | ◐ | ✅ |

---

## Desarrollo

```bash
# Servir localmente
npx serve scriptlab-rc-mimo/

# O con Python
cd scriptlab-rc-mimo && python3 -m http.server 8000
```

Sin build step. Sin dependencias. HTML + CSS + JS vanilla.

---

## Licencia

MIT License. Creado por [KRANK](https://www.youtube.com/@intermosh) de [Intermosh](https://www.youtube.com/@intermosh).
