# Corrección de arranque: metadatos de OperacionLicencia

Fecha: 30 de octubre de 2026. Corrección puntual posterior a M3-T019, sin cambiar su estado documental ni cerrar M3-T136.

## Incidencia y causa

El arranque de `AppModule` fallaba al construir metadatos de TypeORM con `Entity metadata for EnvioCorreo#operacionLicencia was not found`. `EnvioCorreo` declara una relación con `OperacionLicencia`, pero `LicenciasModule` registraba únicamente `Licencia` en `TypeOrmModule.forFeature`. La aplicación usa `autoLoadEntities`; la entidad relacionada no entraba en su conjunto. Las migraciones y la CLI usan una configuración distinta y no corrigen esta omisión de registro en Nest.

## Cambio y prueba previa

Se extendió `test/fase-3-arranque-entidades.integration-spec.ts` para verificar también los metadatos de `EnvioCorreo` y `OperacionLicencia` en la conexión real de `AppModule`. Antes del cambio, la prueba falló con el mismo error reportado. Después se registró `OperacionLicencia` junto a `Licencia` en `LicenciasModule`; la prueba pasó. La prueba de composición sin base incorpora el nuevo repositorio simulado.

La prueba usa una base MariaDB desechable con nombre validado por `test/support/mariadb.ts`. No se ejecutaron migraciones sobre la base cotidiana ni se modificó el esquema.

## Verificación

| Comando | Resultado |
| --- | --- |
| `npm run test:integration -- --runInBand fase-3-arranque-entidades` | Falló antes del cambio con el error exacto; pasó después (1 prueba). |
| `npm run build` | Pasó. |
| `npm run lint` | Pasó. |
| `npm test -- --runInBand` | Pasó: 83 suites, 393 pruebas. |
| `npm run test:e2e -- --runInBand` | 31 suites y 172 pruebas pasaron; 3 suites y 4 pruebas fallaron en contratos HTTP históricos. |
| `npm run test:integration -- --runInBand` | 81 suites y 381 pruebas pasaron; 3 suites y 3 pruebas fallaron en casos de migración y datos históricos. La prueba de arranque corregida pasó dentro de esta ejecución. |

Los fallos HTTP/e2e corresponden a `bajas-t111-t115` (esperaba 403 y recibió 404), `recepcionistas-t48` (la respuesta ahora incluye `inhabilitadoEn: null` en dos casos) y `seguridad-t131-t132` (esperaba 401 y recibió 404). Los archivos de aplicación afectados estaban modificados previamente en el árbol de trabajo; no forman parte de esta corrección de metadatos.

Los fallos de integración corresponden a `fase-4-t008-t013` (la prueba espera otra última migración al revertir), `sucursales-t060` (una FK impide revertir una migración pública anterior) y `ala-t019-t022` (la prueba recibe `null` donde espera una fecha). Ninguno produjo el error de metadatos de `EnvioCorreo#operacionLicencia`. Quedan pendientes de revisión separada; por estos resultados no se declara aprobada la regresión completa ni se marca M3-T136.
