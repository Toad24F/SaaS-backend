# Evidencia de FIX-T030–FIX-T036

## Archivos y función

- `src/profesionales/profesionales.service.ts`: construye una vista de oferta desde cuenta, sucursales, catálogo y tres relaciones individuales del mismo negocio. Cada combinación incluye estados fuente, `ofrecido` derivado y todos sus motivos de exclusión; la consulta no escribe una bandera de resultado.
- `src/profesionales/profesionales.controller.ts`: expone `GET /profesionales/:id/oferta` para el administrador del negocio y el Profesional dueño del perfil.
- `test/fix-modulo-1-t030-t034.e2e-spec.ts`: prueba el contrato HTTP con JWT y MariaDB, la matriz de seis estados, varios motivos simultáneos, oferta vacía, lectura sin mutación y permisos de roles, autoría y dos negocios.
- `test/fix-modulo-1-t034.integration-spec.ts`: prueba con dos conexiones los cambios opuestos de atención y servicios por sucursal, la creación profesional frente a desactivación global, reintentos, rechazo sin auditoría y bajas impedidas por historial.
- `docs/Fix-modulo-1/contrato-implementado.md`: documenta de forma versionable las rutas, cuerpos, respuestas, permisos, motivos y límites de este fix.
- `docs/actual.md`: actualiza también la referencia local de estado actual; el repositorio la excluye mediante `.gitignore`, por lo que el contrato versionable del fix es el archivo anterior.
- `docs/Fix-modulo-1/tareas.md`: enlaza esta evidencia y marca como hechas únicamente FIX-T030–FIX-T036 tras las verificaciones.
- `docs/Fix-modulo-1/evidencia-t030-t036.md`: registra este flujo, las pruebas nuevas, la trazabilidad local RF-01–RF-10 y los resultados de calidad.

## Flujo de consulta y cambios

El token identifica al actor. El servicio obtiene su negocio de la cuenta actual, valida su rol y exige que el perfil consultado pertenezca a ese negocio; un Profesional solo puede consultar su propio perfil. Dentro de una lectura transaccional reúne la cuenta del perfil, sus sucursales asignadas, el catálogo del negocio, las selecciones generales y las combinaciones por sucursal. Ordena sucursales y servicios por ID y calcula `ofrecido` para cada par. Si cuenta, sucursal global, servicio global, selección general, atención individual o combinación están inactivos, devuelve uno o varios motivos concretos. No persiste el valor calculado y tampoco modifica preferencias al consultar.

Las rutas de edición conservan sus límites: el administrador gestiona estados globales; el Profesional puede crear servicios de su negocio, editar únicamente los que creó y manejar sus propias selecciones y atención. Cada cambio de preferencia toma el bloqueo del perfil, valida pertenencia y guarda estado y auditoría juntos. Un reintento idéntico no crea evento; un rechazo no deja cambios parciales. Las bajas físicas siguen denegadas cuando existe uso o historial.

## Trazabilidad del fix

Los RF son los de [spec-fix.md](spec-fix.md), no los RF homónimos de fases anteriores. Cada fila apunta a pruebas creadas para este fix; las regresiones antiguas solo comprueban continuidad.

| RF | Evidencia nueva |
| --- | --- |
| RF-01 especialidad | [Alta, perfil heredado y edición HTTP](../../test/fix-modulo-1-t010-t018.e2e-spec.ts); [resultados 10–18](evidencia-t010-t018.md). |
| RF-02 descripción | [Alta y edición HTTP](../../test/fix-modulo-1-t010-t018.e2e-spec.ts); [resultados 10–18](evidencia-t010-t018.md). |
| RF-03 creación profesional | [Catálogo, selección propia y rollback](../../test/fix-modulo-1-t010-t018.e2e-spec.ts); [carrera con cambio global](../../test/fix-modulo-1-t034.integration-spec.ts). |
| RF-04 edición por autor | [Permisos y autoría estable](../../test/fix-modulo-1-t010-t018.e2e-spec.ts); [matriz transversal](../../test/fix-modulo-1-t030-t034.e2e-spec.ts). |
| RF-05 selección general | [Desmarcado, recuperación y reintentos](../../test/fix-modulo-1-t019-t023.integration-spec.ts); [matriz de oferta](../../test/fix-modulo-1-t030-t034.e2e-spec.ts). |
| RF-06 atención individual | [Rutas y carreras con horarios](../../test/fix-modulo-1-t024-t029.integration-spec.ts); [matriz de oferta](../../test/fix-modulo-1-t030-t034.e2e-spec.ts). |
| RF-07 servicios por sucursal | [Reemplazo y permisos HTTP](../../test/fix-modulo-1-t024-t029.e2e-spec.ts); [matriz transversal](../../test/fix-modulo-1-t030-t034.e2e-spec.ts). |
| RF-08 estados y conservación | [Persistencia de preferencias](../../test/fix-modulo-1-t019-t023.integration-spec.ts), [atención y selección por sucursal](../../test/fix-modulo-1-t024-t029.e2e-spec.ts), [seis niveles y oferta vacía](../../test/fix-modulo-1-t030-t034.e2e-spec.ts). |
| RF-09 reactivación sin empalmes | [Semana, excepción y dos conexiones](../../test/fix-modulo-1-t024-t029.integration-spec.ts). |
| RF-10 consulta explicable | [Estados, motivos y acceso propio](../../test/fix-modulo-1-t030-t034.e2e-spec.ts). |

## Pruebas y resultados

Se escribieron primero los casos HTTP de consulta: ambos fallaron con **404** porque la ruta no existía. La nueva suite de carreras se ejecutó antes de modificar el servicio y pasó, por lo que acredita comportamiento concurrente ya presente sin atribuirlo a la implementación de la consulta. Tras añadir la proyección, la suite HTTP dirigida pasó y se amplió para cubrir oferta vacía, seis motivos simultáneos y la matriz de autoría. También se verificó que un rechazo de selección por sucursal no inserta combinación ni evento.

- `npm run test:e2e -- --runInBand test/fix-modulo-1-t030-t034.e2e-spec.ts`: 1 suite y 2 pruebas aprobadas.
- `npm run test:integration -- --runInBand test/fix-modulo-1-t034.integration-spec.ts`: 1 suite y 2 pruebas aprobadas.
- `npm run build`: aprobado.
- `npm run lint`: aprobado.
- `npm test -- --runInBand`: 57 suites y 303 pruebas aprobadas.
- `npm run test:integration -- --runInBand`: 46 suites y 217 pruebas aprobadas.
- `npm run test:e2e -- --runInBand`: 25 suites y 140 pruebas aprobadas. Los mensajes de error impresos por algunos casos históricos provienen de fallos controlados usados para verificar la reversión; Jest no reportó fallos.

## Alcance pendiente

La consulta describe oferta configurada y estados efectivos del catálogo. El portal público, el cálculo de espacios disponibles, las reservas, WhatsApp y los reportes PDF no forman parte de este fix ni se presentan como operativos en [el contrato implementado](contrato-implementado.md).
