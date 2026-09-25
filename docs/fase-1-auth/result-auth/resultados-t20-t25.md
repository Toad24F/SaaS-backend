# Evidencia de T20–T25: políticas, auditoría y códigos

## Cambios realizados

### T20 — Política de contraseñas

- Se agregó `src/auth/services/politica-contrasenas.service.ts`. Centraliza validación, hash y comparación con bcrypt.
- Exige al menos 12 caracteres y rechaza entradas mayores a 72 bytes UTF-8 para impedir el truncamiento silencioso propio de bcrypt.
- Se modificaron `AuthService` y `AuthModule` para usar y exportar esta política en lugar de comparar directamente con bcrypt.

### T21 — Calendario de Chihuahua

- Se agregó `src/licencias/services/calendario-licencias.service.ts`. Suma años sobre fecha y hora locales de `America/Chihuahua` y devuelve el instante UTC correspondiente.
- Usa `Intl.DateTimeFormat` para aplicar reglas reales de zona, ajusta el 29 de febrero al último día disponible y no usa 365 días ni un offset constante.

### T22 — Política de acceso

- Se agregó `src/licencias/services/politica-acceso-licencia.service.ts`. Clasifica licencias pendientes, vigentes, vencidas y suspendidas.
- Evalúa por separado cuenta activa, cuenta activada, negocio activado, activación inicial, activación de recepcionistas y aceptación de reservas.
- La evaluación es pura: una suspensión prolongada continúa bloqueando sin modificar ni consumir el vencimiento conservado.
- Se modificó `LicenciasModule` para registrar y exportar calendario y política.

### T23 — Auditoría transaccional

- Se agregó `src/auditoria/auditoria.service.ts`. Recibe obligatoriamente el `EntityManager` del caso de uso y guarda el evento con ese repositorio, compartiendo commit o rollback.
- Se modificó `AuditoriaModule` para registrar y exportar el servicio.

### T24 — Emisión de códigos

- Se agregó `src/codigos/codigos.service.ts`. Genera 32 bytes aleatorios, devuelve el código utilizable solo al emisor y persiste exclusivamente su SHA-256.
- Los códigos de activación vencen a las 48 horas y los de recuperación a los 30 minutos exactos.
- La emisión vincula negocio, destinatario, propósito y emisor, y registra auditoría sin código ni hash.
- Se modificó `CodigosModule` para registrar y exportar el servicio.

### T25 — Validación y consumo

- El mismo servicio calcula el hash recibido, busca la fila bajo bloqueo pesimista y revalida propósito, vencimiento exacto, consumo e invalidación.
- El callback de la operación y la marca `consumidoEn` se ejecutan en una sola transacción. Si la operación posterior falla, ambos cambios se revierten.
- Los errores utilizan un mensaje uniforme que no revela si el código existe ni cuál condición falló.

Todos los archivos nuevos y módulos modificados incluyen comentarios breves sobre límites de bcrypt, reglas de zona, inmutabilidad de la política, manager transaccional, exclusión de secretos y bloqueo de filas. No se modificaron entidades, migraciones, SQL ni endpoints.

## Pruebas primero

La fase roja falló porque los servicios aún no existían. Después se agregaron y ejecutaron estas coberturas:

- `politica-contrasenas.service.spec.ts`: mínimo de 12 caracteres, hash/comparación y rechazo de más de 72 bytes.
- `calendario-licencias.service.spec.ts`: aniversario, fin de mes, 29 de febrero, cambio histórico de offset y renovaciones sucesivas.
- `politica-acceso-licencia.service.spec.ts`: matriz de estados, cuenta/negocio, activaciones, reservas y suspensión prolongada sin mutación.
- `auditoria.service.spec.ts`: uso exclusivo del repositorio obtenido del `EntityManager` recibido.
- `codigos-auditoria.integration-spec.ts`: rollback real si falla auditoría; almacenamiento exclusivo del hash; auditoría sin secretos; duraciones de 30 minutos y 48 horas; propósito incorrecto, expiración exacta, invalidación y reutilización; consumo exitoso y rollback conjunto con una operación fallida.

Durante integración, MariaDB detectó dos fixtures que intentaban dejar usuarios en estados parciales inválidos. Se corrigieron para usar fechas posteriores a `creadoEn` y mutaciones completas de activación; las restricciones de producción permanecieron intactas.

Cada prueba de persistencia usa una base temporal migrada que se elimina al terminar. `TEST_DB_*` y sus datos existentes no se modifican.

## Verificaciones finales

| Comando | Resultado |
| --- | --- |
| `npm run build` | Correcto |
| `npm run lint` | Correcto |
| `npm test -- --runInBand` | 22 suites, 101 pruebas aprobadas |
| `npm run test:integration -- --runInBand --detectOpenHandles` | 4 suites, 11 pruebas aprobadas |
| `npm run test:e2e -- --runInBand --detectOpenHandles` | 1 suite, 1 prueba aprobada |

T20, T21, T22, T23, T24 y T25 quedan completadas. No se inició T26 ni ninguna tarea posterior.
