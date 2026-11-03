# Resultado — ALA-T102–ALA-T109

Fecha: 2 de noviembre de 2026.

## Flujo implementado

Al conceder un apartado, el escritor bloquea los recursos y revalida el inicio con el motor. Esa misma lectura entrega modo y tiempo entre citas. El apartado guarda ambos, la versión 1 de reglas, el fin de atención, el fin protegido, costo, zona, sesión, generación y vencimiento original de cinco minutos. El navegador no decide esos valores.

Al registrar la cita, el escritor identifica el apartado propio por negocio, sesión, hash, combinación, extremos, zona y vigencia. Excluye únicamente esa ocupación de la lectura y usa su separación guardada para revisar la atención y los empalmes actuales. No exige que el inicio apartado siga siendo el primero de Compacta ni que pertenezca a la secuencia de una configuración cambiada. Continúa comprobando licencia, oferta, horario, bloqueos, anticipación, horizonte, inicio pasado y duración/zona compatibles. Una concesión nueva sí exige pertenecer a los candidatos actuales.

Cliente, cita pendiente, liberación del apartado, puntero de sesión y resultado del intento se confirman en un solo commit. La cita copia el ID de apartado de origen, la separación y el fin protegido originales; conserva su fin de atención separado. Una clave repetida devuelve la misma cita y folio. La restricción única por negocio y apartado impide otro origen. La lectura de citas afectadas compara horario y bloqueos con el fin protegido histórico, usando `fin_utc` solo para filas anteriores sin ese dato; recalcula causas sin modificar citas.

El reemplazo mantiene dos transacciones durables: si falla el nuevo horario, el anterior queda liberado. El vencimiento exacto y un fallo de registro no amplían ni reviven el apartado. Las pruebas inyectan errores tras insertar cliente, tras insertar cita y al consumir el apartado; cada fallo revierte todo el commit y permite reintentar con la misma clave.

## Archivos agregados o modificados

| Archivo | Qué hace |
| --- | --- |
| `src/disponibilidad/motor-disponibilidad.service.ts` | Devuelve al escritor las reglas de la misma instantánea; distingue la validación de un apartado propio de la selección nueva. Sus comentarios explican qué se preserva y qué restricciones actuales se releen. |
| `src/reservas-publicas/apartados.service.ts` | Guarda modo, versión, separación y fin protegido junto con los datos existentes del apartado sin tocar su plazo. El comentario explica por qué proceden de la revalidación del servidor. |
| `src/reservas-publicas/registro-reserva-publica.service.ts` | Exige contexto capturado y copia origen, separación y fin protegido a la cita dentro del commit existente. Los comentarios explican la conservación histórica. |
| `src/disponibilidad/citas-afectadas.service.ts` | Evalúa atención, descansos y bloqueos hasta el fin protegido histórico, con compatibilidad para citas antiguas. El comentario explica por qué no usa la configuración actual. |
| `test/ala-t102-t109.integration-spec.ts` (nuevo) | Siembra bases migradas desechables y reloj controlado; verifica captura, consumo propio, cambios posteriores, causas, vencimiento, reemplazo y rollback con disparadores SQL. Los comentarios describen las barreras lógicas y las filas que deben permanecer. |
| `docs/ajustes-licencias-administracion-agenda/tareas.md` | Marca T102–T109 y enlaza esta evidencia. |
| `docs/ajustes-licencias-administracion-agenda/resultados-tareas/resultado-t102-t109.md` | Conserva flujo, cambios, pruebas y resultados del lote. |

No se agregaron columnas ni se editaron migraciones: las entidades y la migración de extremos protegidos ya contenían los campos necesarios.

## Tests primero y resultados

Las 11 pruebas de integración se escribieron antes de modificar producción. La primera corrida dio **8 fallos y 3 aprobaciones**: mostró condiciones nulas en el apartado, rechazo del consumo al reaparecer un horario anterior, ausencia del fin protegido/origen en la cita y una afectación no detectada. Una expectativa del test sobre licencia vencida se corrigió de 409 a 404, que es el estado de la entrada actual. Tras los cambios, los 11 casos pasaron. Luego se amplió T106 para inhabilitar realmente el servicio y T107 para bloquear solo el margen protegido; volvieron a pasar 11/11.

| Comando | Resultado |
| --- | --- |
| `npm run test:integration -- --runInBand ala-t102-t109.integration-spec.ts` | 1 suite, 11/11 pruebas aprobadas. Incluye tres fallos SQL inyectados con comprobación de clientes, citas, apartado e intento finales. |
| `npm run test:integration -- --runInBand fase-4-t074-t079.integration-spec.ts` | 1 suite, 7/7 pruebas aprobadas; regresión del escritor y su idempotencia. |
| `npm run test:e2e -- --runInBand ala-t098-t101.e2e-spec.ts ala-t071-t074.e2e-spec.ts` | 2 suites, 6/6 pruebas aprobadas; regresión HTTP de oferta pública y citas afectadas. |
| `npm test -- --runInBand` | 89 suites, 410/410 pruebas aprobadas con acceso a puertos locales. |
| `npm run build`, `npm run lint`, `git diff --check` | Aprobados. |

La integración completa conserva fallos anteriores documentados de expectativas incompatibles y no se volvió a ejecutar en este lote; las suites de integración y HTTP pertinentes al cambio sí terminaron en verde. T110 inicia el cupo telefónico. M3-I001/M2-I004 sigue diferida al escritor manual real. No se declara producción habilitada ni fase cerrada.
