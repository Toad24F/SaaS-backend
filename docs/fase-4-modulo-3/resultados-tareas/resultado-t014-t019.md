# Resultado M3-T014–T019

Fecha: 18 de octubre de 2026. Este lote cierra la pertenencia de los datos públicos en la base, representa sus tablas en TypeORM y las registra en la aplicación y la CLI. No habilita rutas ni escritores de reservas.

## Archivos y finalidad

| Archivo | Qué realiza |
| --- | --- |
| `src/database/migrations/1760000032000-RelacionesReservaPublica.ts` | Añade claves foráneas compuestas por `negocio_id` para sesión, operación, apartado e intento. Cierra las referencias circulares mediante campos anulables y usa borrado restringido. Su reversión retira primero esas relaciones. |
| `src/reservas-publicas/entities/sesion-reserva-publica.entity.ts` | Mapea hash único por negocio, generación, puntero anulable al apartado y fechas; no contiene un token utilizable. |
| `src/reservas-publicas/entities/operacion-apartado.entity.ts` | Mapea la selección, generación, clave idempotente, estados y resultado de una operación; sus relaciones conservan el negocio. |
| `src/reservas-publicas/entities/intento-reserva-publica.entity.ts` | Mapea apartado, huella de formulario, estados terminales, cita opcional y unicidad; no define un estado persistente «procesando». |
| `src/disponibilidad/entities/bloqueo-temporal.entity.ts` | Añade costo decimal, zona, sesión, generación y operación anulables al apartado, sin modificar sus extremos, expiración ni titular. |
| `src/disponibilidad/entities/cliente.entity.ts` | Refleja el índice no único de negocio/teléfono, para permitir personas distintas con el mismo número. |
| `src/disponibilidad/entities/cita.entity.ts` | Representa costo aceptado, contacto y nombres históricos del resumen; mantiene estado, intervalo UTC y zona originales. |
| `src/reservas-publicas/reservas-publicas.module.ts` | Registra sesión, operación e intento con `TypeOrmModule.forFeature`; la aplicación con `autoLoadEntities` las descubre. |
| `test/fase-4-t014-t019.integration-spec.ts` | Comprueba referencias entre negocios, creación ordenada, metadatos de entidades, lectura histórica y descubrimiento en la aplicación. |
| `test/fase-4-t008-t013.integration-spec.ts` | Incluye la nueva migración de relaciones al retroceder temporalmente a fase 3 para su prueba de actualización. |
| `test/support/ocupaciones-fase-3.ts` | Revierte primero las migraciones del portal antes de recrear tablas antiguas en una base temporal; así las nuevas FKs no impiden probar actualizaciones históricas. |
| `test/sucursales-t060.integration-spec.ts` | Retira y repone las migraciones dependientes del portal alrededor de su prueba histórica de instalación de sucursales; conserva la comprobación de datos previos. |
| `docs/fase-4-modulo-3/tareas.md` | Marca únicamente M3-T014–T019 como hechas. |

## Flujo de persistencia

1. El esquema migrado permite crear una sesión sin apartado actual. El servidor almacenará únicamente el hash de su credencial, siempre dentro del negocio resuelto.
2. Se crea una operación preparada vinculada a la sesión y a una selección del mismo negocio. Su resultado `apartado_id` sigue nulo mientras todavía no se concede horario.
3. Se inserta un apartado con su intervalo, expiración y titular; después se enlazan el apartado, la operación y el puntero actual de la sesión. Las claves compuestas rechazan un ID que pertenezca a otro negocio aunque sea válido por sí mismo.
4. Se puede preparar un intento enlazado a la sesión y al apartado. La cita es opcional hasta que un escritor futuro registre el resultado. La relación a cita restringe borrados; no cancela ni borra citas en cascada.
5. TypeORM lee apartados y citas anteriores con los campos nuevos en `NULL`. Las citas nuevas podrán conservar precio y contacto como copias históricas, y dos clientes podrán compartir teléfono sin fusionarse.

## Pruebas y límites

Las pruebas nuevas se ejecutaron antes del cambio y fallaron porque el puntero de sesión aceptaba un apartado ajeno y faltaban metadatos de las entidades. Después pasaron en bases MariaDB desechables: comprueban cruces de Profesional, sucursal, servicio, sesión, operación, apartado y cita; creación en orden; `ON DELETE RESTRICT`; índices, estados y ausencia de token; lectura por repositorios TypeORM; y descubrimiento tanto de la CLI como de `AppModule`.

| Comando | Resultado |
| --- | --- |
| `npm run build` | Aprobado. |
| `npm run lint` | Aprobado. |
| `npm test -- --runInBand` | **65 suites, 329 pruebas aprobadas**. |
| `npm run test:integration -- --runInBand fase-4-t014-t019 fase-4-t008-t013` | **2 suites, 8 pruebas aprobadas**. |
| `npm run test:integration -- --runInBand fase-3-t011-t015` | **1 suite, 3 pruebas aprobadas**; dos casos esperan y verifican un error al encontrar tablas antiguas. |
| `npm run test:integration -- --runInBand sucursales-t060` | **1 suite, 1 prueba aprobada** tras ajustar el orden histórico de reversión. |

| `npm run test:integration -- --runInBand` | **61 suites: 59 aprobadas y 2 fallidas; 269 pruebas: 267 aprobadas y 2 fallidas**. Falló la equivalencia SQL y, en esa primera ejecución, el orden de reversión de la prueba histórica de sucursales. Esta última pasó después en su ejecución específica. |

La comparación de la instalación SQL autónoma con las migraciones sigue pendiente de M3-T020–T022: `db/schema.sql` aún no incorpora estas tablas y columnas. Esta entrega no declara equivalencia entre ambas vías ni adelanta esos cambios. La otra incidencia de la suite completa quedó corregida y verificada con `sucursales-t060` después de la ejecución completa; por ello el resultado total anterior se conserva sin presentarlo como si hubiese pasado íntegro.
