# Fuentes y Citas Bibliográficas — ScriptLab v1.0.1

ScriptLab se basa en una combinación de investigación académica (neurociencia, psicología cognitiva) y análisis cuantitativo de la industria (Data Science en plataformas de video). Este documento detalla las fuentes y la justificación de cada peso (`WEIGHTS`) utilizado en el motor predictivo de retención (APV) y el Índice de Calidad Narrativa (ICN).

> **Regla Epistémica de ScriptLab:** Ningún número o porcentaje en el motor matemático es arbitrario. Si una métrica no puede ser respaldada por datos empíricos de la industria o por literatura científica primaria, su peso en la fórmula final es severamente penalizado o descartado.

---

## 1. Fuerza del Gancho (Hook Strength)
**Peso en el APV: 25% (0.25)**

El factor más determinante de la retención. La ventana de decisión del espectador define la caída inicial de la curva.

*   **PrePublish (2026) Data Study:** Análisis de 5,000 guiones demostró que entregar una proposición de valor (*value claim*) en los primeros 15 segundos eleva la retención base de 44% a 52%. [Fuente Secundaria Convergente].
*   **Backlinko (2017) YouTube Ranking Factors:** Estudio sobre 1.3 millones de videos que confirma la fuerte correlación entre la retención en los primeros 30-45 segundos y el posicionamiento global en el algoritmo. [Link al estudio](https://backlinko.com/youtube-ranking-factors).

## 2. Ritmo de Duración (Pacing Score)
**Peso en el APV: 17% (0.17)**

Evalúa la fragmentación temporal del guion para evitar la fatiga.

*   **Guo, P. J., Kim, J., & Rubin, R. (2014):** *"How video production affects student engagement: An empirical study of MOOC videos."* L@S '14. Estudio masivo sobre 6.9 millones de sesiones de visualización que demuestra que videos o bloques de 0-3 minutos maximizan el *engagement*, sufriendo caídas drásticas pasados los 9 minutos. [DOI: 10.1145/2556325.2566239](https://dl.acm.org/doi/10.1145/2556325.2566239).
*   **Seidel, N., et al. (2024):** *"Short, Long, and Segmented Learning Videos"*. Springer. Confirma las métricas de fragmentación para el mantenimiento sostenido de la atención.

## 3. Interrupciones de Patrón (Pattern Interrupts)
**Peso en el APV: 14% (0.14)**

Mide la reinicialización de la atención mediante elementos visuales o giros inesperados.

*   **Kahneman, D. (1973):** *"Attention and Effort"*. Prentice-Hall. Define la respuesta de orientación (*orienting response*) ante estímulos novedosos. [Fuente Primaria].
*   **Sokolov, E. N. (1963):** *"Higher nervous activity and the problem of perception"*. Define las leyes de habituación. [Fuente Primaria].
*   **Rankin, C. H., et al. (2009):** *"Habituation revisited: An updated and revised description of the behavioral characteristics of habituation."* Neurobiology of Learning and Memory, 92(2). Describe cómo el exceso de interrupciones genera decaimiento logarítmico (usado en nuestra curva matemática). [DOI: 10.1016/j.nlm.2008.09.012](https://doi.org/10.1016/j.nlm.2008.09.012).

## 4. Arco Emocional (Emotional Arc)
**Peso en el APV: 11% (0.11)** *(Solo activo en Modo IA)*

Analiza las fluctuaciones en la valencia emocional de las oraciones. Los guiones monótonos retienen menos que aquellos con saltos tonales (*flips*).

*   **Song, H., et al. (2023):** *"Naturalistic Viewing of Dramatic Film Narratives Engages Neural Networks Associated with Theory of Mind..."* eNeuro. Validado con fMRI, confirma que el *engagement* sigue el arco dramático, donde los cambios de valencia mantienen a la audiencia conectada. [DOI: 10.1523/ENEURO.0484-22.2023](https://doi.org/10.1523/ENEURO.0484-22.2023).
*   **Berger et al. (2026):** *"How should content creators narrate their content?"* JAMS/Springer. Estudio empírico sobre 33,598 podcasts de YouTube y 3,381 TED Talks, que establece un vínculo causal entre la variabilidad emocional (arousal) y el nivel de atención sostenida. [DOI: 10.1007/s11747-026-01147-3](https://link.springer.com/article/10.1007/s11747-026-01147-3).

## 5. Densidad de Contenido (Content Density)
**Peso en el APV: 11% (0.11)**

Calcula los "temas por minuto" para evitar la sobrecarga o el aburrimiento.

*   **Miller, G. A. (1956):** *"The Magical Number Seven, Plus or Minus Two: Some Limits on Our Capacity for Processing Information."* Psychological Review. [Fuente Primaria].
*   **Sweller, J. (1988):** *"Cognitive load during problem solving: Effects on learning."* Cognitive Science. Define cómo presentar demasiados conceptos abstractos en corto tiempo bloquea la retención y provoca el abandono (*Drop Risk*).

## 6. Resolución de la Promesa (Promise Delivery)
**Peso en el APV: 9% (0.09)**

Mide en qué porcentaje del video se responde la incógnita planteada en el *Hook*.

*   **PrePublish Test Data (2026):** Pruebas de métrica correlacional demostraron que los videos que retrasan su "payoff" (resolución) más allá del 60% del video sin micro-promesas intermedias sufren tasas de rebote en forma de "tobogán". [Datos de Industria / Fuente Cuantitativa].

## 7. Legibilidad y Claridad (Readability)
**Peso en el APV: 7% (0.07)**

La fricción lingüística en guiones hablados impacta negativamente en la retención.

*   **Fernández-Huerta, J. (1959):** *"Medidas sencillas de lecturabilidad."* Consigna, 214, 29-32. Adaptación matemática exacta al español de la fórmula "Flesch Reading Ease" de 1948. Recompensa el uso de oraciones cortas y de baja densidad silábica, típico de la comunicación oral en YouTube.

## 8. Completitud Narrativa y Ubicación del CTA
**Peso en el APV: 3% y 3% (0.06 combinado)**

*   **Booker, C. (2004):** *"The Seven Basic Plots: Why We Tell Stories"*. Fundamentación de los requisitos mínimos estructurales presentes en nuestra validación de `Narrative Completeness` (Hook -> Contexto -> Evidencia -> Cierre).
*   **Estudio CTA de Wistia:** Datos reales de la industria del video marketing que confirman que un CTA en formato *mid-roll* alcanza conversiones cercanas al 16.95%, un *post-roll* clásico cae al 10.98%, y *pre-roll* 3.15%. Se utiliza para castigar los llamados a la acción ubicados incorrectamente en el guion. [Wistia Blog](https://wistia.com/learn/marketing/turn-video-viewers-into-leads).
