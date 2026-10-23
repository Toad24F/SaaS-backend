# Resultado M3-T063–T064

Fecha: 18 de octubre de 2026.

## Archivos y finalidad

| Archivo | Qué hace |
| --- | --- |
| `src/reservas-publicas/apartados.service.ts` | Consulta el estado histórico de un apartado propio en una lectura coherente y comunica si una clave de creación ya existía. Devuelve la hora del servidor sin renovar el vencimiento. |
| `src/reservas-publicas/portal-publico.controller.ts` | Expone crear, consultar y liberar apartados. Obtiene negocio del slug y titular de la cookie, aplica CSRF a las mutaciones y evita cachear respuestas personales. |
| `src/reservas-publicas/sesion-reserva-publica.service.ts` | Comprueba que el hash de una cookie con formato válido corresponde a una sesión real del negocio; una credencial caduca recibe 401. |
| `src/reservas-publicas/resolver-negocio-publico.service.ts` | Añade resolución de negocio para liberación sin exigir licencia vigente, manteniendo la comprobación de slug y existencia. Las nuevas concesiones siguen sujetas a la licencia. |
| `test/fase-4-t063-t064.integration-spec.ts` | Prueba las tres rutas con MariaDB migrada, dos sesiones anónimas, dos negocios y reloj controlado. |
| `docs/fase-4-modulo-3/tareas.md` | Marca M3-T063 y M3-T064 como terminadas. |

## Flujo

1. `POST /apartados` exige cookie existente, origen y token CSRF. Resuelve el slug y pasa el hash del titular, nunca la credencial, al servicio. El servicio valida la selección y coordina las dos transacciones ya implementadas: confirma la liberación anterior antes de revalidar y conceder el nuevo horario. Una primera concesión responde 201 y una repetición de la misma clave responde 200 con la expiración original. Una negativa funcional responde 409.
2. `GET /apartados/:id` comprueba cookie, negocio e ID. Lee sesión y apartado en una misma instantánea, captura una sola hora del servidor y devuelve `vigente`, `liberado`, `sustituido` o `vencido`, además de generación y expiración. El límite exacto `servidorAhora = expiraEn` ya es vencido. Las filas liberadas o vencidas permanecen para poder informar su estado.
3. `POST /apartados/:id/liberar` exige cookie, origen, CSRF, ID y generación. El servicio comprueba negocio y titular y solo libera esa generación; repetir la liberación responde 204. Un aviso atrasado no afecta al reemplazo. Esta ruta puede resolver el negocio y liberar el apartado propio aunque la licencia ya no acepte concesiones.
4. Una cookie ausente o inválida recibe 401; un apartado ajeno 404. Los errores pasan por el normalizador público, sin SQL ni datos privados. Las respuestas personales llevan `Cache-Control: no-store`.

## Pruebas y resultados

La prueba HTTP se escribió antes de implementar las rutas. Su primera ejecución no llegó al caso por una restricción de conexión local a MariaDB (`EACCES`). Al repetirla con acceso local, una ampliación de la prueba mostró que una cookie formalmente válida pero sin sesión devolvía 404 en vez de 401; se añadió la comprobación de sesión y el caso pasó.

La integración comprueba creación, repetición sin renovar, expiración de cinco minutos, estado vigente y vencido en el límite exacto, liberación idempotente, sustitución y aviso atrasado. También comprueba aislamiento entre titulares y negocios, rechazo de campos del cliente, CSRF, código de credencial inválida y liberación después del cierre de la licencia.

| Comando | Resultado |
| --- | --- |
| `npm run build` | Aprobado. |
| `npm run lint` | Aprobado. |
| `npm test -- --runInBand` | 70 suites, 350 pruebas aprobadas. |
| `npm run test:integration -- --runInBand fase-4-t063-t064` | 1 suite, 1 prueba aprobada. |
| `npm run test:integration -- --runInBand` | 69 suites, 285 pruebas aprobadas. |
| `npm run test:e2e -- --runInBand` | 28 suites, 147 pruebas aprobadas. |

El alcance termina en las rutas de apartados. La creación de citas y la recuperación de intentos corresponden a tareas posteriores.
