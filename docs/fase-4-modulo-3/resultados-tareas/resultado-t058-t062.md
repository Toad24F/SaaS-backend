# Resultado M3-T058–T062

Fecha: 18 de octubre de 2026. Se implementó el servicio interno de apartados del módulo 3. Aún no se exponen las rutas HTTP de crear, consultar y liberar (M3-T064), por lo que la habilitación externa sigue cerrada.

## Archivos y finalidad

| Archivo | Qué hace |
| --- | --- |
| `src/reservas-publicas/apartados-entrada.ts` | Valida exclusivamente clave opaca, Profesional, sucursal, servicio, fecha y hora; calcula una huella estable de la selección sin aceptar costo, fin, titular, negocio ni generación del cliente. |
| `src/reservas-publicas/apartados.service.ts` | Prepara el reemplazo y concede en dos transacciones; verifica pertenencia, generación, disponibilidad, precio y zona. También libera idempotentemente el apartado propio exacto y protege una cita ya registrada. |
| `src/reservas-publicas/reservas-publicas.module.ts` | Registra y exporta el servicio para que las rutas públicas posteriores puedan usarlo; aclara que todavía no hay endpoint de escritura. |
| `src/reservas-publicas/apartados-entrada.spec.ts` | Prueba la gramática, la huella de contenido y el rechazo de campos e identificadores ajenos. |
| `test/fase-4-t058-t062.integration-spec.ts` | Usa MariaDB migrada y reloj inyectado para probar los commits, propiedad, reemplazo, repetición e interrupción. |
| `docs/fase-4-modulo-3/tareas.md` | Marca M3-T058–T062 como hechas. |
| `docs/fase-4-modulo-3/resultados-tareas/resultado-t058-t062.md` | Conserva el flujo y los resultados de este lote. |

## Flujo de apartado y reemplazo

1. La entrada se valida antes de tocar la sesión. El titular llega como hash derivado de la credencial del navegador por la futura ruta, y el negocio llega del slug autorizado; ninguno se acepta del cuerpo. La huella de selección excluye la clave para distinguir una repetición de reutilizarla con otro horario. Una referencia de otro negocio se rechaza con 404 antes de insertar la operación o liberar el apartado previo.
2. **Primera transacción (`READ COMMITTED`):** se bloquea sesión y luego operación por clave. Si ya existe, solo se comprueba su huella. Si es nueva, se asigna la siguiente generación; el apartado anterior propio se bloquea mediante el orden común de recursos, se verifica que no tenga cita registrada, se marca liberado y se borra el puntero actual. La operación queda `preparada`. El commit ocurre antes de buscar un nuevo hueco.
3. **Segunda transacción:** se vuelven a bloquear sesión y operación. Si la generación quedó atrás, termina `sustituida` sin tocar el apartado actual. Si estaba concedida o rechazada, devuelve el resultado durable. Si sigue preparada, toma usuarios, negocio, licencia, sucursal, servicio y perfil; el motor relee oferta, horario, configuración y ocupaciones. Una negativa funcional queda `rechazada`. Una válida guarda inicio/fin UTC, zona y costo vigente, fija expiración a cinco minutos del reloj de concesión, marca `concedida` y actualiza el puntero de sesión en el mismo commit.
4. **Liberación exacta:** la sesión, operación y recursos del apartado se bloquean en ese orden. Solo el mismo negocio, titular, ID y generación pueden liberar el apartado actual. Repetir la liberación no modifica nada. Un aviso de una generación antigua no borra el nuevo puntero; un intento registrado con cita impide tocar la ocupación.
5. Si la segunda transacción falla técnicamente, revierte solo esa fase. La operación `preparada` y la liberación anterior permanecen confirmadas; la misma clave retoma la revalidación. Una clave con otra selección produce 409. La expiración de una operación concedida no se renueva al repetirla.

## Pruebas

Se escribieron primero las pruebas. Tanto la unitaria como la integración fallaron inicialmente porque faltaban sus módulos. La ampliación de aislamiento detectó después una FK de MariaDB expuesta al intentar insertar un Profesional ajeno; se corrigió con comprobación de pertenencia y 404 uniforme antes de crear la operación.

La integración concede un apartado, verifica precio, zona y cinco minutos exactos, avanza el reloj y repite la clave sin ampliar el plazo. Prueba 409 por clave reutilizada con otra selección, 404 por titular o negocio ajenos, liberación idempotente y aviso viejo que no afecta a un reemplazo. También fuerza una negativa funcional, un fallo técnico entre commits, reintento con la misma clave, sustitución de una operación preparada por una generación posterior y protección de un intento con cita registrada. Consulta las filas persistidas para comprobar la generación y la liberación durable tras el fallo.

| Comando | Resultado |
| --- | --- |
| `npm test -- --runInBand apartados-entrada.spec.ts` | 1 suite, 7 pruebas aprobadas. |
| `npm run test:integration -- --runInBand fase-4-t058-t062` | 1 suite, 1 prueba aprobada con escenarios de las cinco tareas. |
| `npm run build` | Aprobado. |
| `npm run lint` | Aprobado. |
| `npm test -- --runInBand` | 70 suites, 350 pruebas aprobadas. |
| `npm run test:integration -- --runInBand` | 68 suites, 284 pruebas aprobadas. |
| `npm run test:e2e -- --runInBand` | 28 suites, 147 pruebas aprobadas. |

La prueba acredita el servicio interno y las dos fases, no el contrato HTTP ni la reserva final; estos pertenecen a tareas posteriores.
