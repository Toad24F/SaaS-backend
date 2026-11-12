# Resultado — ALA-T008–ALA-T012

Revisión base: `948f84a`; cambios de esta entrega aún sin commit. RF relacionados: RF-16–RF-18, RF-22–RF-27, RF-31 y RF-32. La propuesta documental sigue pendiente de aprobación; la petición de implementación cubre estas cinco tareas, no el flujo funcional completo.

## Flujo implementado y archivos

1. **ALA-T008 y T009.** [Negocio](../../../src/negocios/entities/negocio.entity.ts) declara dos límites configurados, inicialmente 5 profesionales y 3 recepcionistas, y visibilidad pública de precios inicialmente verdadera. No almacena contadores de consumo. La migración [CuposVisibilidadNegocio](../../../src/database/migrations/1760000034000-CuposVisibilidadNegocio.ts) añade columnas y checks positivos; los defaults completan filas previas sin alterar sus datos. `db/schema.sql` refleja el mismo DDL. La prueba de metadatos confirma nombre y default; la integración rechaza cero y confirma que el valor anterior permanece.
2. **ALA-T010 y T011.** [Usuario](../../../src/usuarios/entities/usuario.entity.ts), [Servicio](../../../src/servicios/entities/servicio.entity.ts) y [Sucursal](../../../src/sucursales/entities/sucursal.entity.ts) incorporan `inhabilitado_en` anulable y la regla «inhabilitado implica inactivo». El perfil `Personal` sigue tomando identidad y estado de Usuario. Las claves únicas de correo y nombre no cambian. `db/schema.sql` explica que la marca distingue inactivo habitual de inhabilitado recuperable.
3. **ALA-T012.** La migración [InhabilitacionRecursos](../../../src/database/migrations/1760000035000-InhabilitacionRecursos.ts) añade las tres marcas y checks. Por defecto las filas existentes quedan con marca nula. La prueba de actualización crea datos con el esquema anterior, aplica ambas migraciones y confirma nombres, correo, relaciones y estados. Marcar exige `activo=0`; limpiar la marca conserva `activo=0`. El código de las entidades y migraciones contiene comentarios junto a cada bloque nuevo para explicar propósito y conservación del historial.

## Pruebas y resultados

| Comando o comprobación | Resultado |
| --- | --- |
| `npm test -- --runInBand test/ala-t008-t012-modelo.spec.ts` antes de implementar | Falló como se esperaba: faltaban las columnas en metadatos y esquema. |
| `npm run test:integration -- --runInBand test/ala-t008-t012.integration-spec.ts` antes de implementar | Falló como se esperaba: columna de cupo y migraciones nuevas ausentes. |
| `npm test -- --runInBand test/ala-t008-t012-modelo.spec.ts src/negocios/entities/negocio.entity.spec.ts src/usuarios/entities/usuario.entity.spec.ts` | Código 0; 3 suites, 10 pruebas aprobadas, 0 omitidas. Verifica metadatos nuevos y regresión de entidades. |
| `npm run test:integration -- --runInBand test/ala-t008-t012.integration-spec.ts test/fase-4-t001-t007.integration-spec.ts` | Código 0; 2 suites, 8 pruebas aprobadas, 0 omitidas. Usa bases desechables `citas_persistencia_<uuid>`; verifica instalación, actualización con datos previos, checks, unicidad, relaciones y limpieza. |
| `npm run build` y `npm run lint` | Ambos código 0. |
| `migration:show` con `.env` | Solo las migraciones 1760000034000 y 1760000035000 estaban pendientes en `Citas_Saas`. |
| `migration:run` con `.env` | Código 0; aplicó exactamente esas dos migraciones a `Citas_Saas`. |
| Consulta final de solo lectura | 6 columnas nuevas; los conteos de las 28 tablas de datos coinciden con `citas` (se excluye `migrations`, que gana dos filas). `citas` conserva cero columnas nuevas y sigue como respaldo. |

Las pruebas de integración intentan una escritura inválida y comprueban su rechazo; también inspeccionan filas después de restaurar y claves únicas. Las migraciones no se probaron escribiendo datos de prueba en `Citas_Saas`: todos esos casos usaron bases temporales. La base de trabajo solo recibió las dos migraciones verificadas.

## Límites y pendientes

Estas tareas acreditan persistencia, defaults y restricciones, no la aplicación funcional de cupos, inhabilitación, permisos, consultas administrativas ni ocultación de precios. Esos servicios y rutas corresponden a tareas posteriores. No se ejecutó HTTP/e2e porque no cambió ninguna ruta ni respuesta. RF-63 y M3-I001/M2-I004 siguen diferidos al escritor manual real. La propuesta no queda aprobada ni el sistema habilitado para producción por estas migraciones.
