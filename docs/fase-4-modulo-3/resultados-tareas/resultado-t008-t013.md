# Resultado M3-T008–T013

Fecha: 18 de octubre de 2026. Este lote añade seis migraciones incrementales. No abre endpoints ni escritores públicos. Las relaciones circulares y referencias compuestas restantes son M3-T014; las entidades TypeORM y `db/schema.sql` se sincronizan en M3-T015–T021.

## Archivos modificados y función

| Archivo | Qué hace |
| --- | --- |
| `1760000026000-SesionesReservaPublica.ts` | Crea la sesión anónima por negocio con `titular_hash` único, generación, puntero anulable al apartado y fechas. No guarda la cookie utilizable. |
| `1760000027000-OperacionesApartado.ts` | Registra una clave única por negocio y sesión, selección, generación y resultado de cada operación de apartado. |
| `1760000028000-ContextoApartadosPublicos.ts` | Añade costo decimal exacto, zona, sesión, generación y operación a apartados existentes; los campos quedan nulos en filas anteriores. |
| `1760000029000-TelefonosCompartidos.ts` | Cambia solo el índice negocio/teléfono de clientes a no único; conserva la identidad por ID y las referencias existentes. |
| `1760000030000-HistoriaCitasPublicas.ts` | Añade costo aceptado, contacto y nombres del resumen a citas. El historial anterior queda con valores desconocidos (`NULL`). |
| `1760000031000-IntentosReservaPublica.ts` | Crea intentos con estados `preparado`, `registrado` y `no_registrado`; impone unicidad de clave por sesión y cita no nula. |
| `test/fase-4-t008-t013.integration-spec.ts` | Prueba esquema, unicidad, actualización desde fase 3, conservación de datos, teléfono compartido e intentos terminales. |
| `test/fase-3-t005-t010.integration-spec.ts` | Actualiza una expectativa histórica: ahora comprueba que dos clientes pueden compartir teléfono sin cambiar el nombre del primero. |
| `test/identidad-fase-2.integration-spec.ts` | Comprueba que la migración histórica de identidad conserva su posición sin exigir un total fijo de migraciones. |
| `test/envios-correo.integration-spec.ts` | Compara el historial aplicado con las migraciones descubiertas; mantiene la prueba de la bandeja. |
| `test/instalacion-t61.integration-spec.ts` | Comprueba que la aplicación no reaplica migraciones, usando el total descubierto en vez de 26. |
| `test/instalacion-t126-t127.integration-spec.ts` | Actualiza solo la aserción de recuento; conserva íntegra la comparación de `db/schema.sql` que aún detecta la sincronización pendiente. |
| `docs/fase-4-modulo-3/tareas.md` | Marca solo M3-T008–T013 una vez verificadas. |

## Flujo de datos preparado

1. La futura inicialización pública derivará un hash de la credencial de navegador y localizará la sesión dentro del negocio resuelto. `generacion` y `apartado_actual_id` permitirán coordinar pestañas sin convertir teléfono ni IP en identidad.
2. Una operación de apartado llevará clave propia de la sesión, huella de selección, combinación de Profesional/sucursal/servicio, fecha local y generación. Su estado y causa pública permitirán repetirla sin conceder un segundo apartado. La FK circular al apartado se añade en T014.
3. El apartado existente conservará intervalo UTC, expiración y titular original. Los nuevos apartados podrán guardar costo aceptado, zona y contexto de sesión/operación; los anteriores siguen ocupando mientras sean vigentes aunque esos campos sean nulos.
4. El teléfono podrá repetirse. Cada nueva reserva conservará su cliente por ID y copiará en la cita el contacto, costo y nombres del resumen; una edición posterior del catálogo no tendrá que reconstruir esos datos. Las citas anteriores no reciben valores inventados.
5. Un intento de envío quedará identificado dentro de la sesión, con apartado, huella de formulario y resultado terminal. El índice de cita no nula impedirá asociar una cita a dos intentos. Los escritores y la recuperación que aplican estos contratos se implementan después de T014.

## Pruebas ejecutadas

La prueba nueva se ejecutó primero y falló porque faltaba `sesiones_reserva_publica`; después de implementar, pasó. Usa `conBaseMigrada` para crear y eliminar un esquema MariaDB aleatorio y desechable.

| Caso | Qué comprueba |
| --- | --- |
| Sesiones | Columnas, ausencia de token, generación inicial, puntero nulo y unicidad del hash dentro del negocio. |
| Operaciones | Clave duplicada rechazada en la misma sesión, reutilización permitida en otra sesión y estado inicial. |
| Actualización | Retrocede solo las seis migraciones, siembra datos de fase 3 y vuelve a migrar; compara IDs, nombres, teléfonos, folios, estados, intervalos, expiraciones y hashes. Comprueba campos históricos nulos, segundo cliente con teléfono compartido e importes decimales exactos. |
| Intentos | Clave duplicada rechazada, estados inicial y terminal, y una cita no nula asignable a un solo intento. |

| Comando | Resultado |
| --- | --- |
| `npm run build` | Aprobado, salida 0. |
| `npm run lint` | Aprobado, salida 0 tras los últimos cambios. |
| `npm test -- --runInBand` | **65 suites y 329 pruebas aprobadas**. |
| `npm run test:integration -- --runInBand fase-4-t008-t013` | **1 suite y 4 pruebas aprobadas** tras la implementación. |
| `npm run test:integration -- --runInBand` | **56 suites aprobadas, 4 fallidas; 261 pruebas aprobadas, 4 fallidas** en la primera ejecución completa. Tres fallos eran recuentos históricos fijos de 26; el cuarto es la equivalencia con `db/schema.sql`. |
| `npm run test:integration -- --runInBand identidad-fase-2 envios-correo instalacion-t61 fase-4-t008-t013 fase-3-t005-t010` | **5 suites y 16 pruebas aprobadas** después de corregir los recuentos y el teléfono compartido. |

La comparación completa de `test/instalacion-t126-t127.integration-spec.ts` sigue fallando porque `db/schema.sql` aún no contiene las columnas y tablas de estas migraciones. M3-T020–T021 asignan expresamente esa sincronización y M3-T022 su equivalencia; no se debilita ni se elimina esa prueba. La entidad `Cliente` todavía describe el índice anterior, y las entidades públicas aún no están añadidas: corresponden a M3-T015–T019. Estas diferencias quedan visibles para esos lotes. Las seis tareas de este lote cumplen sus criterios de migración y conservación de filas; el módulo completo aún no está listo para instalación SQL autónoma.
