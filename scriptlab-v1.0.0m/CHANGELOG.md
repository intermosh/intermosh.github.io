# Changelog

All notable changes to ScriptLab will be documented in this file.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning follows [Semantic Versioning](https://semver.org/).

## [1.0.0] - 2026-07-22

### Added
- **Onboarding**: example script loads on first visit with annotated blocks explaining each type
- **Undo/Redo**: Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z with 30-snapshot stack
- **Autosave indicator**: "Guardando…" → "✓ Guardado" visual feedback
- **Import validation**: schema check on JSON import (block types, content length, WPM range)
- **Error boundaries**: try/catch on render(), renderMetrics(), renderSentimentArc()
- **LICENSE**: MIT License
- **docs.html**: comprehensive technical documentation (9 tabs)
- **formula.html**: auditable weight/source/formula breakdown
- **Competitor comparison**: ScriptLab vs vidIQ vs TubeBuddy vs ChatGPT/Claude
- **Sentiment chunking**: blocks >90 words split into model-safe fragments
- **Truncation defense**: classifier() called with {truncation:true, max_length:128}
- **Failed blocks warning**: discrete UI indicator when sentiment analysis fails on blocks
- **Formula closure**: APV formula shows sum of rounded terms (user can audit by hand)
- **Clickable issues**: diagnostic problems scroll + highlight the relevant block
- **Emotional arc legend dots**: colored dots next to Positivo/Neutral/Negativo

### Changed
- File structure: JS files moved to js/, CSS to css/
- Service worker path updated after reorganization
- Header height reduced from 52px to 42px
- Export menu reorganized with GUION/DIAGNÓSTICO section headers
- HTML export: self-contained onepage with dark-theme styling
- Weight annotations: verified sources marked ✅, unverifiable marked 🔴
- Thresholds annotated as [HEURÍSTICA INTERNA] where no academic backing exists

### Fixed
- Sentiment worker crashing on blocks >130 tokens (chunking added)
- APV formula display not matching sum of shown terms (tautological assert replaced)
- `processing` field missing from early-return SENTIMENT_RESULT messages
- `lg-dot` CSS class missing (sentiment legend dots not visible)
- Service worker registration path after /js reorganization

### Retained from Mimo base
- Smooth interpolation curves (pattern interrupts, content density)
- Inverted cognitive load scale (100 = overload)
- Syllable counting with hiato/diptongo/triptongo rules
- Unicode whitelist sanitization for robertuito
- Modular semantic card rendering
- UUID fallback for older browsers

## [0.9.0] - 2026-07-20 (RC)

### Added
- Initial release candidate
- Heuristic analysis engine (8-dimension retention model)
- IA mode with robertuito sentiment + multilingual-e5 embeddings
- Block-based editor with drag-and-drop
- Retention curve visualization
- Cognitive load analysis
- Calibration system with YouTube Studio data
- Service worker for offline support
- Teleprompter with TTS
- Export: JSON, Markdown, HTML, TXT, PDF
