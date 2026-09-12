# Resultados T38–T44 — cuentas, contraseñas y licencias

Fecha: 2026-09-12.

## Trabajo realizado

- **T38:** se amplió `UsuariosService` con desactivación transaccional de recepcionistas. El actor debe ser administrador y el destino se busca combinando ID, rol y `negocio_id`; una cuenta ajena se presenta como recurso no disponible. La fila se conserva con `activo=false`, por lo que la validación JWT existente la rechaza en la siguiente solicitud.
- **T39:** se agregó `CredencialesService.autorizarRecuperacion`. Consulta roles actuales, admite exclusivamente superadmin hacia una cuenta administradora, aun si está inactiva o su licencia está suspendida, reemplaza cualquier recuperación anterior y audita sin secretos ni cambios comerciales.
- **T40:** `recuperarContrasena` consume el código de recuperación, guarda el nuevo hash y revoca todas las sesiones en una sola transacción. No activa la cuenta, negocio o licencia ni retira suspensiones.
- **T41:** `cambiarContrasena` bloquea la cuenta, exige la contraseña actual, valida la nueva con la política común y revoca todas las sesiones, incluida la actual, junto con el cambio de hash.
- **T42:** se agregó `LicenciasService.suspender`. Bloquea la licencia, conserva su vencimiento, permite suspender pendientes sin crear tiempo, rechaza vencidas y trata repeticiones como no-op sin auditoría duplicada.
- **T43:** `reactivar` devuelve exactamente la duración de la pausa al vencimiento conservado. En licencias pendientes solo limpia la suspensión; nunca activa cuentas ni genera vigencia. Repetir no altera fechas ni auditoría.
- **T44:** `renovar` suma un año calendario desde el vencimiento vigente, desde el instante actual si ya venció o desde el vencimiento conservado durante suspensión. Mantiene la pausa y admite acumulación; rechaza licencias pendientes.
- Se agregó `CodigosService.emitirInvalidandoAnterior` para reemplazar recuperaciones dentro de la transacción llamadora y `SesionesService.revocarTodasConManager` para coordinar credenciales y sesiones.
- `AuthModule` y `LicenciasModule` registran y exportan los servicios nuevos. Todos los bloques nuevos contienen comentarios breves sobre pertenencia, bloqueos, atomicidad, conservación de fechas y auditoría de cambios reales.

## Tests primero

Se agregó `test/cuentas-licencias-t38-t44.integration-spec.ts` antes de los servicios. La fase roja terminó porque `CredencialesService` y `LicenciasService` aún no existían.

Las ocho pruebas sobre MariaDB verifican:

1. Desactivación propia, conservación de la cuenta y rechazo de tenant/rol ajenos.
2. Autorización y reemplazo de recuperación, consumo, nuevo hash y revocación global sin levantar bloqueos.
3. Rechazo de emisor no superadmin y destinatario recepcionista.
4. Contraseña actual obligatoria y revocación de todas las sesiones al cambiarla.
5. Suspensión idempotente, vencimiento conservado y un solo evento.
6. Reactivación con devolución exacta del tiempo e idempotencia.
7. Renovaciones vigentes y suspendidas, acumuladas desde la base correcta.
8. Casos pendiente/vencido y autorización exclusiva del superadmin.

## Suite final

```text
npm run build
Resultado: correcto

npm run lint
Resultado: correcto, 0 errores

npm test -- --runInBand
Test Suites: 25 passed, 25 total
Tests:       116 passed, 116 total

npm run test:integration -- --runInBand --detectOpenHandles
Test Suites: 9 passed, 9 total
Tests:       35 passed, 35 total

npm run test:e2e -- --runInBand --detectOpenHandles
Test Suites: 1 passed, 1 total
Tests:       1 passed, 1 total
```

T38–T44 quedan completadas. No se inició T45 ni ninguna tarea posterior.
