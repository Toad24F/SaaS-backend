# Resultado — ALA-T023–ALA-T027

Revisión base: `e336538`; cambios de esta entrega aún sin commit. RF relacionados: RF-56–RF-60 y RF-65–RF-69. Se completó la estructura de persistencia; las políticas funcionales que la usan corresponden a tareas posteriores.

## Archivos y flujo

1. [Cita](../../../src/disponibilidad/entities/cita.entity.ts) y la [migración de origen](../../../src/database/migrations/1760000041000-OrigenCitaTelefono.ts) incorporan `apartado_origen_id`, una FK compuesta con `negocio_id` y un índice único por negocio. Una cita previa o manual puede conservar el origen nulo; una cita pública podrá señalar su apartado y ningún otro registro podrá reutilizarlo. El índice `(negocio_id, sucursal_id, telefono_contacto, inicio_utc)` prepara la consulta de cupo por contacto sin imponer unicidad al teléfono. Los comentarios del código explican ambas decisiones.
2. [IntentoReservaPublica](../../../src/reservas-publicas/entities/intento-reserva-publica.entity.ts) añade `intento_anterior_id`, FK compuesta y unicidad del predecesor. [BloqueoTemporal](../../../src/disponibilidad/entities/bloqueo-temporal.entity.ts) añade `intento_actual_id`, FK compuesta e índice. La [migración de sucesión](../../../src/database/migrations/1760000042000-SucesionIntentos.ts) crea primero el vínculo entre intentos y después el puntero del apartado: el intento debe existir antes de señalarlo. Los valores nulos preservan filas previas y el primer intento de cada apartado. No se añadió un estado que dependa de un proceso vivo.
3. [db/schema.sql](../../../db/schema.sql) reproduce las columnas, índices, restricciones y orden de las dos migraciones para instalaciones limpias. [Prueba de modelo](../../../test/ala-t023-t027-modelo.spec.ts) comprueba metadatos de entidades; [prueba de integración](../../../test/ala-t023-t027.integration-spec.ts) usa bases desechables y verifica restricciones con filas reales. [Prueba de instalación](../../../test/instalacion-t126-t127.integration-spec.ts) amplía la comparación entre instalación migrada y esquema canónico a todas las tablas tocadas por ALA, incluyendo campos, índices, claves foráneas y checks. Sus comentarios explican el propósito de cada bloque.
4. [tareas.md](../tareas.md) marca T023–T027 al quedar satisfechos sus criterios y enlaza esta evidencia.

## Pruebas y resultados

| Comando o comprobación | Resultado observado |
| --- | --- |
| `npm test -- --runInBand test/ala-t023-t027-modelo.spec.ts` antes de implementar | Falló como se esperaba: faltaban las columnas y relaciones nuevas. |
| `npm run test:integration -- --runInBand test/ala-t023-t027.integration-spec.ts` antes de implementar | Falló como se esperaba por columnas ausentes. |
| `npm test -- --runInBand test/ala-t023-t027-modelo.spec.ts src/reservas-publicas src/disponibilidad` | 16 suites, 53/53 pruebas aprobadas, 0 omitidas. Verifica metadatos y regresión de reservas y disponibilidad. La primera ejecución no pudo abrir puertos locales por `EACCES` del entorno; se repitió con acceso local y pasó. |
| `npm run test:integration -- --runInBand test/ala-t023-t027.integration-spec.ts test/instalacion-t126-t127.integration-spec.ts test/fase-4-t074-t079.integration-spec.ts` | 3 suites, 11/11 pruebas aprobadas, 0 omitidas. Verifica unicidad de origen, teléfonos compartidos, aislamiento entre negocios, orden de referencias, sucesor único, equivalencia de instalación y regresión del escritor público actual. Una primera ejecución detectó que la prueba trataba el `COUNT` SQL como número en vez de cadena; se corrigió la aserción y pasó. |
| `npm run build` y `npm run lint` | Ambos código 0. |
| `migration:show` con `.env` | Las dos migraciones nuevas aparecen aplicadas en `Citas_Saas`; las 43 migraciones están marcadas `[X]`. |
| Comparación SQL de solo lectura entre `citas` y `Citas_Saas` | Mismo número de filas en 28 tablas de datos compartidas. Las tres columnas nuevas existen solo en `Citas_Saas`; están nulas en las 7 citas, 7 intentos y 15 apartados históricos consultados. |

Las pruebas de integración emplearon bases desechables; no escribieron datos de prueba en `Citas_Saas`. La base cotidiana recibió únicamente las migraciones nuevas. La original `citas` se conserva como respaldo, sin estas columnas.

## Pendientes y límites

Estos campos preparan el origen único, la consulta de cupo y la sucesión durable; todavía no implementan el conteo telefónico, la transición funcional entre intentos ni rutas nuevas. El contrato público vigente y los escritores se integrarán en tareas posteriores. M3-I001/M2-I004 y RF-63 permanecen diferidos hasta el escritor manual real. La fase no queda cerrada ni habilitada para producción por esta entrega.
