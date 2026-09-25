# Especificación del módulo 1 — Administración de sucursales, servicios y personal

## Objetivo y justificación

Permitir que cada negocio configure sus sucursales, servicios y profesionales, con horarios coherentes entre ubicaciones y permisos separados por responsabilidad.

Incorporar los acuerdos sobre activación por correo, límites de sucursales y licencias para que el acceso y la operación reflejen las condiciones autorizadas por el superadministrador.

Esta entrega comprende únicamente el backend. Los requisitos describen resultados observables, sin definir su implementación. El prototipo de disponibilidad sirve como referencia funcional; sus pantallas no forman parte de esta entrega.

## Relación con la fase 1

Esta especificación sustituye las reglas anteriores incompatibles sobre sucursales ilimitadas, entrega manual de códigos, creación anticipada de administradores incompletos y bloqueo inmediato por suspensión manual.

Se conservan las reglas compatibles de autenticación, sesiones, recuperación de contraseña, recepcionistas, licencias anuales y auditoría. Las evidencias de fase 1 no acreditan los requisitos nuevos.

Los identificadores RF siguientes pertenecen a esta especificación.

## Requisitos funcionales en EARS

### 1. Permisos y aislamiento

**Por qué:** impedir que una cuenta modifique información ajena o asuma responsabilidades que no le corresponden.

- **RF-01.** Cuando un usuario intente consultar o modificar registros de otro negocio, el sistema deberá denegar la operación sin revelar ni alterar esos registros.
- **RF-02.** Cuando un usuario distinto del superadministrador intente registrar negocios, administrar licencias o modificar límites de sucursales, el sistema deberá denegar la operación.
- **RF-03.** Cuando el administrador de un negocio gestione sucursales, servicios, profesionales y sus asignaciones y horarios, el sistema deberá permitirle operar únicamente sobre su negocio.
- **RF-04.** Cuando un recepcionista intente administrar los catálogos, cuentas de profesionales o asignaciones de este módulo, el sistema deberá denegar la operación.
- **RF-05.** Cuando un Profesional intente modificar horarios o servicios de otro profesional, administrar cuentas o cambiar el catálogo general, el sistema deberá denegar la operación.

### 2. Negocios y activación

**Por qué:** entregar la cuenta al destinatario previsto sin crear usuarios incompletos ni iniciar anticipadamente la licencia.

- **RF-06.** Cuando el superadministrador registre un negocio, el sistema deberá exigir nombre, RFC y correo válido del administrador, conservando la identificación pública única del negocio.
- **RF-07.** Cuando se registre un negocio con un RFC utilizado por otro negocio, el sistema deberá permitirlo si cumple las demás condiciones del alta.
- **RF-08.** Cuando se acepte el alta, el sistema deberá dejar el negocio pendiente, asignarle su licencia anual aún sin iniciar y emitir un código de activación para el correo indicado, sin crear una cuenta de administrador.
- **RF-09.** Cuando el destinatario presente el correo correspondiente, un código válido y sus datos completos de cuenta, el sistema deberá crear al administrador, activar el negocio, iniciar la licencia y consumir el código como una única operación.
- **RF-10.** Si el correo no corresponde al destinatario, el código es incorrecto, venció, fue sustituido o ya se utilizó, el sistema deberá rechazar la activación sin crear cuentas ni iniciar la licencia.
- **RF-11.** Cuando se soliciten activaciones simultáneas con el mismo código, el sistema deberá aceptar como máximo una, sin cuentas duplicadas ni resultados parciales.
- **RF-12.** Cuando el superadministrador corrija el correo antes de la activación, el sistema deberá invalidar el código anterior y emitir uno nuevo para el destinatario corregido.
- **RF-13.** Si el correo de acceso ya está ocupado o reservado para otra alta pendiente, el sistema deberá rechazar el alta o cambio de destinatario sin dejar cambios parciales.

### 3. Códigos y errores de correo

**Por qué:** permitir que el destinatario complete su acceso y que un fallo de entrega pueda resolverse sin duplicar negocios.

- **RF-14.** Cuando se genere un código de activación o recuperación, el sistema deberá enviarlo al correo de su destinatario y restringir su uso al propósito y destinatario previstos.
- **RF-15.** Cuando se emita o reemita un código inicial, el sistema deberá concederle 48 horas de vigencia e invalidar cualquier código inicial anterior sustituido, sin iniciar la licencia.
- **RF-16.** Cuando se emita un código de recuperación de administrador autorizado por el superadministrador, el sistema deberá conservar la vigencia de 30 minutos y las demás restricciones compatibles de fase 1.
- **RF-17.** Si falla el envío del código inicial, el sistema deberá conservar el negocio pendiente sin cuenta de administrador, informar el fallo al superadministrador y permitir reintentos de envío y reemisión.
- **RF-18.** Cuando se reintente un envío, el sistema deberá respetar el vencimiento y la invalidación del código; un reintento no deberá extender su vigencia ni rehabilitarlo.
- **RF-19.** Cuando se registren resultados de envío o eventos de auditoría, el sistema deberá excluir contraseñas y códigos utilizables.

### 4. Sucursales y límites

**Por qué:** controlar la capacidad autorizada del negocio conservando su información cuando se reduzca la operación.

- **RF-20.** Cuando se registre un negocio sin un límite explícito, el sistema deberá asignarle capacidad para una sucursal activa.
- **RF-21.** Cuando se cree o edite una sucursal, el sistema deberá exigir nombre, dirección, teléfono y zona horaria, y permitir URL de Google Maps y notas de llegada opcionales.
- **RF-22.** Cuando se consulte el cupo del negocio, el sistema deberá contabilizar únicamente sus sucursales activas.
- **RF-23.** Si crear o reactivar una sucursal excedería el límite autorizado, el sistema deberá rechazar la operación, incluso ante solicitudes simultáneas.
- **RF-24.** Si el superadministrador intenta reducir el límite por debajo de la cantidad de sucursales activas, el sistema deberá rechazar el cambio e indicar que deben desactivarse primero las excedentes.
- **RF-25.** Cuando se desactive una sucursal, el sistema deberá conservar sus datos, asignaciones y horarios, dejando estos últimos sin efecto operativo en esa sucursal.
- **RF-26.** Cuando se reactive una sucursal, el sistema deberá permitirlo únicamente si existe cupo y sus horarios conservados no provocan conflictos con la operación vigente.

### 5. Servicios y profesionales

**Por qué:** mantener una oferta consistente y permitir que cada profesional gestione lo que puede atender.

- **RF-27.** Cuando se cree o edite un servicio, el sistema deberá exigir nombre, costo igual o mayor que cero y duración aproximada en minutos enteros mayores que cero.
- **RF-28.** Mientras un servicio pertenezca al catálogo del negocio, el sistema deberá mantener un mismo costo y duración para todas sus sucursales y profesionales.
- **RF-29.** Cuando el administrador registre un Profesional, el sistema deberá exigir nombre, correo y contraseña y crear su cuenta completa y activa, sin invitación por código.
- **RF-30.** Cuando se establezca la contraseña del Profesional, el sistema deberá aplicar la política de contraseñas vigente y conservar su unicidad de correo de acceso.
- **RF-31.** Cuando el administrador asigne un Profesional a sucursales, el sistema deberá permitir múltiples sucursales del mismo negocio.
- **RF-32.** Cuando el administrador seleccione los servicios que ofrece un Profesional de su negocio, o el propio Profesional gestione su selección, el sistema deberá permitir habilitar o deshabilitar para ese Profesional cualquier servicio activo del catálogo de su negocio.
- **RF-33.** Cuando se determine la oferta de una sucursal, el sistema deberá considerar los servicios habilitados de sus profesionales activos asignados, sin exigir una selección independiente de servicios por sucursal.
- **RF-34.** Mientras un servicio esté desactivado en el catálogo general, el sistema deberá impedir que se ofrezca aunque algún Profesional conserve su selección.
- **RF-35.** Cuando se desactive la cuenta de un Profesional, el sistema deberá impedir su acceso, incluidas las solicitudes con sesiones abiertas, y conservar sus datos.
- **RF-36.** Cuando se reactive una cuenta de Profesional, el sistema deberá conservar sus credenciales y exigir un nuevo inicio de sesión, sujeto a las condiciones de acceso del negocio.

### 6. Horarios, descansos y guardado

**Por qué:** representar dónde y cuándo trabaja cada Profesional, conservar su configuración y permitir cambios completos sin asignarlo simultáneamente a distintas ubicaciones.

- **RF-37.** Cuando el administrador o el propio Profesional configure su horario, el sistema deberá permitir varias franjas semanales recurrentes por día, cada una con su sucursal, hora de inicio y hora de fin; las franjas de un mismo día podrán pertenecer a distintas sucursales asignadas.
- **RF-38.** Cuando se active o desactive una franja, el sistema deberá cambiar únicamente el estado de esa franja y conservar sus datos, sin cambiar el estado de las demás franjas del día.
- **RF-39.** Cuando el administrador o el propio Profesional gestione las franjas del horario, el sistema deberá permitir agregarlas, modificarlas y quitarlas, incluida la última del día, y guardar días o semanas completos sin franjas activas.
- **RF-40.** Cuando se guarde una franja inactiva con datos incompletos, el sistema deberá conservarla como borrador sin efecto sobre la atención ni sobre los empalmes de franjas activas; los datos informados deberán respetar la pertenencia al negocio y las asignaciones del Profesional.
- **RF-41.** Si se intenta activar o guardar una franja activa sin sucursal asignada, sin ambas horas, con un intervalo no positivo o con un empalme, el sistema deberá rechazar la operación y mantener el horario previamente guardado.
- **RF-42.** Cuando se active o guarde una franja activa, el sistema deberá admitir como máximo un descanso opcional y exigir ambas horas del descanso o ninguna; si se indican, su inicio deberá preceder a su fin y el intervalo completo deberá estar contenido dentro de la franja.
- **RF-43.** Si se intenta asignar otra franja dentro del descanso de una franja activa del mismo Profesional, el sistema deberá rechazar el empalme, incluso si corresponde a otra sucursal; el descanso no deberá liberar la asignación de la franja que lo contiene.
- **RF-44.** Cuando se configure un horario especial para una fecha y sucursal, el sistema deberá sustituir para ese día las franjas semanales del Profesional en esa sucursal y validar el horario resultante junto con las franjas de las demás sucursales.
- **RF-45.** Si una jornada cruza la medianoche, el sistema deberá exigir franjas separadas por día local; cada franja podrá terminar en el límite final de su día sin extenderse por el siguiente.
- **RF-46.** Cuando se comparen horarios entre sucursales, el sistema deberá considerar la zona horaria de cada una y detectar coincidencias reales en el tiempo, incluso cuando las franjas correspondan a días locales distintos.
- **RF-47.** Si crear, modificar, reactivar o aplicar una excepción produce un empalme entre franjas activas del mismo Profesional, el sistema deberá rechazar toda la operación, identificar las franjas en conflicto y conservar la configuración anterior.
- **RF-48.** Cuando una franja termine exactamente al comenzar otra, el sistema deberá permitirlas, incluso en distintas sucursales, sin exigir ni configurar un tiempo mínimo de traslado.
- **RF-49.** Cuando un Profesional termine una franja, salga a comer y continúe en otra sucursal, el sistema deberá permitir una franja antes de la comida y otra después, dejando el intervalo entre ellas sin atención para descanso o traslado.
- **RF-50.** Mientras exista un descanso dentro de una franja o un hueco entre franjas, el sistema deberá excluir ese intervalo del horario de atención sin eliminar las franjas guardadas.
- **RF-51.** Cuando el administrador o el propio Profesional guarde el horario semanal completo del Profesional seleccionado, el sistema deberá aceptar todos los cambios válidos como un conjunto o conservar íntegramente el horario anterior, sin guardados parciales.
- **RF-52.** Si el guardado del horario se rechaza por datos inválidos o conflictos, el sistema deberá identificar las franjas y campos afectados y permitir corregir el conjunto presentado sin exigir capturar nuevamente los demás datos.
- **RF-53.** Cuando se reciban guardados concurrentes del horario semanal de un mismo Profesional, el sistema deberá hacer prevalecer el último guardado válido como reemplazo del horario completo, aunque sustituya cambios anteriores; el resultado aceptado deberá respetar las restricciones vigentes y no contener empalmes.
- **RF-54.** Cuando el administrador autorizado o el propio Profesional consulte nuevamente el horario, el sistema deberá devolver las franjas guardadas con sus sucursales, horas, descansos y estados, incluidos los borradores inactivos y sus datos incompletos.

### 7. Bloqueos excepcionales

**Por qué:** restringir temporalmente la atención de personas o sucursales sin borrar horarios y sin permitir que un Profesional altere restricciones de todo el equipo.

- **RF-55.** Cuando se cree o modifique un bloqueo, el sistema deberá exigir motivo, tipo —vacaciones, día festivo o emergencia—, destinatarios y fechas de inicio y fin.
- **RF-56.** Cuando el administrador configure un bloqueo, el sistema deberá permitirle seleccionar un Profesional o todo el equipo y una sucursal o todas las sucursales de su negocio.
- **RF-57.** Cuando un Profesional configure un bloqueo, el sistema deberá limitarlo a sí mismo y a una o todas sus sucursales asignadas, sin afectar a otros profesionales.
- **RF-58.** Cuando un bloqueo incluya horas de inicio y fin, el sistema deberá aplicarlo como un intervalo continuo desde la fecha y hora iniciales hasta la fecha y hora finales, incluyendo el tiempo intermedio de los días abarcados.
- **RF-59.** Cuando un bloqueo no incluya ninguna de las dos horas, el sistema deberá bloquear los días completos desde la fecha inicial hasta la final, ambas incluidas.
- **RF-60.** Si un bloqueo carece de un dato obligatorio, contiene únicamente una de las dos horas o define un intervalo invertido o de duración nula, el sistema deberá rechazar su guardado, indicar los datos afectados y conservar el estado anterior.
- **RF-61.** Cuando un bloqueo afecte a sucursales con distintas zonas horarias, el sistema deberá interpretar las fechas y horas indicadas en la hora local de cada sucursal, sin exigir que los intervalos coincidan en tiempo real.
- **RF-62.** Cuando dos o más bloqueos coincidan total o parcialmente, el sistema deberá permitir conservarlos y restringir la atención donde aplique cualquiera de ellos; modificar o quitar uno deberá mantener las restricciones de los restantes.
- **RF-63.** Cuando el administrador consulte, modifique o quite un bloqueo, el sistema deberá permitirle gestionar los bloqueos de su negocio, incluidos los creados por sus profesionales.
- **RF-64.** Cuando un Profesional consulte, modifique o quite un bloqueo, el sistema deberá permitirle consultar los que afecten a su propia disponibilidad y modificar o quitar los individuales sobre sí mismo, aunque los haya creado el administrador; deberá impedirle modificar o quitar los de todo el equipo o los de otros profesionales.
- **RF-65.** Mientras exista un bloqueo aplicable, el sistema deberá excluir su intervalo del horario de atención sin borrar las franjas de trabajo y sin que un horario especial por fecha anule esa restricción.

### 8. Desactivación y eliminación

**Por qué:** permitir retirar elementos sin perder relaciones ni antecedentes de operación.

- **RF-66.** Cuando el administrador retire una sucursal, servicio o Profesional, el sistema deberá permitir su desactivación conservando sus datos e historial.
- **RF-67.** Cuando se solicite eliminar definitivamente una sucursal, servicio o Profesional sin historial ni registros relacionados, el sistema deberá permitir la eliminación.
- **RF-68.** Si el registro tiene asignaciones, horarios u otro historial o relación, el sistema deberá rechazar su eliminación e indicar que puede desactivarse.

### 9. Suspensión, vencimiento y reactivación

**Por qué:** conceder un plazo de acceso antes del bloqueo manual sin regalar tiempo consumido, perder vigencia conservada ni eliminar información.

- **RF-69.** Cuando el superadministrador suspenda manualmente una licencia habilitada y vigente, el sistema deberá establecer el bloqueo para 48 horas después de la solicitud.
- **RF-70.** Mientras no termine ese plazo ni venza naturalmente la licencia, el sistema deberá permitir la operación normal de los usuarios conforme a su rol y continuar consumiendo vigencia.
- **RF-71.** Cuando se alcance el vencimiento natural antes del bloqueo programado, el sistema deberá negar el acceso desde ese vencimiento, sin extenderlo hasta completar las 48 horas.
- **RF-72.** Cuando se cumpla el plazo de suspensión, el sistema deberá negar nuevas solicitudes de los usuarios del negocio, incluidas aquellas realizadas con sesiones abiertas, y congelar el tiempo de licencia que todavía reste.
- **RF-73.** Cuando se repita una solicitud de suspensión ya pendiente o efectiva, el sistema deberá conservar el plazo y estado correspondientes, sin reiniciar las 48 horas ni duplicar efectos.
- **RF-74.** Cuando el superadministrador reactive antes del bloqueo programado, el sistema deberá cancelar ese bloqueo sin devolver el tiempo consumido; el acceso seguirá sujeto a la vigencia y al estado de las cuentas.
- **RF-75.** Cuando se reactive una licencia cuyo tiempo ya esté congelado, el sistema deberá restituir el tiempo conservado ajustando el vencimiento, sin duplicarlo.
- **RF-76.** Cuando se renueve una licencia, el sistema deberá añadir la vigencia anual correspondiente sin cancelar una suspensión pendiente o efectiva.
- **RF-77.** Cuando se suspenda un negocio pendiente de activación, el sistema deberá impedir inmediatamente la activación del administrador, sin iniciar ni consumir vigencia.
- **RF-78.** Mientras una licencia esté suspendida o vencida, el sistema deberá conservar las cuentas y los datos del negocio.
- **RF-79.** Cuando existan solicitudes concurrentes de suspensión, renovación o reactivación, el sistema deberá conservar un resultado coherente sin pérdida o duplicación de vigencia, cambios de pertenencia ni eventos duplicados para una misma transición.

### 10. Avisos y consulta de vigencia

**Por qué:** permitir que el administrador conozca el vencimiento y disponga de tiempo para gestionar su renovación.

- **RF-80.** Cuando una licencia vigente alcance las 48 horas anteriores a su vencimiento, el sistema deberá enviar un aviso al correo del administrador del negocio.
- **RF-81.** Si falla ese aviso, el sistema deberá registrar el fallo y reintentar mientras la licencia continúe vigente, evitando repetir avisos cuyo envío ya haya sido confirmado.
- **RF-82.** Cuando una renovación o reactivación cambie el vencimiento, el sistema deberá considerar la fecha actual para los avisos posteriores y evitar enviar avisos pendientes de una fecha sustituida.
- **RF-83.** Cuando un usuario autorizado consulte la vigencia de su negocio, el sistema deberá proporcionar el estado de la licencia, la fecha y hora exactas de vencimiento y el tiempo restante en días, horas y minutos.
- **RF-84.** Mientras exista una suspensión pendiente, el sistema deberá distinguirla de una suspensión efectiva e informar la fecha y hora previstas del bloqueo.
- **RF-85.** Mientras la licencia esté pendiente de activación, suspendida o vencida, el sistema deberá distinguir respectivamente vigencia no iniciada, tiempo congelado y tiempo agotado, sin presentar un vencimiento anterior como si siguiera corriendo.

### 11. Selección de servicios del Profesional

**Por qué:** permitir consultar y modificar qué servicios ofrece cada Profesional, incluida una selección vacía que impida nuevas citas sin desactivar su cuenta ni borrar su horario.

Como referencia para el futuro frontend, la edición mediante el lápiz mostrará los servicios con casillas de selección múltiple (checkboxes) y recuperará las selecciones guardadas. La sección de sucursales de ese formulario del prototipo no forma parte de esta edición de servicios; las asignaciones a sucursales conservan sus reglas independientes.

- **RF-86.** Cuando el administrador consulte la selección de servicios de un Profesional de su negocio, o el propio Profesional consulte la suya, el sistema deberá proporcionar los servicios del catálogo disponibles para seleccionar y distinguir los actualmente seleccionados, indicando los que ya no estén activos y no puedan ofrecerse.
- **RF-87.** Cuando se guarde una selección válida de servicios de un Profesional, el sistema deberá conservar como seleccionados los servicios elegidos y dejar de ofrecer para ese Profesional los desmarcados, sin eliminar servicios del catálogo, modificar selecciones de otros profesionales ni cambiar sus sucursales u horarios.
- **RF-88.** Cuando se guarde una selección vacía de servicios de un Profesional, el sistema deberá aceptarla y dejarlo sin servicios habilitados para registrar nuevas citas, conservando el estado de su cuenta y su horario; mientras no tenga servicios seleccionados y activos, el sistema deberá impedir nuevas citas para él.

En el módulo 1 se acredita la selección vacía y que el Profesional queda sin servicios ofrecidos. La comprobación de este impedimento al registrar citas, tanto públicas como administrativas, corresponde a la integración futura del módulo de reservas y no se presenta como implementada en esta entrega. Volver a seleccionar servicios activos restablece su oferta, sin eludir las demás condiciones de cuenta, licencia y horario.

## Fuera de alcance

- Pantallas y componentes del frontend; el prototipo es una referencia funcional, no un entregable de este módulo.
- Creación y gestión de citas, portal operativo de reservas y cálculo de espacios disponibles. Incluye la integración del rechazo de nuevas citas para profesionales sin servicios habilitados; su selección vacía y su oferta vacía sí pertenecen al módulo 1.
- Modos “Ventana libre” y “Agenda compacta”, aunque aparezcan en el prototipo; corresponden al motor de disponibilidad del módulo 2.
- Validación de cambios de horario y bloqueos contra citas existentes, así como identificación y tratamiento de citas afectadas; corresponde a la integración futura del módulo de reservas y no condiciona la finalización del módulo 1.
- Pagos anticipados, pasarelas de pago y facturación fiscal.
- Validación del RFC ante autoridades fiscales; su captura no acredita situación fiscal.
- Precios o duraciones distintos por sucursal o Profesional.
- Selección independiente del catálogo por sucursal.
- Cálculo automático y configuración de tiempos mínimos de traslado entre sucursales.
- Invitación por correo para crear cuentas de profesionales.
- WhatsApp y generación de reportes PDF.
- Eliminación de sucursales, servicios o profesionales con historial o relaciones; esta restricción no impide quitar franjas o bloqueos conforme a las reglas de este módulo.
- Cambios a reglas de fase 1 que no resulten afectados por esta especificación.

## Criterios de finalización

1. Cada RF tiene evidencia verificable de aceptación; se distinguen requisitos nuevos de comportamientos heredados y no hay identificadores duplicados.
2. Se demuestra el aislamiento entre dos negocios y el rechazo de operaciones no autorizadas para cada rol.
3. El alta de negocio no crea un administrador incompleto; la activación válida crea una sola cuenta e inicia una sola licencia, incluso con solicitudes simultáneas.
4. Se comprueban correo incorrecto, código vencido, usado o sustituido, corrección de destinatario, fallos de envío, reintentos y reemisión.
5. Se verifica el cupo inicial, su modificación, la reducción con desactivaciones previas y la imposibilidad de superar el límite mediante altas o reactivaciones simultáneas.
6. Se comprueban altas, modificaciones, desactivaciones y eliminaciones permitidas y rechazadas de sucursales, servicios y profesionales.
7. Se verifica que un mismo día admite varias franjas en distintas sucursales, que cada interruptor afecta únicamente a su franja y que desactivarla conserva sus datos.
8. Se comprueba que es posible quitar la última franja de un día, guardar una semana sin atención y recuperar posteriormente esa configuración.
9. Se comprueba el guardado y la consulta de borradores inactivos incompletos, su ausencia de efecto sobre la atención y los empalmes, y el rechazo de su activación hasta completar y validar sus datos.
10. Se verifican franjas activas incompletas, sucursales no asignadas, intervalos inválidos y descansos con una sola hora, invertidos o fuera de la franja; se comprueba que un descanso opcional completo es válido y que no se admite más de uno por franja.
11. Se demuestra que un descanso no permite asignar otra sucursal dentro de la misma franja, que comer y cambiar de sucursal se representa con franjas separadas y que las franjas consecutivas se aceptan sin exigir traslado.
12. Se verifican horarios semanales, excepciones por fecha, jornadas divididas por día local y conflictos entre sucursales con distintas zonas horarias, incluidos intervalos de días locales distintos que coinciden en tiempo real.
13. Se demuestra que un error en una franja rechaza el guardado completo sin modificar la semana anterior; la respuesta identifica los campos y franjas afectados y permite corregir sin recapturar todo.
14. Se demuestra que el último guardado válido reemplaza el horario completo ante ediciones concurrentes; un guardado posterior inválido no altera el último horario válido y el resultado nunca contiene empalmes.
15. Se comprueba que consultar nuevamente devuelve las sucursales, horas, descansos y estados guardados, incluidos los datos incompletos de borradores inactivos.
16. Se verifican bloqueos con motivo y tipo obligatorios, intervalos continuos de varios días, días completos con ambas fechas incluidas y rechazo de datos faltantes, una sola hora, intervalos invertidos o de duración nula.
17. Se verifican bloqueos de un Profesional o todo el equipo en una o todas las sucursales, interpretados en la hora local de cada sucursal y limitados al negocio autorizado.
18. Se comprueba que el Profesional solo crea bloqueos sobre sí mismo y puede modificar o quitar los individuales que lo afectan, incluidos los creados por el administrador, pero no los colectivos ni los de otros profesionales; el administrador gestiona los de su negocio.
19. Se demuestra que los bloqueos superpuestos mantienen todas sus restricciones, que quitar uno no elimina los restantes y que una excepción de horario no anula un bloqueo ni borra las franjas de trabajo.
20. Se demuestra acceso normal antes del bloqueo de licencia y rechazo en el instante exacto y después; también vencimiento anticipado, cancelación del bloqueo pendiente y suspensión previa a la activación.
21. Se demuestra la conservación exacta de vigencia y datos ante renovaciones, suspensiones, reactivaciones y operaciones concurrentes.
22. Se comprueban el aviso con dos días de anticipación, los reintentos tardíos mientras exista vigencia y la sustitución de avisos obsoletos.
23. La consulta de licencia distingue estados y muestra fechas y tiempo restante coherentes, incluido tiempo congelado o no iniciado.
24. Las verificaciones de calidad aplicables y las pruebas de regresión de los comportamientos compatibles de fase 1 pasan; las expectativas sustituidas se actualizan conforme a esta especificación, conservando las evidencias históricas.
25. Cada requisito de este módulo cuenta con evidencia antes de declarar completa la entrega; las pantallas, los modos de agendamiento y las validaciones contra citas reales se mantienen como trabajo posterior y no se presentan como implementados.
26. Se comprueba que el administrador gestiona la selección de servicios de profesionales de su negocio y que el Profesional gestiona solo la propia; consultar después de guardar recupera las selecciones actuales, distinguiendo los servicios desactivados en el catálogo.
27. Se verifican selección múltiple, desmarcado y selección vacía sin borrar servicios ni alterar otros profesionales, el estado de la cuenta, las sucursales o los horarios. Sin servicios seleccionados y activos, la oferta del Profesional queda vacía; volver a seleccionar servicios activos restablece su oferta sujeto a las demás restricciones. El rechazo de citas reales queda identificado como integración futura y no como una prueba completada del módulo 1.
