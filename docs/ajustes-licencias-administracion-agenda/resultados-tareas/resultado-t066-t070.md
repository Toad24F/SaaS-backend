# Resultado — ALA-T066–ALA-T070

Revisión: cambios locales sin commit, 30 de octubre de 2026. Se escribió primero `test/ala-t066-t070.e2e-spec.ts`. La primera ejecución contra una base MariaDB migrada y desechable falló con 404 en `POST /sucursales/:id/restaurar`; después de implementar las cuatro rutas pasó. No se usó la base cotidiana.

## Flujo

El Administrador envía `POST /<recurso>/:id/restaurar` con cuerpo vacío. La guardia HTTP valida sesión y rol; el servicio relee al actor y obtiene su negocio de la cuenta persistida. La transacción `READ COMMITTED` bloquea primero el negocio y luego la fila propia. Si `inhabilitado_en` ya es nulo, devuelve el estado actual sin escritura ni auditoría: así un reintento posterior a una reactivación no apaga el recurso. Si existe marca, la limpia, deja `activo=false` y registra una sola transición en el mismo commit. La cuenta conserva credenciales y sesiones ya revocadas; servicio y sucursal conservan selecciones, asignaciones y horarios. Restaurar devuelve el recurso al listado habitual, pero la oferta o el acceso se habilitan mediante `reactivar`, que conserva sus validaciones de cupo y condiciones vigentes. La respuesta es 200 con estado verificable; los campos desconocidos se rechazan y el hash nunca se presenta.

Las consultas habituales y las de inhabilitados ya estaban separadas en T061–T065. Este lote comprueba sus rutas y permisos antes y después de restaurar: el detalle específico desaparece al limpiar la marca, y los listados habituales vuelven a incluir el recurso inactivo. Un negocio ajeno recibe 404 y otro rol recibe 403.

## Archivos

- `src/profesionales/profesionales.service.ts` y `profesionales.controller.ts`: restauran la cuenta del Profesional y devuelven la proyección administrativa, sin activar acceso ni consumir cupo. La auditoría se escribe solo al limpiar la marca.
- `src/usuarios/usuarios.service.ts` y `recepcionistas.controller.ts`: restauran la cuenta de Recepción bajo el bloqueo del negocio y la cuenta; la respuesta lista campos permitidos y excluye el hash.
- `src/servicios/servicios.service.ts` y `servicios.controller.ts`: restauran el servicio como inactivo sin cambiar su nombre, costo ni selecciones.
- `src/sucursales/sucursales.service.ts` y `sucursales.controller.ts`: restauran la sede como inactiva sin modificar los estados de Profesional o servicio, asignaciones ni horarios; la activación sigue validando cupo y horarios.
- `test/ala-t066-t070.e2e-spec.ts`: prueba los cuatro flujos HTTP con dos negocios, un rol ajeno, cuerpo estricto, listados y detalles, restauración inactiva, repetición antes y después de reactivar, auditoría única, ausencia de hash, relaciones conservadas y conflicto de cupo de sucursal.
- `tareas.md`: marca T066–T070 y enlaza esta evidencia.

Los métodos y rutas nuevos incluyen comentarios que explican el bloqueo, el retorno idempotente y la separación entre restaurar y reactivar.

## Pruebas y resultados

| Comando | Resultado |
| --- | --- |
| `npm run test:e2e -- --runInBand test/ala-t066-t070.e2e-spec.ts` | 1 suite, 1/1 caso aprobado; antes de implementar falló con 404 como se esperaba. |
| `npm run test:e2e -- --runInBand test/ala-t066-t070.e2e-spec.ts test/ala-t061-t065.e2e-spec.ts test/sucursales-t065.e2e-spec.ts test/fix-modulo-1-t010-t018.e2e-spec.ts` | 4 suites, 10/10 casos aprobados. Las trazas de errores controlados son inyecciones deliberadas en el test histórico del fix. |
| `npm run test:integration -- --runInBand test/bajas-t111-t115.integration-spec.ts test/fase-3-t016-t019.integration-spec.ts test/fix-modulo-1-t034.integration-spec.ts test/ala-t051-t056.integration-spec.ts test/ala-t058-t060.integration-spec.ts` | 5 suites, 17/17 casos aprobados. |
| `npm test -- --runInBand src/auth src/servicios src/sucursales src/profesionales src/usuarios src/modulos.spec.ts` | 19 suites, 116/116 casos aprobados. |
| `npm run build`, `npm run lint` y `git diff --check` | Correctos. |

T066–T070 cumplen sus criterios. T071 y posteriores siguen pendientes; este resultado no cierra la fase ni habilita producción. M3-I001/M2-I004 continúan diferidas al escritor manual real.
