# Resultado T31 — alta inicial de negocio

Fecha: 2026-09-12.

## Trabajo realizado

- Se agregó `src/altas/altas.service.ts`. Este servicio coordina en una única transacción la creación del negocio pendiente, su licencia anual todavía no habilitada, la cuenta pendiente del primer administrador, el código de activación de 48 horas y la auditoría del alta.
- El contrato del servicio recibe únicamente actor, nombre, identificador público, correo del administrador e instante de la operación. No recibe modalidad, período ni fechas de licencia configurables.
- El rol del actor se consulta nuevamente en MariaDB y después se aplica la política de T30. De este modo, un ID o rol declarado por el cliente no concede autorización.
- El nombre, identificador y correo se recortan; identificador y correo se normalizan a minúsculas. El correo inicial también queda como contacto del negocio.
- Los conflictos de identificador o correo se convierten en una respuesta de conflicto uniforme. Como todas las escrituras comparten la transacción, no quedan negocios, licencias, cuentas, códigos ni auditorías parciales.
- Se modificó `src/altas/altas.module.ts` para registrar y exportar `AltasService` junto con su política de autorización.
- Se modificó `src/modulos.spec.ts` para comprobar que el nuevo servicio forma parte de la composición real de módulos.
- El nuevo servicio incluye comentarios sobre el límite transaccional, la obtención segura del rol, el uso del correo de contacto y la exclusión de códigos y hashes de la auditoría.

## Tests primero

Se agregó `test/altas-negocio.integration-spec.ts` antes de implementar el servicio. La primera ejecución quedó en rojo porque `AltasService` todavía no existía.

Las cinco pruebas de integración verifican:

1. Alta válida con negocio, administrador y licencia pendientes, código de activación con 48 horas y auditoría sin secretos.
2. Rechazo de un identificador público duplicado sin filas parciales.
3. Rechazo de un correo duplicado sin filas parciales.
4. Rollback completo cuando falla la auditoría.
5. Consulta del rol actual y rechazo de un administrador de negocio sin mutaciones.

## Suite final

```text
npm run build
Resultado: correcto

npm run lint
Resultado: correcto, 0 errores

npm test -- --runInBand
Test Suites: 24 passed, 24 total
Tests:       111 passed, 111 total

npm run test:integration -- --runInBand --detectOpenHandles
Test Suites: 6 passed, 6 total
Tests:       20 passed, 20 total

npm run test:e2e -- --runInBand --detectOpenHandles
Test Suites: 1 passed, 1 total
Tests:       1 passed, 1 total
```

T31 queda completada. No se inició T32 ni ninguna tarea posterior.
