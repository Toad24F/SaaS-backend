# Resultado — ALA-T013–ALA-T018

Revisión base: `5015790`; cambios de esta entrega aún sin commit. RF relacionados: RF-01–RF-15. Estas seis tareas preparan persistencia y restricciones; los servicios de transición, avisos y envío efectivo permanecen en tareas posteriores.

## Flujo y archivos modificados

1. **ALA-T013/T014: contexto de suspensión.** [Licencia](../../../src/licencias/entities/licencia.entity.ts) y [migración de plazo y ciclo](../../../src/database/migrations/1760000036000-PlazoCicloSuspension.ts) añaden `plazo_suspension_dias` anulable con rango 0–30 y `version_suspension` inicial 0. Las fechas, `remanente_ms` y `version_vencimiento` se conservan para que un ciclo de suspensión no sustituya la identidad del vencimiento. Los comentarios junto a las columnas y la migración explican esa separación.
2. **ALA-T015/T016: operación idempotente.** La nueva [entidad OperacionLicencia](../../../src/licencias/entities/operacion-licencia.entity.ts) representa negocio, licencia, actor, clave, acción, huella y resultado JSON reducido. La [migración de operaciones](../../../src/database/migrations/1760000037000-OperacionesLicencia.ts) crea unicidad por negocio/licencia/clave y FK compuesta a la licencia. Una clave repetida en la misma licencia se rechaza; una licencia ajena tampoco puede vincularse. La tabla no guarda cuerpo de correo ni credenciales. Sus comentarios describen la identidad y la pertenencia.
3. **ALA-T017/T018: referencias de avisos.** [EnvioCorreo](../../../src/correos/entities/envio-correo.entity.ts) y la [migración de correo](../../../src/database/migrations/1760000038000-ReferenciasCorreoLicencia.ts) añaden tipos, `umbral_dias`, `version_suspension` y referencia compuesta a operación. El aviso `aviso_vencimiento` anterior permanece válido para datos históricos. Los nuevos preventivos exigen 15 o 7 días; vencimiento usa versión de vencimiento, suspensión usa ciclo, y revocación/reactivación/renovación usan operación. La clave de deduplicación sigue única. El `CHECK` usa `COALESCE(..., 0)` para que una condición SQL indeterminada por `NULL` sea rechazada; la prueba encontró ese fallo antes de la corrección. La reversión de esta migración se niega si existen avisos nuevos, para no perderlos.
4. [db/schema.sql](../../../db/schema.sql) reproduce el DDL de las tres migraciones al final del esquema de instalación; sus comentarios explican el orden y las referencias. [Prueba de metadatos](../../../test/ala-t013-t018-modelo.spec.ts) revisa columnas y tipos sin secretos. [Prueba de integración](../../../test/ala-t013-t018.integration-spec.ts) recorre instalación, actualización con filas previas, límites y tabla de casos de correo; sus comentarios explican el escenario anterior, la restauración de estado y la FK triple.

## Pruebas ejecutadas

| Comando o comprobación | Resultado observado |
| --- | --- |
| `npm test -- --runInBand test/ala-t013-t018-modelo.spec.ts` antes de implementar | Falló como se esperaba: faltaba la entidad de operación. |
| `npm run test:integration -- --runInBand test/ala-t013-t018.integration-spec.ts` antes de implementar | Falló como se esperaba: faltaban migraciones y tabla de operaciones. |
| La misma integración tras el primer `CHECK` de correo | 2/3 pruebas pasaron; una combinación inválida fue aceptada por la lógica ternaria de SQL. Se corrigió el `CHECK` y se repitió. |
| `npm test -- --runInBand test/ala-t013-t018-modelo.spec.ts src/correos/entities/envio-correo.entity.spec.ts src/licencias` | Código 0; 9 suites, 38 pruebas aprobadas, 0 omitidas. |
| `npm run test:integration -- --runInBand test/ala-t013-t018.integration-spec.ts test/avisos-t116-t120.integration-spec.ts test/encolado-correo.integration-spec.ts` | Código 0; 3 suites, 15 pruebas aprobadas, 0 omitidas. Incluye regresión de avisos y encolado anteriores. |
| `npm run test:integration -- --runInBand test/ala-t013-t018.integration-spec.ts` tras añadir caso de referencia ajena | Código 0; 1 suite, 3 pruebas aprobadas, 0 omitidas. |
| `npm run build` y `npm run lint` | Ambos código 0. |
| `migration:show` con `.env` | Solo las tres migraciones 1760000036000–1760000038000 estaban pendientes en `Citas_Saas`. |
| `migration:run` con `.env` | Código 0; aplicó exactamente esas tres migraciones a `Citas_Saas`. |
| Consulta final de solo lectura | Cinco columnas nuevas, tabla `operaciones_licencia` vacía y conteos iguales en las 28 tablas compartidas con `citas`, excluida la tabla de migraciones. El respaldo `citas` conserva cero de estas columnas. |

La tabla de casos de correo acepta diez combinaciones válidas, incluidas las del aviso histórico, y rechaza seis combinaciones inválidas, una clave de aviso duplicada y una operación de otro negocio. La actualización temporal conserva fechas de habilitación, vencimiento y suspensión, remanente, versión anterior y un aviso ya registrado. Los tests escribieron exclusivamente en bases desechables; `Citas_Saas` recibió solo las tres migraciones verificadas.

## Pendientes y límites

No se implementaron todavía el plazo efectivo en los servicios, la idempotencia HTTP, la producción de nuevos trabajos de correo ni sus plantillas o procesamiento. Los tipos nuevos del modelo no acreditan envío real. No hubo cambios de rutas, por lo que no se ejecutó HTTP/e2e. RF-63 y M3-I001/M2-I004 siguen diferidos al escritor manual real. La propuesta documental sigue pendiente de aprobación y estas migraciones no habilitan producción.
