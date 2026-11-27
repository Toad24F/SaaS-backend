# M5-T007 — Selección de biblioteca raster

Se selecciona **sharp 0.35.5** como referencia para el saneado en el backend. El paquete declara Node.js ≥20.9.0 y publica binarios por plataforma. El entorno local observado fue **Node.js 24.20.0, Windows x64, Node-API 10**. Antes de incorporar la dependencia, comprobar el binario en el entorno de despliegue y los casos de archivos del módulo. La selección se apoya en la documentación del paquete y conserva HTML, CSS, JavaScript, Bootstrap y Vite para la interfaz. [Manifiesto de la versión](https://github.com/lovell/sharp/blob/v0.35.5/package.json), [instalación y plataformas](https://sharp.pixelplumbing.com/install/).

## Flujo previsto

1. Limitar a **2 MiB** el archivo recibido y admitir únicamente **PNG, JPEG y WebP** estáticos por contenido real. Validar la cabecera y restringir los decodificadores a los formatos permitidos antes de abrir el archivo. Rechazar SVG, formatos fuera de lista y señal de animación, incluido APNG.
2. Limitar el decodificador a **2048 × 2048** píxeles y comprobar también cada dimensión. Usar los metadatos solo para validar formato, dimensiones y estructura. Exigir decodificación completa con rechazo de advertencias de truncamiento o corrupción antes de crear el recurso. [Constructor](https://sharp.pixelplumbing.com/api-constructor/), [metadatos de entrada](https://sharp.pixelplumbing.com/api-input/), [restricción de formatos](https://sharp.pixelplumbing.com/security/).
3. Recodificar los píxeles con un formato de salida permitido, omitir las opciones que copian metadatos y validar el tamaño final de **2 MiB**. Guardar únicamente el raster nuevo, sus dimensiones y su MIME. Un rechazo conserva el logo publicado. La publicación posterior revalida pertenencia y versión. [Opciones de salida](https://sharp.pixelplumbing.com/api-output/).

Se evaluó Jimp. WebP requiere configuración de un códec WASM adicional en Jimp. La selección de sharp ofrece los tres formatos previstos y límites de decodificación en una sola biblioteca de backend. [Guía WebP de Jimp](https://jimp-dev.github.io/jimp/guides/webp/).
