# Resultado M1-T030–M1-T034 — procesador y gestión de envíos

Fecha: 2026-09-28. Se implementó el procesamiento durable de códigos, la recuperación de arrendamientos, la revalidación del destinatario, los reintentos y dos rutas exclusivas del superadmin. Los mensajes y códigos se reconstruyen transitoriamente y no se persisten. El procesador se invoca bajo demanda; T121 conectará su ejecución periódica. Los avisos de licencia quedan para T116–T120 y no se toman por este procesador de códigos.

## Flujo implementado

1. `tomar` abre una transacción breve, busca un pendiente/fallido cuya próxima ejecución haya llegado o un trabajo tomado cuyo arrendamiento haya vencido. Bloquea una fila, genera un token nuevo, concede cinco minutos e incrementa intentos. Dos conexiones no obtienen el mismo trabajo mientras ese arrendamiento esté vigente.
2. `procesarUno` revalida bajo bloqueos en orden destinatario → código → envío. Comprueba token y tiempo de arrendamiento, pertenencia, propósito, estado del código, vencimiento exacto, correo y versión actuales. Una invitación debe seguir pendiente; una recuperación requiere administrador activo y activado.
3. Reconstruye el valor con la versión de clave de la emisión y compara su hash en tiempo constante. Si la referencia es obsoleta o el hash no coincide, marca el envío descartado y libera su arrendamiento, sin ampliar la vigencia. Si falta configuración de derivación, conserva el envío como fallido para reintentar.
4. Tras cerrar esa transacción llama al transporte con un mensaje que existe solo en memoria. No mantiene la transacción de alta abierta mientras contacta SMTP. El procesamiento no consume el código.
5. Registra el resultado únicamente si el token sigue siendo el propietario y aún no venció. Aceptación significa estado enviado y fecha de confirmación SMTP; fallo significa estado fallido, error genérico y próxima ejecución. Los detalles del proveedor no se guardan. El backoff comienza en 60 segundos, se duplica y se limita a 30 minutos.
6. Un proceso reiniciado puede recuperar un arrendamiento en su límite exacto. Una confirmación tardía con token anterior no cambia el trabajo recuperado. Un envío ya confirmado no se vuelve a tomar.
7. El superadmin consulta `GET /negocios/:id/envios` o solicita `POST /negocios/:id/reintentar-envio` con `{ "envioId": "..." }`. La respuesta contiene solo ID, tipo, estado, intentos, próxima ejecución, confirmación y error sanitizado. Reintentar un fallido lo deja pendiente, conserva intentos y audita el cambio real; repetir sobre pendiente no duplica auditoría. Confirmados, descartados, ocupados u obsoletos se rechazan con 409; negocio/envío inexistente o cruzado con 404. Los demás roles se rechazan.

## Semántica de entrega y límites

La bandeja ofrece recuperación durable, pero SMTP y la base de datos no comparten una transacción. Si el proveedor acepta y el proceso cae antes de guardar el acuse, recuperar el arrendamiento puede entregar el mismo mensaje otra vez. La prueba reproduce esa duplicación y verifica que el código sigue consumiéndose una sola vez. También puede haber un cambio de destinatario o estado después de la última revalidación y mientras ocurre la llamada externa; recibir un mensaje no rehabilita un código sustituido, vencido o consumido. La aceptación SMTP no acredita recepción en la bandeja del destinatario.

## Archivos y función

- [`procesador-correo.service.ts`](../../../src/correos/procesador-correo.service.ts): toma un trabajo, recupera leases, reconstruye y revalida códigos, descarta obsoletos, registra resultados con protección por token, programa reintentos y expone consultas/reintentos con validación del actor en base de datos. Los comentarios explican orden de bloqueos, transacciones breves, errores sanitizados y recuperación tras caída.
- [`envios-correo.controller.ts`](../../../src/correos/envios-correo.controller.ts): añade las rutas protegidas por sesión y rol; valida negocio y `envioId` como cadena BIGINT sin pérdida de precisión ni campos extra. No devuelve contenido de correo.
- [`correos-http.module.ts`](../../../src/correos/correos-http.module.ts): separa la composición HTTP de Auth del módulo de dominio para evitar ciclos futuros con Altas.
- [`correos.module.ts`](../../../src/correos/correos.module.ts): registra la fábrica del procesador con conexión, transporte y reloj; no inicia envíos al arrancar.
- [`app.module.ts`](../../../src/app.module.ts): incorpora las rutas de gestión de envíos.
- [`modulos-fase-2.spec.ts`](../../../src/modulos-fase-2.spec.ts): adapta el doble del procesador en la prueba de composición sin base de datos ni entrega.
- [`procesador-correo.integration-spec.ts`](../../../test/procesador-correo.integration-spec.ts): usa dos conexiones MariaDB y reloj controlado para comprobar toma concurrente, recuperación exacta, token vencido, revalidación, ausencia de secretos, timeout/rechazo/reinicio y caída después de aceptación con consumo único.
- [`envios-correo.e2e-spec.ts`](../../../test/envios-correo.e2e-spec.ts): prueba sesión, permisos de los cuatro roles, aislamiento entre negocios, campos extra e IDs inválidos, estados públicos sin código, reintento idempotente, auditoría única y rechazo del confirmado.
- [`verificar_smtp.cjs`](../../../tools/verificar_smtp.cjs): carga configuración local y verifica conexión TLS/autenticación SMTP con un límite total; no envía mensajes ni imprime usuario, contraseña o respuesta textual del proveedor.
- [`tareas-modulo-1.md`](../tareas-modulo-1.md): marca T030–T034 y enlaza esta evidencia.

## Tests primero

Primero falló la suite de integración por no existir el procesador. Después de implementarlo pasaron las pruebas de toma y entrega. La prueba HTTP falló primero con 404 porque aún no estaban las rutas; pasó tras añadir controlador y composición HTTP. Los transportes de las suites son controlados y capturan únicamente en memoria; no usan la cuenta de Google ni destinatarios reales.

## Verificaciones finales

| Comando | Resultado |
| --- | --- |
| `npm test -- --runInBand` | 43 suites, 212 pruebas aprobadas |
| `npm run test:integration -- --runInBand` | 23 suites, 106 pruebas aprobadas |
| `npm run test:e2e -- --runInBand` | 10 suites, 94 pruebas aprobadas |
| `npm run build` | Compilación correcta |
| `npm run lint` | Sin errores |

El procesador tiene 15 pruebas focalizadas aprobadas; HTTP tiene una prueba integral que recorre permisos, aislamiento y estados. La suite completa suma 412 pruebas aprobadas. Los mensajes ERROR de las pruebas de rollback corresponden a fallos inyectados deliberadamente; las suites terminaron con código 0. Se verificaron las rutas de esta evidencia y el formato con `git diff --check`. T030–T034 quedan hechas (34 completadas, 106 pendientes); no se implementó T035.

## Resultado de Google SMTP

La comprobación fuera del sandbox terminó con código 0: **Google SMTP conecta y autentica correctamente**. El primer intento restringido no respondió y se detuvo; el script incorpora un límite total para evitar una espera indefinida. No se envió un correo real, por lo que no se verificó recepción final ni aceptación de un remitente concreto al enviar. Ninguna credencial se añadió a código, documentación o resultados.
