# Resultado — ALA-T090–ALA-T093

## Flujo

El lector toma una instantánea transaccional de citas no canceladas y apartados vigentes del mismo negocio y Profesional, sin filtrar sucursal ni servicio. Consulta por `fin_ocupacion_utc` si existe; en filas históricas sin ese campo usa `fin_utc`. Así encuentra una ocupación que empezó y terminó su atención antes del rango, pero cuyo margen protegido aún lo invade. En cada objeto interno conserva ambos extremos: `finUtc` es el fin del servicio y `finOcupacionUtc` es el fin protegido guardado. El futuro redondeo de inicios no modifica este último. Un apartado deja de ocupar al estar liberado o cuando `ahora` alcanza `expiraEn` exactamente.

La proyección de atención ya descuenta descansos y bloqueos. Sobre sus tramos, el constructor de espacios libres une solo los contiguos de la sucursal solicitada y resta las ocupaciones del Profesional de cualquier sucursal hasta su fin protegido. Los intervalos son semiabiertos: una solicitud puede comenzar al terminar una ocupación o acabar justo al empezar un cierre. El motor usa estos huecos para filtrar candidatos; la respuesta mantiene como `finUtc` el fin de atención del servicio. La generación y el redondeo locales de candidatos corresponden a tareas posteriores.

## Archivos

| Archivo agregado o modificado | Qué hace |
| --- | --- |
| `src/disponibilidad/contratos-internos.ts` | Expone en la ocupación interna los extremos separados de atención y protección. |
| `src/disponibilidad/ocupaciones.service.ts` | Lee el fin protegido con compatibilidad histórica, vigencia exacta y comparación de empalmes semiabiertos. |
| `src/disponibilidad/espacios-libres.ts` (nuevo) | Une atención continua de la sede y resta las ocupaciones protegidas de todas las sedes; comprueba cabida en un hueco. |
| `src/disponibilidad/motor-disponibilidad.service.ts` | Usa los espacios libres al filtrar candidatos sin cambiar el fin de servicio devuelto. |
| `src/disponibilidad/espacios-libres.spec.ts` (nuevo) | Prueba los dos extremos, el límite de protección, la continuidad, los cierres y los huecos. |
| `src/disponibilidad/seleccion-compacta.spec.ts` | Actualiza su fixture al contrato de ocupación con fin protegido explícito. |
| `test/ala-t090-t093.integration-spec.ts` (nuevo) | Comprueba lectura persistida entre sedes y servicios, aislamiento, vencimiento exacto y liberación del apartado en base temporal migrada. |
| `docs/ajustes-licencias-administracion-agenda/tareas.md` | Marca T090–T093 y enlaza esta evidencia. |

Los comentarios del código explican el fin histórico, la vigencia, la unión de tramos y los extremos semiabiertos; los fixtures de integración señalan por qué el rango de lectura descubre la separación.

## Tests primero y resultados

Se escribieron las pruebas antes de la implementación. El primer rojo fue `Cannot find module './espacios-libres'`. Después pasaron las pruebas dirigidas del constructor, el comparador y el lector persistido. La prueba del fin 09:42 demuestra que el siguiente inicio puede tratarse por separado sin extender el fin protegido hasta 09:45.

| Comando | Resultado |
| --- | --- |
| `npm test -- --runInBand espacios-libres.spec.ts seleccion-compacta.spec.ts` | 2 suites, 5/5 pruebas aprobadas. |
| `npm run test:integration -- --runInBand ala-t090-t093.integration-spec.ts` | 1 suite, 2/2 pruebas aprobadas. |
| `npm run test:integration -- --runInBand fase-3-t039-t043.integration-spec.ts` | 1 suite, 3/3 pruebas aprobadas; regresión de ocupaciones históricas. |
| `npm run build`, `npm run lint`, `git diff --check` | Aprobados. |
| `npm test -- --runInBand` | 87 suites, 400/400 pruebas aprobadas con acceso a localhost. La primera corrida bajo sandbox dio 3 fallos `EACCES` al abrir el servidor local; la repetición aprobó toda la suite. |
| `npm run test:integration -- --runInBand` | 72 suites aprobadas, 13 fallidas; 361/386 pruebas aprobadas. Los fallos incluyen pruebas con `intervaloMinutos` retirado, llamadas a `guardarExcepcion` retirada, transición histórica de horarios y reversión de una migración con FK. |
| `npm run test:e2e -- --runInBand` | 28 suites aprobadas, 11 fallidas; 166/185 pruebas aprobadas. Los fallos observados corresponden a contratos anteriores de horarios, representación HTTP, auditoría y permisos de otros módulos. |

Las suites completas de integración y HTTP **no están verdes**. Sus fallos se registran como pendientes de reconciliar con los contratos actuales; no se cuentan como cobertura aprobada de este lote. La suite unitaria completa y las regresiones dirigidas sí pasaron.

## Límite de esta entrega

T094 y siguientes definirán el redondeo local y la generación pública final de candidatos; los escritores posteriores capturarán el fin protegido en citas y apartados nuevos. M3-I001/M2-I004 continúan diferidas al escritor manual real. No se declara el portal listo para producción ni la fase cerrada.
