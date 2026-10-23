# Resultado M3-T074–T079

Fecha: 19 de octubre de 2026.

## Archivos y finalidad

| Archivo | Qué hace |
| --- | --- |
| `src/reservas-publicas/registro-reserva-publica.service.ts` | Añade el escritor interno. Bloquea sesión, intento y recursos; revalida licencia, oferta, horario, duración, apartado e intervalo; copia precio y nombres; guarda cliente, cita pendiente, consumo y resultado en una sola transacción. Los comentarios señalan el orden de bloqueo, la fecha civil, la copia histórica y el commit atómico. |
| `src/reservas-publicas/resolucion-reserva-publica.service.ts` | Añade el resolutor interno. Bajo la misma exclusión, recupera el resultado propio o cierra la clave como `no_registrado`, incluso si la preparación nunca llegó. Libera únicamente el apartado aún actual de esa sesión. Los comentarios explican la espera, la fila terminal y la liberación. |
| `src/reservas-publicas/intentos-reserva-publica.service.ts` | Expone la proyección histórica registrada para que el resolutor propio recupere el resultado sin solicitar otra vez el formulario. |
| `src/reservas-publicas/reservas-publicas.module.ts` | Registra y exporta los dos colaboradores internos; todavía no expone las rutas HTTP de T080–T081. |
| `test/fase-4-t074-t079.integration-spec.ts` | Prepara oferta y apartados reales en bases MariaDB migradas. Prueba revalidación, copia histórica, repetición, fallos entre escrituras, exclusión y claves tardías. Los comentarios describen el escenario y las comprobaciones de rollback. |
| `docs/fase-4-modulo-3/tareas.md` | Marca M3-T074–T079 después de verificar sus criterios. |

## Flujo de registro

1. El escritor recibe negocio y titular autorizados por el colaborador interno, normaliza el formulario y calcula su HMAC. En una transacción `READ COMMITTED`, bloquea sesión e intento en ese orden. Si ese intento ya registró una cita con el mismo contenido, devuelve la copia persistida aunque el apartado haya vencido; contenido distinto o un estado terminal negativo produce conflicto.
2. Para un intento preparado, toma los bloqueos comunes de usuario, negocio, licencia, sucursal, servicio, perfil y apartado. Después de esperar, relee el apartado y la generación actual; exige que pertenezca a esa sesión, siga vigente y tenga costo y zona públicos. La operación concedida aporta fecha y hora originales. MariaDB devuelve `TIME` con segundos y puede convertir `DATE` según la zona del host, por lo que el escritor restaura explícitamente `HH:mm` y la fecha civil persistida antes de consultar el motor.
3. El motor revalida licencia, oferta, reglas de agenda, atención y ocupaciones de todas las sucursales. El inicio, fin y zona calculados deben coincidir con los extremos guardados del apartado. Una negativa funcional termina sin insertar cliente ni cita ni consumir el apartado. Antes de la primera inserción se comprueba de nuevo el vencimiento y que el inicio no haya pasado.
4. La copia histórica toma el costo aceptado del apartado, los extremos UTC y zona validados, los nombres vigentes bajo bloqueo y el contacto normalizado. Se genera un folio aleatorio de 20 caracteres sujeto al índice único. El cliente nuevo, la cita `pendiente`, la liberación del apartado, la retirada del puntero de sesión y la asociación del resultado al intento se escriben con el mismo manager y commit. No se envían mensajes externos en esa transacción.

## Flujo de resolución

1. El resolutor bloquea sesión e intento. Si el escritor aún mantiene esas filas, espera; el agotamiento de bloqueo se traduce en 503 por la coordinación compartida, sin concluir que no hubo reserva.
2. Un intento registrado devuelve el resumen guardado a su propia sesión aunque la licencia o el apartado ya no estén vigentes. Un intento preparado sin cita se cierra como `no_registrado`; si su apartado todavía es el puntero actual, se libera bajo los bloqueos comunes.
3. Si la clave no llegó a prepararse, el resolutor verifica que el apartado pertenezca a la sesión y crea la fila terminal para esa clave antes de soltar el bloqueo. Una preparación o escritura tardía encuentra esa fila y no puede crear una cita. El cierre nunca libera un apartado de otra generación.

Estos servicios siguen siendo internos. La protección HTTP y las rutas de registro y resolución pertenecen a M3-T080–T081.

## Pruebas y resultados

Se escribió primero `test/fase-4-t074-t079.integration-spec.ts`; su primera ejecución falló porque aún no existían los servicios. Tras implementarlos, la prueba mostró dos detalles reales de MariaDB: `TIME` devolvía `08:00:00` y `DATE` se desplazaba al convertirse con la zona del host. Se corrigió la lectura y la suite dirigida pasó.

La prueba de rollback instala por separado disparadores que fallan después de crear cliente, después de crear cita y justo antes de registrar el resultado. En los tres casos comprueba que no quedaron cliente o cita nuevos, el intento sigue preparado y el apartado conserva su liberación y plazo anteriores. Otra prueba mantiene bloqueada la sesión con una segunda conexión, comprueba que el resolutor espera y después verifica su cierre. Las pruebas de rechazo alteran oferta o duración antes de registrar; la prueba de éxito recupera el mismo resultado después del vencimiento y del bloqueo comercial sin duplicar la cita.

| Comando | Resultado |
| --- | --- |
| `npm run test:integration -- --runInBand fase-4-t074-t079` | 1 suite, 7 pruebas aprobadas. |
| `npm run build` | Aprobado. |
| `npm run lint` | Aprobado. |
| `npm test -- --runInBand` | 72 suites, 361 pruebas aprobadas. |
| `npm run test:integration -- --runInBand` | 72 suites, 298 pruebas aprobadas. |
| `npm run test:e2e -- --runInBand` | 28 suites, 147 pruebas aprobadas. Los mensajes de fallos inyectados en casos históricos fueron esperados; Jest terminó con código 0. |
