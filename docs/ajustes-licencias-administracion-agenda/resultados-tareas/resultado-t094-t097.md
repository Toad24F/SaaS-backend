# Resultado — ALA-T094–ALA-T097

Fecha: 2 de noviembre de 2026.

## Flujo implementado

El generador recibe los espacios libres ya descontados por atención, bloqueos y ocupaciones protegidas. Para cada hueco toma el límite mayor entre su inicio y el instante del servidor más la anticipación. Convierte ese límite a la hora civil IANA de la sucursal y busca el siguiente minuto múltiplo de cinco que se resuelva en un único instante UTC. Descarta horas locales inexistentes o repetidas durante cambios de hora. El redondeo solo mueve el próximo inicio: no cambia el fin de atención ni el fin protegido de la ocupación anterior.

Agenda Libre ofrece el primer inicio que admite servicio más separación dentro del hueco y avanza desde ese inicio por duración más separación; vuelve a redondear antes de probar el siguiente. El resultado informa el fin de atención sin incluir separación. Se comparan inicios y cabida en UTC, de modo que las ocupaciones entre sucursales de distintas zonas siguen respetando los mismos instantes reales. Se filtran fechas civiles locales por rango solicitado y horizonte inclusivo; una consulta puede cubrir como máximo 31 fechas inclusivas.

Este generador es una pieza independiente. ALA-T100 conectará la generación y la validación de apartados al motor compartido después de implementar la selección de Agenda Compacta en T098–T099. Por ello las rutas HTTP todavía no ofrecen la nueva secuencia.

## Archivos agregados o modificados

| Archivo | Qué hace |
| --- | --- |
| `src/disponibilidad/candidatos-libres.ts` (nuevo) | Redondea un instante al siguiente múltiplo civil válido de cinco minutos; genera todas las opciones de Agenda Libre desde los espacios libres con duración, separación, anticipación, horizonte y rango. Sus comentarios explican la conversión local, la omisión de horas DST y la separación entre inicio redondeado y protección real. |
| `src/disponibilidad/candidatos-libres.spec.ts` (nuevo) | Prueba límites exactos, segundos, cambios de hora, conversión UTC entre zonas, avance por duración y separación, anticipación, horizonte y 31 fechas inclusivas. Los nombres y comentarios describen las transiciones civiles que se ejercitan. |
| `docs/ajustes-licencias-administracion-agenda/tareas.md` | Marca únicamente ALA-T094–T097 y enlaza esta evidencia. |
| `docs/ajustes-licencias-administracion-agenda/resultados-tareas/resultado-t094-t097.md` | Documenta el flujo, los archivos, el orden de pruebas y los resultados. |

No se modificaron entidades, migraciones, esquema, servicios HTTP ni escritores.

## Tests primero y resultado

Se añadió `candidatos-libres.spec.ts` antes del generador. La primera corrida falló porque `./candidatos-libres` todavía no existía. Tras implementarlo, seis casos pasaron y uno reveló un error en el dato de prueba: el hueco acababa a las 10:45 y una atención iniciada a las 10:15 con duración 32 terminaba a las 10:47. Se amplió el hueco de prueba a las 10:50, sin modificar la lógica, y los siete casos pasaron.

| Verificación | Resultado |
| --- | --- |
| `npm test -- --runInBand candidatos-libres.spec.ts` | 1 suite, 7/7 pruebas aprobadas. |
| `npm test -- --runInBand` | 88 suites, 407/407 pruebas aprobadas con acceso a puertos locales. Una primera ejecución restringida dio 3 fallos `EACCES` al conectar con puertos locales en una suite HTTP existente; la repetición aprobó completa. |
| `npm run test:integration -- --runInBand ala-t090-t093.integration-spec.ts` | 1 suite, 2/2 pruebas aprobadas en MariaDB desechable; confirma los espacios libres que consume el generador. |
| `npm run build` | Aprobado. |
| `npm run lint` | Aprobado. |
| `git diff --check` | Aprobado. |

La suite HTTP no tiene un caso directamente aplicable todavía porque T100 conectará este generador a la consulta y concesión públicas. No se declara habilitación de producción ni cierre de fase. M3-I001/M2-I004 continúa diferida al escritor manual real.
