# Resultados — ALA-T002–ALA-T007

Revisión base: `5a87ae1`, con cambios de trabajo de ALA-T001–T007 aún sin commit. Estado de constitución, spec y plan: propuesta pendiente de aprobación. No se modificó lógica de producción ni se usó la base cotidiana.

## Flujo y archivos

| Tarea y RF | Archivo o recurso | Qué se realizó y cómo se usa |
| --- | --- | --- |
| ALA-T002 · RF-22–RF-24, RF-36–RF-42, RF-64 | `constitucion.md` y `plan.md` | Se alineó «inhabilitación recuperable» y el alcance exclusivamente backend. El plan ahora describe la precedencia propuesta sin atribuir aprobación: los ajustes solo sustituirían reglas incompatibles después de aprobarse. Se conservaron referencias al módulo 1, fix, motor y portal. |
| ALA-T003 · RF-03, RF-15, RF-32–RF-42, RF-60, RF-64–RF-68 | [inventario-contratos-t003.md](inventario-contratos-t003.md) | Inventaría entradas nuevas, modificadas y retiradas, las nueve rutas públicas y cinco privadas vigentes y sus permisos. Explica el paso de superadmin, administración propia y navegador anónimo por la API propuesta. Es una guía de compatibilidad, no una implementación. |
| ALA-T004 · RF-64–RF-65, RF-67 | `test/fase-4-t001-t007.integration-spec.ts` y ejecutor existente `test/support/mariadb.ts` | Se añadió un caso que rechaza una fixture dirigida a una base ajena antes de escribir. El ejecutor crea una base `citas_persistencia_<uuid>`, migra, conecta dos fuentes y la elimina tras cerrarlas; el caso existente confirma en `information_schema` que desapareció. |
| ALA-T005 · RF-16, RF-22, RF-43, RF-56–RF-58 | Fixture existente `test/support/escenario-portal.ts` | Se ejecutó su caso de control: crea dos negocios, dos profesionales distintos por negocio, dos sucursales con zonas distintas, oferta activa/inactiva, ocupaciones y teléfono compartido. El cierre del ejecutor elimina solo su base temporal. Los nuevos cupos e inhabilitación todavía no existen y no se simulan como implementados. |
| ALA-T006 · RF-07, RF-15, RF-59, RF-65 | `test/support/reloj.ts`, `test/support/concurrencia-portal.ts` y suite de integración | Los casos existentes avanzan hasta un milisegundo antes, exactamente y después del vencimiento. Dos conexiones independientes disputan la misma fila mediante barrera: la segunda espera, la primera confirma y luego continúa; otro caso fuerza fallo y verifica rollback y cierre. No acredita aún carreras de los futuros escritores del ajuste. |
| ALA-T007 · RF-01–RF-69 | [plantilla-evidencia.md](plantilla-evidencia.md) | La plantilla obliga a registrar revisión, RF, archivos, flujo, comando, entorno, resultado, pruebas omitidas y pendientes. Separa preparación documental de funcionalidad acreditada para que una casilla no cierre un RF sin prueba real. |

La nueva suite `test/ala-preparacion-documental.spec.ts` comprueba terminología, alcance, precedencia, inventario de rutas y campos de la plantilla. Sus comentarios explican por qué solo las rutas enumeradas cuentan. En la suite de integración, el comentario del caso nuevo explica que la validación precede a cualquier `INSERT`.

## Pruebas ejecutadas

| Comando o comprobación | Resultado |
| --- | --- |
| `npm test -- --runInBand test/ala-preparacion-documental.spec.ts` antes de los documentos | Falló como se esperaba: 3/3 casos detectaron terminología desalineada, inventario y plantilla ausentes. |
| `npm test -- --runInBand test/ala-preparacion-documental.spec.ts test/ala-t001-matriz.spec.ts` | Código 0; 2 suites, 5 pruebas aprobadas, 0 omitidas. Incluye regresión de la matriz ALA-T001. |
| `npm run test:integration -- --runInBand test/fase-4-t001-t007.integration-spec.ts` en sandbox | Falló por `EACCES` a `127.0.0.1:3306`/`::1:3306`: restricción de red del sandbox, no resultado funcional. |
| Mismo comando con acceso local autorizado, antes del caso nuevo | Código 0; 1 suite, 5 pruebas aprobadas, 0 omitidas. |
| Mismo comando con acceso local autorizado, después del caso nuevo | Código 0; 1 suite, 6 pruebas aprobadas, 0 omitidas. Usó bases desechables migradas. |
| `npm run build` | Código 0. |
| `npm run lint` | Código 0. |

La prueba de la base verifica que el nombre creado sea temporal y distinto de `DB_NAME`, que la limpieza no deje el esquema y que una fixture rechace un destino no creado por el ejecutor. La prueba de fixtures comprueba filas finales y pertenencia. El control de concurrencia comprueba bloqueo, continuación, rollback y cierre de ambas conexiones. No hubo pruebas omitidas en las ejecuciones aprobadas.

## Pendientes

Estas tareas preparan documentación e infraestructura de prueba; **no acreditan la implementación** de RF-01–RF-69. Las pruebas de la lógica nueva, sus rutas HTTP, migraciones y carreras reales se ejecutarán con las tareas posteriores. RF-63 y M3-I001/M2-I004 continúan diferidos al escritor manual real. La propuesta sigue pendiente de aprobación y no habilita producción ni cierra la fase.
