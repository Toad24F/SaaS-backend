# Resultado M1-T025–M1-T027 — bandeja y transporte controlado

Fecha: 2026-09-27. Se definió el registro durable de envíos, su migración incremental y el contrato del transporte. La bandeja conserva identidad, destinatario, referencia de dominio, deduplicación, estado, intentos, fecha de próximo intento y arrendamiento. No tiene columnas de cuerpo, contraseña ni código utilizable. El transporte de pruebas solo simula resultados en memoria y nunca abre una conexión de correo.

## Flujo preparado

1. Una operación futura creará un envío lógico con `clave_dedupe`, negocio, destinatario y **una** referencia: código de activación/recuperación o licencia con versión de vencimiento. La clave única impide crear dos filas para el mismo envío.
2. La fila comienza `pendiente`, con cero intentos y fecha de próximo intento. Un procesador futuro la tomará con token y vencimiento de arrendamiento; eso permitirá recuperar el trabajo si cae antes de terminar.
3. El procesador futuro revalidará la referencia, construirá el mensaje transitoriamente y llamará a `TransporteCorreo`. El adaptador controlado permite probar aceptación, rechazo o timeout sin red. El mensaje y cualquier código quedan solo en memoria durante la llamada.
4. T029–T033 conectarán el encolado transaccional, la toma concurrente, la reconstrucción del código, los reintentos y el registro sanitizado del resultado. T028 aportará un transporte real. Esta entrega define y prueba la estructura y el contrato; todavía no envía correos.

## Archivos y función

| Archivo | Qué hace |
| --- | --- |
| [`envio-correo.entity.ts`](../../../src/correos/entities/envio-correo.entity.ts) | Define tipos, estados, referencias excluyentes, deduplicación, intentos, próxima ejecución, arrendamiento y confirmación. Las relaciones compuestas obligan a que código o licencia pertenezcan al negocio. Los comentarios explican por qué no se persiste el contenido y para qué sirve cada bloque. |
| [`BandejaCorreo`](../../../src/database/migrations/1760000008000-BandejaCorreo.ts) | Crea `envios_correo`, sus FK, índices y checks; añade una clave compuesta en códigos para la FK de negocio. La reversión retira solo este tramo nuevo. |
| [`schema.sql`](../../../db/schema.sql) | Refleja la novena migración en el SQL de referencia, sin reescribir las migraciones históricas. |
| [`codigo-acceso.entity.ts`](../../../src/codigos/entities/codigo-acceso.entity.ts) | Declara la clave única `(negocioId, id)` usada por la referencia compuesta de la bandeja. |
| [`transporte-correo.ts`](../../../src/correos/transporte-correo.ts) | Declara el mensaje transitorio y la interfaz de entrega que implementarán los adaptadores. |
| [`transporte-correo-controlado.ts`](../../../src/correos/transporte-correo-controlado.ts) | Simula aceptación, rechazo y timeout en orden programado; captura copias de los intentos solo en memoria. Sus comentarios explican la copia y la ausencia de red. |
| [`correos.module.ts`](../../../src/correos/correos.module.ts) | Aclara que definir entidad y contrato no inicia aún un ejecutor de envíos. |
| [`envio-correo.entity.spec.ts`](../../../src/correos/entities/envio-correo.entity.spec.ts), [`transporte-correo-controlado.spec.ts`](../../../src/correos/transporte-correo-controlado.spec.ts) y [`envios-correo.integration-spec.ts`](../../../test/envios-correo.integration-spec.ts) | Comprueban metadatos sin cuerpo, resultados del transporte, deduplicación, persistencia tras reconectar, FK entre negocios, checks y aviso por versión. |
| [`schema-fase-2.spec.ts`](../../../src/database/schema-fase-2.spec.ts), [`identidad-fase-2.integration-spec.ts`](../../../test/identidad-fase-2.integration-spec.ts), [`instalacion-t61.integration-spec.ts`](../../../test/instalacion-t61.integration-spec.ts) y [`codigos-fase-2.integration-spec.ts`](../../../test/codigos-fase-2.integration-spec.ts) | Verifican coherencia del SQL, nueve migraciones y la reversión/reinstalación de tramos dependientes. |
| [`tareas-modulo-1.md`](../tareas-modulo-1.md) | Marca T025–T027 como hechas y enlaza esta evidencia. |

## Tests primero y verificaciones

Las primeras pruebas fallaron porque no existían la entidad ni el adaptador y solo había ocho migraciones. Tras implementar, las pruebas focalizadas de entidad, transporte y SQL pasaron **8/8**; las de integración relacionadas pasaron **12/12**. Se añadió además un caso que acepta el aviso de una licencia propia y rechaza la referencia ajena y la versión cero.

Resultado final: `npm test -- --runInBand` **201/201, 42 suites**; `npm run test:integration -- --runInBand` **85/85, 21 suites**; `npm run test:e2e -- --runInBand` **93/93, 9 suites**. `npm run build` y `npm run lint` pasaron. Los mensajes `ERROR` de e2e corresponden a fallos inyectados para comprobar rollback; Jest terminó con código 0.
