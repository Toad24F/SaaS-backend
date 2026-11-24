# M4-T123 — Matriz final de aceptación

Fuentes vigentes: [constitución](../constitucion-modulo-4.md), [especificación y diez criterios](../spec.md), [plan](../plan.md), [tareas](../tareas.md) y [ajustes](../../ajustes-licencias-administracion-agenda/spec.md). La [matriz T001](matriz-aceptacion-t001.md) conserva la planificación histórica; este archivo registra la revisión final. Los comandos, revisiones, conteos y límites se consolidan en [T116–T124](m4-t116-t124.md). Cada enlace de prueba apunta al archivo ejecutable revalidado en esa ejecución, no a una promesa ni a una demo.

## RF locales

| RF | Prueba propia ejecutable y comprobación | Resultado |
| --- | --- | --- |
| RF-01 | [Roles HTTP](../../../test/fase-5-t021-t023.integration-spec.ts), [gestión real en navegador](../../../test/fase-5-t104-t109.e2e-spec.ts): Administración/Recepción gestionan su negocio. | Aprobado. |
| RF-02 | [Alcance de agenda](../../../test/fase-5-t026-t030.integration-spec.ts), [Profesional en navegador](../../../test/fase-5-t104-t109.e2e-spec.ts): solo citas propias, contacto y notas; sin escritura. | Aprobado. |
| RF-03 | [Aislamiento HTTP](../../../test/fase-5-t044-t047.e2e-spec.ts), [superficie segura](../../../test/fase-5-t114-t115.e2e-spec.ts): IDs ajenos equivalen a inexistentes. | Aprobado. |
| RF-04 | [Acceso y licencia](../../../test/fase-5-t021-t023.integration-spec.ts), [relectura tras espera](../../../test/fase-5-t064-t065.integration-spec.ts): sesión abierta no evita revocación o vencimiento. | Aprobado. |
| RF-05 | [Errores operativos](../../../test/fase-5-t024.e2e-spec.ts), [frontera segura](../../../test/fase-5-t114-t115.e2e-spec.ts): denegación sin datos privados. | Aprobado. |
| RF-06 | [Periodo completo](../../../test/agenda-periodo-completo.e2e-spec.ts), [vistas conectadas](../../../../frontend-saas/tests/agenda.consulta-conectada.test.js): hasta 42 fechas, exceso rechazado íntegro. | Aprobado. |
| RF-07 | [Zona y proyección](../../../test/fase-5-t026-t030.integration-spec.ts), [detalle](../../../test/fase-5-t034-t036.e2e-spec.ts): combinación y horario de sucursal. | Aprobado. |
| RF-08 | [Filtros del periodo](../../../test/agenda-periodo-completo.e2e-spec.ts), [filtros y respuestas fuera de orden](../../../../frontend-saas/tests/agenda.consulta-conectada.test.js). | Aprobado. |
| RF-09 | [Lectura de estados](../../../test/fase-5-t026-t030.integration-spec.ts), [presentación](../../../../frontend-saas/tests/agenda.presentacion-conectada.test.js): canceladas y cinco estados visibles. | Aprobado. |
| RF-10 | [Coordinador de actualización y versión](../../../../frontend-saas/tests/agenda.refresco-errores.test.js): actualización automática y aviso de versión anterior. | Aprobado. |
| RF-11 | [Causas vigentes](../../../test/fase-5-t031-t033.integration-spec.ts), [presentación de agenda](../../../../frontend-saas/tests/agenda.presentacion-conectada.test.js): afectaciones sin mutar citas. | Aprobado. |
| RF-12 | [Móvil y teclado reales](../../../test/fase-5-t104-t109.e2e-spec.ts): foco, formularios y ausencia de desbordamiento. | Aprobado. |
| RF-13 | [Directorio HTTP](../../../test/fase-5-t044-t047.e2e-spec.ts): búsqueda por nombre/teléfono y negocio; Profesional denegado. | Aprobado. |
| RF-14 | [Ficha e historial](../../../test/fase-5-t038-t042.integration-spec.ts), [directorio conectado](../../../test/fase-5-t104-t109.e2e-spec.ts). | Aprobado. |
| RF-15 | [Entrada](../../../test/fase-5-t037-clientes.spec.ts), [alta HTTP](../../../test/fase-5-t044-t047.e2e-spec.ts): límites y normalización mexicana. | Aprobado. |
| RF-16 | [Selección explícita](../../../test/fase-5-t043.integration-spec.ts), [alta real con ficha/nueva](../../../test/fase-5-t104-t109.e2e-spec.ts). | Aprobado. |
| RF-17 | [Fichas independientes](../../../test/fase-5-t043.integration-spec.ts), [cupo sin fusión](../../../test/fase-5-t063.e2e-spec.ts): mismo teléfono con personas distintas. | Aprobado. |
| RF-18 | [Corrección con snapshot intacto](../../../test/fase-5-t038-t042.integration-spec.ts), [corrección conectada](../../../test/fase-5-t104-t109.e2e-spec.ts). | Aprobado. |
| RF-19 | [Validación y aislamiento](../../../test/fase-5-t044-t047.e2e-spec.ts), [rollback y fallos](../../../test/fase-5-t114-t115.e2e-spec.ts). | Aprobado. |
| RF-20 | [Entrada manual](../../../test/fase-5-t048-manual.spec.ts), [formulario contra API real](../../../test/fase-5-t104-t109.e2e-spec.ts). | Aprobado. |
| RF-21 | [Revalidación manual](../../../test/fase-5-t049-t052.integration-spec.ts), [aceptación HTTP](../../../test/fase-5-t063.e2e-spec.ts): omite reglas públicas y conserva restricciones operativas. | Aprobado. |
| RF-22 | [Relectura de reglas después del bloqueo](../../../test/fase-5-t064-t065.integration-spec.ts): consultar no garantiza reservar. | Aprobado. |
| RF-23 | [Ocupación entre sucursales](../../../test/fase-5-t064-t065.integration-spec.ts), [manual/apartado real](../../../test/fase-5-t110-t112.integration-spec.ts): incompatibles y contiguos. | Aprobado. |
| RF-24 | [Commit manual](../../../test/fase-5-t053-t058.integration-spec.ts), [cupo compartido](../../../test/fase-5-t110-t112.integration-spec.ts): Confirmada, folio y snapshots. | Aprobado. |
| RF-25 | [Costo y nombres históricos](../../../test/fase-5-t053-t058.integration-spec.ts), [cambios de reglas](../../../test/fase-5-t064-t065.integration-spec.ts). | Aprobado. |
| RF-26 | [Cinco puntos de rollback](../../../test/fase-5-t053-t058.integration-spec.ts), [fallos tras SQL real](../../../test/fase-5-t114-t115.e2e-spec.ts). | Aprobado. |
| RF-27 | [Resolutor en ambos órdenes](../../../test/fase-5-t059-t061.integration-spec.ts), [respuesta perdida y recarga](../../../test/fase-5-t104-t109.e2e-spec.ts): misma cita o incertidumbre. | Aprobado. |
| RF-28 | [Carreras manuales](../../../test/fase-5-t064-t065.integration-spec.ts), [manual/público y último cupo](../../../test/fase-5-t110-t112.integration-spec.ts): un ganador compatible. | Aprobado. |
| RF-29 | [Detalle histórico](../../../test/fase-5-t034-t036.e2e-spec.ts), [cinco estados y origen](../../../test/fase-5-t074-t075.e2e-spec.ts). | Aprobado. |
| RF-30 | [Cambios versionados y evento](../../../test/fase-5-t068-t072.integration-spec.ts), [PATCH real](../../../test/fase-5-t074-t075.e2e-spec.ts). | Aprobado. |
| RF-31 | [Límite exacto de fin](../../../test/fase-5-t074-t075.e2e-spec.ts): antes/en/después de atención para Completada/No asistió. | Aprobado. |
| RF-32 | [Motivo opcional](../../../test/fase-5-t073.integration-spec.ts), [recorrido conectado](../../../test/fase-5-t104-t109.e2e-spec.ts). | Aprobado. |
| RF-33 | [Solo Cancelada libera](../../../test/fase-5-t074-t075.e2e-spec.ts), [cancelación contra reserva](../../../test/fase-5-t076.e2e-spec.ts). | Aprobado. |
| RF-34 | [Reactivación histórica sin cupo de alta](../../../test/fase-5-t068-t072.integration-spec.ts), [carreras reales](../../../test/fase-5-t076.e2e-spec.ts). | Aprobado. |
| RF-35 | [Reactivación pasada/ocupada](../../../test/fase-5-t068-t072.integration-spec.ts), [reserva rival](../../../test/fase-5-t076.e2e-spec.ts). | Aprobado. |
| RF-36 | [Historial de correcciones](../../../test/fase-5-t073.integration-spec.ts), [cinco estados](../../../test/fase-5-t074-t075.e2e-spec.ts): anterior/nuevo, actor e instante. | Aprobado. |
| RF-37 | [Pendiente pública persistente](../../../test/fase-5-t074-t075.e2e-spec.ts), [regresión del portal](../../../test/fase-5-t110-t112.integration-spec.ts). | Aprobado. |
| RF-38 | [Movimiento HTTP](../../../test/fase-5-t083-t086.e2e-spec.ts), [movimiento conectado](../../../test/fase-5-t104-t109.e2e-spec.ts): mismo folio y combinación. | Aprobado. |
| RF-39 | [Duración/separación históricas](../../../test/fase-5-t077-t082.integration-spec.ts), [zona y DST](../../../test/fase-5-t083-t086.e2e-spec.ts). | Aprobado. |
| RF-40 | [Conflicto y contigüidad entre sedes](../../../test/fase-5-t083-t086.e2e-spec.ts), [movimiento/apartado](../../../test/fase-5-t087.e2e-spec.ts). | Aprobado. |
| RF-41 | [Horario y evento atómicos](../../../test/fase-5-t077-t082.integration-spec.ts), [historial HTTP](../../../test/fase-5-t083-t086.e2e-spec.ts). | Aprobado. |
| RF-42 | [Pasado, zona inválida y rollback](../../../test/fase-5-t083-t086.e2e-spec.ts): horario y evento anteriores intactos. | Aprobado. |
| RF-43 | [Dos actores y versión](../../../test/fase-5-t068-t072.integration-spec.ts), [edición obsoleta](../../../test/fase-5-t083-t086.e2e-spec.ts), [estado frontend](../../../../frontend-saas/tests/m4-clientes-horario.test.js). | Aprobado. |
| RF-44 | [Cambios durante espera](../../../test/fase-5-t064-t065.integration-spec.ts), [estados](../../../test/fase-5-t076.e2e-spec.ts), [movimiento](../../../test/fase-5-t087.e2e-spec.ts), [escritores](../../../test/fase-5-t110-t112.integration-spec.ts). | Aprobado. |
| RF-45 | [Evento público](../../../test/fase-5-t013-t019.integration-spec.ts), [auditoría de clientes](../../../test/fase-5-t038-t042.integration-spec.ts), [evento manual](../../../test/fase-5-t053-t058.integration-spec.ts), [movimiento](../../../test/fase-5-t077-t082.integration-spec.ts). | Aprobado. |
| RF-46 | [Vacío frente a fallo](../../../test/fase-5-t034-t036.e2e-spec.ts), [fallos sin parciales](../../../test/fase-5-t114-t115.e2e-spec.ts), [frontend](../../../../frontend-saas/tests/agenda.consulta-conectada.test.js). | Aprobado. |
| RF-47 | [400/401/403/404/409/500/503 y no-store](../../../test/fase-5-t114-t115.e2e-spec.ts), [incertidumbre real](../../../test/fase-5-t066.e2e-spec.ts). | Aprobado. |

## Ajustes e integraciones

| RF de ajustes | Prueba reejecutada | Resultado |
| --- | --- | --- |
| ALA-RF-03 | [Suspensión durable](../../../test/ala-t028-t034.integration-spec.ts): plazo entero 0–30 y valor inicial dos. | Aprobado. |
| ALA-RF-04 | [Repetición idempotente de licencia](../../../test/ala-t028-t034.integration-spec.ts): no reinicia plazo. | Aprobado. |
| ALA-RF-05 | [Bandeja y avisos](../../../test/ala-t036-t040.integration-spec.ts): conserva notificaciones programadas. | Aprobado. |
| ALA-RF-06 | [Sesión abierta](../../../test/ala-t050.e2e-spec.ts): suspensión inmediata y límites exactos. | Aprobado. |
| ALA-RF-07 | [Vencimiento y suspensión](../../../test/ala-t050.e2e-spec.ts), [escritor tras espera](../../../test/fase-5-t064-t065.integration-spec.ts). | Aprobado. |
| ALA-RF-08 | [Ciclo y avisos](../../../test/ala-t041-t045.integration-spec.ts), [fallos y carreras de correo](../../../test/ala-t046-t049.integration-spec.ts). | Aprobado. |
| ALA-RF-43 | [Snapshots manuales](../../../test/fase-5-t053-t058.integration-spec.ts), [movimiento histórico](../../../test/fase-5-t077-t082.integration-spec.ts): fin de atención y fin protegido separados. | Aprobado. |
| ALA-RF-44 | [Carreras entre sucursales](../../../test/fase-5-t110-t112.integration-spec.ts): separación y extremos contiguos. | Aprobado. |
| ALA-RF-45 | [Revalidación](../../../test/fase-5-t049-t052.integration-spec.ts), [destino histórico](../../../test/fase-5-t077-t082.integration-spec.ts): duración y separación completas dentro de atención. | Aprobado. |
| ALA-RF-54 | [Separación histórica del apartado](../../../test/ala-t102-t109.integration-spec.ts), [movimiento](../../../test/fase-5-t077-t082.integration-spec.ts): configuración nueva no reescribe compromisos. | Aprobado. |
| ALA-RF-56 | [Cupo compartido I001](../../../test/fase-5-t110-t112.integration-spec.ts): pública más manual impiden tercera. | Aprobado. |
| ALA-RF-57 | [Límites del contador](../../../test/ala-t110-t115.integration-spec.ts), [alta manual](../../../test/fase-5-t063.e2e-spec.ts): excluye inicio exacto, pasadas, canceladas y apartados. | Aprobado. |
| ALA-RF-58 | [Otra sucursal](../../../test/fase-5-t110-t112.integration-spec.ts), [aislamiento](../../../test/ala-t110-t115.integration-spec.ts). | Aprobado. |
| ALA-RF-59 | [I002, dos conexiones y ambos órdenes](../../../test/fase-5-t110-t112.integration-spec.ts): un último lugar, sin filas parciales. | Aprobado. |
| ALA-RF-60 | [Cupo público y vencimiento original](../../../test/ala-t110-t115.integration-spec.ts), [corrección](../../../test/ala-t116-t121.e2e-spec.ts): rechazo no renueva el apartado. | Aprobado. |
| ALA-RF-61 | [Mensaje de cupo HTTP](../../../test/fase-5-t063.e2e-spec.ts): sin revelar otras citas. | Aprobado. |
| ALA-RF-62 | [Fichas y snapshots independientes](../../../test/fase-5-t063.e2e-spec.ts), [ambos canales](../../../test/fase-5-t110-t112.integration-spec.ts). | Aprobado. |
| ALA-RF-63 | [Escritores reales I001–I003](../../../test/fase-5-t110-t112.integration-spec.ts): cupo y separación compartidos. | Aprobado. |
| ALA-RF-64 | [Pertenencia y rol reales](../../../test/fase-5-t114-t115.e2e-spec.ts): identidad enviada no es autoridad. | Aprobado. |
| ALA-RF-65 | [Revalidación y carreras](../../../test/fase-5-t064-t065.integration-spec.ts), [público/manual](../../../test/fase-5-t110-t112.integration-spec.ts): exclusión común y rollback. | Aprobado. |
| ALA-RF-66 | [Resolución e idempotencia](../../../test/fase-5-t059-t061.integration-spec.ts), [cupo público](../../../test/ala-t116-t121.integration-spec.ts): mismo resultado sin otro consumo. | Aprobado. |
| ALA-RF-67 | [Fallos sin parciales](../../../test/fase-5-t114-t115.e2e-spec.ts): fallo no equivale a vacío ni ausencia terminal. | Aprobado. |
| ALA-RF-68 | [Recuperación pública sin licencia](../../../test/ala-t133-t140.e2e-spec.ts): recuperar resultado y liberar apartado propio. | Aprobado. |
| ALA-RF-69 | [Auditoría de operaciones de licencia](../../../test/ala-t028-t034.integration-spec.ts), [estados](../../../test/fase-5-t068-t072.integration-spec.ts): repeticiones no duplican eventos. | Aprobado. |

ALA-I001, ALA-I002 y ALA-I003 tienen [evidencia propia de barreras y filas finales](m4-t104-t115.md), vinculada en [tareas ALA](../../ajustes-licencias-administracion-agenda/tareas.md). M2-I004 y M3-I001 reciben el mismo anexo de escritores reales en [módulo 2](../../fase-3-modulo-2/tareas.md) y [módulo 3](../../fase-4-modulo-3/tareas.md); sus casillas externas se conservan. Su revalidación actual corresponde a la suite de trece casos de integración citada arriba y al informe de cierre. No se cierra M3-T136 por este enlace.

Los demás ajustes aplicables conservan regresión completa en las suites ALA, públicas, de licencia y del motor incluidas en integración/HTTP. La [matriz inicial](matriz-aceptacion-t001.md) contiene sus relaciones previstas; no convierte una fila pendiente histórica en aceptación nueva por sí sola.

## Diez criterios

| Criterio | Pruebas y evidencia | Resultado |
| --- | --- | --- |
| CF-01 | Las 47 filas anteriores y [control de trazabilidad](../../../test/fase-5-t122-t124.spec.ts) enlazan aceptación propia y resultados actuales. | Aprobado. |
| CF-02 | [Acceso/licencia](../../../test/fase-5-t021-t023.integration-spec.ts), [roles reales](../../../test/fase-5-t104-t109.e2e-spec.ts). | Aprobado. |
| CF-03 | [Periodo completo](../../../test/agenda-periodo-completo.e2e-spec.ts), [agenda conectada](../../../../frontend-saas/tests/agenda.consulta-conectada.test.js), [móvil/teclado](../../../test/fase-5-t104-t109.e2e-spec.ts), [causas](../../../test/fase-5-t031-t033.integration-spec.ts). | Aprobado. |
| CF-04 | [Directorio real](../../../test/fase-5-t044-t047.e2e-spec.ts), [selección](../../../test/fase-5-t043.integration-spec.ts), [corrección conectada](../../../test/fase-5-t104-t109.e2e-spec.ts). | Aprobado. |
| CF-05 | [Registro atómico](../../../test/fase-5-t053-t058.integration-spec.ts), [reglas durante espera](../../../test/fase-5-t064-t065.integration-spec.ts), [formulario real](../../../test/fase-5-t104-t109.e2e-spec.ts). | Aprobado. |
| CF-06 | [Cinco estados y fin exacto](../../../test/fase-5-t074-t075.e2e-spec.ts), [carreras](../../../test/fase-5-t076.e2e-spec.ts), [historial](../../../test/fase-5-t073.integration-spec.ts). | Aprobado. |
| CF-07 | [Movimiento HTTP](../../../test/fase-5-t083-t086.e2e-spec.ts), [apartado rival](../../../test/fase-5-t087.e2e-spec.ts). | Aprobado. |
| CF-08 | [Resolución durable](../../../test/fase-5-t059-t061.integration-spec.ts), [respuesta perdida](../../../test/fase-5-t066.e2e-spec.ts), [versiones y rollback](../../../test/fase-5-t083-t086.e2e-spec.ts), [recarga](../../../test/fase-5-t104-t109.e2e-spec.ts). | Aprobado. |
| CF-09 | [T110–T112 e I001–I003](../../../test/fase-5-t110-t112.integration-spec.ts), [barreras, respuestas y filas finales](m4-t104-t115.md). | Aprobado. |
| CF-10 | [Informe de revisión y comandos T116–T124](m4-t116-t124.md), [guía de operación](../operacion-recuperacion.md). WhatsApp, PDF y pagos siguen fuera de M4. | Aprobado. |

## Límites

Los tests Node comprueban estado y presentación; las rutas y escritores se acreditan además con MariaDB/HTTP/navegador real. Los recorridos de frontend con respuestas simuladas no sustituyen esas pruebas. Una suite aprobada acredita únicamente sus aserciones. La entrega local no certifica operación en producción ni cierra pendientes de otros módulos.
