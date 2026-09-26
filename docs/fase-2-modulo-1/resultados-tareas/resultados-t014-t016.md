# Resultado M1-T014–M1-T016 — cuentas y destinos de auditoría

Fecha: 2026-09-25. El modelo y MariaDB admiten cuentas Profesional completas y vinculadas a su negocio. El índice calculado mantiene un solo administrador por negocio. La reserva de correo queda ligada mediante claves compuestas al correo de su invitación o cuenta. La auditoría admite un alta pendiente sin usuario administrador, comprueba su pertenencia al negocio y prepara referencias tipadas para los dominios posteriores.

## Archivos y función

- [`usuario.entity.ts`](../../../src/usuarios/entities/usuario.entity.ts) y [`rol.enum.ts`](../../../src/auth/enums/rol.enum.ts): alinean los roles de TypeORM con Profesional; la cuenta de ese rol exige nombre, hash y activación, y se conserva la unicidad del administrador.
- [`alta-administrador.entity.ts`](../../../src/altas/entities/alta-administrador.entity.ts) y [`correo-acceso.entity.ts`](../../../src/altas/entities/correo-acceso.entity.ts): describen los índices y relaciones compuestas que impiden asociar una reserva con una dirección distinta de la del titular.
- [`altas.module.ts`](../../../src/altas/altas.module.ts): registra las entidades nuevas en la carga automática de TypeORM para resolver sus relaciones al iniciar Nest.
- [`evento-auditoria.entity.ts`](../../../src/auditoria/entities/evento-auditoria.entity.ts) y [`auditoria.service.ts`](../../../src/auditoria/auditoria.service.ts): añaden destino de invitación y referencia tipada de recurso; el servicio rechaza claves de secretos incluso dentro de objetos anidados antes de guardar.
- [`1760000005000-CuentasProfesionales.ts`](../../../src/database/migrations/1760000005000-CuentasProfesionales.ts): amplía el enum SQL y agrega claves compuestas para la correspondencia de correo sin reescribir migraciones anteriores.
- [`1760000006000-DestinosAuditoria.ts`](../../../src/database/migrations/1760000006000-DestinosAuditoria.ts): agrega columnas, clave foránea por negocio e invitación y restricciones de par tipado para destinos posteriores.
- [`schema.sql`](../../../db/schema.sql): reproduce ambos cambios incrementales en el esquema de referencia, después de las tablas de identidad pendiente.
- [`usuario-fase-2.spec.ts`](../../../src/usuarios/entities/usuario-fase-2.spec.ts), [`auditoria-fase-2.spec.ts`](../../../src/auditoria/auditoria-fase-2.spec.ts) y [`cuentas-auditoria-fase-2.integration-spec.ts`](../../../test/cuentas-auditoria-fase-2.integration-spec.ts): prueban roles, credenciales, reserva, límites de administrador, pertenencia de auditoría y secretos.
- [`usuario.entity.spec.ts`](../../../src/usuarios/entities/usuario.entity.spec.ts), [`schema-fase-2.spec.ts`](../../../src/database/schema-fase-2.spec.ts) y [`modulos.spec.ts`](../../../src/modulos.spec.ts): actualizan expectativas de roles, orden SQL y registro de repositorios simulados.
- [`identidad-fase-2.integration-spec.ts`](../../../test/identidad-fase-2.integration-spec.ts), [`instalacion-t61.integration-spec.ts`](../../../test/instalacion-t61.integration-spec.ts) y [`migrations.integration-spec.ts`](../../../test/migrations.integration-spec.ts): mantienen comprobación, reversión e instalación completa con siete migraciones.
- [`tareas-modulo-1.md`](../tareas-modulo-1.md): marca las tres tareas y enlaza esta evidencia.

Los comentarios en entidades, migraciones, servicio, SQL y pruebas explican las FKs, las restricciones, el orden de reversión y la transición temporal.

## Tests primero y verificaciones

Se escribieron primero pruebas de entidad, auditoría y MariaDB temporal. Fallaron porque faltaban Profesional en el enum persistido y el destino `alta_administrador_id` en auditoría. Tras implementar, las pruebas focalizadas pasaron: **5/5 unitarias** y **3/3 de integración**; la regresión de instalación se corrigió registrando las entidades nuevas en el módulo.

La suite unitaria completa pasó **190/190 en 37 suites**; la de integración, **72/72 en 18 suites**; HTTP/e2e pasó **93/93 en 9 suites**. `npm run build` y `npm run lint` pasaron. Las trazas `ERROR` de e2e provienen de fallos inyectados para probar rollback; Jest terminó con código 0.

La compatibilidad temporal del flujo de alta de fase 1 permite todavía un administrador incompleto; su sustitución corresponde a M1-T035. Las referencias genéricas a sucursal, servicio, profesional, horario o bloqueo validan el par tipo/ID y requieren negocio, pero las claves foráneas específicas se añadirán cuando existan esas tablas. La reserva transaccional en los flujos de alta corresponde a M1-T017–M1-T018.
