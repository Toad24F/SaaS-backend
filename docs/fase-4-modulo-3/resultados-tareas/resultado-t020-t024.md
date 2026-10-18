# Resultado M3-T020–T024

Fecha: 18 de octubre de 2026. Este lote sincroniza la instalación SQL autónoma con las migraciones del portal y verifica la actualización de datos de fase 3. No incorpora rutas ni escritores públicos.

## Archivos modificados

| Archivo | Qué hace |
| --- | --- |
| `db/schema.sql` | Define sesiones, operaciones de apartado e intentos de reserva, con claves por negocio, índices y restricciones equivalentes a las migraciones. Amplía apartados y citas con contexto público e histórico anulable. Sustituye la unicidad del teléfono por un índice de búsqueda que permite compartirlo. Incluye comentarios sobre el propósito de cada bloque. |
| `test/instalacion-t126-t127.integration-spec.ts` | Extiende la comparación entre instalación SQL y migraciones a las tres tablas nuevas, incluidos tipos, precisión temporal, índices, `CHECK`, claves foráneas y reglas de borrado. |
| `test/fase-4-t008-t013.integration-spec.ts` | Comprueba que los apartados anteriores conservan su ocupación tras migrar, además de IDs, intervalos, estados y campos nuevos nulos. |
| `docs/fase-4-modulo-3/tareas.md` | Marca M3-T020–T024 como hechas tras verificar sus criterios. |

## Flujo de datos y actualización

1. Una instalación nueva crea las tablas de fase 3 y después las del portal. Primero crea sesión, operación e intento; al estar disponibles todos los destinos, agrega las claves compuestas que cierran el ciclo sesión → apartado → operación y enlazan el intento con apartado y cita. La clave incluye `negocio_id` para impedir cruces.
2. La sesión guarda el hash del titular y una generación. Cada operación tiene una clave única dentro de la sesión y conserva la selección. Distintas sesiones pueden usar la misma clave. Un intento de reserva también conserva su clave y resultado, con una cita opcional y única cuando existe.
3. El apartado puede guardar costo aceptado, zona, sesión, generación y operación. La cita puede guardar costo, contacto y nombres históricos. Estos valores son anulables porque una fila anterior no revela qué precio o texto se aceptó entonces; nunca se infieren del catálogo actual.
4. Al actualizar desde fase 3, las migraciones preservan filas, IDs, UTC, expiraciones y estados. Un apartado legado sigue ocupando mientras `liberado_en IS NULL` y el instante consultado sea anterior a `expira_en`, aunque carezca de contexto público.
5. El teléfono se indexa para búsquedas pero no identifica unívocamente al cliente. Las referencias compuestas y claves únicas se aplican en MariaDB tanto a las tablas nuevas como a los vínculos con citas y apartados.

## Pruebas

Se ampliaron primero las pruebas. La comparación inicial falló porque el SQL autónomo carecía de `costo_aceptado`, `sesion_id`, `generacion`, `operacion_id` y `zona_horaria_apartado` en apartados. Después de sincronizarlo, pasaron las pruebas específicas en bases desechables. La prueba de instalación compara el esquema migrado y el SQL; la de actualización retrocede a fase 3, carga datos, vuelve a migrar y comprueba ocupación y valores históricos; la de relaciones ejercita el rechazo de referencias entre negocios y la unicidad de operaciones, y las pruebas previas de migraciones comprueban teléfonos repetidos y claves iguales en sesiones distintas.

| Comando | Resultado |
| --- | --- |
| `npm run test:integration -- --runInBand instalacion-t126-t127 fase-4-t008-t013 fase-4-t014-t019` | 3 suites, 10 pruebas aprobadas. |
| `npm run build` | Aprobado. |
| `npm run lint` | Aprobado. |
| `npm test -- --runInBand` | 65 suites, 329 pruebas aprobadas. |
| `npm run test:integration -- --runInBand` | 61 suites, 269 pruebas aprobadas. |

La equivalencia se verifica en bases temporales; no se alteró una base de producción.
