# Resultados T77

Fecha: 2026-09-15

## Resultado

`POST /recepcionistas/:id/reactivar` permite al administrador reactivar únicamente un recepcionista de su negocio y responde 204 con cuerpo vacío. Reutiliza los Guards, el DTO de ID y el caso de uso transaccional T76: el servicio valida rol y pertenencia desde la base y no restaura sesiones revocadas, identidad ni licencia. El cuerpo vacío impide modificar otros campos.

## Archivos

- `src/usuarios/recepcionistas.controller.ts`: agrega la ruta de reactivación, entrega el instante del reloj común al servicio y comenta por qué solo admite cuerpo vacío y valida la pertenencia en la transacción.
- `test/recepcionistas-t48.e2e-spec.ts`: agrega el escenario HTTP de reactivación y extiende los escenarios existentes para exigir en ambas operaciones 404 ante recursos ajenos, 400 ante IDs o campos inválidos, 403 ante roles insuficientes y 401 ante sesión o licencia bloqueada. Incluye un comentario sobre la reutilización de Guards.
- `docs/results/resultados-t77.md`: describe el alcance y la evidencia de pruebas.
- `docs/tareas-auth.md` y `docs/plan.md`: actualizan el avance y enlazan este informe; conservan pendientes T78–T79 y T83–T85.

## Pruebas

1. El nuevo escenario desactiva y reactiva una cuenta propia por HTTP; verifica 204 sin contenido, estado activo, conservación de nombre, correo, hash, rol, negocio, activación y licencia, y que la sesión previa permanece revocada. Repetir la reactivación no duplica la auditoría ni modifica registros.
2. Los escenarios HTTP compartidos prueban que desactivar y reactivar ocultan recepcionistas de otro negocio, administradores e IDs inexistentes con 404, y rechazan IDs inválidos y cuerpos con campos ajenos con 400 sin mutaciones.
3. Los escenarios de autorización prueban 403 para superadmin y recepcionista y 401 para falta de token, sesión revocada o vencida y licencia suspendida, usando los Guards y la `ValidationPipe` de producción.

La primera ejecución focalizada fue roja: la petición de reactivación esperaba 204 y recibió 404 porque todavía no existía la ruta. Tras implementarla, el escenario focalizado pasó 1/1.

## Verificación final

- `npm run build`: correcto.
- `npm run lint`: correcto, sin diagnósticos.
- `npm test -- --runInBand`: 26 suites, 118 pruebas aprobadas.
- `npm run test:integration -- --runInBand`: 10 suites, 41 pruebas aprobadas.
- `npm run test:e2e -- --runInBand`: 7 suites, 80 pruebas aprobadas. Los errores controlados impresos por Nest en escenarios de rollback T48–T50 no hicieron fallar la suite.

T77 queda completada. Se detiene el trabajo aquí; T78–T79 y las tareas posteriores permanecen pendientes.
