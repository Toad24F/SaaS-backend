# Resultado — ALA-T110–ALA-T115

Fecha: 2 de noviembre de 2026.

## Flujo implementado

El portal normaliza el teléfono del formulario a diez dígitos antes de entrar al escritor. Al registrar, bloquea sesión e intento, comprueba primero si esa clave ya produjo una cita y, si sigue preparada, toma los bloqueos comunes, incluida la fila del negocio. Tras esperar, relee el apartado, revalida la oferta y el horario, y consulta en la misma transacción las citas de ese negocio, sucursal y teléfono cuyo inicio UTC sea estrictamente posterior al reloj del servidor y cuyo estado no sea `cancelada`. Cuentan todas las citas no canceladas, independientemente del servicio o Profesional. Otra sucursal, otro negocio y los apartados no cuentan. El índice existente sobre negocio, sucursal, teléfono e inicio sostiene esta lectura; no se añadió un contador.

Si ya hay dos citas, el escritor guarda en el intento `no_registrado`, la huella del formulario y `cupo_telefonico`, y confirma la transacción sin insertar cliente o cita ni cambiar apartado, sesión o vencimiento. Solo después del commit devuelve 409. El mismo intento no puede registrar otra cita, aunque una pestaña atrasada cambie el teléfono.

La preparación inicial vincula el intento al puntero `intento_actual_id` del apartado. Repetir la misma clave devuelve el intento existente. Una clave nueva exige explícitamente el ID del intento actual, propio y terminado por cupo; el sucesor queda ligado al predecesor y sustituye el puntero dentro de la misma transacción. La preparación no amplía los cinco minutos originales. El registro comprueba el puntero antes de escribir, por lo que un envío anterior no puede consumir el apartado tras la corrección.

La resolución pública específica del rechazo, la respuesta HTTP de corrección y el flujo de interfaz corresponden a T116–T120; este lote termina en T115.

## Archivos agregados o modificados

| Archivo | Qué hace |
| --- | --- |
| `src/reservas-publicas/cupo-telefonico.service.ts` (nuevo) | Cuenta citas futuras no canceladas por teléfono normalizado, negocio y sucursal dentro de la transacción recibida. Sus comentarios describen el índice y la exclusión de apartados. |
| `src/reservas-publicas/registro-reserva-publica.service.ts` | Consulta el cupo bajo la barrera de negocio, guarda el rechazo terminal y emite 409 tras el commit; valida el puntero actual antes de registrar. Los comentarios explican el orden y la durabilidad. |
| `src/reservas-publicas/intentos-reserva-publica.service.ts` | Valida el predecesor explícito, asigna el primer puntero y permite sucesión solo tras rechazo propio por cupo. Sus comentarios explican la autoridad del puntero y la vigencia original. |
| `src/reservas-publicas/coordinacion-reserva-publica.service.ts` | Persiste el ID del predecesor al crear un intento y comprueba la repetición compatible bajo la sesión bloqueada. |
| `src/reservas-publicas/reservas-publicas.module.ts` | Registra el contador como proveedor del escritor público. |
| `test/ala-t110-t115.integration-spec.ts` (nuevo) | Usa bases migradas desechables y reloj fijo; prueba el alcance del conteo, el rechazo confirmado, el sucesor y una carrera por el último cupo. Sus comentarios explican las condiciones de las fixtures. |
| `test/fase-4-t092-t096.integration-spec.ts` | Ajusta la expectativa histórica T094: otra clave se rechaza al prepararse, como exige T113, y conserva las comprobaciones de rollback e idempotencia. El comentario explica el cambio de contrato. |
| `docs/ajustes-licencias-administracion-agenda/tareas.md` | Marca T110–T115 y enlaza esta evidencia. |
| Este archivo | Documenta el flujo, cada cambio y las verificaciones del lote. |
| `tsconfig.build.tsbuildinfo` | Caché generado por `npm run build`; ya aparecía modificado al iniciar el lote y se conservó. |

Las entidades, el esquema y la migración de sucesión ya incluían `telefono_contacto`, `causa_publica`, `intento_anterior_id` e `intento_actual_id`; no se modificó persistencia.

## Tests primero y resultados

Se escribió la suite de integración antes del código de producción. La primera ejecución falló al importar el nuevo contador, como se esperaba. La primera ejecución tras implementarlo quedó bloqueada por `EACCES` al conectar con MariaDB local desde el sandbox; con acceso local, los tres casos pasaron.

Las pruebas verifican: límite exacto de inicio y estados; aislamiento por negocio y sucursal; citas de distintos profesionales; rechazo durable con huella y causa, sin cliente ni cita nuevos; conservación de apartado y plazo; idempotencia de preparación; corrección explícita; rechazo del envío tardío aun con otro teléfono; y dos registros simultáneos que esperan una barrera en una tercera conexión y compiten por un único cupo, dejando dos citas finales.

| Comando | Resultado |
| --- | --- |
| `npm run test:integration -- --runInBand ala-t110-t115 fase-4-t092-t096` | 2 suites, 14/14 pruebas aprobadas con acceso local a MariaDB, tras ajustar T094 y añadir la barrera de concurrencia. |
| `npm test -- --runInBand` | 89 suites, 410/410 pruebas aprobadas con acceso a puertos locales. |
| `npm run test:e2e -- --runInBand ala-t098-t101.e2e-spec.ts fase-4-t080-t085.e2e-spec.ts` | 2 suites, 20/20 pruebas HTTP aprobadas. |
| `npm run test:integration -- --runInBand` | 67 suites aprobadas, 20 fallidas; 334/400 pruebas aprobadas. Los fallos incluyen expectativas históricas de horarios, configuración, licencias y migraciones, más T094 antes de ajustar su contrato. La suite pertinente volvió a verde tras ese ajuste. |
| `npm run build`, `npm run lint`, `git diff --check` | Aprobados. |

La integración completa conserva fallos de contratos históricos ajenos a este lote; no se han marcado como aprobados. No se declara producción habilitada ni fase cerrada. M3-I001/M2-I004 permanece diferida al escritor manual del módulo 4.
