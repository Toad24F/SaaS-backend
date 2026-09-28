# Resultado M1-T037–M1-T039 — activar y reemplazar invitaciones

Fecha: 2026-09-28. **T037–T039 hechas.** Se implementaron las operaciones de dominio para crear al administrador al activar una invitación, corregir su correo y reemitir su código. Las pruebas usan el alta real de T035, una base MariaDB temporal migrada y claves aisladas; no emplean la fixture histórica para acreditar estas funciones.

## Flujo de activación — T037

1. El servicio recibe código, correo, nombre, contraseña y fecha; si se aporta `negocioId`, debe corresponder al negocio del código. Valida nombre/contraseña y genera el hash bcrypt antes de abrir la transacción.
2. `CodigosService.consumir` obtiene la referencia por hash y bloquea primero la invitación, después el código. Verifica propósito, consumo, invalidación, vencimiento exacto, correo normalizado, versión del destinatario y reconstrucción HMAC. Las invitaciones requieren correo; no se aplica la excepción de códigos históricos.
3. En ese mismo manager se bloquean licencia y negocio. La invitación y negocio deben seguir pendientes y la licencia debe permitir su primera habilitación; una suspensión impide la activación.
4. Se crea la cuenta completa con nombre, correo, contraseña hash, rol Administrador, pertenencia y fecha de activación. Se transfiere la reserva de correo de la invitación a la cuenta creada.
5. Se marca la invitación activada con su usuario, se activa el negocio y se habilita el primer año mediante el calendario existente. La auditoría referencia cuenta e invitación sin contraseña, hash ni código.
6. `consumir` marca finalmente el código utilizado y confirma el conjunto. Un fallo revierte cuenta, reserva, invitación, negocio, licencia, auditoría y consumo. Repetir el mismo código se rechaza sin modificaciones.

## Flujo de corrección — T038

1. `corregirCorreoInicial` normaliza y valida el nuevo correo. Consulta bajo bloqueo el actor persistido y exige superadmin activo y activado, además de negocio existente.
2. Bloquea la invitación del negocio. Una ya activada se rechaza; no permite corregir cuentas activadas por esta operación.
3. Si el correo normalizado es el mismo, devuelve las referencias existentes sin incrementar versión, emitir código ni auditar una transición inexistente.
4. `ReservaCorreoService.corregirAlta` libera la reserva anterior, actualiza invitación y correo administrador del negocio, incrementa la versión y reserva el nuevo correo. Un correo de cuenta u otra invitación ocupados provoca rollback de todo el cambio.
5. En la misma transacción se invalida el código anterior y se emite otro para el nuevo correo y versión, con nuevas 48 horas.
6. Los envíos anteriores pendientes, fallidos o tomados quedan descartados y pierden su token de arrendamiento. Un acuse tardío no puede cambiar el trabajo descartado. Un correo ya enviado conserva su confirmación histórica; el código invalidado ya no activa nada.
7. Se encola el envío nuevo y se audita `destinatario_corregido` con las versiones antes/después. Devuelve referencias y estado del envío, nunca el código. Negocio y licencia siguen pendientes hasta activar correctamente el nuevo destinatario.

## Flujo de reemisión — T039

`reemitirCodigoInicial` aplica la misma autorización y bloqueo de invitación. Mantiene negocio, correo y versión del destinatario; invalida la emisión anterior, descarta sus trabajos pendientes, emite con 48 horas desde la nueva solicitud y encola el siguiente envío. Permite sustituir un código vencido y rechaza una invitación activada. No crea cuentas, consume códigos ni inicia la licencia. La emisión registra la auditoría existente de `codigo_emitido`; las respuestas de invitaciones contienen `negocioId`, `altaAdministradorId`, `envioId`, `estadoEnvio` y `expiraEn`.

El envío SMTP se realiza posteriormente con el procesador ya implementado, fuera de estas transacciones. La posible llamada al transporte en curso después de la última revalidación conserva la limitación documentada en T030–T034: puede llegar un mensaje anterior, pero su código sustituido no puede activarse.

## Archivos y función

- [`activaciones.service.ts`](../../../src/altas/activaciones.service.ts): añade correo y pertenencia al contrato de dominio, activa invitaciones mediante creación de cuenta completa y transferencia de reserva y valida credenciales/fecha. Conserva una rama separada para cuentas/códigos históricos. Los comentarios explican bloqueo previo y participación de todas las escrituras en el consumo transaccional.
- [`altas.service.ts`](../../../src/altas/altas.service.ts): añade corrección, autorización de gestión, bloqueo de invitación, sustitución y proyección de metadatos. Adapta reemisión a invitaciones y conserva la compatibilidad de registros históricos. Los comentarios describen la operación sin cambios, la revocación del lease y la conservación de entregas confirmadas.
- [`invitaciones-t037-t039.integration-spec.ts`](../../../test/invitaciones-t037-t039.integration-spec.ts): añade 18 casos sobre servicios reales. Reconstruye los códigos solo en memoria de test, compara registros desde otra conexión e inyecta fallos mediante triggers exclusivos de la base temporal. Incluye comentarios sobre rollback, acuses tardíos y ausencia de secretos.
- [`resultados-t037-t039.md`](resultados-t037-t039.md): explica los tres flujos, archivos, pruebas, resultados y límites de la entrega.
- [`tareas-modulo-1.md`](../tareas-modulo-1.md): registra T037–T039 con esta evidencia al finalizar las verificaciones.

No se modificó SQL, entidades ni migraciones: las tablas y relaciones previas admiten estas transiciones. No hizo falta cambiar el registro de módulos: ReservaCorreoService ya está disponible en AltasModule.

## Tests primero

Se escribió y ejecutó la suite nueva antes de modificar producción: **10 fallaron y 6 pasaron, de 16 casos**. Los fallos evidenciaron ausencia de corrección, activación que no recibía correo ni creaba cuenta y reemisión que solo buscaba administrador histórico. Los casos de rechazo ya pasaban. Después de implementar los servicios pasaron **16/16**. Se añadieron dos casos para trabajo tomado y entrega confirmada, incluidos en la ejecución final completa.

| Grupo | Casos | Verificación |
| --- | ---: | --- |
| Activación válida y consumo único | 1 | Cuenta completa con bcrypt comprobado, reserva transferida, año iniciado y segundo consumo rechazado sin cambios. |
| Activación inválida | 6 | Correo distinto/ausente, negocio ajeno, vencimiento exacto, contraseña corta y licencia suspendida; ningún cambio parcial. |
| Rollback de activación | 1 | Fallo de auditoría tras las escrituras de dominio revierte el conjunto; el mismo código todavía puede activarse después. |
| Corrección completa | 1 | Reserva y versión nuevas, código/envío anteriores invalidados, mismo correo idempotente, activación solo con nuevo código/correo y rechazo posterior a activar. |
| Corrección inválida | 3 | Correo de cuenta, otra invitación o inválido; se preservan los registros anteriores. |
| Reemisión | 1 | Sustituye un vencido, conserva destinatario/cupo, concede 48 horas nuevas, no inicia licencia y rechaza después de activar. |
| Rollback de sustitución | 2 | Fallo al insertar envío nuevo revierte corrección o reemisión, incluida reserva, versión, invalidación y auditoría. |
| Trabajos anteriores | 2 | Lease tomado pierde autoridad; enviado conserva acuse; únicamente el nuevo destinatario recibe la siguiente entrega controlada. |
| Autorización | 1 | Ambas operaciones exigen superadmin persistido activo y negocio existente; actor desactivado o demovido se rechaza sin cambios. |

## Verificaciones finales

| Comando | Resultado |
| --- | --- |
| `npm test -- --runInBand` | 43 suites; **212/212** aprobadas |
| `npm run test:integration -- --runInBand` | 26 suites; **148/148** aprobadas |
| `npm run test:e2e -- --runInBand` | 10 suites; **94/94** aprobadas |
| `npm run build` | Correcta |
| `npm run lint` | Sin errores |

Total: **454 pruebas aprobadas**, incluidas las **18/18** nuevas. Todas las verificaciones finalizaron con código 0. Los ERROR de T48/T49/T50/T72 son fallos inyectados en las suites de rollback, no fallos de la ejecución final. Se verificaron las rutas enlazadas y `git diff --check`; se restauró únicamente el archivo incremental generado por la compilación. La lista queda con 39 tareas hechas y 101 pendientes, y el trabajo se detiene en T039.

## Alcance al detenerse

Estos cambios implementan servicios de dominio. T040 adaptará recuperación por correo; T041 actualizará los DTO/rutas HTTP de activación y corrección y cerrará sus respuestas. **El DTO HTTP actual de activación todavía no admite el correo requerido por las invitaciones nuevas; debe completarse en T041.** La ruta de reemisión existente ya reutiliza el servicio adaptado. Se conservan estados y evidencias históricos sin atribuirles cobertura de invitaciones nuevas. Las pruebas específicas de carreras y recorridos HTTP de T042–T044 siguen pendientes, igual que la ejecución periódica de T121. No se inició T040.
