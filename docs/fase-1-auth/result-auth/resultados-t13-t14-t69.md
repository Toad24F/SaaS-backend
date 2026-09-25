# Evidencia de T13, T14 y T69

## Cambios realizados

### T13 — Eventos de auditoría

- Se agregó `src/auditoria/entities/evento-auditoria.entity.ts`. La entidad conserva un identificador único de operación, actor, negocio/cuenta/licencia de destino, acción, fecha y valores anteriores/nuevos en JSON.
- El modelo no contiene modalidad, contraseñas, códigos, hashes ni tokens. Un comentario aclara que los servicios posteriores deben filtrar esos secretos antes de construir el evento.
- Se modificó `AuditoriaModule` para registrar y exportar su repositorio sin depender de Auth, Altas u otros módulos de dominio.

### T14 — Contador compartido de intentos

- Se agregó `src/auth/entities/limite-intentos.entity.ts`. Usa la IP canónica como clave primaria de hasta 45 caracteres y guarda inicio de ventana, contador y bloqueo hasta.
- No existen columnas de ruta, endpoint o propósito; por ello una sola fila puede coordinar conjuntamente login y validación de cualquier código.
- Se modificó `AuthModule` para registrar el repositorio junto con las sesiones. La lógica de incremento, bloqueo transaccional y conexión con las rutas corresponde a T27 y T73.

### T69 — Fixtures del modelo actual

- Se modificó `test/support/datos-negocios.ts`. Cada tenant generado incluye negocio, licencia anual, administrador y recepcionista activados, además de un recepcionista pendiente sin nombre, hash ni fecha de activación.
- Se agregó `crearEscenariosLicencia`, que produce fixtures independientes para licencias pendientes, vigentes, vencidas y suspendidas usando el reloj controlado.
- Se mantuvo `crearDosNegocios` como contrato de T06, ahora adaptado al modelo actual y sin referencias a `EstadoNegocio`.
- Se modificó la prueba de composición para proporcionar dobles de los repositorios nuevos de auditoría y límites.

Los archivos agregados y modificados contienen comentarios breves que explican la separación de responsabilidades, el filtrado de secretos, el uso de una fila por IP y la finalidad de las fixtures. No se crearon migraciones, no se modificó `db/schema.sql` y no se alteraron datos existentes.

## Pruebas primero

Antes de implementar se agregaron suites para T13 y T14 y se amplió la suite de fixtures. La ejecución roja inicial tuvo 3 suites fallidas: faltaban ambas entidades y las fixtures todavía no exponían cuentas pendientes, licencia ni escenarios.

- `evento-auditoria.entity.spec.ts` verifica campos, ausencia de columnas para secretos/modalidad y registro en el módulo independiente.
- `limite-intentos.entity.spec.ts` verifica la IP primaria, ventana, contador, bloqueo, ausencia de separación por ruta y registro compartido en Auth.
- `datos-negocios.spec.ts` verifica cuentas activadas/pendientes, asociación anual, los cuatro estados de licencia y aislamiento de objetos y fechas entre negocios.
- `modulos.spec.ts` confirma que la composición continúa sin conexión real ni dependencias circulares.

## Verificaciones finales

| Comando | Resultado |
| --- | --- |
| `npm run build` | Correcto |
| `npm run lint` | Correcto |
| `npm test -- --runInBand` | 17 suites, 78 pruebas aprobadas |
| `npm run test:integration -- --runInBand --detectOpenHandles` | 1 suite, 2 pruebas aprobadas |
| `npm run test:e2e -- --runInBand --detectOpenHandles` | 1 suite, 1 prueba aprobada |

T13, T14 y T69 quedan completadas. No se inició T15 ni ninguna tarea posterior.
