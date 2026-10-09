# Evidencia de FIX-T019–FIX-T023

## Archivos y función

- `src/profesionales/profesionales.service.ts`: conserva las selecciones generales desmarcadas y sus preferencias por sucursal; crea combinaciones para servicios nuevos y sucursales nuevas; elimina solo las combinaciones de sucursales retiradas; calcula la oferta con los estados individuales vigentes.
- `test/fix-modulo-1-t019-t023.integration-spec.ts`: ejercita persistencia, preferencias, oferta, reintentos, auditoría, asignaciones, horarios y pertenencia con una base MariaDB migrada.
- `test/profesionales-t081-t082.integration-spec.ts`: adapta la regresión anterior para que su conjunto seleccionado use filas activas, ya que las inactivas permanecen como historial de preferencias.
- `test/bajas-t111-t115.integration-spec.ts`: conserva la comprobación de bajas con historial y ahora espera que la selección desmarcada permanezca inactiva en vez de desaparecer físicamente.
- `test/profesionales-t077-t080.e2e-spec.ts`: comprueba en HTTP que una selección histórica desmarcada sigue visible aun si el servicio global está inactivo.
- `docs/Fix-modulo-1/tareas.md`: marca como hechas únicamente las tareas FIX-T019–FIX-T023 y enlaza esta evidencia.

## Flujo

El servidor obtiene el negocio del actor y bloquea el perfil profesional antes de reemplazar selecciones o sucursales. Al seleccionar un servicio por primera vez, guarda la relación general activa y crea una combinación activa por cada sucursal asignada. El estado global del servicio se comprueba antes de admitir una selección inédita. Al desmarcarlo, cambia solo `personal_servicios.activo` a falso: la fila y sus combinaciones permanecen. Al marcarlo otra vez, reactiva la fila existente y recupera las preferencias particulares sin sobrescribirlas. La consulta muestra la opción histórica desmarcada y la oferta efectiva exige que todos los estados correspondientes estén activos.

Al modificar sucursales, compara el conjunto solicitado con el anterior. Las asignaciones conservadas y sus combinaciones permanecen intactas. Para cada sucursal nueva, crea combinaciones de los servicios generales activos. Para una sucursal retirada, comprueba primero horarios y excepciones; si el retiro es válido, elimina sus combinaciones antes de borrar esa asignación. Todos los cambios y su único evento de auditoría ocurren en la misma transacción. Una solicitud repetida sin cambio no registra otro evento.

## Pruebas

La suite nueva se escribió y ejecutó antes del código. Falló porque no existían las combinaciones iniciales; además se corrigió en la prueba el nombre SQL de las columnas de horario (`inicio_minutos`, `fin_minutos`). Después pasó con tres escenarios: desmarcar, vaciar, recuperar preferencias y aislar a otro Profesional; crear y retirar combinaciones por sucursal con reintentos; impedir retiro con horario y rechazar una sucursal de otro negocio. Comprueba también que un servicio globalmente inactivo no se selecciona por primera vez. Las suites históricas de selección y HTTP confirman el contrato vigente. La primera ejecución completa de integración detectó que una prueba histórica de bajas aún esperaba borrado físico; se actualizó su expectativa, se comprobó su suite y se repitió la integración completa.

## Resultados

- `npm run build`: aprobado.
- `npm run lint`: aprobado.
- `npm run test:integration -- --runInBand test/fix-modulo-1-t019-t023.integration-spec.ts test/profesionales-t081-t082.integration-spec.ts`: 2 suites y 7 pruebas aprobadas.
- `npm run test:e2e -- --runInBand test/profesionales-t077-t080.e2e-spec.ts`: 1 suite y 3 pruebas aprobadas.
- `npm run test:integration -- --runInBand test/bajas-t111-t115.integration-spec.ts`: 1 suite y 4 pruebas aprobadas tras actualizar la expectativa de conservación.
- `npm test -- --runInBand`: 57 suites y 303 pruebas aprobadas.
- `npm run test:integration -- --runInBand`: 44 suites y 212 pruebas aprobadas en la repetición completa.
- `npm run test:e2e -- --runInBand`: 23 suites y 135 pruebas aprobadas. Los errores impresos por algunos casos son fallos controlados de auditoría usados para comprobar reversión.
