# Resultado — ALA-T078–ALA-T081

Revisión: cambios locales sin commit, 30 de octubre de 2026. Se escribió primero `test/ala-t078-t081.e2e-spec.ts` y se ejecutó en una base MariaDB migrada y desechable. Falló porque el catálogo seguía exponiendo `costo` después de ocultarlo. Las pruebas posteriores identificaron expectativas del contrato HTTP anterior, actualizadas para la representación pública neutral. No se usó la base cotidiana.

## Flujo

El catálogo resuelve el negocio, su licencia, la oferta y `mostrarPreciosPublicos` en la misma instantánea. Antes de devolver la respuesta, aplica la proyección común que omite los importes si el valor global es falso. Las respuestas de catálogo y del apartado llevan `Cache-Control: no-store`.

La concesión guarda `costo_aceptado` en la fila interna del apartado. La consulta propia del apartado recupera también ese valor histórico. Tras conceder, consultar o repetir la operación, el controlador relee la opción global vigente y proyecta la respuesta. Ocultar el precio no borra la fila ni altera sus cinco minutos, generación o estado.

El escritor conserva el costo fijado en la cita y la identidad idempotente del intento. El controlador aplica la opción vigente al registro inicial, a la repetición y a la resolución, incluso si la licencia ya no acepta reservas. La autorización de sesión e intento ocurre antes de proyectar; otra credencial no puede recuperar el resultado. El campo monetario **público** visible se llama `costo`, nombre neutral que no afirma que el cliente vio o aceptó el precio cuando inició con la opción oculta. El resumen histórico **interno** sigue usando `costoAceptado`. Si la opción está oculta, ninguno de esos campos monetarios aparece en el JSON: no se sustituye por cero ni por `null`.

El portal web acepta `costo` como dato opcional en catálogo, apartado y resultado. En la selección conserva la duración aunque no haya importe. Al abrir o revisar el formulario, la consulta propia actualiza el precio conocido y elimina el anterior si el negocio lo ocultó. El resumen del resultado nunca recupera un importe desde un catálogo viejo; muestra costo solo cuando la respuesta del intento lo contiene. El texto visible usa «Costo», sin afirmar aceptación del importe oculto.

## Archivos

- `src/reservas-publicas/resolver-negocio-publico.service.ts`: incorpora la opción a la instantánea del catálogo y permite releerla por negocio después de una operación, sin exigir licencia para recuperar una reserva propia.
- `src/reservas-publicas/catalogo-publico.service.ts`: aplica la proyección a la oferta y la configuración leídas juntas.
- `src/reservas-publicas/apartados.service.ts`: incluye el costo fijado en la lectura interna del apartado; la salida HTTP decide si mostrarlo.
- `src/reservas-publicas/portal-publico.controller.ts`: proyecta concesión, consulta, registro, repetición y resolución con la opción vigente, conservando autorización y cabeceras de caché.
- `src/reservas-publicas/proyeccion-precios-publicos.ts`: agrega la representación monetaria pública neutral sobre la proyección recursiva existente.
- `src/reservas-publicas/contratos.ts`: distingue el resumen histórico interno del contrato público con costo opcional.
- `test/ala-t078-t081.e2e-spec.ts`: recorre el flujo HTTP real con cambios de visibilidad, apartado y cita históricos, repetición, resolución, licencia cerrada, caché, administración y credencial ajena.
- `test/fase-4-t063-t064.integration-spec.ts`, `test/fase-4-t065-t068.integration-spec.ts` y `test/fase-4-t080-t085.e2e-spec.ts`: ajustan las expectativas de salida HTTP de `costoAceptado` a `costo`; sus comprobaciones de persistencia interna permanecen.
- `frontend-saas/src/connected/public/selection.js` y `selection-view.js`: validan el precio opcional y presentan la duración sin generar `$NaN` cuando falta el importe.
- `frontend-saas/src/connected/public/booking.js` y `booking-view.js`: admiten apartados sin precio, refrescan la visibilidad al consultar el apartado y evitan mostrar costos de un catálogo anterior en formulario o resultado.
- `frontend-saas/src/connected/public/submission.js`: valida y conserva el resultado histórico con `costo` opcional, manteniendo folio y demás campos obligatorios.
- `frontend-saas/tests/portal-publico-precios.test.js` (nuevo): comprueba catálogo oculto, resultado oculto y costo público neutral.
- `frontend-saas/tests/portal-publico-apartado.test.js`, `portal-publico-envio.test.js`, `portal-publico-resumen.test.js` y `portal-publico-accesibilidad.test.js`: actualizan dobles del contrato y prueban que una relectura quita un precio ocultado durante el formulario.
- `frontend-saas/tests/fixtures/portal-selection-server.mjs`: alinea el servidor de prueba del navegador con el campo público `costo` en apartado, consulta propia y reserva.
- `frontend-saas/tests/browser/portal.spec.js`: actualiza selectores de encabezados que ya no coincidían con el texto actual del portal, para que la regresión Playwright compruebe el flujo real.
- `frontend-saas/docs/ajustes-precios-publicos-ala-t078-t081.md` (nuevo): documenta el flujo conectado, alcance, archivos, verificaciones y límite de revisión visual del frontend.
- `tareas.md`: marca T078–T081 y enlaza esta evidencia.

Los bloques nuevos llevan comentarios sobre la instantánea, la relectura posterior al commit, la separación entre costo interno y salida pública, y la representación neutral.

## Pruebas y resultados

| Comando | Resultado |
| --- | --- |
| `npm run test:e2e -- --runInBand test/ala-t078-t081.e2e-spec.ts test/fase-4-t080-t085.e2e-spec.ts` | 2 suites, 16/16 casos aprobados. La prueba nueva falló primero por el precio aún visible; la regresión señaló las expectativas HTTP antiguas, actualizadas. |
| `npm run test:integration -- --runInBand test/fase-4-t063-t064.integration-spec.ts test/fase-4-t065-t068.integration-spec.ts test/fase-4-t072-t073.integration-spec.ts test/fase-4-t074-t079.integration-spec.ts` | 4 suites, 14/14 casos aprobados. |
| `npm test -- --runInBand src/reservas-publicas` | 11 suites, 37/37 casos aprobados. |
| `frontend-saas: npm test` | 164/164 casos aprobados. Antes de adaptar el portal, la prueba nueva falló en catálogo oculto y resultados sin precio. |
| `frontend-saas: npm run build` | Correcto. |
| `frontend-saas: npm run test:browser -- --grep-invert T124` | 8/8 casos Playwright aprobados con servidores y base efímera. La primera ejecución completa halló selectores antiguos en cuatro casos; se actualizaron. T124 espera cinco minutos reales para verificar vencimiento y no forma parte de esta regresión de precios. |
| `npm run build`, `npm run lint` y `git diff --check` | Correctos. |

T078–T081 cumplen sus criterios. T082 y posteriores permanecen pendientes; esta entrega no cierra la fase ni habilita producción. M3-I001/M2-I004 continúan diferidas al escritor manual real.
