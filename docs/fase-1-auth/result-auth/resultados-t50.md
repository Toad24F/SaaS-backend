# Resultados T50 — suspensión, reactivación y renovación HTTP

Fecha: 2026-09-14.

## Trabajo por archivo

| Archivo | Cambio y finalidad |
|---|---|
| `test/licencias-t50.e2e-spec.ts` (nuevo) | 15 casos HTTP con Guards reales, JWT firmados, sesiones persistidas, reloj controlado y MariaDB migrada desechable. Comprueba transiciones, permisos, validación, conservación, auditoría, rollback y solicitudes simultáneas. |
| `test/cuentas-licencias-t38-t44.integration-spec.ts` (modificado) | Actualiza las expectativas de renovación pendiente y suspensión vencida a ConflictException, conforme al contrato 409 de T50; conserva BadRequestException para contraseña actual incorrecta. |
| `src/licencias/licencias.controller.ts` (nuevo) | Expone las tres transiciones exclusivamente al superadmin con sesión vigente. Toma el actor y el reloj del servidor y delega la operación transaccional al servicio. |
| `src/licencias/dto/licencia-id.dto.ts` (nuevo) | Valida ID entero positivo en rango INT UNSIGNED. El cuerpo usa el DTO vacío existente para rechazar cualquier propiedad extra. |
| `src/licencias/licencias-http.module.ts` (nuevo) | Compone Auth y Licencias, Guards y reloj para publicar las rutas sin introducir ciclos en el dominio. |
| `src/app.module.ts` (modificado) | Registra LicenciasHttpModule para habilitar las rutas. |
| `src/licencias/licencias.service.ts` (modificado) | Sustituye 400 por 409 en conflictos de estado y convierte la licencia inexistente en 404. Conserva autorización, bloqueos de fila, cálculo de fechas, idempotencia y auditoría transaccional existentes. |
| `tsconfig.build.tsbuildinfo` (generado) | Caché incremental actualizada por la compilación TypeScript. |
| `docs/tareas-auth.md` (cierre) | Marca T50 y enlaza esta evidencia después de verificar los resultados. |

Los archivos de producción incluyen comentarios sobre permisos, fuente de identidad y hora, tiempo conservado, renovación anual, validación, errores y composición sin ciclos. No se modifican entidades, migraciones ni SQL.

## Contrato HTTP

| Ruta | Resultado |
|---|---|
| `POST /licencias/:id/suspender` | 204 sin cuerpo; congela el tiempo disponible y bloquea acceso. Suspender una vencida produce 409. |
| `POST /licencias/:id/reactivar` | 204 sin cuerpo; devuelve el tiempo suspendido y conserva bloqueos de cuenta/activación. Repetir no prolonga la vigencia. |
| `POST /licencias/:id/renovar` | 204 sin cuerpo; añade un año calendario desde la base correspondiente y conserva la suspensión. Una pendiente produce 409. |

Todas exigen superadmin y cuerpo vacío. Sesión inválida: 401; rol insuficiente: 403; ID inválido o campos extra: 400; licencia inexistente: 404. El ID identifica la licencia y nunca modifica su negocio. No se agregan modalidades, períodos elegibles, cancelación definitiva ni suspensión independiente del negocio.

## Tests primero

Se escribieron primero las pruebas HTTP y se ejecutaron antes de modificar producción:

```text
npm run test:e2e -- --runInBand --testPathPatterns=licencias-t50
Test Suites: 1 failed, 1 total
Tests:       14 failed, 1 passed, 15 total
```

Los 14 fallos fueron respuestas 404 de las rutas aún inexistentes. La prueba que comprueba ausencia de cancelación, borrado y suspensión del negocio ya pasaba. Las fixtures, migraciones y sesiones reales funcionaron. También se actualizaron antes de implementar las expectativas de conflictos de estado de la integración T42–T44.

## Escenarios de aceptación

- Suspender bloquea inmediatamente a administrador y recepción del negocio; el otro negocio conserva acceso y datos.
- Renovar una licencia suspendida suma un año sin retirar la suspensión; reactivar devuelve el tiempo exacto transcurrido en pausa.
- Repetir suspensión/reactivación no cambia fechas ni duplica auditoría; dos renovaciones acumulan dos años.
- La reactivación conserva las cuentas desactivadas.
- En el vencimiento exacto, suspender responde 409. Reactivar sin suspensión no amplía la licencia; renovar una vencida usa la hora actual.
- Renovar una pendiente, incluso suspendida, responde 409. Suspender y reactivar no habilita la licencia ni altera cuenta o código inicial.
- Administrador y recepcionista reciben 403 para las tres operaciones tanto sobre su licencia como sobre la ajena.
- Sesión de superadmin ausente, revocada o vencida recibe 401 sin mutaciones.
- IDs inválidos o propiedades extra reciben 400; licencia inexistente recibe 404. No se admiten modalidad, período, años, actor, negocio ni fechas enviados en el cuerpo.
- No se exponen cancelación definitiva, borrado de licencia ni suspensión independiente del negocio.
- Fallos deliberados de auditoría en las tres transiciones producen 500 y rollback completo.
- Pares simultáneos de suspensión/reactivación tienen un único efecto; renovaciones simultáneas acumulan ambos años sin alterar pertenencia.

Las comparaciones de rechazo/rollback incluyen usuarios con hashes, negocios, sesiones, códigos, licencias y auditoría. Los bloques de fixtures, solicitudes, validación y concurrencia incluyen comentarios explicativos.

## Verificación final

```text
npm run build
Resultado: correcto (salida 0)

npm run lint
Resultado: correcto (salida 0)

npm test -- --runInBand
Test Suites: 25 passed, 25 total
Tests:       116 passed, 116 total
```

```text
npm run test:integration -- --runInBand --detectOpenHandles
Test Suites: 9 passed, 9 total
Tests:       35 passed, 35 total
```

```text
npm run test:e2e -- --runInBand --detectOpenHandles
Test Suites: 7 passed, 7 total
Tests:       85 passed, 85 total
Time:        907.451 s
```

**Total final: 41 suites y 236 pruebas distintas aprobadas**, incluidas las 15 nuevas de T50. La ejecución inicial en rojo no se suma nuevamente. No hubo pruebas omitidas ni fallos finales; integración y HTTP finalizaron sin reportar recursos abiertos.

Los errores `Fallo de prueba T50 suspender/reactivar/renovar`, `Fallo de prueba T49` y `Fallo de prueba T48` son inyecciones deliberadas de fallo de auditoría. Sus casos esperan 500 y comprueban rollback; no representan fallos de la suite. Node mostró el aviso existente de VM Modules experimental.

**T50 completada y marcada en la lista de tareas.** Se detiene el trabajo aquí. T51 y las tareas posteriores permanecen pendientes; no se implementó el módulo de reservas ni se amplió el alcance de T50.
