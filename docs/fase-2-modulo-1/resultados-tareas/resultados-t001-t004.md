# Resultados M1-T001–M1-T004 — decisiones de fase 2

Fecha: 2026-09-25. El usuario confirmó las cuatro respuestas durante esta tarea. Este cierre fija contratos para implementar más adelante; no acredita que los RF de fase 2 ya funcionen en el backend.

## Decisiones y casos verificables

| Tarea | Decisión confirmada | Casos que guiarán las pruebas de implementación |
|---|---|---|
| M1-T001 | El cupo autorizado tiene mínimo 1 y predeterminado 1. | Aceptar 1 y 2; rechazar 0, -1 y 1.5. Con límite 1 y ninguna sucursal activa, permitir operar sin sucursales; rechazar bajar el límite bajo la cantidad de activas. |
| M1-T002 | Rechazar horas locales inexistentes y repetidas; omitir solo la ocurrencia recurrente afectada, sin desplazarla. | En `America/New_York`, rechazar `2026-03-08 02:30` y `2026-11-01 01:30` en una excepción fechada o un bloqueo horario. Una franja semanal que toque la discontinuidad no atiende esa fecha y vuelve a aplicarse en fechas válidas. Informar la omisión en la consulta. Los bloqueos de días completos usan límites de fecha. |
| M1-T003 | La sola auditoría técnica de alta no impide borrar físicamente un registro nunca usado; el evento se conserva. | Permitir borrar un servicio recién creado sin relaciones ni cambios operativos; rechazar el borrado de uno seleccionado o usado y ofrecer desactivarlo. Nunca eliminar la auditoría para permitir el borrado. |
| M1-T004 | La instalación prevista utiliza una base nueva. | Ensayar migraciones históricas y futuras en una base temporal. Si en otro momento se requiere migrar datos existentes, preparar un diagnóstico y un plan de conversión aprobado y ensayado sobre copia antes de desplegar; no borrar ni convertir datos actuales por esta decisión. |

## Archivos modificados

- [`plan-modulo-1.md`](plan-modulo-1.md): incorpora las cuatro decisiones en la sección 8 y ajusta el modelo de cupo y borrado para que el diseño sea coherente. El comentario HTML de la sección aclara que son criterios futuros.
- [`spec-modulo-1.md`](spec-modulo-1.md): concreta los casos límite asociados a los RF sin cambiar su alcance. El comentario HTML distingue estos ejemplos de pruebas funcionales ya ejecutadas.
- [`tareas-modulo-1.md`](tareas-modulo-1.md): marca M1-T001–M1-T004 como hechas, actualiza el número de pendientes y enlaza esta evidencia.
- [`decisiones-modulo-1.spec.ts`](../../test/decisiones-modulo-1.spec.ts): prueba que plan y spec registran las cuatro decisiones y ejemplos, y que las tareas tienen marca de cierre y evidencia. Sus comentarios explican los dos bloques de comprobación.
- Este archivo registra decisiones, alcance y verificaciones para poder revisar por qué se cerró cada tarea.

## Pruebas y verificaciones

Se escribió primero la prueba documental. Su ejecución inicial falló en sus **8 casos**, porque las decisiones aún figuraban abiertas. Tras actualizar los documentos, la prueba focalizada pasó **8/8**. Verifica presencia y coherencia de los acuerdos escritos; no simula cambios de huso ni prueba el futuro control de cupos o borrado en una base de datos.

Antes de modificar los documentos pasaron las suites existentes: unitaria **118/118** en 26 suites; integración MariaDB **63/63** en 15 suites; HTTP/e2e **93/93** en 9 suites. La salida e2e mostró errores inyectados por casos de prueba y terminó con código 0.

Después del cambio, la suite unitaria completa pasó **126/126** en 27 suites, ya con los ocho casos nuevos. También pasaron `npm run build`, `npm run lint`, `git diff --check` y la comprobación de que los enlaces relativos de los cuatro documentos resuelven. Las suites de integración y HTTP se ejecutaron antes de la edición documental; no se modificó código de aplicación.

Pendiente fuera de T001–T004: implementar y probar en código los RF correspondientes mediante las tareas posteriores del módulo. La conversión de una instalación con datos no forma parte del destino confirmado.
