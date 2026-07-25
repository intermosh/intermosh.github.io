# Política de seguridad

## Versiones soportadas

| Versión | Estado |
|---|---|
| 1.0.0a | ✅ Release actual (recibe fixes) |
| builds previas (`arena`, `mimo`) | ❌ Sin soporte (históricas, auditadas y descartadas) |

## Reportar una vulnerabilidad

- **No abras un issue público** con detalles del exploit.
- Usá **Security → Report a vulnerability** (Private Vulnerability Reporting de
  GitHub) en el repositorio, o contactá a los mantenedores por mensaje privado.
- Incluí: navegador y versión, modo (heurístico/IA), pasos de reproducción y,
  si aplica, el JSON de guion que lo dispara. La versión exacta está en los
  `<meta name="app-version">` y `<meta name="engine-version">` de cada HTML.
- Compromiso: acuse de recibo en ~72 h; divulgación coordinada una vez
  publicado el fix.

## Contexto de seguridad de la app

- ScriptLab corre **100 % en el navegador**: no hay backend propio ni
  telemetría. Los guiones viven en IndexedDB local y los exports se generan
  del lado del cliente.
- Superficie de riesgo principal:
  1. **Importación de JSON de terceros** (contenido potencialmente hostil) —
     el texto se sanitiza antes de renderizar (ver `js/ai-shared.js`).
  2. **Modelos descargados desde CDN de terceros** (Transformers.js +
     Hugging Face), solo al activar el Modo IA por primera vez.
  3. **Workers y módulos ES**: requieren servir por HTTP(S); `file://` no es
     un modo soportado.
- Si encontrás un problema en una dependencia de terceros (p. ej.
  Transformers.js), reportalo primero al proyecto correspondiente; igual
  avisanos para mitigar del lado nuestro si aplica.
