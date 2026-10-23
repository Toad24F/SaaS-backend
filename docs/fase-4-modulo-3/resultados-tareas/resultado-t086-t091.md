# Resultado M3-T086–T091

Fecha: 20 de octubre de 2026. Revisión base: `c47842f7470d68ffcfa9ac6bc0a9cf030935c91e`; evidencia sobre los cambios de este lote en el árbol de trabajo.

## Alcance y archivos

Este lote agrega la evidencia de concurrencia del escritor público real desde T086 hasta T091. Las pruebas usan dos `DataSource` independientes, transacciones `READ COMMITTED`, filas retenidas con `FOR UPDATE`, barreras de arranque, reloj controlado y una base MariaDB recién migrada y desechable por caso. No se modificó la lógica productiva: el protocolo implementado en los lotes anteriores satisfizo los nuevos escenarios.

| Archivo agregado o modificado | Qué hace |
| --- | --- |
| `test/fase-4-t086-t091.integration-spec.ts` | Agrega 13 pruebas de integración sobre apartados, intentos y reservas reales. Siembra dos sucursales cuya misma franja UTC cae en fechas locales diferentes, coordina dos conexiones, fuerza esperas sobre filas reales y comprueba respuestas, citas, clientes, intentos y apartados persistidos. Los comentarios dentro del archivo explican la barrera de dos participantes, la equivalencia entre zonas, el punto exacto de espera del escritor y por qué ciertos escenarios retiran la recurrencia usada solo para T087. |
| `docs/fase-4-modulo-3/tareas.md` | Marca exclusivamente M3-T086–M3-T091 después de satisfacer sus criterios y enlaza esta evidencia. T092 y las tareas posteriores permanecen pendientes. |
| `docs/fase-4-modulo-3/resultados-tareas/resultado-t086-t091.md` | Documenta el flujo de las carreras, los casos probados, la trazabilidad M2 y los resultados de todas las verificaciones. |
| `tsconfig.build.tsbuildinfo` | Metadato incremental regenerado automáticamente por `npm run build`; no cambia contratos ni lógica de aplicación. |

No se agregaron entidades, migraciones ni cambios de esquema. Cada invocación de `conBaseMigrada` valida el nombre `citas_persistencia_<uuid>`, crea y migra esa base, cierra ambas conexiones y la elimina; no se utilizó la base cotidiana.

## Flujo de concurrencia comprobado

1. Cada escenario crea una oferta real con licencia vigente, un Profesional, un servicio y dos sucursales. La primera usa `America/Chihuahua`; la segunda usa `Pacific/Kiritimati`. De ese modo, `2026-10-20 08:00` y `2026-10-21 04:00` representan el mismo instante UTC, permitiendo comprobar que la exclusión no depende de la fecha civil ni de la sucursal.
2. Las carreras de T086 y T087 usan una barrera de dos participantes: ninguna conexión empieza a solicitar hasta que ambas están listas. El bloqueo común del Profesional permite un solo apartado incompatible. Después se prepara el primer intento, se libera ese apartado y el otro navegador obtiene la misma ocupación; ambos envíos llegan de nuevo juntos al escritor. Solo el intento cuyo apartado sigue vigente registra, mientras el otro devuelve conflicto 409. La base termina con una sola cita y un solo cliente.
3. Para los cambios durante la espera, una conexión auxiliar abre `READ COMMITTED` y retiene con `FOR UPDATE` la fila que el escritor necesita. El escritor bloquea antes su sesión e intento y queda esperando en el orden productivo. Mientras está detenido, la segunda conexión confirma el cambio operativo o mueve el reloj; después se libera la fila. Así se demuestra que el escritor relee el estado confirmado después de esperar, en vez de usar la consulta previa.
4. En los órdenes inversos, el escritor toma primero la barrera del negocio y se detiene más adelante en el servicio. La mutación queda esperando esa barrera; al liberar el servicio, la reserva confirma antes y la mutación se aplica después. La cita conserva sus extremos, precio y estado, y el lector de afectaciones recalcula la causa vigente sin modificarla.
5. Cada negativa comprueba las filas finales: no hay cliente ni cita parcial, el intento continúa preparado y el apartado no se consume ni cambia su vencimiento. Cada éxito comprueba el resumen histórico y el intervalo almacenado, no solo la promesa resuelta.

## Tests primero y casos ejecutados

La suite se escribió antes de actualizar tareas o documentación. La primera ejecución dentro del sandbox falló en los 13 casos por `EACCES` al intentar conectar a `localhost:3306`; fue un límite de ejecución, no un rojo funcional. Al repetir con acceso a la MariaDB local, 9 de 13 casos pasaron y 4 expusieron defectos del arnés inicial: las semillas de titular no eran hashes hexadecimales reales, una recurrencia cruzada sembrada exclusivamente para T087 hacía inválida una mutación posterior de calendario y la sesión administrativa no respetaba la ventana fija de 12 horas del esquema. Se corrigieron los escenarios sin relajar resultados de dominio. La suite final aprobó 13 de 13.

| Tarea / trazabilidad | Prueba y resultado observado |
| --- | --- |
| T086; M2-I001 y M2-I002; RF-18, RF-20, RF-33–RF-35 | Dos conexiones arrancan juntas sobre el mismo intervalo. Solo un apartado es concedido. Después ambos intentos llegan juntos al escritor real: una promesa registra y la otra rechaza con 409. Quedan exactamente una cita y un cliente. El ejecutor cierra conexiones y elimina la base aun ante fallos. |
| T087; M2-I003; RF-14–RF-15, RF-20, RF-33 | Un intervalo de Chihuahua y otro de Kiritimati tienen fechas locales distintas pero se traslapan parcialmente en UTC; una sola reserva sobrevive y la otra obtiene 409. Un segundo caso usa extremos contiguos entre las mismas zonas: ambos apartados y ambas citas se aceptan, y el fin de la primera coincide exactamente con el inicio de la segunda. |
| T088; M2-I005; RF-19–RF-22, RF-31, RF-35 | El escritor espera la fila del Profesional; el reloj avanza exactamente a `expira_en` antes de liberarla. La reserva se rechaza, no se crean cita ni cliente, el intento sigue `preparado`, el apartado no se consume y conserva su vencimiento original. |
| T089; parte de M2-I006; RF-04, RF-18, RF-30–RF-33, RF-36 | Si el costo cambia de 100 a 250 antes de que el escritor continúe, la cita conserva 100. Si se desactiva la oferta o la duración cambia de 30 a 45 primero, se rechaza sin filas parciales. En el orden inverso, la reserva confirma con 100 y 30 minutos; el cambio posterior de costo/duración no modifica la cita. |
| T090; cierre de M2-I006; RF-14, RF-18, RF-31–RF-33 | Durante la espera se reemplaza atómicamente la configuración. Anticipación de 180 minutos, horizonte de cero días y cambio de Ventana Libre a Agenda Compacta vuelven inválidas ranuras que eran válidas al apartar. El escritor relee cada configuración y no agrega citas. |
| T091; parte de M2-I007; RF-14–RF-15, RF-20, RF-31–RF-33, RF-36 | Una excepción vacía que confirma antes hace fallar la reserva. En el orden inverso, la cita confirma primero; reemplazar después el horario por un conjunto vacío conserva estado y extremos, y `CitasAfectadasService` devuelve `horario_insuficiente`. |

M2-I006 queda acreditado por las pruebas de oferta, duración y configuración de T089–T090. M2-I007 conserva alcance **parcial**: T091 cubre horario y excepción, mientras T092 sigue pendiente para bloqueo colectivo y nuevas asignaciones. M2-I004/M3-I001 permanece diferido al escritor manual real del módulo 4, conforme a la fuente normativa.

## Verificaciones finales

| Comando | Resultado |
| --- | --- |
| `npm run test:integration -- --runInBand test/fase-4-t086-t091.integration-spec.ts` | 1 suite, 13 pruebas aprobadas; código de salida 0. |
| `npm run build` | Aprobado; código de salida 0. |
| `npm run lint` | Aprobado sin advertencias; código de salida 0. |
| `npm test -- --runInBand` | 72 suites, 361 pruebas aprobadas; código de salida 0. |
| `npm run test:integration -- --runInBand` | 73 suites, 311 pruebas aprobadas; código de salida 0. La pasada final se ejecutó después de reforzar T086/T087 con ambos envíos reales. |
| `npm run test:e2e -- --runInBand` | 29 suites, 159 pruebas aprobadas; código de salida 0. Los mensajes `ERROR` de T48, T49, T50, T72 y del fix son fallos inyectados esperados por sus casos de respuesta segura y rollback. |
| `git diff --check` | Aprobado; sin errores de whitespace. |

## Límite del lote

M3-T092 y posteriores permanecen sin marcar. Esta evidencia no declara terminada la coordinación colectiva de M2-I007, no cubre todavía licencia durante la espera, doble consumo o escritor contra resolutor, y no habilita producción ni cierra la fase. El siguiente punto normativo sería T092, pero este lote se detiene expresamente en T091.
