# Resultado M1-T028 — adaptador SMTP

Fecha: 2026-09-28. Se implementó el contrato `TransporteCorreo` mediante SMTP con Nodemailer. Remitente, servidor y credenciales proceden del entorno. Faltar un dato obligatorio o configurar un valor inválido produce un error claro antes de crear el transporte. No se registran credenciales ni contenido de mensajes en logs, auditoría o base de datos.

## Flujo de entrega

1. Nest registra el adaptador por una fábrica sin abrir conexiones ni enviar al arrancar. No exige credenciales hasta que se solicite una entrega.
2. `enviar` valida remitente, servidor, credenciales, puerto, modo TLS y timeout. El destinatario debe ser una dirección individual y el asunto no admite saltos de línea.
3. Crea el transporte SMTP: `SMTP_SECURE=true` utiliza TLS implícito; `false` exige STARTTLS. Se mantiene la verificación de certificados. Los logs del protocolo están deshabilitados y la composición del correo no permite leer archivos ni URL.
4. Pasa remitente, destinatario, asunto y texto al driver. Solo devuelve el identificador si el servidor confirma la aceptación del destinatario. La aceptación SMTP no garantiza que el mensaje llegue a la bandeja del usuario.
5. Ante fallo, devuelve un mensaje genérico sin detalles del proveedor; un timeout conserva `name=TimeoutError`. No reintenta ni modifica la bandeja: T029–T033 coordinarán persistencia, ejecución y reintentos.

Referencia del API utilizado: [transporte SMTP de Nodemailer](https://nodemailer.com/smtp).

## Configuración

| Variable | Uso |
| --- | --- |
| `CORREO_REMITENTE` | Dirección individual del emisor; obligatoria. |
| `SMTP_HOST` | Servidor SMTP; obligatorio. |
| `SMTP_USER`, `SMTP_PASS` | Credenciales obligatorias, suministradas fuera del repositorio. La contraseña no se recorta ni se imprime. |
| `SMTP_PORT` | Entero 1–65535; predeterminado 587. |
| `SMTP_SECURE` | `true` o `false`; predeterminado `false`. Habitualmente 465 para TLS implícito o 587 para STARTTLS. |
| `SMTP_TIMEOUT_MS` | Entero 1–120000; predeterminado 10000. Aplica a conexión, saludo y socket. |

`.env.example` deja las credenciales vacías y usa direcciones de ejemplo. La aplicación necesita valores operativos al entregar; ninguna prueba utiliza destinatarios reales.

## Archivos y función

- [`transporte-correo-smtp.ts`](../../../src/correos/transporte-correo-smtp.ts): implementa validación, configuración SMTP, entrega y sanitización de errores. Los comentarios explican el arranque sin red, TLS y por qué se descartan detalles del proveedor.
- [`transporte-correo-smtp.spec.ts`](../../../src/correos/transporte-correo-smtp.spec.ts): inyecta un driver controlado que captura llamadas solo en memoria; prueba aceptación, configuración faltante e inválida, rechazo y timeout sin exponer contenido o credenciales.
- [`correos.module.ts`](../../../src/correos/correos.module.ts): registra y exporta el adaptador mediante fábrica, sin iniciar trabajo periódico ni entregas.
- [`modulos-fase-2.spec.ts`](../../../src/modulos-fase-2.spec.ts): conserva el requisito de T008 de inicializar los módulos sin enviar correo, ahora con el proveedor SMTP registrado.
- [`.env.example`](../../../.env.example): documenta variables SMTP y diferencias entre TLS implícito y STARTTLS, sin credenciales operativas.
- [`package.json`](../../../package.json) y [`package-lock.json`](../../../package-lock.json): incorporan Nodemailer y sus tipos TypeScript, con versiones reproducibles en el lockfile.
- [`tareas-modulo-1.md`](../tareas-modulo-1.md): marca T028 como hecha y enlaza este resultado.

## Tests primero y verificaciones

La primera ejecución falló porque faltaba el adaptador. Tras implementarlo, las **11/11** pruebas nuevas pasaron. La primera suite completa detectó que T008 aún exigía un módulo sin proveedores; se reemplazó esa expectativa por la comprobación funcional de que inicializar Nest no llama a `enviar`. La ejecución posterior pasó **212/212 en 43 suites**. Integración pasó **85/85 en 21 suites** y HTTP/e2e **93/93 en 9 suites**. Compilación y lint pasaron. Los mensajes `ERROR` de e2e pertenecen a fallos inyectados para comprobar rollback; Jest terminó con código 0.

El driver controlado no abre sockets ni escribe mensajes en disco. Esta evidencia valida configuración y contrato del adaptador; no acredita la disponibilidad de un proveedor SMTP de producción ni la recepción final de un correo. El transporte real queda listo para ser invocado por las próximas tareas de la bandeja.
