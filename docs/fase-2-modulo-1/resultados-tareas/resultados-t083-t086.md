# Resultados M1-T083–M1-T086 — franjas semanales y excepciones

Fecha: 2026-10-02. Las cuatro tareas están implementadas y marcadas como hechas en el plan.

## Qué se realizó

Las franjas semanales tienen ID estable, día, orden, sucursal, minutos locales, descanso y estado. Los borradores inactivos pueden guardar campos incompletos; una franja activa exige sucursal, entrada, salida y un descanso completo o ausente. Las claves foráneas compuestas impiden asociar un perfil con otro negocio o con una sucursal que no tenga asignada. Una excepción tiene cabecera única por profesional, sucursal y fecha local. La cabecera vacía representa un cierre explícito, distinto de no haber excepción. El validador devuelve errores con el nombre del campo y admite 24:00 exclusivamente como salida.

## Archivos

| Archivo | Qué hace |
| --- | --- |
| `src/horarios/entities/horario-personal.entity.ts` | Modela la franja semanal, sus borradores, relaciones de pertenencia y restricciones de estado. |
| `src/horarios/entities/excepcion-horario.entity.ts` | Modela la cabecera única por fecha y la relación con sus franjas; permite una cabecera sin hijas. |
| `src/horarios/entities/franja-excepcion-horario.entity.ts` | Modela cada intervalo de la excepción, con minutos, descanso y referencia al negocio de la cabecera. |
| `src/database/migrations/1760000013000-HorariosSemanales.ts` | Crea la tabla semanal con integridad de perfil y asignación, más restricciones para borradores y activación. |
| `src/database/migrations/1760000014000-ExcepcionesHorario.ts` | Crea cabeceras y franjas hijas; protege unicidad, pertenencia e intervalos. |
| `src/horarios/validar-franja.ts` | Valida una franja antes de guardarla y señala el campo inválido sin modificar la entrada. |
| `src/horarios/horarios.module.ts` | Registra las tres entidades en TypeORM para el módulo de horarios. |
| `db/schema.sql` | Mantiene el esquema de instalación alineado con las nuevas migraciones. |
| `src/horarios/horarios-fase-2.spec.ts` | Prueba el modelo y los casos de validación de T083 y T086. |
| `test/horarios-t083-t085.integration-spec.ts` | Prueba en MariaDB real borradores, activación, aislamiento, cabeceras vacías y franjas hijas. |
| `src/modulos-fase-2.spec.ts` | Proporciona los repositorios nuevos al test de composición de módulos. |
| `test/instalacion-t61.integration-spec.ts`, `test/envios-correo.integration-spec.ts`, `test/identidad-fase-2.integration-spec.ts` | Actualizan expectativas del número de migraciones por las dos migraciones nuevas. |
| `test/sucursales-t060.integration-spec.ts` | Ajusta el orden de reversión y reaplicación de migraciones para respetar las nuevas claves foráneas. |
| `test/profesionales-t081-t082.integration-spec.ts` | Usa un mismo instante fijo para creación y activación del fixture; evita que el paso de fecha invalide su restricción. |
| `docs/fase-2-modulo-1/tareas-modulo-1.md` | Marca T083–T086 y enlaza esta evidencia. |
| `docs/fase-2-modulo-1/resultados-tareas/resultados-t083-t086.md` | Documenta cambios, pruebas y límites del resultado. |

Las entidades, migraciones, validador, esquema y pruebas nuevas contienen comentarios que explican las decisiones principales: borradores, pertenencia, cierre explícito y límites de minutos.

## Tests primero y resultados

Primero se escribieron las pruebas unitarias y de integración. La primera ejecución unitaria falló porque faltaba la entidad semanal y la primera integración falló porque todavía no existían las tablas. Después de implementar el modelo y las migraciones, pasaron **17/17 pruebas unitarias enfocadas** y **3/3 pruebas de integración enfocadas**.

| Pruebas | Qué verifican |
| --- | --- |
| 17 unitarias de horarios | Metadatos de entidades, borrador parcial, activación incompleta, inversión de intervalo, descanso parcial o exterior, límites de minutos, salida 24:00 y errores con campos. |
| 3 de integración de horarios | Persistencia y recuperación de borrador, transición a activo, rechazo de datos incompletos, sucursal ajena y negocio ajeno, unicidad de excepción, distinción entre cabecera vacía y ausencia, franja hija y aislamiento. |
| Integración enfocada de sucursales | Reversión y reaplicación de las migraciones con el nuevo orden de dependencias; **1/1 aprobada**. |
| Integración enfocada de profesionales | Fixture de fechas y concurrencia anterior; **4/4 aprobadas**. |

| Suite o comando | Resultado |
| --- | --- |
| `npm test -- --runInBand` | **50 suites; 274/274 pruebas aprobadas.** |
| `npm run test:integration -- --runInBand` | **26 suites aprobadas, 6 fallidas; 166/172 pruebas aprobadas.** |
| `npm run test:e2e -- --runInBand` | **12 suites aprobadas, 4 fallidas; 100/118 pruebas aprobadas.** |
| `npm run build` | Aprobado. |
| `npm run lint` | Código de salida 0; cuatro advertencias por importaciones no usadas en `src/auth/dto/acceso-codigo.dto.ts`, archivo no modificado en esta entrega. |

La integración completa usa MariaDB 10.4.32 local. Sus seis fallos están en pruebas anteriores: T037–T039, T052–T058, T013, T021–T024, T026 y T015–T018. Dos fallan al revertir `CodigosInvitacion1760000007000` por `Duplicate key`; otros esperan rechazos o un valor nulo que no se producen con esta base. La suite HTTP muestra 18 fallos de rutas anteriores que reciben 400 cuando esperaban 200 o 409. Las pruebas nuevas de horarios no fallan. Estos fallos completos quedan pendientes de diagnóstico fuera de T083–T086.

La resolución de zonas horarias, empalmes, guardado de semana y endpoints corresponde a T087 y siguientes.
