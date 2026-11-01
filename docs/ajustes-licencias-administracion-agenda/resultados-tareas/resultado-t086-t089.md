# Resultado — ALA-T086–ALA-T089

## Flujo implementado

El reemplazo semanal de T085 sigue validando asignación y pertenencia antes de guardar. La prueba nueva usa sucursales en Nueva York y Phoenix: franjas que se empalman en UTC se rechazan con 409 aunque sus horas locales sean distintas; franjas exactamente contiguas en UTC se aceptan. Un bloqueo dentro de una franja fusionada divide la atención efectiva sin modificar el horario guardado.

`GET /disponibilidad/configuracion` devuelve modo, `tiempoEntreCitasMinutos`, anticipación y horizonte. Sin fila, los valores efectivos son Ventana Libre, separación 0, anticipación 15 y horizonte 60. `PUT` exige los cuatro campos, admite separación 0–60 en múltiplos de cinco y rechaza `intervaloMinutos` como campo desconocido. El administrador propio es el único que escribe. El negocio serializa el reemplazo; configuración y auditoría antes/después comparten el commit. Un 400 no cambia la fila y repetir el mismo conjunto no crea otro evento.

El motor deja de leer el intervalo SQL heredado. Usa un paso público técnico de cinco minutos mientras se completan las reglas de generación de T090 y siguientes; la modalidad manual conserva pasos de un minuto y omite anticipación, horizonte y selección pública. Ambas modalidades comprueban que atención y separación configurada quepan dentro de la jornada y no atraviesen ocupaciones conocidas. El `finUtc` de la respuesta sigue representando el fin del servicio, no el fin protegido.

## Archivos

| Archivo agregado o modificado | Qué hace |
| --- | --- |
| `src/disponibilidad/configuracion-agenda.validador.ts` | Sustituye el campo de intervalo por separación; valida conjunto completo, valores 0/5/60 y rechaza extras. |
| `src/disponibilidad/configuracion-agenda.service.ts` | Lee, compara, escribe y audita la separación; conserva la columna SQL anterior únicamente como legado. |
| `src/disponibilidad/motor-disponibilidad.service.ts` | Deja de usar el intervalo configurable; comprueba duración más separación para atención y validación manual. Los comentarios distinguen fin de atención y protección. |
| `src/disponibilidad/configuracion-agenda-ala.spec.ts` (nuevo) | Prueba defaults, valores admitidos, valores inválidos y rechazo del campo retirado. |
| `src/disponibilidad/configuracion-agenda.validador.spec.ts`, `disponibilidad-entradas.spec.ts` | Actualizan la regresión unitaria al contrato ALA sin perder pruebas de entradas completas y desconocidas. |
| `test/ala-t086-t089.e2e-spec.ts` (nuevo) | Recorre horarios de dos zonas, asignaciones, empalmes, bloqueo, cinco rutas privadas, permisos, reemplazo, auditoría y modalidad manual en base migrada desechable. |
| `test/fase-3-t020-t025.integration-spec.ts` | Conserva la regresión de transacción, rollback y primeras escrituras concurrentes con el campo nuevo. |
| `test/fase-3-t080-t081.integration-spec.ts` | Comprueba que una lectura coherente no reinterpreta el intervalo SQL antiguo como separación. |
| `test/fase-3-t057-t061.e2e-spec.ts`, `fase-3-t062-t066.e2e-spec.ts` | Conservan las pruebas de permisos y privacidad de las cinco rutas con el cuerpo HTTP nuevo. |
| `docs/ajustes-licencias-administracion-agenda/tareas.md` | Marca T086–T089 y enlaza esta evidencia. |

Los bloques de producción nuevos incluyen comentarios sobre el campo legado, el paso público provisional y el fin protegido; las pruebas comentan la equivalencia UTC y la diferencia entre modalidades.

## Tests primero y resultados

La prueba unitaria comenzó roja: el valor inicial aún devolvía `intervaloMinutos: 15`. En la prueba HTTP se corrigieron dos fechas inválidas del fixture antes de obtener el rojo funcional: GET devolvía el campo anterior. Después de cambiar el contrato, una prueba adicional mostró que la validación manual aceptaba 11:26 pese a que sus cinco minutos de separación salían de la jornada; se corrigió y pasó.

| Comando | Resultado |
| --- | --- |
| `npm test -- --runInBand src/disponibilidad/configuracion-agenda-ala.spec.ts src/disponibilidad/configuracion-agenda.validador.spec.ts src/disponibilidad/disponibilidad-entradas.spec.ts` | 3 suites, 7/7 pruebas aprobadas. |
| `npm run test:e2e -- --runInBand test/ala-t086-t089.e2e-spec.ts` | 1 suite, 3/3 pruebas aprobadas; última ejecución incluye extremos UTC contiguos y auditoría antes/después. |
| `npm run test:integration -- --runInBand test/fase-3-t020-t025.integration-spec.ts` | 1 suite, 3/3 pruebas aprobadas: aislamiento, auditoría, rollback y dos conexiones. |
| `npm run test:integration -- --runInBand test/fase-3-t080-t081.integration-spec.ts` | 1 suite, 2/2 pruebas aprobadas: instantánea coherente y columna heredada. |
| `npm run test:e2e -- --runInBand test/fase-3-t057-t061.e2e-spec.ts` | 1 suite, 1/1 prueba aprobada: permisos y consulta privada. |
| `npm run test:e2e -- --runInBand test/fase-3-t062-t066.e2e-spec.ts` | 1 suite, 5/5 pruebas aprobadas: contrato y privacidad de las cinco rutas. |
| `npm test -- --runInBand` | Suite completa: 86 suites, 398/398 pruebas aprobadas. |
| `npm run build`, `npm run lint`, `git diff --check` | Aprobados; lint sin avisos. |
| `npm run test:integration -- --runInBand` | Ejecución completa: 69 suites aprobadas, 15 fallidas; 355/384 pruebas aprobadas. |
| `npm run test:e2e -- --runInBand` | Ejecución completa: 26 suites aprobadas, 13 fallidas; 164/185 pruebas aprobadas. |

Las suites completas **no están verdes**. Se ejecutaron antes de adaptar las cuatro regresiones dirigidas indicadas arriba; esas regresiones pasaron por separado después. Quedan pruebas históricas que aún envían `intervaloMinutos`, esperan la cuadrícula anterior o ejercitan descansos/excepciones retirados en T082–T085. También persisten fallos de migración, auditoría y representación de otros módulos ya visibles en la entrega anterior. No se cuentan como éxito.

## Límite de esta entrega

T090 y posteriores deben persistir y leer el fin protegido real de citas y apartados y completar las nuevas reglas públicas de redondeo y selección. El formulario administrativo de `frontend-saas` todavía envía `intervaloMinutos`; su adaptación queda pendiente y el PUT nuevo lo rechaza. M3-I001/M2-I004 siguen diferidas al escritor manual real. No se declara fase cerrada ni producción habilitada.
