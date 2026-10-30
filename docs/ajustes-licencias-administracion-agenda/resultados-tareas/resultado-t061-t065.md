# Resultado — ALA-T061–ALA-T065

Revisión: cambios locales sin commit, 30 de octubre de 2026. Se escribió primero `test/ala-t061-t065.e2e-spec.ts`; su primera ejecución con MariaDB desechable falló con 404 en `POST /profesionales/:id/inhabilitar`. La primera ejecución sin acceso de red del sandbox no alcanzó MariaDB (`EACCES`); la ejecución autorizada sí creó y eliminó la base temporal. Las pruebas finales pasan. No se usó la base cotidiana.

## Flujo implementado

La guardia HTTP valida sesión y rol Administrador. El servicio relee al actor y deriva su negocio de la cuenta persistida. En una transacción `READ COMMITTED`, bloquea la fila de negocio y la fila del recurso propio. Si ya tiene `inhabilitado_en`, devuelve su estado sin escribir otra auditoría. Si no, guarda `activo=false` y la fecha del reloj del servidor; para cuentas revoca todas sus sesiones en el mismo commit. No borra la cuenta, el perfil, la reserva del correo, las selecciones, asignaciones, horarios ni el historial. El cupo deja de contar las cuentas inactivas. El listado y detalle habituales excluyen la marca; `GET /<recurso>/inhabilitados` y `GET /<recurso>/inhabilitados/:id` la muestran solo al Administrador del negocio propio. La ruta `DELETE` se retiró y devuelve 404. Reactivar o editar un recurso inhabilitado exige primero restaurarlo en una tarea posterior. La autenticación consulta la marca persistida tanto al iniciar sesión como al usar un JWT antiguo.

## Archivos modificados

- `src/profesionales/profesionales.service.ts` y `profesionales.controller.ts`: agregan la transición y las consultas de inhabilitados, con estado del Profesional en `usuarios`, revocación de sesiones y auditoría idempotente. Retiran la baja física HTTP y del servicio.
- `src/usuarios/usuarios.service.ts` y `recepcionistas.controller.ts`: agregan la misma transición para Recepción, separan listados y detalle, exponen solo campos sin hash, y rechazan reactivación o cambio de contraseña de una cuenta inhabilitada.
- `src/servicios/servicios.service.ts` y `servicios.controller.ts`: retiran la baja física, marcan el servicio inactivo e inhabilitado sin tocar costo, nombre ni selecciones; la auditoría registra el cambio real.
- `src/sucursales/sucursales.service.ts` y `sucursales.controller.ts`: retiran la baja física, marcan la sucursal sin propagar estado a cuentas o servicios y conservan asignaciones y horarios. La activación directa de una sede inhabilitada devuelve 409.
- `src/auth/auth.service.ts` y `auth/strategies/jwt.strategy.ts`: rechazan cuentas con marca de inhabilitación tanto en el primer login como en la revalidación de sesiones abiertas. También se relee el estado antes de crear la sesión.
- `test/ala-t061-t065.e2e-spec.ts`: prueba los cuatro contratos HTTP, dos negocios, permisos, repetición, auditoría única, relaciones, horario y reserva de correo conservados, cupos, revocación de todas las sesiones y login válido antes de la baja y rechazado después.
- `test/bajas-t111-t115.integration-spec.ts`: adapta la prueba antigua de eliminación física a la retirada recuperable con y sin relaciones; comprueba identidad, correo, selecciones y auditoría idempotente.
- `test/fase-3-t016-t019.integration-spec.ts` y `test/fix-modulo-1-t034.integration-spec.ts`: conservan las comprobaciones históricas de citas, apartados, pertenencia y oferta tras sustituir los intentos de eliminación por inhabilitación.
- `test/fix-modulo-1-t010-t018.e2e-spec.ts`: actualiza la expectativa de `DELETE /servicios/:id` a 404 porque la ruta dejó de existir.
- `tareas.md`: marca T061–T065 y enlaza esta evidencia.

Los bloques nuevos de código tienen comentarios sobre los bloqueos, la conservación de relaciones, la separación de consultas y la revocación.

## Pruebas y resultados

| Comando | Resultado |
| --- | --- |
| `npm run test:e2e -- --runInBand test/ala-t061-t065.e2e-spec.ts` | 1 suite, 1/1 caso aprobado; antes de implementar falló por 404 como se esperaba. |
| `npm run test:e2e -- --runInBand test/ala-t061-t065.e2e-spec.ts test/ala-t057.e2e-spec.ts test/sucursales-t065.e2e-spec.ts test/fix-modulo-1-t010-t018.e2e-spec.ts` | 4 suites, 10/10 casos aprobados. Las trazas de error son fallos controlados inyectados por una prueba antigua. |
| `npm run test:integration -- --runInBand test/ala-t051-t056.integration-spec.ts test/ala-t058-t060.integration-spec.ts` | 2 suites, 10/10 casos aprobados. |
| `npm run test:integration -- --runInBand test/bajas-t111-t115.integration-spec.ts test/fase-3-t016-t019.integration-spec.ts test/fix-modulo-1-t034.integration-spec.ts` | 3 suites, 7/7 casos aprobados tras adaptar las expectativas anteriores de borrado. |
| `npm test -- --runInBand src/auth src/servicios src/sucursales src/profesionales src/usuarios src/modulos.spec.ts` | 19 suites, 116/116 casos aprobados. |
| `npm run build` y `npm run lint` | Correctos. |
| `git diff --check` | Correcto. |

La primera pasada de unitarias detectó dobles antiguos sin la propiedad `inhabilitadoEn`; la comparación de autenticación trata el valor ausente como no marcado. La primera pasada de tres suites históricas falló por llamadas a `eliminar()`, ya retirado; las pruebas se actualizaron al contrato nuevo y pasaron. Ninguna prueba se saltó.

T061–T065 cumplen sus criterios. La restauración comienza en T066; este lote no la implementa ni declara la fase o producción habilitada. M3-I001/M2-I004 continúan diferidas al escritor manual real.
