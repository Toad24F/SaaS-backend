# Evidencia de T70: configuración de migraciones y producción

## Cambios realizados

- Se agregó `src/config/typeorm.datasource.ts`, que construye la `DataSource` utilizada por la CLI de TypeORM, registra los patrones de entidades y migraciones y no abre conexiones al importarse.
- Se modificó `src/config/database.config.ts` para deshabilitar `synchronize`, `dropSchema` y `migrationsRun` tanto en producción como en pruebas, conservando la validación aislada de `TEST_DB_*`.
- Se modificó `package.json` para agregar comandos explícitos de generación, ejecución y reversión de migraciones.
- Se agregaron pruebas en `src/config/typeorm.datasource.spec.ts` y se amplió `src/config/database.config.spec.ts` para verificar la configuración segura, los comandos y que una `DataSource` recién importada permanezca sin inicializar.

No se crearon ni ejecutaron migraciones, no se modificaron entidades y no se alteró ningún esquema o dato existente.

## Pruebas primero

Antes de implementar, las pruebas específicas fallaron porque faltaba `typeorm.datasource.ts` y producción aún configuraba `synchronize: true`. Después del cambio, las 18 pruebas específicas pasaron.

## Verificaciones finales

| Comando | Resultado |
| --- | --- |
| `npm run build` | Correcto |
| `npm run lint` | Correcto |
| `npm test -- --runInBand` | 10 suites, 52 pruebas aprobadas |
| `npm run test:integration -- --runInBand --detectOpenHandles` | 1 suite, 2 pruebas aprobadas |
| `npm run test:e2e -- --runInBand --detectOpenHandles` | 1 suite, 1 prueba aprobada |

T70 queda completada. No se inició T08 ni ninguna tarea posterior.
