# Resultados M1-T005–M1-T009

Fecha: 2026-09-25. Se cerraron los contratos y la infraestructura inicial de fase 2. Las rutas de la tabla son contratos futuros: no se presentan como endpoints ya implementados. El esquema actual aún no permite guardar cuentas Profesional ni invitaciones; eso corresponde a M1-T011–M1-T015.

## Qué se realizó

| Tarea | Resultado |
|---|---|
| M1-T005 | Se detallaron método, ruta, entrada mínima, respuesta, rol y errores de altas, activación, cupos, catálogos, profesionales, horario, bloqueos y licencia. La activación exige correo y código, el horario conserva el último guardado válido y ninguna respuesta incluye códigos utilizables. |
| M1-T006 | Se añadió un fixture en memoria con dos negocios de IDs independientes, los cuatro roles, recursos etiquetados por negocio, una invitación pendiente sin Usuario y fechas tomadas del reloj controlado. |
| M1-T007 | Se añadió una barrera para dos corredores MariaDB sobre una base temporal migrada. Si falla un participante, el otro despierta y ambos corredores y conexiones se cierran. |
| M1-T008 | Se declararon y compusieron en Nest los seis módulos de dominio previstos. Correos no registra transporte ni envía al inicializarse. |
| M1-T009 | Se agregó Profesional al rol de aplicación y una matriz cerrada de permisos. La comprobación de recurso valida negocio y propiedad del perfil; deniega recepción, recursos ajenos, otra persona y bloqueos colectivos al Profesional. |

## Archivos y función

- [`plan-modulo-1.md`](../plan-modulo-1.md): la sección 5.5 especifica los contratos HTTP futuros y sus errores. Su comentario HTML distingue contrato de implementación.
- [`tareas-modulo-1.md`](../tareas-modulo-1.md): marca M1-T005–M1-T009, actualiza pendientes a 131 y enlaza esta evidencia.
- [`contratos-modulo-1.spec.ts`](../../../test/contratos-modulo-1.spec.ts): comprueba que cada ruta clave tenga su entrada o permiso en la misma fila y que el plan declare errores y protección de secretos.
- [`modulo-1.ts`](../../../test/support/modulo-1.ts) y [`modulo-1.spec.ts`](../../../test/support/modulo-1.spec.ts): construyen y verifican los datos sintéticos aislados, la invitación sin cuenta y el reloj. Los comentarios señalan que aún no persisten.
- [`carreras-modulo-1.ts`](../../../test/support/carreras-modulo-1.ts) y [`carreras-modulo-1.integration-spec.ts`](../../../test/carreras-modulo-1.integration-spec.ts): ofrecen dos conexiones con barrera y prueban conexiones distintas, liberación conjunta y cierre tras fallo. Los comentarios explican barrera y limpieza.
- [`rol.enum.ts`](../../../src/auth/enums/rol.enum.ts): declara Profesional para la política de aplicación; su comentario remite a la migración futura de cuentas. [`jwt-payload.interface.ts`](../../../src/auth/interfaces/jwt-payload.interface.ts) actualiza la descripción del rol.
- [`usuario.entity.ts`](../../../src/usuarios/entities/usuario.entity.ts) y [`usuario.entity.spec.ts`](../../../src/usuarios/entities/usuario.entity.spec.ts): mantienen el metadato del enum SQL limitado a los tres roles persistidos hasta M1-T014–T015 y comprueban esa coherencia. El comentario de la columna explica el límite temporal.
- [`autorizacion.service.ts`](../../../src/auth/services/autorizacion.service.ts) y [`autorizacion-fase-2.spec.ts`](../../../src/auth/services/autorizacion-fase-2.spec.ts): amplían la matriz y prueban autorización por rol, negocio, titular y alcance individual/colectivo. Los comentarios describen el cierre por defecto y la comprobación de propiedad.
- [`sucursales.module.ts`](../../../src/sucursales/sucursales.module.ts), [`servicios.module.ts`](../../../src/servicios/servicios.module.ts), [`profesionales.module.ts`](../../../src/profesionales/profesionales.module.ts), [`horarios.module.ts`](../../../src/horarios/horarios.module.ts), [`bloqueos.module.ts`](../../../src/bloqueos/bloqueos.module.ts) y [`correos.module.ts`](../../../src/correos/correos.module.ts): reservan los límites de cada dominio sin casos de uso prematuros; cada archivo comenta su responsabilidad.
- [`app.module.ts`](../../../src/app.module.ts) y [`modulos-fase-2.spec.ts`](../../../src/modulos-fase-2.spec.ts): incorporan los seis módulos al arranque y verifican composición, ausencia de ciclos y falta de transporte automático.
- [`negocios-t47.e2e-spec.ts`](../../../test/negocios-t47.e2e-spec.ts): limita el fixture histórico a los tres roles que la migración de fase 1 admite; su comentario explica que Profesional se persistirá en T14–T15. El primer recorrido HTTP descubrió esta incompatibilidad.
- Este informe describe la función de cada archivo, las pruebas y los límites de la entrega.

## Tests primero y resultado

Se escribieron primero las pruebas de contratos, fixtures, barrera, composición y política. La primera ejecución de cuatro suites unitarias falló (10 casos fallidos y 4 aprobados), y la prueba de integración no pudo cargar el soporte de carreras; ambos fallos eran esperados antes de crear la implementación. Tras implementarla, las pruebas focalizadas T5/T6/T8/T9 pasaron 33/33 y las dos pruebas MariaDB de T7 pasaron 2/2. Una revisión posterior endureció la comprobación de contratos para exigir ruta y requisito en la misma fila; reveló un caso `RFC`/`rfc` que se corrigió en el test y volvió a pasar 14/14.

La revisión de coherencia encontró que el nuevo valor de `Rol` ampliaba por accidente el metadato TypeORM de la columna antigua. La prueba añadida falló primero (1 caso), se acotó la columna al enum SQL vigente y pasó después.

La regresión completa final pasó: `npm test -- --runInBand --silent` **160/160, 31 suites**; `npm run test:integration -- --runInBand --silent` **65/65, 16 suites**; `npm run test:e2e -- --runInBand --silent` **93/93, 9 suites**. `npm run build` y `npm run lint` pasaron sin errores ni advertencias. T47 se repitió tras corregir su fixture y pasó 12/12. Los mensajes de errores inyectados en T48–T50 y T72 son parte de sus casos de rollback; Jest terminó con código 0.

Estas pruebas verifican la infraestructura y las reglas de política aisladas. No acreditan todavía persistencia de Profesional, correo real, controladores nuevos, horarios operativos ni carreras de negocio concretas: esas tareas siguen pendientes.
