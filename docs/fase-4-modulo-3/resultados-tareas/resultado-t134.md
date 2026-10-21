# M3-T134 — Integración pública del módulo 2 y caso diferido

Fecha: 21 de octubre de 2026. Revisión base: `ae9c8c9`; la comprobación se hizo sobre el árbol de trabajo actual.

## Flujo consolidado

El portal obtiene un apartado para una sesión anónima y prepara una clave de intento. El escritor público toma la sesión y el intento, después los recursos del negocio en orden común y la fila del Profesional compartida entre sucursales. Tras esperar bloqueos, vuelve a leer licencia, oferta, configuración, horario y ocupaciones con `READ COMMITTED` y el reloj del servidor. Si la combinación sigue válida, crea cliente y cita `pendiente`, consume el apartado y guarda el resultado del intento en un único commit. Si falla, no deja filas parciales; una respuesta perdida se resuelve bajo las mismas filas de exclusión.

Las pruebas de T086–T096 enfrentan ese escritor **real** con otro escritor público o con mutaciones reales mediante dos conexiones, barreras, bloqueos `FOR UPDATE` y bases MariaDB migradas y desechables. Comprueban estados y filas finales, no solo promesas. La compuerta T097 enlaza los grupos T05–T11 con suites y evidencias existentes, sin dobles del escritor.

## Matriz de integración pública

| Caso | Prueba real y resultado observado | Evidencia de detalle |
| --- | --- | --- |
| M2-I001 | El arnés abre dos conexiones independientes y coordina sus entradas con barreras; `conBaseMigrada` elimina la base temporal al terminar. | [T086–T091](resultado-t086-t091.md), T086 |
| M2-I002 | Dos solicitudes al mismo intervalo dejan una sola cita y un solo cliente; la contendiente recibe 409. | [T086–T091](resultado-t086-t091.md), T086 |
| M2-I003 | Sucursales con fechas locales distintas y traslape parcial UTC producen una sola ocupación; los extremos contiguos permiten dos citas. | [T086–T091](resultado-t086-t091.md), T087 |
| M2-I005 | El reloj alcanza exactamente `expira_en` mientras el escritor espera: no se consume el apartado ni se crean cita o cliente; el intento conserva su estado. | [T086–T091](resultado-t086-t091.md), T088 |
| M2-I006 | Cambios confirmados de costo, oferta, duración, anticipación, horizonte y modo se releen tras esperar. El costo aceptado se conserva y las selecciones incompatibles se rechazan sin filas parciales. | [T086–T091](resultado-t086-t091.md), T089–T090 |
| M2-I007 | Horario o excepción confirmados primero impiden reservar; si la cita confirma primero, permanece y se informa su causa vigente. Una barrera colectiva incorpora asignaciones nuevas al alcance y evita reservas incompatibles. | [T086–T091](resultado-t086-t091.md), T091; [T092–T096](resultado-t092-t096.md), T092 |
| M2-I008 | Vencimiento de licencia y límite exacto de 48 horas de suspensión durante la espera impiden la primera reserva; un resultado ya registrado se recupera después. | [T092–T096](resultado-t092-t096.md), T093 |
| M2-I009 | La misma clave concurrente reproduce una cita y folio; otra clave sobre el mismo apartado recibe 409. Un fallo SQL revierte cliente, cita, consumo e intento y permite reintentar. | [T092–T096](resultado-t092-t096.md), T094 |

**M2-I004/M3-I001 permanece pendiente.** Exige enfrentar un apartado público con la reserva manual real del módulo 4, incluso entre sucursales. Ese escritor todavía no existe en este alcance; ninguna prueba pública ni doble lo sustituye. Por ello no se marca la integración completa de RF-35–RF-37 del módulo 2 ni se cambian las casillas históricas de `docs/fase-3/tareas.md`. La lista anterior acredita los escenarios públicos que ordena el [plan de fase 4](../plan.md), con ese límite explícito.

## Tests primero y resultados de esta revisión

Se ejecutaron las pruebas antes de crear esta nota o marcar T134:

| Comando | Resultado | Qué verifica |
| --- | --- | --- |
| `npm run test:integration -- --runInBand fase-4-t086-t091 fase-4-t092-t096` | **2 suites, 24/24 pruebas aprobadas**, salida 0. | Carreras M2-I001–I003 e I005–I009 con escritor público, mutaciones y dos conexiones reales. |
| `npm run test:e2e -- --runInBand fase-4-t080-t085` | **1 suite, 15/15 pruebas aprobadas**, salida 0. | Registro, conflicto, resultado durable y recuperación por HTTP con base desechable. |
| `npm test -- --runInBand test/fase-4-t097-evidencia.spec.ts` | **1 suite, 3/3 pruebas aprobadas**, salida 0. | Matriz ejecutable de T05–T11, rutas de evidencia y exclusión expresa de M2-I004. |

Las verificaciones amplias de la misma revisión ya constan en [T126–T131](resultado-t126-t131.md): integración completa 74 suites/322 pruebas y HTTP completo 29 suites/164 pruebas. Esta tarea consolida la trazabilidad; no agrega lógica de producto, tests ni bloques de código. Por ello no hay código nuevo que requiera comentarios. Los comentarios existentes en las suites explican barreras, orden de bloqueos y limpieza de bases.

## Archivos afectados

| Archivo | Qué hace |
| --- | --- |
| `docs/fase-4-modulo-3/resultados-tareas/resultado-t134.md` | Nuevo: explica el flujo del escritor, relaciona cada M2-I con prueba y evidencia, registra la ejecución actual y conserva el límite manual. |
| `docs/fase-4-modulo-3/tareas.md` | Marca únicamente M3-T134 y enlaza esta consolidación; M3-I001 continúa sin marcar. |

No se modificaron servicios, entidades, migraciones ni bases cotidianas. T134 no habilita producción ni cierra la fase; M3-T135 y M3-T136 siguen pendientes.
