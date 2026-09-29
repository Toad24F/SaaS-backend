# Resultado M1-T045–M1-T050

Fecha: 2026-09-28. **T045–T050 implementadas.** Se conserva la solicitud pendiente separada de la congelación efectiva para que las 48 horas de gracia no se confundan con una licencia suspendida.

## Cambios realizados

| Archivo | Qué hace |
| --- | --- |
| `src/licencias/entities/licencia.entity.ts` | Persiste la hora de solicitud, bloqueo previsto, congelación efectiva, remanente en milisegundos y versión del vencimiento. |
| `src/database/migrations/1760000009000-SuspensionProgramadaLicencias.ts` | Agrega columnas sin reescribir migraciones anteriores. Los registros históricos suspendidos se migran como ya efectivos, sin otorgar otra gracia; calcula su remanente con sus fechas guardadas. |
| `src/licencias/services/politica-acceso-licencia.service.ts` | Decide el estado usando reloj inyectado por argumento: acceso durante la gracia, suspensión desde su límite, vencimiento natural y bloqueo de activación inicial solicitada. |
| `src/licencias/licencias.service.ts` | Solicita suspensión una sola vez, materializa su instante efectivo de forma transaccional y audita la congelación real. La reactivación anticipada limpia la solicitud sin mover el vencimiento; la posterior restaura el remanente desde el momento de reactivación. Repetir transiciones no duplica auditoría ni tiempo. |
| `db/schema.sql` | Mantiene el esquema de referencia alineado con las columnas y semántica nuevas. |
| `test/migrations.integration-spec.ts` | Incluye la migración incremental en la secuencia de integración para ejecutarla sobre una base temporal. |
| `src/licencias/services/suspension-licencia.service.spec.ts` | Prueba con fechas fijas el instante anterior y exacto al bloqueo, la prioridad del vencimiento natural y la separación entre solicitud/congelación/remanente. |
| `src/licencias/entities/licencia.entity.spec.ts` | Verifica que los cinco campos nuevos forman parte del modelo persistido. |
| `docs/fase-2-modulo-1/tareas-modulo-1.md` | Marca T045–T050 como hechas y enlaza esta evidencia. |

Se comentaron los nuevos campos, la migración de estados históricos, la decisión temporal y los bloques transaccionales para explicar el propósito de cada estado y cómo se conserva el tiempo.

## Pruebas y verificaciones

- **Primero, prueba roja:** el test nuevo falló antes de implementar porque la política permitía acceso justo en el bloqueo previsto.
- **Pruebas enfocadas:** 3 suites, **18/18** aprobadas para licencia, política temporal, límite anterior/exacto/posterior y bloqueo de activación inicial.
- **Suite principal `npm test -- --runInBand`:** 44 suites, **216/216** aprobadas.
- **`npm run build`:** pasó.
- **`npm run lint`:** pasó.
- **Integración MariaDB** (`migrations.integration-spec.ts` y `licencias-reintentos.integration-spec.ts`): no ejecutable en este entorno; la conexión al host configurado `40.233.1.45:3306` devuelve `ECONNREFUSED`, incluso fuera del sandbox. Por ello, la nueva migración está incorporada a la prueba de migraciones, pero la ejecución real y la conservación de filas históricas quedan pendientes de una MariaDB disponible.

La suite completa no incluye las pruebas de integración configuradas aparte. No se ejecutó trabajo posterior a T050.
