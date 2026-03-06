# Intermosh

Espacio personal de experimentación y portafolio de proyectos interactivos, prototipos y experimentos de programación creativa.

## Portfolio

Sitio principal: [intermosh.github.io](https://intermosh.github.io)

## Proyectos

Este repositorio contiene varias aplicaciones web interactivas y experimentos:

### Fuzzytronic Visual Terminal (`fuzzy_vt/`)
Terminal audiovisual para las performances en vivo de Fuzzytronic. Presenta múltiples modos de visualización en blanco y negro, incluyendo osciloscopio, matrix rain, patrones concéntricos, curvas de Lissajous, túnel effect, sistemas de partículas, generación de terreno, espirórafos y arte glitch. Construido con Canvas 2D y Web Audio API.

### GP Live Visualizer (`gp_live/`)
Terminal audiovisual para las performances en vivo de Gallagher Plus. Un visualizador de audio en tiempo real con arquitectura modular. Presenta procesamiento de audio en vivo, tuberías de renderizado personalizables y controles interactivos.

### Kinetosynth (`kinetosynth/`)
Un sintetizador modular de control gestual creado con MediaPipe. Controla los parámetros de síntesis de audio a través de objetos virtuales controlados por gestos de pinza, rotación y movimientos de las manos.

### AR Tracking System (`artrack/`)
Un sistema de seguimiento de marcadores de realidad aumentada con interfaz de terminal retro. Utiliza visión por computadora para detección y seguimiento de marcadores en tiempo real. Just for fun.

### Otros Experimentos
- **ReactLive** (`reactlive/`): Entorno de codificación en vivo

## Tecnologías Utilizadas

- **Frontend**: HTML5, CSS3, JavaScript (ES6+)
- **Gráficos**: Canvas 2D, WebGL
- **Audio**: Web Audio API
- **Visión por Computadora**: MediaPipe Hands
- **Estilos**: Tailwind CSS, CSS personalizado
- **Herramientas de Construcción**: Ninguna (desarrollo web vanilla)

## Comenzar
Para proyectos que requieran shadowArrayBuffer, asegúrate de estar sirviendo los headers necesarios en local.

1. Clona el repositorio:
   ```bash
   git clone https://github.com/intermosh/intermosh.github.io.git
   cd intermosh.github.io
   ```
2. Sirve el directorio raíz con un servidor local. Ejecuta: 
   ```bash
   python server.py
   ```

## Uso

Algunos proyectos pueden requerir:

- Acceso al micrófono para visualización de audio
- Acceso a la cámara para seguimiento de gestos
- Navegador moderno con soporte de Web Audio API

## Contribuir

Este es un portafolio personal, pero siéntete libre de:
- Reportar bugs o problemas
- Sugerir mejoras
- Hacer fork y crear tus propias variaciones

## Licencia

Este proyecto es código abierto y está disponible bajo la [Licencia MIT](LICENSE).

## Autor

**Ciro Mendoza** (KRANK)
- Sitio Web: [intermosh.github.io](https://intermosh.github.io)
- GitHub: [@intermosh](https://github.com/intermosh)

---

*Mess with the best. Die like the rest.*