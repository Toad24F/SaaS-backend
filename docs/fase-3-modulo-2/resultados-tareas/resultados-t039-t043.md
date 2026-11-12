# Resultados M2-T039–M2-T043 — lectura de ocupaciones

## Qué se hizo y cómo fluye

`src/disponibilidad/ocupaciones.service.ts` añade el lector interno de citas y apartados. Recibe el contexto autorizado del Profesional, una transacción activa, el instante ya capturado y un rango UTC semiabierto. Consulta **todas** las sucursales y servicios de ese Profesional dentro del negocio: una ocupación entra si `inicio_utc < hasta` y `fin_utc > desde`, aun si empezó antes del rango o corresponde a otro día local. Las citas con estado distinto de `cancelada` ocupan con sus extremos guardados; no se recalcula el fin con la duración actual del servicio. Un apartado ocupa solo si `liberado_en IS NULL` y `expira_en > ahora`. La proyección común conserva tipo, ID, negocio, Profesional, sucursal, servicio y extremos; añade estado o vigencia según la fuente, sin cargar cliente ni `titular_hash`. `ocupacionesQueSeEmpalman` comprueba los mismos extremos UTC y permite límites contiguos.

Flujo: **contexto autorizado y transacción → rango UTC → citas no canceladas + apartados vigentes al mismo instante → proyección común ordenada → comprobación de empalme UTC por el motor**. El lector falla si se invoca sin transacción o con intervalo inválido; no devuelve una agenda vacía ante un fallo técnico. La composición en `src/disponibilidad/ocupaciones.module.ts` registra y exporta este lector para la siguiente etapa del motor. No añade controladores ni escritores de reservas.

`src/config/database.config.ts` fija UTC para la conexión de producción, igual que la de pruebas, para que los `DATETIME` canónicos se serialicen e hidraten como instantes UTC sin depender de la zona del proceso. `src/disponibilidad/base-fase-3.spec.ts` actualiza la expectativa de composición: ahora hay un lector en el módulo de ocupaciones, pero sigue sin controladores. `test/fase-3-t039-t043.integration-spec.ts` contiene los casos de MariaDB migrada y desechable. `docs/fase-3/tareas.md` marca como terminadas T039–T043.

## Tests primero y resultados

Se creó primero la integración. Antes del servicio, la prueba falló por el módulo inexistente; una vez implementado, los tres casos ejecutaron contra MariaDB. Un ajuste de la aserción de `COUNT(*)` fue necesario porque el driver entrega ese agregado como texto. La suite unitaria detectó además una expectativa histórica de módulo vacío y se actualizó a la composición vigente.

Los casos nuevos comprueban los cuatro estados ocupantes y la exclusión de `cancelada`; una cita que empieza antes del rango y lo atraviesa; aislamiento por negocio; apartados vigentes un milisegundo antes del vencimiento, vencidos en el instante exacto y liberados explícitamente sin borrar filas; ausencia de titular y cliente en la proyección; ocupación de otra sucursal y servicio con fechas locales distintas pero empalme UTC; límite contiguo; y que cambiar la duración del servicio de 30 a 45 minutos no modifica el fin de una cita persistida.

Resultado final del 15 de octubre de 2026:

| Verificación | Resultado |
| --- | --- |
| `npm run build` | Pasó |
| `npm run lint` | Pasó |
| `npm test -- --runInBand` | 62 suites, 321 pruebas aprobadas |
| `npm run test:integration -- --runInBand test/fase-3-t039-t043.integration-spec.ts` | 1 suite, 3 pruebas aprobadas |
| `npm run test:integration -- --runInBand` | 53 suites, 242 pruebas aprobadas |

La instalación local requirió `npm ci --legacy-peer-deps` porque `@nestjs/throttler@6.5.0` declara compatibilidad de pares hasta Nest 11 y el proyecto usa Nest 12. No se modificó el lockfile. La lectura ya está lista como colaborador, pero su conexión con configuración, oferta, atención y el cálculo completo corresponde a M2-T044 y posteriores; los escritores reales de citas y apartados siguen fuera de este tramo.
