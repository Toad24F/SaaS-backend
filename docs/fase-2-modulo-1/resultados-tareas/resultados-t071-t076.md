# Resultado M1-T071–M1-T076 — perfiles Profesionales

Fecha: 2026-09-30.

## Qué se realizó

El perfil `personal` contiene solo negocio y cuenta. Nombre, correo, hash de contraseña y estado siguen en `usuarios`, con una sola fuente de identidad. Las relaciones `personal_sucursales` y `personal_servicios` contienen `negocio_id` y claves foráneas compuestas; rechazan duplicados y cruces entre negocios. La selección de servicios se modela para las tareas siguientes, sin gestionarla todavía.

El administrador crea la cuenta Profesional completa, su perfil, reserva de correo y auditoría en una transacción. La contraseña usa la política bcrypt compartida y nunca aparece en respuesta ni auditoría. Puede consultar perfiles, editar nombre, correo o contraseña y reemplazar el conjunto de sucursales propias. Cambiar correo actualiza su reserva y versión; los cambios de correo o contraseña revocan sesiones. Desactivar revoca sesiones abiertas y conserva el perfil; reactivar exige una sesión nueva. Las rutas comprueban JWT y rol, y el servicio vuelve a leer actor y pertenencia desde la base. Las transiciones y asignaciones repetidas no duplican eventos de auditoría.

| Ruta | Resultado |
| --- | --- |
| `POST /profesionales`, `GET /profesionales`, `GET /profesionales/:id` | Alta completa y lecturas propias. |
| `PATCH /profesionales/:id` | Edición parcial de nombre, correo o contraseña; no acepta negocio, rol ni estado. |
| `POST /profesionales/:id/desactivar`, `POST /profesionales/:id/reactivar` | Cambian acceso con 204; conservan datos y no restauran sesiones. |
| `GET /profesionales/:id/sucursales`, `PUT /profesionales/:id/sucursales` | Consultan o reemplazan asignaciones del mismo negocio; `[]` es válido. |

## Archivos

| Archivo | Qué hace |
| --- | --- |
| `src/profesionales/entities/personal.entity.ts` | Modela el perfil con vínculo único a la cuenta y sin credenciales duplicadas. |
| `src/profesionales/entities/personal-sucursal.entity.ts` | Modela la asignación múltiple a sucursales con pertenencia compuesta. |
| `src/profesionales/entities/personal-servicio.entity.ts` | Modela futuras selecciones individuales sin duplicar tarifa ni duración. |
| `src/database/migrations/1760000012000-Profesionales.ts` | Crea las tres tablas, unicidad y FKs compuestas; las revierte en orden de dependencia. |
| `db/schema.sql` | Alinea el esquema de referencia con las entidades y la migración nueva. |
| `src/profesionales/dto/profesionales.dto.ts` | Valida alta, edición, ID y conjuntos de sucursales; rechaza campos reservados. |
| `src/profesionales/profesionales.service.ts` | Implementa transacciones de cuenta/perfil/reserva, edición, sesiones, asignaciones, permisos y auditoría. |
| `src/profesionales/profesionales.controller.ts` | Expone rutas administrativas con respuestas sin hash y reloj controlable. |
| `src/profesionales/profesionales-http.module.ts` | Compone HTTP, autenticación y dominio sin dependencia circular. |
| `src/profesionales/profesionales.module.ts` | Registra repositorios, política de contraseña, reserva y servicio. |
| `src/app.module.ts` | Conecta las rutas de Profesionales con la aplicación. |
| `src/modulos-fase-2.spec.ts` | Añade simulaciones de los repositorios a la prueba de composición sin base. |
| `test/profesionales-t071-t076.e2e-spec.ts` | Comprueba restricciones SQL, alta atómica, roles, tenant, asignaciones, sesiones y edición. |
| `test/sucursales-t060.integration-spec.ts` | Revierte y reaplica relaciones dependientes antes de ensayar la migración de sucursales. |
| `test/identidad-fase-2.integration-spec.ts`, `test/envios-correo.integration-spec.ts`, `test/instalacion-t61.integration-spec.ts` | Ajustan los conteos de migraciones al nuevo total de 13. |
| `test/alta-invitacion.integration-spec.ts` | Hace determinista una cuenta de prueba histórica usando el mismo reloj para creación y activación. |
| `docs/fase-2-modulo-1/tareas-modulo-1.md` | Marca T071–T076 hechas y enlaza esta evidencia. |
| `docs/fase-2-modulo-1/resultados-tareas/resultados-t071-t076.md` | Registra el alcance, la función de los archivos y los resultados de pruebas. |

Los comentarios en entidades, migración, DTO, servicio, controlador, módulos y pruebas explican los bloques de pertenencia, transacción, reserva, estado y asignaciones.

## Tests primero y resultado

Se escribió primero `test/profesionales-t071-t076.e2e-spec.ts`. Su ejecución inicial falló porque la tabla `personal` no existía y las rutas respondían 404. Tras implementar, la prueba enfocada pasó **4/4**: comprobó perfil y relaciones sin duplicados ni cruces tenant; alta con contraseña válida y correo reservado; rollback de cuenta, perfil y reserva al fallar auditoría; asignación a varias sucursales propias; denegación a recepción y al propio Profesional; revocación de sesión al desactivar, persistente tras reactivar; nueva sesión válida; edición y conservación de datos ante correo o contraseña inválidos. Una ejecución intermedia detectó que un nombre de campo booleano de auditoría coincidía con el filtro de secretos; se cambió sin registrar contraseñas ni hashes.

Las suites se ejecutaron contra bases desechables migradas en MariaDB local 10.4.32. Los mensajes `ERROR` de las pruebas HTTP son fallos inyectados y esperados; el resumen de Jest determina el resultado.

| Verificación | Resultado |
| --- | --- |
| `npm test -- --runInBand` | **49 suites, 257/257 pruebas aprobadas.** |
| `npm run test:e2e -- --runInBand profesionales-t071-t076` | **1 suite, 4/4 aprobadas.** |
| `npm run test:e2e -- --runInBand` | **15 suites, 115/115 aprobadas.** |
| `npm run test:integration -- --runInBand` | **25 suites aprobadas, 5 fallidas; 160/165 pruebas aprobadas.** |
| `npm run build` | Aprobado. |
| `npm run lint` | Aprobado tras retirar un import sin uso. |

Los cinco fallos restantes de integración pertenecen a casos anteriores: transición concurrente de licencia T058, conversión de códigos T021–T024, reversión histórica T013, restricción de bandeja T026 y rechazo de relación inexistente T017. Se observaron también durante T067–T070 en la misma instancia local; su causa no se investigó en estas tareas. La prueba de migración de sucursales y la prueba histórica de alta con reloj fijo quedaron verdes tras adaptar sus fixtures a las dependencias actuales.
