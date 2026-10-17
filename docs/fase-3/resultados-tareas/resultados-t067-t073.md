# Resultados M2-T067–M2-T073 — citas afectadas y causas vigentes

## Archivos y flujo

`src/disponibilidad/citas-afectadas.service.ts` añade una lectura transaccional de citas no canceladas. Resuelve el negocio, la licencia y el rol actuales antes de buscar citas; limita al Profesional a su perfil y conserva recursos inactivos para poder explicar su efecto. Filtra la fecha civil de inicio según la zona IANA de cada sucursal, conserva el inicio, fin y zona originales de la cita y evalúa su intervalo guardado contra horarios, descansos, todos los bloqueos aplicables y estados de oferta. Las desactivaciones se señalan solo para citas futuras. Deduplica causas por código y referencia y devuelve únicamente IDs operativos, intervalo y causas. No escribe citas, apartados ni mensajes. Los comentarios explican el margen UTC, el intervalo histórico y la recomposición de causas.

`src/disponibilidad/contexto-disponibilidad.service.ts` separa la autorización común de sesión, cuenta, rol, negocio y licencia en `resolverAcceso`. Así la consulta de varias citas puede autorizar al actor una vez sin escoger un Profesional arbitrario; la consulta normal sigue comprobando después el perfil solicitado. `src/disponibilidad/proyeccion-atencion.ts` conserva los intervalos y el ID de origen de cada descanso para explicar exactamente qué franja afecta una cita. `src/disponibilidad/atencion-interna.service.ts` agrega esos descansos de las fechas consultadas y `src/disponibilidad/motor-disponibilidad.service.ts` inicializa el nuevo campo en la proyección vacía. Sus comentarios señalan la procedencia de los cortes.

`src/disponibilidad/disponibilidad-entradas.ts` valida `desde`, `hasta` y filtros opcionales `personalId` y `sucursalId`, con máximo de 31 fechas inclusivas y sin campos ajenos. `src/disponibilidad/disponibilidad.module.ts` registra y exporta el nuevo servicio. `src/disponibilidad/disponibilidad.controller.ts` publica `GET /disponibilidad/citas-afectadas` tras JWT y roles, y reutiliza la traducción de fallos 503/500 sin devolver datos parciales. `test/fase-3-t067-t073.e2e-spec.ts` reúne las pruebas HTTP con dos negocios, zonas distintas, reloj controlado y MariaDB migrada desechable. `docs/fase-3/tareas.md` marca solo T067–T073 como hechas. `tsconfig.build.tsbuildinfo` es la caché incremental de la compilación y no añade lógica.

Flujo: **JWT → autorización actual del actor → validación de fechas/filtros → instantánea transaccional → citas no canceladas del negocio → fecha local por sucursal → oferta y atención actuales → comparación con el intervalo UTC persistido → causas vigentes deduplicadas → respuesta privada**. Un cambio operativo válido permanece guardado; la consulta posterior muestra las causas actuales sin cambiar estado ni horario de la cita. Retirar un bloqueo elimina solo su causa. Cancelar la cita la excluye de la lista. Cambiar modo, intervalo, anticipación, horizonte o duración del catálogo no recalcula su compromiso anterior.

## Tests primero y verificaciones

La prueba HTTP se escribió antes de registrar la ruta y falló con 404 en lugar del 401 exigido sin sesión. Tras implementar el servicio y la ruta, pasó. La compilación detectó que un tipo de causa usado por un método público debía exportarse; se corrigió y la compilación pasó.

La prueba comprueba permisos de Administrador, Recepción y Profesional propio, rechazo de Profesional ajeno y superadmin, aislamiento entre dos negocios, filtros inválidos y de sucursal ajena, fechas locales distintas para un mismo tramo UTC, exclusión de citas canceladas, referencias de descanso y de dos bloqueos, retirada independiente de cada bloqueo, cambio válido de horario guardado por HTTP, conservación de estado e intervalo, desactivación y reactivación individual de sucursal, cuenta, servicio, asignación y selecciones, relaciones retiradas, ausencia de una causa retrospectiva de oferta para una cita pasada, ausencia de causas por reglas comerciales o duración nueva, respuesta sin contactos y fallos técnicos 503/500 sin datos internos.

Resultado del 15 de octubre de 2026:

| Verificación | Resultado |
| --- | --- |
| `npm run build` | Pasó tras exportar el tipo de causa |
| `npm run lint` | Pasó |
| `npm test -- --runInBand` | 64 suites, 327 pruebas aprobadas |
| `npm run test:e2e -- --runInBand test/fase-3-t067-t073.e2e-spec.ts` | 1 suite, 1 prueba aprobada |
| `npm run test:integration -- --runInBand` | 55 suites, 250 pruebas aprobadas |
| `npm run test:e2e -- --runInBand` | 26 suites aprobadas y 2 fallidas; 142 pruebas aprobadas y 3 fallidas, de 145 |

Los tres fallos HTTP completos son los mismos observados en T057–T066: `auth-t45.e2e-spec.ts` espera un perfil sin `negocioNombre`, aunque la respuesta actual lo incluye; `horarios-t093-t095.e2e-spec.ts` inserta dos sucursales `Sede` del mismo negocio y choca con `uq_sucursales_negocio_nombre` antes de llegar a sus rutas. La prueba dirigida T067–T073 pasó otra vez tras el último ajuste, junto con compilación y lint. `git diff --check` no reportó errores de formato; Git avisó únicamente de la conversión futura de LF a CRLF.

La identificación de causas es una lectura operativa. La notificación y el ciclo de vida de las citas pertenecen a módulos posteriores.
