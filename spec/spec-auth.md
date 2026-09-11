# Especificación de autenticación, negocios y licencias

## Objetivo y decisiones

Completar el acceso de superadministrador, administrador de negocio y recepcionista; el alta controlada de negocios multitenant; la activación de cuentas y la administración de licencias.

Decisiones acordadas:

- Licencias estrictamente anuales; sin límites de sucursales, servicios ni usuarios.
- El superadmin administra su asignación, suspensión y reactivación; las licencias se pueden renovar de forma acumulativa.
- La primera habilitación de la licencia ocurre al activar al administrador del negocio.
- Suspender una licencia bloquea el acceso del negocio y las nuevas reservas, conservando sus datos en su esquema. Se congela el tiempo restante.
- Pausar, suspender y desactivar una licencia son la misma acción reversible; se utiliza el término «suspender». No existe cancelación definitiva ni suspensión independiente del negocio.
- Una licencia vencida bloquea el acceso y las nuevas reservas hasta renovar.
- Los códigos se entregan manualmente.
- El código inicial dura 48 horas, está vinculado al correo del administrador y puede reemplazarse, invalidando el anterior.

## Requisitos funcionales en EARS

### Negocios y permisos

**Por qué:** impedir el registro libre de negocios y mantener separados sus datos y responsabilidades.

- **RF-01.** Cuando el superadministrador registre un negocio, el sistema deberá exigir nombre, identificador público único y correo del primer administrador, asignando automáticamente una licencia anual.
- **RF-02.** Cuando el registro sea aceptado, el sistema deberá dejar el negocio pendiente de activación, con la licencia anual asignada pero aún no habilitada y un código para crear al primer administrador.
- **RF-03.** Si el identificador público o el correo de acceso ya están registrados, el sistema deberá rechazar el alta sin dejar un negocio, licencia o cuenta parcialmente creados.
- **RF-04.** Cuando un usuario distinto del superadministrador intente crear negocios o crear, asignar, renovar, suspender o reactivar licencias, el sistema deberá denegar la operación.
- **RF-05.** Cuando un administrador gestione recepcionistas, el sistema deberá permitirle darles acceso y desactivarlos únicamente dentro de su negocio.
- **RF-06.** Si un usuario de negocio intenta consultar o modificar información de otro negocio, el sistema deberá denegar el acceso.
- **RF-07.** Cuando un recepcionista intente administrar cuentas, negocios o licencias, el sistema deberá denegar la operación.

### Activación y códigos

**Por qué:** entregar el control al destinatario previsto y evitar que un código permita crear varias cuentas.

- **RF-08.** Cuando el destinatario presente un código inicial válido, el sistema deberá permitirle establecer su nombre y contraseña y activar la cuenta vinculada al correo previsto.
- **RF-09.** Cuando se active correctamente el primer administrador, el sistema deberá iniciar la vigencia del año de licencia y consumir el código.
- **RF-10.** Si un código es incorrecto, está vencido, fue usado o fue reemplazado, el sistema deberá rechazarlo sin crear cuentas ni iniciar la licencia.
- **RF-11.** Cuando se presenten simultáneamente varias solicitudes con el mismo código, el sistema deberá resolver la condición de carrera aceptando como máximo una activación y rechazando las demás.
- **RF-12.** Cuando el superadministrador reemita un código inicial, el sistema deberá invalidar el anterior y conceder otras 48 horas sin iniciar la vigencia.
- **RF-13.** Cuando el administrador dé acceso a un recepcionista, el sistema deberá generar un código vinculado a su correo y negocio, válido por 48 horas, para que establezca su propia contraseña.
- **RF-14.** Mientras la licencia esté suspendida, el sistema deberá impedir la activación inicial y de recepcionistas; mientras la licencia haya vencido y no esté suspendida con tiempo conservado, deberá impedir la activación de recepcionistas hasta renovar.

### Inicio y cierre de sesión

**Por qué:** permitir el acceso autorizado y retirar permisos cuando cambien las condiciones de la cuenta.

- **RF-15.** Cuando un usuario activo presente credenciales válidas, el sistema deberá iniciar su sesión con su rol y negocio únicamente si su cuenta está activada y, para usuarios de negocio, el negocio está activado, su licencia está habilitada, no está suspendida y tiene vigencia disponible.
- **RF-16.** Si las credenciales son incorrectas o la cuenta está desactivada, el sistema deberá rechazar el acceso con un mensaje que no revele si el correo existe.
- **RF-17.** Si se supera el límite de cinco intentos de acceso o validación de códigos por minuto desde una misma dirección IP, el sistema (a nivel de backend mediante herramientas de limitación de tasa como `@nestjs/throttle`) deberá bloquear nuevos intentos de ese origen durante un minuto.
- **RF-18.** Cuando un usuario cierre sesión, el sistema deberá impedir que ese token/sesión vuelva a utilizarse.
- **RF-19.** En cada validación de solicitud a la API (mediante Guards o middleware), el sistema deberá verificar el estado actual de la cuenta y la licencia. Si la cuenta es desactivada o la licencia se vence/suspende, el sistema deberá denegar el acceso inmediatamente con un error 401, incluso si el usuario tenía una sesión previamente iniciada.
- **RF-20.** Cuando una sesión cumpla una hora desde su inicio, el backend deberá rechazar cualquier nueva solicitud exigiendo un nuevo inicio de sesión, sin almacenar mutaciones de datos que hayan quedado a la mitad al momento de expirar.

### Cambio y recuperación de contraseña

**Por qué:** recuperar el acceso sin que los administradores conozcan las contraseñas y retirar sesiones potencialmente comprometidas.

- **RF-21.** Cuando un usuario autenticado cambie su contraseña, el sistema deberá exigir la contraseña actual y una nueva de al menos 12 caracteres.
- **RF-22.** Cuando el superadministrador autorice recuperar una cuenta de administrador, el sistema deberá generar un código de recuperación para entregar manualmente.
- **RF-23.** Cuando se emita un código de recuperación, el sistema deberá vincularlo a una sola cuenta, darle 30 minutos de vigencia e invalidar los códigos de recuperación anteriores de esa cuenta.
- **RF-24.** Cuando se utilice correctamente un código de recuperación, el sistema deberá permitir establecer una nueva contraseña, consumir el código e invalidar todas las sesiones anteriores.
- **RF-25.** Cuando se complete un cambio de contraseña, el sistema deberá invalidar todas las sesiones existentes y exigir autenticarse nuevamente.
- **RF-26.** Si se recupera una contraseña de una cuenta desactivada o cuyo negocio esté bloqueado por su licencia, el sistema deberá conservar esas restricciones sin levantar la suspensión ni el vencimiento de la licencia.
- **RF-27.** Cuando se establezca una contraseña mediante activación o recuperación, el sistema deberá exigir la misma longitud mínima del cambio de contraseña.

### Licencias y suspensión

**Por qué:** permitir acceso al año contratado sin perder tiempo durante una suspensión, eliminar información o levantar bloqueos accidentalmente.

- **RF-28.** Cuando se active una licencia, el sistema deberá otorgar un año calendario desde la activación.
- **RF-29.** Cuando una licencia no suspendida alcance su vencimiento, el sistema deberá bloquear desde la siguiente solicitud el acceso de los usuarios del negocio y la aceptación de nuevas reservas públicas, incluidas las iniciadas previamente pero aún no confirmadas.
- **RF-30.** Mientras el negocio esté bloqueado, el sistema deberá conservar intacta su base de datos (cuentas, configuración y citas) y permitir que el superadministrador gestione su licencia.
- **RF-31.** Cuando el superadministrador renueve una licencia ya habilitada, el sistema deberá añadir un año calendario exacto. Si se realizan múltiples renovaciones, los años deberán sumarse de forma acumulativa. El cálculo se hará desde el vencimiento actual si sigue vigente, o desde el vencimiento conservado si está suspendida; si venció sin estar suspendida, deberá iniciar el nuevo año desde el momento de la renovación.
- **RF-32.** Cuando se renueve una licencia suspendida, el sistema deberá conservar su suspensión y ampliar el tiempo conservado sumando el nuevo año, sin restablecer el acceso automáticamente.
- **RF-33.** Cuando el superadministrador suspenda una licencia, el sistema deberá bloquear el acceso de los usuarios del negocio y nuevas reservas.
- **RF-34.** Cuando el superadministrador reactive una licencia, el sistema deberá retirar su suspensión y permitir el acceso únicamente si negocio y cuenta están activados y el usuario está activo; el sistema deberá aplicar el tiempo restante conservado.
- **RF-35.** Cuando se registre un alta, activación, renovación, suspensión, reactivación o recuperación autorizada, el sistema deberá conservar quién realizó la acción, cuándo y sobre qué cuenta, negocio o licencia, incluyendo fechas anteriores y nuevas cuando cambien, sin registrar contraseñas ni códigos ni duplicar transiciones ya aplicadas.
- **RF-36.** Cuando el superadministrador suspenda una licencia vigente, el sistema deberá calcular el tiempo restante y detener su consumo hasta la reactivación.
- **RF-37.** Cuando el superadministrador reactive una licencia suspendida, el sistema deberá ajustar su fecha de vencimiento proyectándola hacia el futuro para devolver el tiempo exacto que le restaba al suspenderla, sumando las renovaciones realizadas durante la suspensión.
- **RF-38.** Si se repite o se solicita simultáneamente una suspensión o reactivación ya aplicada (condición de carrera), el sistema deberá conservar un único efecto sobre el estado y el tiempo de la licencia.

## Supuestos y fuera de alcance

Defaults para cerrar las decisiones no consultadas:

- Los correos de acceso son únicos en toda la plataforma, sin distinguir mayúsculas; cada cuenta de negocio pertenece a uno solo.
- El superadministrador inicial ya existe. Su recuperación excepcional queda fuera de esta entrega.
- Los vencimientos utilizan la zona horaria `America/Chihuahua`, evaluando dinámicamente sus reglas locales para determinar el segundo exacto. Si el día de aniversario no existe en el mes de destino (ej. 29 de febrero), se utiliza su último día.
- Toda licencia es estrictamente anual.
- Suspender antes de activar impide usar el código sin iniciar ni acumular tiempo de licencia. Reactivar antes de activar tampoco inicia la vigencia; el código conserva sus 48 horas y debe reemitirse si vence.
- Una licencia ya vencida debe renovarse antes de poder suspenderla; no se recupera tiempo consumido. Una licencia suspendida con tiempo conservado no vence por el mero transcurso de la suspensión.
- Al reactivar una licencia, se desplaza su vencimiento por el tiempo total de suspensión. Suspensiones sucesivas, repetidas o concurrentes no pueden duplicar tiempo ni sus efectos.
- Desactivar una cuenta no elimina sus datos. Reemitir un código inicial no cambia al destinatario.
- Condiciones de carrera entre activación y reemisión de código invalidan la transacción que llegue un milisegundo tarde, priorizando el bloqueo en base de datos.
- Se adoptan sesiones de una hora, recuperación de 30 minutos y contraseñas de al menos 12 caracteres.

Fuera de alcance: cobros y facturación de licencias, pagos de citas, registro público de negocios, envío automático de códigos, acceso social, autenticación multifactor, múltiples administradores por negocio, cambio de propietario, y cancelación definitiva de licencias.

La gestión de sucursales, servicios, citas, disponibilidad, WhatsApp y reportes continúa fuera de esta entrega; únicamente queda definido su bloqueo por licencia o suspensión a través de los Guards de autorización.

## Criterios de finalización

- Todos los RF tienen escenarios de aceptación aprobados para resultados válidos y rechazos.
- Se demuestra mediante pruebas de integración que los usuarios no acceden a los datos de otros *tenants* y que los recepcionistas no administran permisos.
- Se verifican códigos incorrectos, vencidos, reemplazados, reutilizados y utilizados simultáneamente, previniendo condiciones de carrera.
- Se comprueba en cada endpoint que la API rechaza inmediatamente el acceso si la licencia es suspendida o expira a mitad de una sesión activa (validación continua).
- Se verifica el bloqueo por tasa de peticiones mediante el Throttler.
- Se verifican vencimientos exactos considerando zonas horarias, fin de mes, año bisiesto, renovaciones acumulativas, congelación exacta del tiempo y ajuste del vencimiento al reactivar.
- Se verifican suspensiones antes de activar, códigos vencidos durante la suspensión, pausas prolongadas y sucesivas, doble suspensión, doble reactivación y cruces con renovación, sin pérdida ni duplicación de tiempo.
- Se demuestra que los bloqueos conservan la integridad de la base de datos y que recuperar una contraseña no elude restricciones de licencia.
- Compilación, lint, pruebas de autenticación y pruebas de integración con esquemas de datos aislados finalizan correctamente.

El bloqueo de confirmaciones de reservas reales de RF-29 y RF-33 permanece como integración pendiente del futuro módulo de reservas; las pruebas de la política de acceso no completan por sí solas esos escenarios.
