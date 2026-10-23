# M3-T126–T131 — Cierre operativo, métricas y verificación

Revisión base: `5665e82`; resultados tomados sobre el árbol de trabajo de estas tareas.

## Flujo implementado

`PORTAL_PUBLICO_ESCRITURAS=habilitadas` permite crear apartados, preparar intentos nuevos y registrar citas. `cerradas` bloquea esas escrituras con 503 seguro. En producción la ausencia de habilitación expresa también cierra las escrituras; en desarrollo y pruebas el valor omitido conserva el flujo existente. El cierre se comprueba antes de preparar el reemplazo de apartado, antes de concederlo y antes del primer INSERT de la cita. Así, un cierre entre las dos transacciones puede dejar durable la liberación ya preparada, pero no concede un apartado nuevo; un cierre durante la revalidación revierte el registro sin consumir el apartado.

Consultar y liberar un apartado propio, resolver una respuesta incierta y repetir una reserva ya registrada siguen disponibles con las escrituras cerradas. La resolución usa las mismas filas de exclusión y puede cerrar `no_registrado` de forma durable; el interruptor no borra citas ni intentos. El controlador cuenta conflictos 409, fallos 500/503, apartados observados como vencidos y recuperaciones registradas. Cada línea de métrica contiene solo categoría y contador por proceso; no incluye etiquetas de negocio, contacto, cookie, CSRF, claves ni excepción interna. Los contadores vuelven a cero al reiniciar el proceso y no son una fuente persistente de auditoría.

## Archivos y función

- `src/reservas-publicas/control-escrituras-publicas.ts`: define la política del interruptor de nuevas escrituras y el estado cerrado por defecto en producción.
- `src/reservas-publicas/apartados.service.ts`: comprueba el interruptor antes de preparar y conceder un apartado; mantiene separadas las dos transacciones.
- `src/reservas-publicas/intentos-reserva-publica.service.ts`: impide crear intentos nuevos con el portal cerrado y conserva la lectura de intentos existentes.
- `src/reservas-publicas/registro-reserva-publica.service.ts`: permite reproducir un resultado ya registrado y bloquea el primer registro antes y después de la revalidación si se cerraron escrituras.
- `src/reservas-publicas/metricas-portal.service.ts`: suma cuatro categorías agregadas por proceso y emite registros sin valores de solicitudes.
- `src/reservas-publicas/portal-publico.controller.ts`: clasifica errores seguros y registra expiraciones y recuperaciones observables sin añadir datos privados a los logs.
- `src/reservas-publicas/reservas-publicas.module.ts`: registra y exporta el servicio de métricas para la frontera HTTP.
- `src/reservas-publicas/control-escrituras-publicas.spec.ts` y `metricas-portal.service.spec.ts`: prueban la política de producción y el contenido permitido de los registros capturados.
- `test/fase-4-t080-t085.e2e-spec.ts`: ejercita cierre y reapertura, 503 para nuevas escrituras, liberación, resolución, repetición de cita previa y contadores de fallo, expiración y recuperación sobre HTTP real y base desechable.
- `test/fase-4-t045-t051.integration-spec.ts`, `fase-4-t052-t057.integration-spec.ts`, `fase-4-t086-t091.integration-spec.ts` y `fase-4-t092-t096.integration-spec.ts`: fijan `creado_en` junto con `activado_en` en los usuarios de escenarios con reloj controlado. Al avanzar la fecha del host, la activación ya no precede accidentalmente a la creación.
- `docs/fase-4-modulo-3/tareas.md`: señala las tareas acreditadas y enlaza esta evidencia.

## Pruebas y resultados

- `npm run build`: pasó en la revisión final del backend.
- `npm run lint`: pasó en la revisión final del backend.
- `npm test -- --runInBand`: 75 suites y 373 pruebas pasaron. La suite completa incluye la regresión unitaria privada; las dos pruebas nuevas cubren el interruptor y los registros de métricas.
- `npm run test:integration -- --runInBand`: primera corrida, 70 suites pasaron y cuatro fallaron por fixtures con activación fija anterior a la creación implícita. Las cuatro suites corregidas pasaron por separado: 27/27 pruebas. **Repetición final completa: 74 suites y 322 pruebas pasaron**, sin casos saltados por conexión.
- `npm run test:e2e -- --runInBand`: 29 suites y 164 pruebas pasaron. Incluye las nueve rutas públicas y la regresión de las cinco rutas privadas; los errores controlados que imprimen otras suites son inyecciones esperadas por sus casos.
- `npm run test:e2e -- --runInBand fase-4-t080-t085`: 15/15 pruebas pasaron tras el último control de cierre en el escritor.

## Alcance

La verificación corresponde al backend y a bases MariaDB de prueba desechables. No acredita el frontend ni el navegador de T132–T133, la integración manual diferida M2-I004/M3-I001 ni habilitación de producción.
