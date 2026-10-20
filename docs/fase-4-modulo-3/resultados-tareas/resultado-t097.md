# Resultado M3-T097

Fecha: 20 de octubre de 2026. Revisión base: `b5a41d0e890ddf3ea03c8b1052d0c0295364227a`; evidencia sobre los cambios de este lote en el árbol de trabajo.

## Decisión

La compuerta del escritor público queda **aprobada para continuar con E5, Portal conectado**. Los grupos T05–T11 tienen pruebas ejecutables, sin casos omitidos, y la regresión completa termina en verde. Esta decisión no habilita producción por sí sola: T098–T125 todavía deben construir y probar el portal, T126 debe añadir los controles operativos de apertura y cierre, y M3-T136 conserva el cierre final de fase.

M2-I001–M2-I003 y M2-I005–M2-I009 están acreditadas con escritores públicos reales. M2-I004/M3-I001 permanece expresamente diferida hasta el escritor manual real del módulo 4; por ello no se declara integración completa de RF-35–RF-37 del módulo 2.

## Archivos agregados o modificados

| Archivo | Qué hace |
| --- | --- |
| `test/support/evidencia-escritor-publico.ts` | Define la matriz ejecutable T05–T11, sus suites reales, documentos de evidencia, dependencias de T097 e integraciones M2 acreditadas o diferidas. Los comentarios explican por qué las rutas son explícitas y cómo funciona la compuerta. |
| `test/fase-4-t097-evidencia.spec.ts` | Comprueba que la matriz contiene exactamente T05–T11, que cada suite y evidencia existe, que ninguna suite citada está omitida, que todas las dependencias de T097 están hechas y que M2-I004 no se presenta como acreditada. Los comentarios señalan las condiciones que impedirían aprobar la habilitación. |
| `docs/fase-4-modulo-3/tareas.md` | Marca únicamente M3-T097 y enlaza este resultado. M3-T098 y las tareas posteriores permanecen pendientes. |
| `docs/fase-4-modulo-3/resultados-tareas/resultado-t097.md` | Conserva la decisión, la matriz T05–T11, el flujo de revisión, los resultados de pruebas y los límites de habilitación. |

No se modificaron servicios, controladores, entidades, migraciones ni esquema. T097 revisa la evidencia del escritor ya implementado; no incorpora una funcionalidad productiva nueva.

## Matriz T05–T11 revisada

| Grupo | Evidencia ejecutable revisada | Decisión |
| --- | --- | --- |
| T05 — Reloj y apartado | `fase-4-t065-t068.integration-spec.ts` prueba cinco minutos inmutables y límites exactos; `fase-4-t086-t091.integration-spec.ts` hace vencer el apartado mientras el escritor espera. | Aprobado: el reloj del servidor gobierna y ningún reintento renueva el plazo. |
| T06 — Reemplazo y salida | `fase-4-t058-t062.integration-spec.ts` prueba las dos transacciones durables; `fase-4-t065-t068.integration-spec.ts` cubre reemplazo fallido, interrupción, repetición, generación obsoleta y liberación atrasada. | Aprobado: el apartado anterior permanece liberado y una señal vieja no toca la generación actual. |
| T07 — Precio e historia | `fase-4-t080-t085.e2e-spec.ts` comprueba costo aceptado y snapshots; `fase-4-t086-t091.integration-spec.ts` enfrenta costo, duración y oferta con el escritor. | Aprobado: el precio aceptado y el resumen histórico no se reconstruyen desde el catálogo vivo. |
| T08 — Registro atómico | `fase-4-t074-t079.integration-spec.ts`, `fase-4-t080-t085.e2e-spec.ts` y `fase-4-t092-t096.integration-spec.ts` inyectan fallos entre escrituras y verifican filas finales. | Aprobado: cliente, cita pendiente, consumo y resultado confirman o revierten juntos; el folio es único. |
| T09 — Idempotencia y recuperación | `fase-4-t072-t073.integration-spec.ts`, `fase-4-t074-t079.integration-spec.ts`, `fase-4-t080-t085.e2e-spec.ts` y `fase-4-t092-t096.integration-spec.ts` cubren repetición, doble envío, ambos órdenes escritor/resolutor, timeout, preparación tardía y respuesta perdida. | Aprobado: existe una cita recuperable o un cierre terminal, nunca ambos; la incertidumbre devuelve 503. |
| T10 — Migraciones | `fase-4-t008-t013.integration-spec.ts`, `fase-4-t014-t019.integration-spec.ts` e `instalacion-t126-t127.integration-spec.ts` prueban instalación, actualización, relaciones por negocio, filas previas y equivalencia con `schema.sql`. | Aprobado: no se inventan valores históricos ni se pierden ocupaciones; el teléfono repetido permanece permitido. |
| T11 — Carreras de dominio | `fase-4-t086-t091.integration-spec.ts` y `fase-4-t092-t096.integration-spec.ts` usan dos conexiones, barreras y filas reales contra licencia, oferta, configuración, horario, bloqueos y asignaciones. | Aprobado: se verifica la respuesta y el estado persistido después de cada orden de commit. |

## Flujo de la compuerta

1. La matriz de soporte enumera únicamente T05–T11 y enlaza cada grupo con suites que ejercitan MariaDB, HTTP o ambos; una demo o un doble del escritor no forma parte de la lista.
2. La prueba de T097 abre cada archivo citado y rechaza rutas inexistentes o declaraciones `skip`, `it.skip`, `test.skip`, `xdescribe` y `xit`. Después comprueba que todos los documentos de resultado continúan disponibles.
3. La misma prueba lee `tareas.md` y exige que cada dependencia normativa de T097 ya tenga su casilla terminada. Así, la revisión no puede adelantarse a una carrera aún pendiente.
4. Finalmente reúne la evidencia de T086–T096, exige M2-I001–I003 e I005–I009 y comprueba que M2-I004 no esté en la lista acreditada. El texto diferido `M2-I004/M3-I001` debe seguir presente.
5. Con la prueba focalizada y las regresiones completas aprobadas, se registra la decisión de continuar al portal. La apertura operativa y la habilitación de producción siguen fuera del alcance de T097.

## Tests primero y resultados

La matriz y su prueba se escribieron antes de cambiar `tareas.md` o crear este documento. La primera ejecución de la prueba nueva pasó directamente porque la evidencia producida por T008–T096 estaba completa y coherente.

| Prueba | Qué verifica | Resultado |
| --- | --- | --- |
| Matriz T05–T11 | Orden exacto, al menos una suite y una evidencia por grupo, archivos existentes y ninguna suite citada omitida. | Aprobada. |
| Dependencias T097 | Las 17 tareas exigidas por T097 aparecen marcadas como hechas antes de marcar T097. | Aprobada. |
| Integración M2 | Ocho verificaciones públicas acreditadas y M2-I004 excluida de la lista, con M2-I004/M3-I001 todavía documentada como diferida. | Aprobada. |

## Verificaciones finales

| Comando | Resultado |
| --- | --- |
| `npm test -- --runInBand test/fase-4-t097-evidencia.spec.ts` | 1 suite, 3 pruebas aprobadas; código de salida 0. |
| `npm run build` | Aprobado; código de salida 0. |
| `npm run lint` | Aprobado sin advertencias; código de salida 0. |
| `npm test -- --runInBand` | 73 suites, 364 pruebas aprobadas; código de salida 0. |
| `npm run test:integration -- --runInBand` | 74 suites, 322 pruebas aprobadas; código de salida 0. |
| `npm run test:e2e -- --runInBand` | 29 suites, 159 pruebas aprobadas; código de salida 0. Los mensajes `ERROR` de T48, T49, T50, T72 y del fix son fallos deliberados de pruebas de respuesta segura y rollback. |

## Límite del lote

M3-T098 permanece sin marcar. No se implementó el frontend, no se añadió una cuenta de cliente, no se creó el escritor manual y no se declaró producción habilitada ni fase cerrada. El trabajo se detiene expresamente en M3-T097.
