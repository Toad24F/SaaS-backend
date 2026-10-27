# Resultados M2-T080–M2-T085 — duración, instantánea y regresión

Revisión base comprobada: `87b1e38cc0a84c69ae5cab1de363a281b888496f`, más los cambios de pruebas y documentación descritos aquí. No se modificó lógica de producción: los escenarios nuevos verifican el comportamiento ya implementado del motor y de las rutas privadas.

## Archivos y flujo

`test/fase-3-t080-t081.integration-spec.ts` agrega dos pruebas con MariaDB migrada temporal. Su fixture prepara una cuenta, licencia, sesión, horario y oferta válidos. La primera conserva en base una cita y un apartado de 30 minutos, cambia la duración del servicio a 45 y comprueba que solo las nuevas ranuras usan 45; la cita conserva su fin, zona y estado, mientras la revalidación rechaza el apartado cuyo fin ya no coincide. La segunda utiliza **dos conexiones independientes**: pausa la consulta después de leer reglas, confirma en la otra conexión una nueva configuración y la desactivación del servicio, y reanuda la consulta. Los comentarios del archivo señalan la barrera de concurrencia y la conservación de compromisos históricos.

`test/fase-3-t062-t066.e2e-spec.ts` amplía las pruebas HTTP existentes con T080 y T083. T080 edita la duración por `PATCH /servicios/:id`, vuelve a consultar disponibilidad y usa la revalidación interna para rechazar el apartado antiguo; comprueba que ni la cita ni el apartado se reescribieron. T083 coloca una cita con cliente identificable y un apartado con hash, consulta las cinco rutas privadas y verifica que sus respuestas no contienen cliente, folio privado, hash de titular, token, SQL o traza. También comprueba que la auditoría de configuración no conserva esos datos y que una sucursal de otro negocio recibe el mismo error que una inexistente. Los comentarios explican la conservación de compromisos y la separación entre estado operativo y secretos.

`docs/fase-3/tareas.md` marca M2-T080–M2-T085 como hechas. Este informe deja los comandos, los resultados y el límite de la evidencia.

Flujo de lectura: **sesión y licencia vigentes → transacción `REPEATABLE READ` → reglas, oferta, horario y ocupaciones del mismo estado confirmado → ranuras con duración actual**. Una cita persistida conserva su intervalo y zona originales. Un apartado propio solo puede excluirse en la revalidación interna si su intervalo completo sigue coincidiendo. Si se confirma un cambio mientras una lectura está en curso, esa lectura termina con el estado anterior completo y la siguiente ve el nuevo; un error técnico se propaga, no se convierte en una agenda vacía.

## Tests primero y verificaciones

Se añadieron primero las dos pruebas de integración y la comprobación HTTP de seguridad. El primer intento de integración falló por el fixture: la sesión de una hora infringía `chk_sesiones_expiracion`. Se ajustó a la duración válida de doce horas, sin cambiar lógica de producción, y ambas pruebas pasaron. Luego se amplió T080 con el recorrido HTTP de edición, consulta y revalidación; las cinco pruebas HTTP dirigidas pasaron.

La regresión T082 se contrasta con las suites completas, que incluyen las rutas y pruebas de módulo 1/fix para oferta, horarios, bloqueos, omisiones por zona y permisos. En particular, las suites de horarios, bloqueos y catálogo prueban que Recepción no puede escribir esos recursos. T083 agrega revisión de las cinco rutas y del evento nuevo; no se atribuye cobertura a escritores reales de reservas ni a los casos M2-I001–M2-I009, todavía diferidos.

## Resultado de ejecución — 16 de octubre de 2026

| Verificación | Resultado |
| --- | --- |
| `npm run test:integration -- --runInBand test/fase-3-t080-t081.integration-spec.ts` | 1 suite, 2 tests aprobados |
| `npm run test:e2e -- --runInBand test/fase-3-t062-t066.e2e-spec.ts` | 1 suite, 5 tests aprobados |
| `npm run build` | Aprobado |
| `npm run lint` | Aprobado |
| `npm test -- --runInBand` | 64 suites, 327 tests aprobados |
| `npm run test:integration -- --runInBand` | 57 suites, 255 tests aprobados |
| `npm run test:e2e -- --runInBand` | 28 suites, 147 tests aprobados |

Todas las verificaciones finales terminaron con código de salida 0. Los mensajes `ERROR` emitidos por Nest durante E2E corresponden a fallos inyectados deliberadamente por pruebas de regresión; Jest no reportó tests fallidos. `git diff --check` no encontró errores de formato.

