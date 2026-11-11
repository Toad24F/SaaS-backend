# M4-T001 — Matriz de aceptación prevista

Fuentes: [constitución](../constitucion-modulo-4.md), [RF locales y diez criterios](../spec.md), [plan y grupos T01–T11](../plan.md), [tareas](../tareas.md) y [ajustes aprobados](../../ajustes-licencias-administracion-agenda/spec.md). Los identificadores RF son locales: el prefijo ALA distingue los ajustes.

## Flujo de uso

1. Elegir el RF y ejecutar las tareas indicadas respetando sus dependencias.
2. Escribir la prueba de aceptación del escenario previsto; los grupos T01–T11 remiten al plan, no son nombres de suites ya implementadas.
3. Registrar revisión, comando, resultado y filas finales o recorrido de navegador según corresponda. Solo entonces sustituir «Pendiente» por un enlace a evidencia propia.
4. Revisar también los criterios CF y las integraciones diferidas. El criterio CF-01 es transversal a todos los RF; CF-10 exige las verificaciones relevantes de la entrega.

## RF locales

| RF | Tareas previstas | Grupo | Resultado | Prueba de aceptación prevista |
| --- | --- | --- | --- | --- |
| RF-01 | M4-T020–M4-T022, M4-T105 | T01, T11 | Pendiente | Administración y Recepción gestionan su negocio. |
| RF-02 | M4-T027, M4-T035, M4-T105 | T01, T02 | Pendiente | Profesional lee solo sus citas, contacto y notas. |
| RF-03 | M4-T018, M4-T022, M4-T047 | T01, T09 | Pendiente | IDs cruzados no revelan ni modifican datos ajenos. |
| RF-04 | M4-T023, M4-T065 | T01, T08 | Pendiente | Cuenta y licencia se releen incluso con sesión abierta. |
| RF-05 | M4-T024, M4-T101, M4-T114 | T01, T09 | Pendiente | Denegación comprensible sin detalles privados. |
| RF-06 | M4-T025–M4-T026, M4-T090 | T02, T11 | Pendiente | Día, semana y cuadrícula mensual con periodos completos de hasta 42 fechas; exceso de volumen explícito. |
| RF-07 | M4-T028, M4-T035, M4-T092 | T02 | Pendiente | Horario y combinación en zona de sucursal. |
| RF-08 | M4-T029–M4-T030, M4-T091 | T02 | Pendiente | Filtros y búsqueda sobre el periodo completo autorizado, orden estable y rechazo del exceso sin truncamiento. |
| RF-09 | M4-T026, M4-T035, M4-T090 | T02 | Pendiente | Cinco estados visibles, incluidas canceladas. |
| RF-10 | M4-T100, M4-T103 | T02, T11 | Pendiente | Cambio remoto actualiza agenda y advierte obsolescencia. |
| RF-11 | M4-T031, M4-T090 | T02 | Pendiente | Causas vigentes sin mutar las citas afectadas. |
| RF-12 | M4-T102, M4-T109 | T02, T11 | Pendiente | Móvil y teclado con foco y mensajes utilizables. |
| RF-13 | M4-T038, M4-T044, M4-T047 | T01, T03 | Pendiente | Directorio privado acotado al negocio. |
| RF-14 | M4-T039, M4-T098 | T03 | Pendiente | Ficha e historial por ID propio. |
| RF-15 | M4-T037, M4-T040, M4-T045 | T03 | Pendiente | Alta independiente, límites y teléfono mexicano. |
| RF-16 | M4-T043, M4-T054, M4-T106 | T03, T04 | Pendiente | Elegir ficha propia o crear una nueva. |
| RF-17 | M4-T045, M4-T054 | T03, T04 | Pendiente | Teléfonos compartidos exigen elección explícita por ID. |
| RF-18 | M4-T041, M4-T046 | T03, T10 | Pendiente | Corregir ficha conserva snapshots previos. |
| RF-19 | M4-T037, M4-T047, M4-T115 | T03, T09 | Pendiente | Inválidos y ajenos sin cambios parciales. |
| RF-20 | M4-T048, M4-T062, M4-T106 | T01, T04 | Pendiente | Solo roles gestores preparan selección y notas. |
| RF-21 | M4-T052, M4-T063, M4-T094 | T04 | Pendiente | Manual omite estrategia pública, mantiene reglas reales. |
| RF-22 | M4-T052, M4-T065 | T04, T08 | Pendiente | Revalidar dentro de la transacción tras esperar. |
| RF-23 | M4-T064, M4-T110–M4-T111 | T04, T08 | Pendiente | Solapamiento protegido entre sedes y extremos contiguos. |
| RF-24 | M4-T055–M4-T058, M4-T063 | T04, T05 | Pendiente | Una Confirmada, folio, snapshot y cupo compartido. |
| RF-25 | M4-T053, M4-T063, M4-T065 | T04, T10 | Pendiente | Catálogos posteriores no cambian costo ni historia. |
| RF-26 | M4-T061, M4-T066 | T04, T05 | Pendiente | Fallos revierten cliente, cita, evento y resultado. |
| RF-27 | M4-T058–M4-T060, M4-T066, M4-T107 | T05 | Pendiente | Resolver mismo envío, ausencia terminal o incertidumbre. |
| RF-28 | M4-T064–M4-T065, M4-I002 | T08 | Pendiente | Solo una ocupación incompatible o último lugar telefónico. |
| RF-29 | M4-T032, M4-T067, M4-T075 | T02, T06 | Pendiente | Detalle identifica cinco estados y origen. |
| RF-30 | M4-T068–M4-T075 | T06 | Pendiente | Transición válida versionada y con historial. |
| RF-31 | M4-T070, M4-T075 | T06 | Pendiente | Completada/No asistió solo desde fin de atención exacto. |
| RF-32 | M4-T073, M4-T108 | T06 | Pendiente | Motivo opcional separado de notas clínicas. |
| RF-33 | M4-T071, M4-T075–M4-T076 | T06, T08 | Pendiente | Solo Cancelada libera su ocupación. |
| RF-34 | M4-T072, M4-T076 | T06, T08 | Pendiente | Reactivación futura revalida sin imponer cupo telefónico. |
| RF-35 | M4-T072, M4-T076 | T06, T08 | Pendiente | Reactivación pasada u ocupada no sobrescribe. |
| RF-36 | M4-T073, M4-T075 | T06 | Pendiente | Corregir estados finales conserva actor y anterior/nuevo. |
| RF-37 | M4-T019, M4-T075, M4-T113 | T06, T10 | Pendiente | Pendiente pública permanece ocupando sin caducidad automática. |
| RF-38 | M4-T078, M4-T082–M4-T084 | T07 | Pendiente | Mover solo fecha/hora, conservar folio y combinación. |
| RF-39 | M4-T078–M4-T079, M4-T084–M4-T085 | T07 | Pendiente | Zona/DST, duración y separación históricas completas. |
| RF-40 | M4-T081, M4-T085, M4-T087 | T07, T08 | Pendiente | Conflicto entre sedes conserva horario anterior. |
| RF-41 | M4-T082, M4-T086 | T07, T10 | Pendiente | Historial conserva horario y zona anterior/nueva. |
| RF-42 | M4-T084, M4-T086 | T07 | Pendiente | Pasado y fallo no alteran cita ni historial. |
| RF-43 | M4-T068, M4-T086, M4-T103 | T05, T07 | Pendiente | Versión vieja devuelve conflicto, sin sobrescritura. |
| RF-44 | M4-T065, M4-T076, M4-T087, M4-I003 | T08 | Pendiente | Cambios confirmados primero se releen bajo bloqueo. |
| RF-45 | M4-T019, M4-T042, M4-T056, M4-T082 | T03, T06, T07 | Pendiente | Evento con actor real y valores operativos en el commit. |
| RF-46 | M4-T036, M4-T101, M4-T115 | T09, T11 | Pendiente | Vacío legítimo separado de fallo y resultado parcial. |
| RF-47 | M4-T024, M4-T114–M4-T115 | T09 | Pendiente | Entrada, permisos, conflicto y fallo seguros y distintos. |

## Ajustes aplicables e integraciones

Las reglas de suspensión se conservan mediante regresión; sus avisos no se reimplementan en M4. Las reglas de configuración, oferta activa y motor se heredan de las fuentes normativas del inventario T002. Se destacan aquí las que requieren evidencia de integración o regresión del panel.

| RF de ajustes | Tareas previstas | Prueba prevista | Resultado |
| --- | --- | --- | --- |
| ALA-RF-03 | M4-T023 | T01: plazo 0–30, dos días por defecto. | Pendiente |
| ALA-RF-04 | M4-T023, M4-T113 | T01: repetición no altera plazo original. | Pendiente |
| ALA-RF-05 | M4-T113 | T10: conservar avisos programados existentes. | Pendiente |
| ALA-RF-06 | M4-T023 | T01: suspensión inmediata incluso con sesión abierta. | Pendiente |
| ALA-RF-07 | M4-T023, M4-T065 | T01, T08: mínimo entre bloqueo y vencimiento. | Pendiente |
| ALA-RF-08 | M4-T113 | T10: regresión de vencimiento y avisos. | Pendiente |
| ALA-RF-43 | M4-T055, M4-T078, M4-I003 | T04, T07, T08: atención y fin protegido separados. | Pendiente |
| ALA-RF-44 | M4-T064, M4-I003 | T08: incompatibles y contiguos entre sucursales. | Pendiente |
| ALA-RF-45 | M4-T052, M4-T081 | T04, T07: duración y separación caben en tramo continuo. | Pendiente |
| ALA-RF-54 | M4-T078, M4-T113 | T07, T10: cambios no reescriben separación histórica. | Pendiente |
| ALA-RF-56 | M4-T063, M4-I001 | T04: máximo dos futuras por sucursal y teléfono. | Pendiente |
| ALA-RF-57 | M4-T063, M4-I001 | T04: inicio exacto, pasadas, canceladas y apartados excluidos. | Pendiente |
| ALA-RF-58 | M4-I001 | T08: cupos independientes entre sucursales y negocios. | Pendiente |
| ALA-RF-59 | M4-I002 | T08: carrera por último lugar sin filas parciales. | Pendiente |
| ALA-RF-60 | M4-T113 | T10: rechazo público conserva apartado y plazo. | Pendiente |
| ALA-RF-61 | M4-T024, M4-T114 | T09: mensaje de cupo sin datos de otras citas. | Pendiente |
| ALA-RF-62 | M4-T045, M4-T063 | T03, T04: personas independientes con teléfono igual. | Pendiente |
| ALA-RF-63 | M4-I001–M4-I003 | T08: integración del escritor manual real. | Pendiente |
| ALA-RF-64 | M4-T022, M4-T114 | T01, T09: rol y negocio del servidor. | Pendiente |
| ALA-RF-65 | M4-T065, M4-I003 | T08: revalidación, exclusión y rollback. | Pendiente |
| ALA-RF-66 | M4-T058, M4-T066 | T05: recuperación no consume otro cupo. | Pendiente |
| ALA-RF-67 | M4-T115 | T09: fallo nunca equivale a vacío o ausencia terminal. | Pendiente |
| ALA-RF-68 | M4-T113 | T10: recuperar resultado público y liberar apartado sin licencia. | Pendiente |
| ALA-RF-69 | M4-T113 | T10: cambios administrativos y repeticiones conservan auditoría. | Pendiente |

ALA-I001 se acredita en M4-I001; ALA-I002 en M4-I002; ALA-I003 en M4-I003. M2-I004 y M3-I001 se consolidan en M4-T112 después de M4-T110–M4-T111 y M4-I001–M4-I003. Todos permanecen pendientes: requieren escritores reales, dos conexiones, barreras, ambos órdenes y filas finales. La prueba de control M4-T006 solo acredita infraestructura.

## Diez criterios de finalización

| Criterio | Tareas | Pruebas previstas | Resultado |
| --- | --- | --- | --- |
| CF-01 | M4-T001, M4-T123 | T01–T11: cada RF con evidencia propia actual. | Pendiente |
| CF-02 | M4-T022–M4-T023, M4-T105 | T01, T11: roles, aislamiento y licencia. | Pendiente |
| CF-03 | M4-T035–M4-T036, M4-T100, M4-T109 | T02, T11: agenda real y accesible. | Pendiente |
| CF-04 | M4-T045–M4-T047, M4-T098–M4-T099 | T03: directorio y snapshots. | Pendiente |
| CF-05 | M4-T061, M4-T063–M4-T065, M4-T106 | T04: escritor manual y rollback. | Pendiente |
| CF-06 | M4-T075–M4-T076, M4-T108 | T06: estados, límites y reactivación. | Pendiente |
| CF-07 | M4-T084–M4-T087, M4-T108 | T07: movimiento íntegro e historial. | Pendiente |
| CF-08 | M4-T066, M4-T086, M4-T107, M4-T115 | T05, T09: incertidumbre y versiones. | Pendiente |
| CF-09 | M4-T110–M4-T112, M4-I001–M4-I003 | T08: M2-I004/M3-I001 y ALA-I001–ALA-I003 reales. | Pendiente |
| CF-10 | M4-T116–M4-T121 | T09–T11: build, lint y suites relevantes, sin módulo 5. | Pendiente |

## Antecedentes

Los resultados de módulos 2/3 y ajustes son contexto de implementación; no acreditan aceptación M4 ni cierran M3-T136. Ver [contratos conservados](contratos-conservados-t002.md).

## Evidencia nueva

`test/fase-5-t001-t002.spec.ts` verifica estructura completa y enlaces. `test/fase-5-t003-t006.integration-spec.ts` prueba infraestructura y fixtures en MariaDB. Ninguna convierte en aprobados los RF funcionales de esta matriz. Comandos y resultados propios se registran en [el informe del lote](resultados-m4-t001-t006.md).

Las migraciones aditivas, sus restricciones y la regresión de instalación tienen evidencia propia en [M4-T007–M4-T012](m4-t007-t012.md). No acreditan todavía entidades completas, escritor manual, autorización operativa ni la aceptación funcional de los RF.

Las entidades completas, instalación/actualización y el evento atómico de alta pública se verifican en [M4-T013–M4-T019](m4-t013-t019.md). Esta evidencia es parcial para RF-24/RF-37/RF-45: no acredita aún los escritores y permisos operativos del panel ni cierra sus aceptaciones completas.

Los permisos cerrados, revalidación de sesión/rol/negocio/licencia, alcance y errores seguros tienen evidencia propia en [M4-T020–M4-T024](m4-t020-t024.md). No habilitan ni acreditan por sí solos las futuras rutas, consultas paginadas o escrituras del panel; sus RF completos permanecen pendientes.

El servicio de consulta por periodo, alcance Profesional, proyección histórica por zona, filtros, búsqueda y páginas tiene evidencia propia en [M4-T025–M4-T030](m4-t025-t030.md). Ese lote acreditó la lectura interna sin causas, detalle, historial, rutas o agenda conectada, ni cerró los RF completos.

Las causas vigentes, snapshot de detalle, historial ordenado y tres rutas privadas reales se verifican en [M4-T031–M4-T036](m4-t031-t036.md), incluyendo filtros/zonas y vacío frente a fallo sin resultado parcial. Esta evidencia habilita lecturas backend; no acredita frontend, directorio, escritores o aceptación completa de los RF de gestión.

El [ajuste de periodo completo](ajuste-agenda-periodo-completo.md), solicitado después de revisar la demo visual, sustituye las páginas de citas por hasta 42 fechas completas y rechazo explícito al superar 1.000 citas tras alcance/filtros. Mantiene historial paginado, detalle completo y disponibilidad de 31 fechas. Las evidencias anteriores conservan los contratos y resultados históricos de sus revisiones; este ajuste rige el lector actual. La aceptación de frontend sigue pendiente.

El dominio de directorio tiene evidencia propia en [M4-T037–M4-T042](m4-t037-t042.md): validación compartida de contacto, búsqueda paginada por negocio, ficha e historial por ID, alta independiente, corrección con versión y auditoría atómica sin duplicar contacto. Se prueban teléfonos compartidos, snapshots, rollback, concurrencia y revocación durante una espera real. Es evidencia parcial para RF-13–RF-19, RF-43 y RF-45; no acredita elección del cliente para el escritor manual, rutas HTTP de clientes, frontend ni aceptación completa de esos RF.

La selección interna por ID explícito y las cinco rutas privadas del directorio tienen evidencia propia en [M4-T043–M4-T047](m4-t043-t047.md): dos tests transaccionales y siete HTTP nuevos comprueban teléfonos compartidos, aislamiento, permisos, páginas, snapshots, versión obsoleta, `no-store` y errores seguros. Amplía la evidencia backend de RF-03, RF-13–RF-19, RF-43 y RF-45–RF-47; la integración de esa selección con la cita manual, el frontend y los criterios completos siguen pendientes.

La validación y preparación idempotente de intentos manuales, junto con la exclusión y revalidación previas a escribir, tienen evidencia propia en [M4-T048–M4-T052](m4-t048-t052.md): 35 tests unitarios y 20 de integración nuevos. Se observan esperas reales, orden de bloqueos, cambios de reglas/contacto/ocupación/cupo y límites de acceso/reloj con motor real. Es evidencia parcial de RF-03, RF-16–RF-17, RF-20–RF-23, RF-27–RF-28, RF-43–RF-44 y RF-47; no acredita todavía creación/registro de citas, resolución incierta, rutas manuales, frontend ni M2-I004/M3-I001/ALA-I001–ALA-I003.
