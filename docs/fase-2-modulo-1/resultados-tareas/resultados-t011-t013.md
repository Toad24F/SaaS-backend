# Resultado M1-T011–M1-T013 — identidad y persistencia inicial

Fecha: 2026-09-25. Se extendió el modelo de negocio con RFC, correo destinatario y cupo de sucursales activas; se añadieron la invitación del administrador sin cuenta y la reserva exclusiva de correo. Una migración incremental crea estas columnas y tablas en una base temporal. No se convirtieron datos reales ni se alteraron las cuatro migraciones históricas.

## Archivos y función

- [`negocio.entity.ts`](../../../src/negocios/entities/negocio.entity.ts): incorpora RFC no único, correo normalizado y cupo predeterminado de 1; sus restricciones comprueban los valores persistidos. RFC y correo admiten nulo de forma transitoria para los flujos de fase 1, hasta que las tareas de alta nueva exijan ambos.
- [`validar-limite-sucursales.ts`](../../../src/negocios/validar-limite-sucursales.ts): valida que el cupo explícito sea un entero seguro de al menos 1 y aplica el valor 1 si se omite.
- [`alta-administrador.entity.ts`](../../../src/altas/entities/alta-administrador.entity.ts): representa una invitación pendiente sin usuario ni contraseña y una activación vinculada a una cuenta del mismo negocio.
- [`correo-acceso.entity.ts`](../../../src/altas/entities/correo-acceso.entity.ts): representa la reserva global del correo normalizado con un solo titular, invitación o usuario.
- [`1760000004000-IdentidadPendiente.ts`](../../../src/database/migrations/1760000004000-IdentidadPendiente.ts): agrega columnas y tablas con claves foráneas, unicidad, validaciones de estado y titular exclusivo; su reversión retira únicamente este tramo nuevo.
- [`schema.sql`](../../../db/schema.sql): refleja las nuevas columnas, tablas y restricciones para mantener el esquema de referencia alineado con la migración.
- [`negocio-fase-2.spec.ts`](../../../src/negocios/entities/negocio-fase-2.spec.ts) y [`identidad-pendiente.spec.ts`](../../../src/altas/entities/identidad-pendiente.spec.ts): verifican metadatos de entidades, normalización y límites del cupo.
- [`identidad-fase-2.integration-spec.ts`](../../../test/identidad-fase-2.integration-spec.ts): aplica, revierte y reaplica la migración en MariaDB temporal; comprueba cupo, RFC repetido, reservas exclusivas, pertenencia del usuario y estados válidos.
- [`schema-fase-2.spec.ts`](../../../src/database/schema-fase-2.spec.ts): comprueba que el SQL de referencia contiene los elementos nuevos.
- [`instalacion-t61.integration-spec.ts`](../../../test/instalacion-t61.integration-spec.ts): actualiza de cuatro a cinco el número esperado de migraciones, conservando su prueba de instalación completa.
- [`tareas-modulo-1.md`](../tareas-modulo-1.md): marca M1-T011, M1-T012 y M1-T013 como hechas, actualiza pendientes a 127 y enlaza esta evidencia.

Los comentarios añadidos en las entidades, el validador, la migración, el SQL y las pruebas explican la transición de fase 1, el propietario exclusivo del correo y las restricciones que protegen la pertenencia.

## Tests primero y verificaciones

Se escribieron primero las pruebas de entidad, migración y esquema. Las unitarias fallaron porque aún no existían las entidades nuevas; integración encontró solo cuatro migraciones y ninguna tabla de invitación; la comprobación SQL detectó la ausencia de las definiciones. Después de implementar, las pruebas focalizadas pasaron: **14/14 unitarias** para T011–T012, **4/4 de integración** para T013 y **2/2 de coherencia SQL**.

La verificación completa terminó con **184/184 pruebas unitarias en 35 suites**, **69/69 de integración en 17 suites** y **93/93 HTTP/e2e en 9 suites**. `npm run build` y `npm run lint` pasaron. La primera ejecución e2e registró 92/93; la repetición completa terminó con código 0 y 93/93. Una ejecución adicional destinada a guardar el JSON no pudo escribirlo porque la carpeta temporal elegida no existía; se corrigió la ruta y la siguiente ejecución pasó.

Estas tareas dejan preparado el modelo y la persistencia. La creación, reserva y transferencia operativa del correo, así como la exigencia final de RFC y destinatario en el alta, corresponden a tareas posteriores.
