# Resultado M3-T092–T096

Fecha: 20 de octubre de 2026. Revisión base: `1f93397ea1c670f619f21bfd883548b50f611c1d`; evidencia sobre los cambios de este lote en el árbol de trabajo.

## Alcance y archivos

Este lote completa la evidencia de concurrencia del escritor público real desde T092 hasta T096. Las pruebas se escribieron antes de marcar las tareas y usan bases MariaDB nuevas y desechables, dos conexiones independientes, transacciones `READ COMMITTED`, filas retenidas con `FOR UPDATE`, orden controlado de contendientes y reloj inyectable. No fue necesario modificar la lógica productiva: el protocolo implementado previamente satisfizo los escenarios nuevos.

| Archivo agregado o modificado | Qué hace |
| --- | --- |
| `test/fase-4-t092-t096.integration-spec.ts` | Agrega 11 pruebas de integración reales. Sus ayudantes siembran una oferta mínima, crean módulos sobre conexiones distintas, preparan apartados e intentos, retienen filas y encolan escritor, resolutor y mutaciones. Los comentarios explican cada barrera, la relectura posterior a la espera, el pool usado para provocar el timeout y la limpieza segura. |
| `docs/fase-4-modulo-3/tareas.md` | Marca únicamente M3-T092–M3-T096 después de aprobar sus criterios y enlaza esta evidencia. M3-T097 y las tareas posteriores permanecen pendientes. |
| `docs/fase-4-modulo-3/resultados-tareas/resultado-t092-t096.md` | Explica el flujo de coordinación, los casos ejecutados, la trazabilidad de integración y los resultados de compilación y suites. |

No se agregaron entidades, migraciones ni cambios de esquema. Cada caso usa `conBaseMigrada`, que exige el patrón seguro `citas_persistencia_<uuid>`, migra la base temporal y elimina sus conexiones y la base al terminar. La base cotidiana no se utilizó.

## Flujo comprobado

1. El navegador obtiene un apartado y prepara una clave de intento. El escritor bloquea primero la sesión y el intento; después recorre el orden común de usuarios, negocio, licencia, sucursal, servicio, perfil y ocupaciones. Toda decisión se toma con la lectura posterior a la espera.
2. Para T092, una conexión retiene un perfil mientras el bloqueo colectivo ya conserva la barrera del negocio. La asignación de un segundo perfil y el escritor esperan esa barrera. Al liberar el perfil, el bloqueo colectivo confirma primero, la asignación entra después y tanto el intento ya preparado como una solicitud nueva del perfil incorporado reconocen la restricción. Ninguna reserva incompatible queda fuera del alcance dinámico.
3. Para T093, el escritor espera la fila del Profesional mientras el reloj alcanza exactamente el vencimiento o el límite de 48 horas de una suspensión confirmada. Cuando continúa, relee la licencia cerrada y no crea filas parciales. En sentido inverso, un intento ya registrado se resuelve desde su resultado durable aunque la licencia y el apartado ya no permitan una reserva nueva.
4. Para T094, dos conexiones envían simultáneamente la misma clave: la primera crea cliente y cita, y la segunda reproduce exactamente el folio guardado. Dos claves distintas asociadas al mismo apartado se serializan por sesión; solo una consume la ocupación. Un disparador de prueba falla al actualizar el resultado, demostrando antes de reintentar que cliente, cita, consumo y estado del intento revierten juntos.
5. Para T095, una fila externa de sesión ordena la carrera. Si el escritor entra primero, el resolutor espera y recupera la cita; si el resolutor entra primero, guarda `no_registrado`, libera el apartado y el escritor tardío recibe conflicto. Con un pool dedicado de una conexión y `innodb_lock_wait_timeout=1`, tres esperas agotadas producen 503 y dejan el intento `preparado`, nunca lo cierran por ausencia aparente.
6. Para T096, el resolutor encolado antes de una preparación crea el terminal `no_registrado`; la preparación y escritura tardías quedan bloqueadas. En el caso de respuesta perdida, el commit del escritor se conserva, se deja vencer el apartado y se cierra la licencia; la resolución posterior recupera el mismo folio y confirma que existe una sola cita.

## Tests primero y resultados por tarea

La primera ejecución dentro del sandbox no alcanzó MariaDB: los 11 casos fallaron por `EACCES` contra `localhost:3306`. Al repetir con acceso a la instancia local desechable, la primera corrida funcional aprobó 9 de 11. Los dos rojos restantes identificaron defectos del arnés: se intentaba insertar el horario del perfil antes de crear su asignación, y luego la limpieza intentaba destruir por segunda vez el `DataSource` dedicado que Nest ya había cerrado. Tras corregir únicamente el arnés, la suite focalizada aprobó 11 de 11.

| Tarea / trazabilidad | Pruebas y resultado observado |
| --- | --- |
| M3-T092; cierre de M2-I007; RF-04, RF-14, RF-20, RF-31–RF-33 | Una barrera colectiva confirma antes que una asignación nueva y que un escritor ya preparado. La asignación se guarda, pero el escritor rechaza, el perfil recién incorporado tampoco obtiene apartado y quedan cero citas públicas. Con esto se completa M2-I007 junto con T091. |
| M3-T093; M2-I008; RF-03, RF-31–RF-33, RF-39–RF-41 | Dos casos avanzan el reloj al vencimiento y al límite exacto de 48 horas mientras el escritor espera. Ambos rechazan sin cita y conservan el intento preparado. Un tercer caso registra primero y después recupera el mismo resultado con licencia vencida. Se acredita M2-I008. |
| M3-T094; M2-I009; RF-34–RF-35, RF-39, RF-42 | Dos envíos de la misma clave devuelven objetos idénticos y un solo folio, cliente y cita. Dos claves sobre el mismo apartado producen un éxito y un 409. El fallo SQL inyectado demuestra rollback total y permite un reintento limpio. Se acredita M2-I009. |
| M3-T095; RF-35, RF-39–RF-43 | Se ejecutan ambos órdenes reales: escritor → resolutor devuelve la cita; resolutor → escritor conserva `no_registrado` y cero citas. La espera agotada devuelve 503 y mantiene `preparado`, por lo que la incertidumbre no se convierte en una negativa terminal. |
| M3-T096; RF-28, RF-35, RF-39–RF-42 | Resolver antes de preparar impide tanto la preparación como la escritura tardías. Perder la respuesta después del commit permite recuperar el mismo folio diez minutos después, con apartado vencido y licencia cerrada, sin duplicar la cita. |

M2-I007, M2-I008 y M2-I009 quedan acreditados por este lote y sus dependencias señaladas. M2-I004/M3-I001 permanece diferido al escritor manual real del módulo 4, conforme a la fuente normativa.

## Verificaciones finales

| Comando | Resultado |
| --- | --- |
| `npm run test:integration -- --runInBand test/fase-4-t092-t096.integration-spec.ts` | 1 suite, 11 pruebas aprobadas; código de salida 0. |
| `npm run build` | Aprobado; código de salida 0. |
| `npm run lint` | Aprobado sin advertencias; código de salida 0. |
| `npm test -- --runInBand` | 72 suites, 361 pruebas aprobadas; código de salida 0. La primera pasada restringida quedó en 71/72 por `EACCES` al abrir puertos locales; la repetición con acceso local aprobó completa. |
| `npm run test:integration -- --runInBand` | 74 suites, 322 pruebas aprobadas; código de salida 0. |
| `npm run test:e2e -- --runInBand` | 29 suites, 159 pruebas aprobadas; código de salida 0. Los mensajes `ERROR` de T48, T49, T50, T72 y del fix son fallos inyectados esperados por sus pruebas de respuesta segura y rollback. |

## Límite del lote

M3-T097 permanece sin marcar. Esta evidencia no revisa todavía el conjunto T05–T11 para habilitar el escritor, no implementa el portal web y no declara producción habilitada ni fase cerrada. El trabajo se detiene expresamente en M3-T096.
