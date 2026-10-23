# Resultado M3-T001–T007

Fecha de ejecución: 18 de octubre de 2026. Alcance: solo la base de pruebas y los contratos iniciales del módulo 3. Las siete tareas están marcadas en [tareas.md](../tareas.md); M3-T008 y siguientes siguen pendientes.

## Archivos y función

| Archivo | Qué hace |
| --- | --- |
| [matriz-aceptacion-t001.md](matriz-aceptacion-t001.md) | Relaciona RF-01–RF-43 y los ocho criterios con grupos de pruebas; distingue infraestructura nueva, antecedentes y verificaciones pendientes. |
| [contratos-conservados-t002.md](contratos-conservados-t002.md) | Registra las cinco rutas privadas, permisos, límites del motor y estado inicial `pendiente`. |
| `test/fase-4-t001-t007.integration-spec.ts` | Comprueba aislamiento de base desechable, limpieza, fixture, reloj exacto, rollback y espera de dos conexiones. |
| `test/support/escenario-portal.ts` | Crea dos negocios con dos Profesionales cada uno, oferta activa e inactiva, dos sucursales con zonas distintas, teléfono compartido y cita/apartado. Solo acepta bases temporales creadas por el ejecutor. |
| `test/support/concurrencia-portal.ts` | Ofrece una barrera explícita y un fallo antes del commit para futuras pruebas de carreras y atomicidad. |
| `src/reservas-publicas/contratos.ts` | Declara selección pública, contexto interno resuelto por servidor y salida de reserva pendiente, separados del JWT privado. |
| `src/reservas-publicas/reservas-publicas.module.ts` | Reserva la frontera de servicios de dominio M01–M05. |
| `src/reservas-publicas/reservas-publicas-http.module.ts` | Reserva la frontera HTTP; no registra controladores ni escritores. |
| `src/reservas-publicas/reservas-publicas.contract.spec.ts` | Comprueba que ambas fronteras carecen de controladores y que entrada y salida mantienen el estado inicial. |
| `src/app.module.ts` | Registra la frontera HTTP vacía en la composición principal sin abrir rutas nuevas. |
| `docs/fase-4-modulo-3/tareas.md` | Marca únicamente M3-T001–T007 tras completar sus criterios. |

## Flujo preparado

1. `conBaseMigrada` comprueba `NODE_ENV=test` y exige `TEST_DB_*` confirmado y separado de la base cotidiana. Crea un esquema con nombre aleatorio validado, aplica migraciones, abre dos conexiones y elimina el esquema después de cerrar los pools, también si falla la prueba.
2. El fixture inserta datos de dos negocios dentro de ese esquema. Su guardia impide ejecutarlo contra una base persistente. Las pruebas consultan filas por `negocio_id` y comprueban que un Profesional ajeno no aparece en el negocio contrario.
3. `RelojPrueba`, ya existente, avanza un milisegundo antes, exactamente al vencimiento y un milisegundo después. El inyector de fallo provoca una excepción dentro de la transacción y la prueba verifica que no queda la fila insertada.
4. Dos conexiones toman la misma fila: la primera retiene el bloqueo, la segunda espera en `FOR UPDATE` y continúa al commit. El caso de fallo revierte ambas transacciones y comprueba que ambas conexiones fueron cerradas.
5. Los contratos separan selección recibida, contexto autorizado construido por servidor y resultado público. Los módulos de dominio y HTTP están declarados, pero el portal aún no puede crear ocupaciones. Las tareas siguientes añadirán persistencia, autorización, revalidación y escritores.

## Pruebas y resultado

| Comando | Resultado |
| --- | --- |
| `npm run build` | Aprobado, salida 0. |
| `npm run lint` | Aprobado, salida 0. |
| `npm test -- --runInBand` | **65 suites, 329 pruebas aprobadas**, 0 fallidas. |
| `npm test -- --runInBand reservas-publicas.contract` | **1 suite, 1 prueba aprobada** tras el último cambio. |
| `npm run test:integration -- --runInBand fase-4-t001-t007` | **1 suite, 5 pruebas aprobadas** en MariaDB local de pruebas, 0 fallidas. |

La primera ejecución de la integración dentro del sandbox obtuvo `EACCES` al conectar a `127.0.0.1:3303`; se repitió con acceso aprobado y pasó. La suite unitaria completa se ejecutó antes de añadir el último caso de integración; ese caso se verificó en la ejecución final específica. Las pruebas de este lote acreditan infraestructura y contratos, no escritores públicos ni integración completa del motor. M2-I004/M3-I001 permanece diferido al escritor manual real del módulo 4.
