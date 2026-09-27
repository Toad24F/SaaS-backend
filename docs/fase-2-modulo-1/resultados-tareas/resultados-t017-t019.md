# Resultado M1-T017–M1-T019 — reserva y competencia por correo

Fecha: 2026-09-25. Se creó una autoridad transaccional única para el correo normalizado. Puede reservarlo para una invitación o una cuenta, transferirlo al usuario activado y sustituir la reserva al corregir una invitación. El alta de recepción registra cuenta, reserva y auditoría en la misma transacción. Las pruebas de carreras verifican que solo un titular gana y que el intento rechazado no deja cuenta, invitación ni reserva parcial.

## Archivos y función

- [`reserva-correo.service.ts`](../../../src/altas/reserva-correo.service.ts): normaliza y valida correo, verifica titular y negocio, crea reservas, transfiere la titularidad y corrige el destinatario. Usa siempre el `EntityManager` recibido; las colisiones de unicidad se convierten en conflicto. Los comentarios explican orden de bloqueo, protección de cuentas históricas y dependencia de la transacción llamadora.
- [`usuarios.service.ts`](../../../src/usuarios/usuarios.service.ts): al crear recepción, reserva el correo después de insertar la cuenta y antes de auditar. Si la reserva falla, la transacción revierte también la cuenta.
- [`usuarios.module.ts`](../../../src/usuarios/usuarios.module.ts) y [`altas.module.ts`](../../../src/altas/altas.module.ts): registran y exportan el servicio de reserva para los casos de uso actuales y posteriores.
- [`reserva-correo-fase-2.integration-spec.ts`](../../../test/reserva-correo-fase-2.integration-spec.ts): prueba reserva, corrección, transferencia, aislamiento de negocio, rollback, recepción y aprovisionamiento transaccional del superadmin inicial; usa dos conexiones y una barrera para tres carreras de correo equivalente.
- [`usuarios.service.spec.ts`](../../../src/usuarios/usuarios.service.spec.ts): suministra la nueva dependencia en el fixture de inyección de Nest.
- [`limite-intentos.storage.spec.ts`](../../../src/auth/services/limite-intentos.storage.spec.ts) y [`limite-intentos.storage.ts`](../../../src/auth/services/limite-intentos.storage.ts): una regresión de T73 detectó deadlocks de MariaDB durante la suite e2e; la prueba se escribió antes del arreglo y el contador ahora reintenta la transacción de forma acotada, releyendo el estado confirmado.
- [`tareas-modulo-1.md`](../tareas-modulo-1.md): marca T017–T019 y enlaza esta evidencia.

## Tests primero y verificaciones

La prueba nueva de integración falló primero porque faltaba `ReservaCorreoService`. Después de implementarlo pasó **6/6**, incluidos rollback y carreras invitación/invitación, cuenta/cuenta e invitación/cuenta. La prueba de regresión del contador por IP falló primero ante un deadlock simulado y pasó tras añadir el reintento. La prueba HTTP T73 pasó aislada.

La suite unitaria completa pasó **191/191 en 38 suites**; integración pasó **78/78 en 19 suites** y la focalizada, **6/6** tras las últimas aserciones; HTTP/e2e pasó **93/93 en 9 suites**. `npm run build` y `npm run lint` pasaron. Antes del ajuste, dos ejecuciones e2e registraron 92/93 por el deadlock de T73; la ejecución completa posterior terminó con código 0. Las trazas `ERROR` de otros escenarios e2e proceden de fallos inyectados para comprobar rollback.

No existe una ruta de alta del superadmin inicial en este repositorio: la especificación de fase 1 parte de esa cuenta ya provisionada. `reservarUsuario` admite esa cuenta con `negocioId = null` y la prueba confirma cuenta y reserva en una transacción. La corrección de destinatario aún no se expone por HTTP; invalidar códigos y envíos anteriores corresponde a las tareas de códigos y corrección posteriores. Las altas históricas ya existentes requieren conversión solo si se desplegara sobre datos previos; este proyecto confirmó una base nueva.
