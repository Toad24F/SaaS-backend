# M3-T125 — Límites HTTP y respuestas seguras

## Flujo verificado

El navegador consulta catálogo y disponibilidad por slug. Al iniciar sesión recibe una cookie anónima y un token CSRF. Con ellos puede crear y consultar un apartado, preparar un intento, registrar la cita pendiente, resolver un envío incierto o liberar el apartado propio. Cada entrada valida sus campos permitidos; el negocio y la identidad proceden del servidor. Los errores se traducen a `codigo`, `mensaje` y `accion`, sin copiar la causa interna.

Antes de llegar al controlador, el parser público limita el JSON crudo a 32 KiB. Si lo supera, responde 400 con el mismo contrato seguro. Esa respuesta ahora incluye `Cache-Control: no-store` y `Vary: Cookie, Origin`, pues puede corresponder a un formulario personal. Los controladores ya aplicaban `no-store` a sus respuestas personales. Ninguno de los bloques añadidos registra el cuerpo, la cookie, el token o errores internos.

## Archivos

- `test/fase-4-t080-t085.e2e-spec.ts`: añade el caso T125 sobre las rutas HTTP reales con base desechable. Comprueba campos extra en catálogo, disponibilidad, sesión, apartado, preparación, reserva, resolución y liberación; consulta de apartado propio; rechazo del cuerpo excesivo; contrato 400 sin eco de secretos y `no-store`. El fixture instala el middleware de `main.ts` para reproducir el flujo de producción.
- `src/reservas-publicas/limite-cuerpo-publico.ts`: añade cabeceras de no caché al rechazo temprano por exceso de JSON.
- `src/reservas-publicas/limite-cuerpo-publico.spec.ts`: comprueba esa cabecera en la respuesta 400 del parser.
- `docs/fase-4-modulo-3/tareas.md`: marca T125 y enlaza esta evidencia.

## Pruebas y resultados

- `npm run test:e2e -- --runInBand fase-4-t080-t085`: **13/13 pasaron**. Incluye la prueba nueva y la regresión de reserva y recuperación. La primera ejecución en sandbox no pudo conectar con MariaDB (`EACCES`); con acceso a la base local de pruebas desechable pasó.
- `npm test -- --runInBand src/reservas-publicas/limite-cuerpo-publico.spec.ts src/reservas-publicas/errores-publicos.spec.ts src/reservas-publicas/entradas-publicas.spec.ts src/reservas-publicas/contacto-reserva-publica.spec.ts`: **21/21 pasaron**. Cubren límite de bytes, traducción de 400/401/403/404/409/500/503, validación de consultas y contacto. El primer intento en sandbox bloqueó los puertos locales de Supertest; se repitió con acceso local.
- `npm test -- --runInBand src/reservas-publicas/limite-cuerpo-publico.spec.ts`: **3/3 pasaron** tras añadir la última aserción de `no-store`.
- `npm run build`: **pasó**.
- `npm run lint`: **pasó**.

La prueba HTTP revisa las respuestas observables. La ausencia de registro de secretos se comprobó además por revisión de los bloques escritos: no contienen llamadas de logging ni incluyen entradas o causas internas en el cuerpo de error. T125 no declara cierre de fase ni producción habilitada.
