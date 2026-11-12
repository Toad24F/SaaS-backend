# Resultado — ALA-T019–ALA-T022

Revisión base: `2b951b8`; cambios de esta entrega aún sin commit. RF relacionados: RF-39–RF-48 y RF-54. Estas cuatro tareas preparan persistencia; el nuevo cálculo y los escritores se integrarán después.

## Archivos y flujo

1. **ALA-T019/T020.** [ConfiguracionAgenda](../../../src/disponibilidad/entities/configuracion-agenda.entity.ts) declara `tiempo_entre_citas_minutos` con valor inicial cero y rango 0–60 en múltiplos de cinco. La [migración de separación](../../../src/database/migrations/1760000039000-SeparacionAgenda.ts) añade la columna sin copiar `intervalo_minutos`: modo, anticipación, horizonte e intervalo heredado permanecen. El código comenta por qué el valor nuevo inicia en cero. La retirada del intervalo del contrato y del motor se hará en tareas posteriores; esta tarea solo establece persistencia.
2. **ALA-T021/T022, citas.** [Cita](../../../src/disponibilidad/entities/cita.entity.ts) distingue `fin_utc` de atención y `fin_ocupacion_utc` protegido, junto con `separacion_minutos`. La [migración de extremos](../../../src/database/migrations/1760000040000-ExtremosProtegidos.ts) asigna separación cero y copia `fin_utc` al fin protegido de citas previas. El `CHECK` exige fin protegido exactamente igual a fin de atención más separación, sin sumar redondeo. El campo protegido admite nulo temporalmente para que el escritor anterior siga operando mientras se sustituye; no se acredita todavía ocupación protegida del escritor nuevo.
3. **ALA-T021/T022, apartados.** [BloqueoTemporal](../../../src/disponibilidad/entities/bloqueo-temporal.entity.ts) incorpora separación, fin protegido, modo capturado y versión de reglas anulables. La migración deja los cuatro campos nulos en apartados antiguos porque su contexto de concesión no se puede inferir. Para datos nuevos, los checks exigen que se guarden juntos, con separación válida y fin exacto. Los comentarios explican el tratamiento del legado y la captura futura.
4. [db/schema.sql](../../../db/schema.sql) reproduce ambas migraciones y documenta la secuencia de instalación. [La prueba de metadatos](../../../test/ala-t019-t022-modelo.spec.ts) comprueba nombres, defaults y nulabilidad. [La prueba de integración](../../../test/ala-t019-t022.integration-spec.ts) retrocede una base temporal al esquema previo, crea datos, actualiza y verifica los resultados; su comentario indica por qué se prepara el estado anterior.

## Pruebas y resultados

| Comando o comprobación | Resultado observado |
| --- | --- |
| `npm test -- --runInBand test/ala-t019-t022-modelo.spec.ts` antes de implementar | Falló como se esperaba: faltaban columnas y metadatos. |
| `npm run test:integration -- --runInBand test/ala-t019-t022.integration-spec.ts` antes de implementar | Falló como se esperaba: faltaban las migraciones y la nueva columna. |
| `npm test -- --runInBand test/ala-t019-t022-modelo.spec.ts src/disponibilidad/configuracion-agenda.validador.spec.ts src/disponibilidad` | Código 0; 6 suites, 18 pruebas aprobadas, 0 omitidas. Incluye regresión de configuración y motor actuales. |
| `npm run test:integration -- --runInBand test/ala-t019-t022.integration-spec.ts test/fase-3-t005-t010.integration-spec.ts test/fase-4-t074-t079.integration-spec.ts` | Código 0; 3 suites, 12 pruebas aprobadas, 0 omitidas. Bases desechables; verifica actualización desde datos previos, límites 0/5/60, rechazo de -5/7/65, fin exacto, contexto completo y regresión del escritor público vigente. |
| `npm run build` y `npm run lint` | Ambos código 0. |
| `migration:show` con `.env` | Solo las migraciones 1760000039000 y 1760000040000 estaban pendientes en `Citas_Saas`. |
| `migration:run` con `.env` | Código 0; aplicó esas dos migraciones a `Citas_Saas`. |
| Consulta final de solo lectura | Siete columnas nuevas; 7/7 citas previas con separación cero y fin protegido igual al fin de atención; 15/15 apartados previos con los cuatro campos de contexto nulos. Conteos iguales en 28 tablas compartidas; `citas` conserva cero columnas nuevas. |

Las pruebas de integración inspeccionaron filas finales, no solo la respuesta del migrador. No se usaron datos de prueba en `Citas_Saas`; únicamente recibió las dos migraciones verificadas. No hubo pruebas omitidas en las suites aprobadas.

## Pendientes y límites

El motor y los escritores actuales siguen usando el intervalo anterior y todavía no protegen la separación nueva. Los servicios, contratos HTTP y la captura obligatoria del fin protegido pertenecen a tareas posteriores; hasta entonces una cita escrita por el escritor anterior puede tener `fin_ocupacion_utc` nulo. RF-63 y M3-I001/M2-I004 continúan diferidos al escritor manual real. Estas migraciones no habilitan producción ni cierran la fase.
