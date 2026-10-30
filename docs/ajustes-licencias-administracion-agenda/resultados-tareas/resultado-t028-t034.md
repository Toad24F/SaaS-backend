# Resultado — ALA-T028–ALA-T034

Revisión base: `e513929`; cambios de esta entrega aún sin commit. RF relacionados: RF-03–RF-15. Se implementaron y probaron las transiciones del servicio; el contrato HTTP con cabecera obligatoria pertenece a ALA-T035.

## Archivos y flujo

1. [Validador de operación](../../../src/licencias/dto/operacion-licencia.dto.ts) convierte el plazo omitido a dos días, acepta enteros de 0 a 30 y verifica claves opacas ASCII de 16 a 64 caracteres. Su [prueba unitaria](../../../src/licencias/dto/operacion-licencia.dto.spec.ts) cubre extremos y entradas inválidas. Los comentarios explican la normalización anterior al cálculo idempotente.
2. [LicenciasService](../../../src/licencias/licencias.service.ts) usa el plazo validado para programar el bloqueo, registra el ciclo de suspensión y conserva el plazo mientras está pendiente. Dentro de una transacción `READ COMMITTED`, bloquea actor, negocio y licencia, busca la clave y compara acción y huella de parámetros. Una repetición compatible devuelve el resultado histórico reducido; una clave incompatible o un segundo plazo produce 409. Guarda licencia, auditoría y operación en un solo commit. La renovación con clave nueva suma otro año calendario; renovar durante suspensión conserva el bloqueo. La revocación pendiente no desplaza el vencimiento y la reactivación efectiva suma el remanente congelado al instante de retorno. Los comentarios señalan el orden de bloqueo, las decisiones de plazo y el contenido limitado del resultado.
3. [Prueba de integración](../../../test/ala-t028-t034.integration-spec.ts) crea bases desechables, ejercita el servicio contra tablas reales y consulta filas finales de licencia, operaciones y auditoría. Comprueba reconocimiento, conflictos, anualidades, plazos 0/2/30, licencia no habilitada, prioridad temporal antes/en/después de vencimiento, revocación y remanente al reactivar. Los comentarios explican los datos y las referencias temporales.
4. [tareas.md](../tareas.md) marca únicamente T028–T034 y enlaza esta evidencia.

## Pruebas y resultados

| Comando o comprobación | Resultado observado |
| --- | --- |
| `npm test -- --runInBand src/licencias/dto/operacion-licencia.dto.spec.ts` antes de implementar | Falló como se esperaba: faltaba el validador. |
| `npm run test:integration -- --runInBand test/ala-t028-t034.integration-spec.ts` antes de implementar | 7 fallos y 3 aprobadas: faltaban reconocimiento, plazo persistido y bloqueo de plazo cero. |
| `npm test -- --runInBand src/licencias` | 8 suites, 36/36 pruebas aprobadas, 0 omitidas. Incluye validación nueva y regresión de política de acceso, calendario y servicio. |
| `npm run test:integration -- --runInBand test/ala-t028-t034.integration-spec.ts test/licencias-reintentos.integration-spec.ts` | 2 suites, 15/15 pruebas aprobadas, 0 omitidas. Verifica operaciones durables y regresión de reintentos transaccionales. |
| `npm run test:integration -- --runInBand test/ala-t028-t034.integration-spec.ts` después del caso adicional de licencia pendiente | 1 suite, 11/11 pruebas aprobadas, 0 omitidas. |
| `npm run test:e2e -- --runInBand test/licencias-t50.e2e-spec.ts test/licencias-vigencia-t051-t057.e2e-spec.ts` | 2 suites, 17/17 pruebas aprobadas, 0 omitidas. Ejercita las rutas HTTP vigentes y la consulta de vigencia. Los mensajes `ERROR` de Nest provienen de casos que inyectan fallos intencionales y esperan su respuesta; la suite terminó en código 0. |
| `npm run build` y `npm run lint` | Ambos código 0. |

Las suites de integración y HTTP usaron bases desechables; esta entrega no aplicó migraciones ni escribió datos de prueba en `Citas_Saas` o `citas`.

## Pendientes y límites

La cabecera `Idempotency-Key` aún no es obligatoria en las rutas actuales: ALA-T035 conectará el contrato HTTP al reconocimiento ya implementado. Los correos de suspensión, vencimiento, revocación, reactivación y renovación, incluida su deduplicación, pertenecen a tareas posteriores. Las verificaciones M3-I001/M2-I004 y RF-63 siguen diferidas al escritor manual real. Esta entrega no cierra la fase ni habilita producción.
