# Evidencia M2-T005–M2-T010 — persistencia mínima

## Qué se hizo

La instalación desde migraciones ahora añade cuatro tablas después del fix. `1760000019000-ConfiguracionAgenda.ts` crea una fila opcional por negocio, con valores iniciales  `ventana_libre/15/15/60`, una clave primaria que impide duplicados y restricciones de modo, intervalo y anticipación. `configuracion-agenda.entity.ts` representa esas columnas en TypeORM. La lectura efectiva sin fila y la escritura autorizada se implementarán en M2-T021–T023.

`1760000020000-ClientesBase.ts` crea la referencia mínima de clientes, con teléfono único dentro de cada negocio y clave `(negocio_id, id)` para las citas. `cliente.entity.ts` permite leer y guardar esos datos en TypeORM; no incorpora rutas de clientes.

`1760000021000-CitasCanonicas.ts` instala citas con inicio y fin `DATETIME(3)` interpretados en UTC, zona IANA de reserva, estado, origen, folio, notas, índices de búsqueda y claves foráneas compuestas por negocio. `cita.entity.ts` representa el mismo intervalo y sus cinco relaciones. El fin se guarda explícitamente: cambiar la duración del servicio no modifica una cita previa.

`1760000022000-ApartadosCanonicos.ts` instala `bloqueos_temporales` con Profesional, sucursal, servicio, intervalo UTC, expiración, liberación y `titular_hash`. No guarda `session_token`. La entidad y el lector de apartados corresponden a M2-T011 y M2-T040.

El flujo de datos preparado es **negocio → configuración y cliente → cita**, mientras **negocio + Profesional + sucursal + servicio → apartado**. En ambas ocupaciones las referencias compuestas impiden relacionar recursos de negocios distintos. El futuro motor leerá sus intervalos UTC y aplicará estado o vigencia. Las migraciones solo instalan fuentes: esta entrega no crea reservas desde HTTP ni calcula disponibilidad.

Cada migración y entidad nueva incluye comentarios sobre su función y las decisiones de integridad. `test/fase-3-t005-t010.integration-spec.ts` crea exclusivamente bases temporales migradas y las limpia al terminar. Se actualizó `test/recorrido-t133.e2e-spec.ts` para comprobar que `citas` está instalada y vacía en un recorrido que no reserva.

## Pruebas escritas primero

La prueba de integración se ejecutó antes de crear migraciones y entidades; falló porque `configuracion-agenda.entity.ts` no existía. Tras implementarlas, los tres casos pasaron:

1. Configuración: guarda y lee valores iniciales y personalizados; la PK rechaza duplicados y las restricciones rechazan modo, intervalo, anticipación y horizonte inválidos.
2. Clientes y citas: comprueba unicidad del teléfono por negocio, milisegundos de inicio/fin, conservación del fin tras cambiar duración, carga de relaciones del mismo negocio, rechazo de sucursal ajena y rechazo de intervalo vacío.
3. Apartados: comprueba columnas canónicas y ausencia de token utilizable; acepta un intervalo válido y rechaza sucursal, Profesional o servicio ajeno e intervalo vacío.

La primera ejecución completa de integración encontró cinco pruebas históricas dependientes del recuento anterior de 19 migraciones, del esquema SQL de instalación aún antiguo o de una reversión manual que no retiraba primero las nuevas tablas dependientes. Se ajustaron `instalacion-t61.integration-spec.ts`, `identidad-fase-2.integration-spec.ts`, `envios-correo.integration-spec.ts`, `instalacion-t126-t127.integration-spec.ts` y `sucursales-t060.integration-spec.ts` a 23 migraciones y al nuevo orden. La comparación histórica con `db/schema.sql` sigue comprobando sus tablas anteriores; la paridad de estas cuatro tablas nuevas queda expresamente para M2-T012–T013 y M2-T016. Los cinco grupos repetidos aprobaron **12 de 12 pruebas**.

## Resultado y límite de esta entrega

`npm test -- --runInBand`: **58 suites, 306 pruebas aprobadas**. La prueba dirigida de fase 3: **1 suite, 3 pruebas aprobadas**. El recorrido HTTP actualizado: **1 suite, 1 prueba aprobada**. `npm run build` y `npm run lint` terminaron sin errores.

Después de adaptar las cinco pruebas históricas, `npm run test:integration -- --runInBand` terminó con **47 suites y 220 pruebas aprobadas**. El resultado de la primera ejecución completa (5 fallos por expectativas históricas) se conserva arriba para explicar la corrección; la segunda ejecución completa es la verificación final.

La migración de apartados instala la tabla, pero su entidad TypeORM pertenece a M2-T011. `db/schema.sql` conserva por ahora el diseño anterior de las tablas de fase 3; M2-T012–T013 son las tareas explícitas para sincronizarlo. No se ejecutó el instalador SQL sobre una base cotidiana.
