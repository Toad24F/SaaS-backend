# Resultado T32 — invitación de recepcionistas

Fecha: 2026-09-12.

## Trabajo realizado

- Se modificó `src/altas/altas.service.ts` para agregar `invitarRecepcionista`. El método reserva una cuenta pendiente con rol `recepcionista` y emite un código de activación de 48 horas dentro de la misma transacción.
- El negocio se obtiene exclusivamente de la cuenta administradora persistida. Un `negocioId` adicional enviado por el cliente se ignora y no puede cambiar el tenant de destino.
- Antes de crear la cuenta se consultan el rol, activación y estado actual del administrador, negocio y licencia. Se reutilizan la matriz de permisos de T30 y la política de licencia de T22; recepción y negocios suspendidos quedan rechazados.
- El correo se recorta y normaliza a minúsculas antes de reservarlo. La restricción global de MariaDB rechaza correos existentes y la transacción evita dejar cuenta, código o auditoría parcial.
- Se modificó la construcción de `AltasService` en `test/altas-negocio.integration-spec.ts` para aportar la política de acceso añadida como dependencia. Los cinco escenarios anteriores de T31 siguieron aprobando.
- Los bloques incorporados incluyen comentarios breves sobre la procedencia segura del tenant, la validación de acceso y el orden cuenta-código.

## Tests primero

Se agregó `test/invitaciones-recepcionistas.integration-spec.ts` antes de implementar el método. La ejecución inicial terminó en rojo con tres errores `invitarRecepcionista is not a function`.

Las pruebas nuevas verifican:

1. Reserva del correo normalizado y creación de una cuenta pendiente con rol recepcionista.
2. Código de activación de 48 horas vinculado al usuario, negocio, propósito y administrador emisor correctos.
3. Imposibilidad de inyectar otro `negocioId` desde la solicitud.
4. Rechazo de un correo ya reservado sin cuenta, código o auditoría parcial.
5. Rechazo de actores recepcionistas y de administradores cuya licencia está suspendida.

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
Test Suites: 7 passed, 7 total
Tests:       23 passed, 23 total

npm run test:e2e -- --runInBand --detectOpenHandles
Test Suites: 1 passed, 1 total
Tests:       1 passed, 1 total
```

T32 queda completada. No se inició T33 ni ninguna tarea posterior.
