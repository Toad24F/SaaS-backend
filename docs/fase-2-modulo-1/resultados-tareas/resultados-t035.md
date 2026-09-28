# Resultado M1-T035 — alta con invitación sin usuario

Fecha: 2026-09-28. **T035 hecha.** El alta confirma negocio, licencia pendiente, invitación, reserva del correo, código derivable y envío pendiente dentro de una sola transacción. No crea una cuenta de administrador ni devuelve el código utilizable.

## Flujo

1. El superadmin envía nombre, identificador público, RFC y correo del administrador. Puede indicar `limiteSucursales`; si lo omite vale 1. Se conserva el nombre HTTP existente `identificadorPublico` y `emailAdministrador`. RFC se recorta y convierte a mayúsculas; slug y correo se recortan y convierten a minúsculas. El servicio valida entradas internas además de la validación HTTP: RFC no vacío hasta 13 caracteres, correo válido, límites de columnas, fecha válida y cupo entero entre 1 y el máximo de INT UNSIGNED. No verifica el RFC ante autoridades fiscales ni impone unicidad del RFC.
2. Abre una transacción y consulta al actor bajo bloqueo de lectura. Exige cuenta activa, activada y permiso de superadmin; actor y fecha proceden del servidor por HTTP.
3. Guarda el negocio pendiente con RFC, correo del administrador y cupo. Crea la licencia anual sin fecha de habilitación ni vencimiento.
4. Crea `AltaAdministrador` pendiente, versión de correo 1, sin usuario creado ni activación. Reserva el correo mediante la autoridad compartida `ReservaCorreoService`; una cuenta o reserva previa impide el alta.
5. Emite el código de activación para esa invitación y negocio con vigencia de 48 horas. Usa la clave HMAC configurada fuera de la base; almacena hash y metadatos, no el valor. La ausencia de una clave válida provoca rollback, no un código histórico entregado manualmente.
6. Encola la referencia al código con `BandejaCorreoService`, usando el mismo manager. El envío queda pendiente con cero intentos. El alta no llama a SMTP ni depende de su disponibilidad.
7. Audita `codigo_emitido` y `negocio_creado`, referenciando invitación y negocio sin usuario ni secretos. Confirma el conjunto. Un error de escritura o auditoría revierte las escrituras de la transacción; slug duplicado se traduce a 409 y la reserva protege la unicidad global del correo.
8. Devuelve únicamente `negocioId`, `altaAdministradorId`, `licenciaId`, `envioId`, `estadoEnvio` y `expiraEn`. El procesador de T030–T034 puede tomar posteriormente ese envío. Pendiente no significa entregado ni habilita la licencia.

## Archivos añadidos y modificados

- [`altas.service.ts`](../../../src/altas/altas.service.ts): sustituye la creación anticipada de Usuario por invitación, reserva y bandeja; valida RFC/cupo/actor y proyecta una respuesta sin código. Sus comentarios explican validación interna, destinatario sin cuenta y participación en una sola transacción.
- [`altas.module.ts`](../../../src/altas/altas.module.ts): importa Correos para inyectar la bandeja sin ejecutar entregas al arrancar.
- [`negocios-http.dto.ts`](../../../src/negocios/dto/negocios-http.dto.ts): exige RFC y admite cupo opcional para que la ruta existente pueda invocar el servicio nuevo. [`negocios.controller.ts`](../../../src/negocios/negocios.controller.ts) pasa ambos campos y documenta la respuesta con invitación/envío. Es la conexión mínima del alta; no acredita el conjunto de operaciones HTTP de T041.
- [`negocio.entity.ts`](../../../src/negocios/entities/negocio.entity.ts): actualiza el comentario de RFC/correo. Las columnas siguen anulables para estados históricos; el alta nueva exige los datos. No cambió el esquema ni hizo falta una migración: T017–T023 ya prepararon las tablas y referencias utilizadas.
- [`modulos.spec.ts`](../../../src/modulos.spec.ts): amplía la comprobación de composición y ausencia de ciclos a Correos; sustituye repositorio/procesador solo en la prueba sin conexión.
- [`alta-invitacion.integration-spec.ts`](../../../test/alta-invitacion.integration-spec.ts): añade siete casos sobre base migrada para comprobar registros del conjunto, ausencia de cuenta y secretos, normalización, cupo inicial/expreso, rechazo de cupos inválidos, RFC vacío y actor inactivo. Usa una clave de prueba aislada; no entrega correos reales.
- [`altas-negocio.integration-spec.ts`](../../../test/altas-negocio.integration-spec.ts): adapta las cinco regresiones de alta al servicio real nuevo: invitación, duplicados sin filas adicionales, rollback de auditoría y permisos. El conteo de duplicados incluye invitaciones, reservas y envíos.
- [`negocios-t47.e2e-spec.ts`](../../../test/negocios-t47.e2e-spec.ts): verifica alta HTTP real con invitación/envío, administrador nulo en consultas, ausencia de código/cuenta y validación de RFC/cupo. Conserva pruebas de sesiones, roles, errores e identidad duplicada.
- [`altas-historicas.ts`](../../../test/support/altas-historicas.ts): fixture exclusiva de tests para preparar el estado de fase 1 que aún necesitan los escenarios históricos de activación, reemisión y licencias. No se registra en Nest ni se importa desde producción. No acredita el alta nueva.
- [`escenarios-t51-t60.ts`](../../../test/support/escenarios-t51-t60.ts): usa esa fixture para estados históricos y mantiene los servicios de activación, credenciales y licencias reales; reemisión se delega al servicio de producción actual.
- [`recepcionistas-t48.e2e-spec.ts`](../../../test/recepcionistas-t48.e2e-spec.ts), [`credenciales-t49.e2e-spec.ts`](../../../test/credenciales-t49.e2e-spec.ts) y [`licencias-t50.e2e-spec.ts`](../../../test/licencias-t50.e2e-spec.ts): preparan explícitamente el pendiente histórico mediante fixture y conservan las operaciones HTTP reales bajo prueba.
- [`recorridos-t51-t58-t60.e2e-spec.ts`](../../../test/recorridos-t51-t58-t60.e2e-spec.ts): prepara altas históricas por fixture para seguir verificando activación/licencias de fase 1. Ya no atribuye esos recorridos a la nueva alta HTTP; esta se verifica en T47 adaptada y la suite de T035.
- [`tareas-modulo-1.md`](../tareas-modulo-1.md): marca exclusivamente T035 y enlaza esta evidencia.

## Tests primero y resultados

Antes de modificar producción se ejecutó `alta-invitacion.integration-spec.ts`: **7/7 fallaron** porque el servicio creaba Usuario, devolvía el código y no validaba RFC/cupo. Tras implementar el cambio, **7/7 pasaron**. La prueba HTTP de cupo detectó que `null` se trataba como omisión; se corrigió para que solo `undefined` aplique el valor inicial. La suite unitaria detectó la nueva dependencia del repositorio de envíos en la prueba sin base; se añadió el doble correspondiente y se repitió la suite completa.

| Verificación final | Resultado |
| --- | --- |
| `npm test -- --runInBand` | 43 suites; **212/212** aprobadas |
| `npm run test:integration -- --runInBand` | 24 suites; **113/113** aprobadas |
| `npm run test:e2e -- --runInBand` | 10 suites; **94/94** aprobadas |
| `npm run build` | Correcta |
| `npm run lint` | Sin errores |

Total: **419 pruebas aprobadas**. Los ERROR de T48/T49/T50/T72 son fallos inyectados para comprobar rollback, y las suites finales terminaron con código 0. Se comprobó el formato con `git diff --check` y la existencia de las rutas enlazadas.

## Alcance al detenerse

T036 sigue pendiente con su matriz ampliada de fallos, concurrencia e indisponibilidad de correo. **Las invitaciones creadas por el alta nueva todavía no pueden completar el flujo de activación existente**: T037 creará la cuenta al activar; T038–T040 adaptarán corrección, reemisión y recuperación, y T041 cerrará sus contratos HTTP. La activación y reemisión históricas continúan aplicando a sus estados previos; sus tests no prueban las invitaciones nuevas. La ejecución periódica de envíos corresponde a T121. Se detiene el trabajo en T035; no se marca ninguna de esas tareas como hecha.
