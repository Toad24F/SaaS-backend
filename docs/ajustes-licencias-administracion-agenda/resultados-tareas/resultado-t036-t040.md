# Resultado — ALA-T036–ALA-T040

Revisión base: `3a3e095`; cambios de esta entrega aún sin commit. RF relacionados: RF-01–RF-15. Se completó el **encolado durable** de avisos de licencia. La preparación y entrega de sus mensajes corresponde a ALA-T043; el ciclo periódico a ALA-T045.

## Archivos y flujo

1. [clave-aviso-licencia.ts](../../../src/licencias/services/clave-aviso-licencia.ts) construye la identidad lógica con negocio, licencia y tipo. Los preventivos distinguen versión de vencimiento y umbral 15/7; la suspensión distingue ciclo; las confirmaciones distinguen operación. Su [prueba unitaria](../../../src/licencias/services/clave-aviso-licencia.spec.ts) demuestra claves distintas para eventos distintos y la misma clave al repetir el mismo evento. Los comentarios explican esa separación.
2. [BandejaCorreoService](../../../src/correos/bandeja-correo.service.ts) añade `encolarEventoLicencia` dentro de la transacción del llamador. Guarda referencia, destinatario administrativo, tipo y clave de deduplicación mediante el mecanismo existente; no almacena cuerpo ni envía SMTP. El comentario explica por qué requiere la barrera del negocio y la licencia.
3. [LicenciasService](../../../src/licencias/licencias.service.ts) encola en el mismo commit que licencia, operación y auditoría: `suspension_programada` con plazo positivo; un único `suspension_inmediata` con plazo cero; `suspension_efectiva` al materializar antes de vencer; `licencia_vencida` si el vencimiento precede o coincide con el bloqueo; `suspension_revocada` o `licencia_reactivada` según el instante; y `licencia_renovada` para una operación nueva. Usa el correo administrativo del negocio bloqueado. Descarta solo trabajos aún pendientes, fallidos o tomados que la transición vuelve incompatibles. Revocar un bloqueo pendiente conserva la versión del vencimiento natural, para no descartar su aviso si la licencia ya venció. Los comentarios explican la prioridad y la conservación del historial entregado.
4. [AvisosVencimientoService](../../../src/licencias/services/avisos-vencimiento.service.ts) añade `detectarLimites(ahora)`: relee bajo bloqueos de negocio y licencia, encola una vez el vencimiento natural y retira el aviso de bloqueo futuro si corresponde. No emite un vencimiento nuevo si la suspensión efectiva ocurrió antes. Su comentario explica el orden de exclusión y la prioridad temporal.
5. [ProcesadorCorreoService](../../../src/correos/procesador-correo.service.ts) selecciona por ahora solo los tipos que ya sabe preparar. Los nuevos avisos permanecen pendientes hasta que ALA-T043 implemente sus plantillas y validación final; así no se descartan por la lógica antigua ni se envía un mensaje equivocado. El comentario señala esta dependencia.
6. [ala-t036-t040.integration-spec.ts](../../../test/ala-t036-t040.integration-spec.ts) crea bases desechables y verifica filas finales, deduplicación, plazos, límites antes/en/después, descarte de pendientes, renovación vigente/vencida/suspendida, ausencia de SMTP prematuro y rollback si falla el encolado. Sus comentarios describen los límites y el procesador previo.
7. [tareas.md](../tareas.md) marca T036–T040 y enlaza esta evidencia.

## Pruebas y resultados

| Comando o comprobación | Resultado observado |
| --- | --- |
| `npm test -- --runInBand src/licencias/services/clave-aviso-licencia.spec.ts` antes de implementar | Falló como se esperaba: no existía el generador de claves. |
| `npm run test:integration -- --runInBand test/ala-t036-t040.integration-spec.ts` antes de implementar | 10/10 casos fallaron: no había filas de aviso ni detector de límites. Se corrigió además una fecha inválida del fixture de licencia vencida. |
| La misma suite después de añadir la prueba del procesador antiguo | 1 fallo y 10 aprobadas: el procesador descartaba el nuevo aviso. Después del filtro pasó 11/11. |
| La misma suite después de añadir revocación posterior al vencimiento y rollback | 1 fallo y 12 aprobadas: la revocación descartaba el aviso natural. Tras corregir la versión, pasó 13/13. |
| `npm test -- --runInBand src/licencias src/correos` | 12 suites, 51/51 pruebas aprobadas, 0 omitidas. Incluye deduplicación nueva y regresión de licencia y correo. |
| `npm run test:integration -- --runInBand test/ala-t036-t040.integration-spec.ts test/ala-t028-t034.integration-spec.ts test/licencias-reintentos.integration-spec.ts test/encolado-correo.integration-spec.ts test/envios-correo.integration-spec.ts test/procesador-correo.integration-spec.ts` | 6 suites, 53/53 pruebas aprobadas, 0 omitidas. Comprueba persistencia, rollbacks, reintentos y bandeja existente. |
| `npm run test:e2e -- --runInBand test/ala-t035.e2e-spec.ts test/licencias-t50.e2e-spec.ts test/licencias-vigencia-t051-t057.e2e-spec.ts test/envios-correo.e2e-spec.ts test/recorridos-t51-t58-t60.e2e-spec.ts` | 5 suites, 28/28 pruebas aprobadas, 0 omitidas. Verifica rutas de licencia, vigencia y correo existentes. Los mensajes `ERROR` de Nest corresponden a fallos inyectados y esperados por T50; el proceso terminó en código 0. |
| `npm run build`, `npm run lint`, `git diff --check` | Código 0; sin errores de compilación, lint ni espacios conflictivos. |

Las pruebas con escritura usaron bases desechables; no se aplicaron migraciones ni se escribieron datos de prueba en `Citas_Saas` o `citas`. No se llamó a SMTP al encolar. El plazo y bloqueo permanecen en la licencia referenciada por el aviso; el mensaje aún no se materializa ni se almacena.

## Pendientes y límites

ALA-T041–T042 actualizarán la selección de preventivos de 15/7 días; ALA-T043 preparará mensajes y comprobará que ciclo, versión, operación y destinatario sigan vigentes antes de SMTP. Hasta entonces los tipos nuevos quedan pendientes y **no se entregan por correo**. ALA-T045 incorporará el detector al ciclo periódico. No se declara la fase cerrada ni producción habilitada. M3-I001/M2-I004 y RF-63 siguen diferidos al escritor manual real.
