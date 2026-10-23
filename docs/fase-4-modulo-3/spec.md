# Módulo 3: Portal Público de Reservas

## Objetivo y reglas de referencia

Permitir que un cliente reserve un servicio mediante el portal público de un negocio, con un apartado temporal y sin duplicar reservas ni exponer información ajena.

El resultado será una **cita pendiente de confirmación por el cliente**. La confirmación mediante WhatsApp corresponde al módulo 5.

Se conservan las reglas vigentes de licencia, oferta y disponibilidad del módulo 2, incluida la ocupación del Profesional entre sucursales. Los RF siguientes pertenecen exclusivamente a esta especificación.

## Requisitos funcionales en EARS

### Acceso y selección

**Por qué:** permitir reservas dentro del negocio correcto y únicamente sobre su oferta disponible.

- **RF-01.** Cuando una persona acceda al enlace público de un negocio existente, el sistema deberá permitir iniciar una reserva sin crear una cuenta ni iniciar sesión.
- **RF-02.** Mientras una persona utilice el portal de un negocio, el sistema deberá limitar los catálogos, horarios, apartados y reservas a ese negocio, incluso ante identificadores manipulados.
- **RF-03.** Si el negocio no existe o su licencia no permite acceso conforme a las reglas vigentes, el sistema deberá impedir nuevas consultas de disponibilidad, apartados y reservas, e informar que el portal no está disponible para reservar.
- **RF-04.** Cuando se presenten opciones de reserva, el sistema deberá ofrecer únicamente combinaciones activas de servicio, sucursal y Profesional que cumplan las condiciones de oferta del módulo 2.
- **RF-05.** Cuando el cliente avance por el portal, el sistema deberá guiarlo por servicio, sucursal, Profesional, fecha y horario, formulario de contacto y resultado de la reserva.
- **RF-06.** Cuando cambie una selección que determine opciones posteriores, el sistema deberá exigir que esas opciones vuelvan a ser válidas antes de permitir continuar.
- **RF-07.** Mientras se utilice el portal desde un dispositivo móvil o mediante teclado, el sistema deberá permitir completar el flujo y comprender los campos, errores y acciones disponibles.

### Datos de contacto

**Por qué:** disponer de información suficiente para atender la reserva sin confundir un teléfono compartido con la identidad de una persona.

- **RF-08.** Cuando el cliente envíe el formulario, el sistema deberá exigir nombre completo y teléfono, y admitir motivo de consulta o notas opcionales.
- **RF-09.** Cuando se capture un teléfono mexicano con espacios, guiones o prefijo `+52`, el sistema deberá aceptarlo si equivale a diez dígitos nacionales; los números incompletos u otros prefijos deberán rechazarse.
- **RF-10.** Si los datos obligatorios son inválidos, el sistema deberá señalar los campos que requieren corrección y conservar los datos escritos mientras el cliente permanezca en el flujo.
- **RF-11.** Cuando el teléfono cumpla el formato permitido, el sistema deberá permitir continuar sin exigir un código de verificación.
- **RF-12.** Si existen otras reservas con el mismo teléfono, el sistema deberá permitir una nueva reserva y conservar el nombre indicado para cada cita, sin modificar los datos de citas anteriores.
- **RF-13.** Cuando se introduzca un teléfono, el sistema no deberá revelar nombres, notas ni reservas anteriores asociadas a ese número.

### Disponibilidad

**Por qué:** ofrecer horarios reservables conforme a las reglas actuales y distinguir los conflictos de los fallos del sistema.

- **RF-14.** Cuando se consulte disponibilidad, el sistema deberá aplicar las reglas públicas vigentes del módulo 2, incluidos duración, modo de agenda, anticipación, horizonte, horarios, bloqueos y ocupaciones entre sucursales.
- **RF-15.** Cuando se presenten horarios y resúmenes, el sistema deberá expresar la fecha y hora de la sucursal e identificar su zona horaria; los inicios locales ambiguos o inexistentes deberán rechazarse.
- **RF-16.** Si una consulta válida no encuentra horarios, el sistema deberá informar que no hay disponibilidad y permitir cambiar las selecciones.
- **RF-17.** Si falla la consulta de disponibilidad, el sistema deberá informar del fallo y permitir reintentar, sin presentar una agenda vacía como resultado válido ni mostrar resultados parciales.
- **RF-18.** Cuando el cliente seleccione un horario mostrado, el sistema deberá comprobar nuevamente su disponibilidad antes de conceder el apartado.

### Apartados temporales

**Por qué:** proteger el horario durante la captura del formulario sin retenerlo indefinidamente.

- **RF-19.** Cuando el cliente llegue al formulario final y el horario continúe disponible, el sistema deberá conceder un apartado de cinco minutos y mostrar el tiempo restante.
- **RF-20.** Mientras un apartado esté vigente, el sistema deberá impedir reservas y apartados incompatibles para el mismo Profesional, incluidas otras sucursales y servicios.
- **RF-21.** Mientras el cliente complete el formulario, el sistema no deberá ampliar el apartado por actividad, errores de captura ni solicitudes de tiempo adicional.
- **RF-22.** Cuando se alcance exactamente el vencimiento, el sistema deberá dejar de considerar vigente el apartado e impedir utilizarlo para guardar la reserva.
- **RF-23.** Si el apartado vence durante la captura, el sistema deberá informar del vencimiento, conservar lo escrito en el flujo abierto y exigir consultar disponibilidad y obtener un nuevo apartado.
- **RF-24.** Cuando el cliente vuelva atrás desde el formulario, el sistema deberá liberar el apartado actual.
- **RF-25.** Cuando el mismo navegador intente apartar otro horario del mismo negocio, el sistema deberá liberar el apartado anterior, aunque el nuevo intento falle, y mantener como máximo uno vigente para ese navegador y negocio.
- **RF-26.** Si una pestaña intenta utilizar un apartado liberado o reemplazado, el sistema deberá informar que ya no está vigente e impedir guardar la reserva mediante él.
- **RF-27.** Cuando el sistema reciba aviso de cierre, recarga o abandono del portal, deberá liberar el apartado; si no recibe el aviso, el apartado deberá vencer en su plazo original.
- **RF-28.** Cuando el cliente recargue sin tener un envío de reserva pendiente de resolución, el sistema deberá reiniciar el flujo sin recuperar los datos del formulario.
- **RF-29.** Si alguien intenta utilizar, liberar o sustituir un apartado ajeno, el sistema deberá rechazar la acción sin revelar sus datos.

### Registro y resultado de la reserva

**Por qué:** registrar una sola cita con las condiciones aceptadas, incluso ante cambios concurrentes o pérdida de conexión.

- **RF-30.** Cuando se conceda un apartado, el sistema deberá mostrar el costo asociado; si ese costo cambia durante su vigencia, la reserva deberá respetar el mostrado al concederlo.
- **RF-31.** Cuando el cliente envíe la reserva, el sistema deberá comprobar la vigencia y pertenencia del apartado, el acceso permitido por licencia y las condiciones actuales de disponibilidad.
- **RF-32.** Si un cambio de duración, oferta, horario, bloqueo u ocupación vuelve incompatible la reserva, el sistema deberá rechazarla, informar que debe elegir disponibilidad vigente y conservar los datos escritos dentro del flujo abierto.
- **RF-33.** Si solicitudes simultáneas intentan ocupar intervalos incompatibles del mismo Profesional, el sistema deberá aceptar como máximo una e informar del conflicto a las demás, incluso entre sucursales.
- **RF-34.** Cuando una reserva se guarde correctamente, el sistema deberá crear una sola cita en estado **Pendiente de confirmación del cliente** y dejar consumido su apartado.
- **RF-35.** Si el registro de la reserva falla, el sistema no deberá dejar una cita parcial ni consumir el apartado sin haber registrado la cita; el apartado conservará su vencimiento original.
- **RF-36.** Cuando una cita quede registrada, el sistema deberá conservar el inicio, fin, zona horaria, costo aceptado y datos de contacto correspondientes, sin alterarlos por cambios posteriores del catálogo.
- **RF-37.** Cuando finalice el registro, el sistema deberá mostrar un folio único, el estado pendiente y un resumen con negocio, servicio, sucursal, Profesional, fecha, horario y costo, sin afirmar que el cliente ya confirmó por WhatsApp.
- **RF-38.** Mientras la cita permanezca pendiente, el sistema deberá mantener ocupado su intervalo sin aplicarle una caducidad automática en este módulo.
- **RF-39.** Si el cliente repite el mismo envío ya registrado, el sistema deberá devolver la misma reserva y folio sin crear otra cita.
- **RF-40.** Si se pierde la respuesta del envío y no se conoce su resultado, el sistema deberá permitir comprobar ese intento antes de iniciar otra reserva; mientras no pueda determinarlo, deberá informar la incertidumbre sin afirmar éxito ni fracaso.
- **RF-41.** Cuando se recargue el portal con un envío de resultado incierto, el sistema deberá comprobar primero ese envío; si fue registrado, deberá recuperar su resultado, y si se comprueba que no fue registrado, deberá reiniciar el flujo.
- **RF-42.** Cuando se recupere el resultado de un envío, el sistema deberá mostrarlo únicamente al solicitante de ese intento, sin permitir consultar reservas ajenas mediante teléfonos o folios.
- **RF-43.** Si ocurre un error durante el flujo, el sistema deberá comunicar una acción comprensible para continuar o reintentar, sin revelar secretos, información ajena ni detalles internos.

## Fuera de alcance

- Registro de cuentas de clientes, autenticación del cliente y verificación de teléfono mediante códigos.
- Ampliación o renovación de apartados.
- Consulta posterior de reservas mediante enlaces privados, teléfonos o folios; se conserva únicamente la recuperación del resultado de un envío.
- Confirmación del cliente por WhatsApp, mensajes, recordatorios y entrega posterior del resumen: módulo 5.
- Calendario administrativo, agendamiento manual, cancelación, reprogramación y gestión posterior de estados: módulo 4.
- Caducidad o cancelación automática de citas pendientes.
- Reportes PDF, pagos y pasarelas de cobro.
- Cambios a las reglas de disponibilidad, licencias y oferta ajenos a su integración con el portal.
- Garantizar una sola persona por teléfono o impedir que una persona reserve desde distintos navegadores o dispositivos.

## Criterios de finalización

1. Cada RF cuenta con evidencia de aceptación propia del módulo 3; las pruebas históricas del motor no sustituyen esa evidencia.
2. Se completa el flujo público en móvil y mediante teclado, incluyendo validación de campos, ausencia de disponibilidad y recuperación de errores.
3. Se verifica aislamiento entre negocios, pertenencia de apartados, protección de datos y acceso según licencia, incluido su cambio durante el flujo.
4. Se comprueban los cinco minutos y su límite exacto, ausencia de ampliación, vuelta atrás, abandono, recarga, reemplazo entre pestañas y fallo al intentar obtener un nuevo apartado.
5. Se verifican teléfonos compartidos, normalización, conservación del nombre de cada reserva y respeto al costo mostrado, incluidos cambios del catálogo durante el apartado.
6. Las pruebas con escritores públicos reales demuestran ausencia de empalmes y duplicados, consumo único del apartado, recuperación tras pérdida de respuesta y ausencia de resultados parciales.
7. Se verifica que la cita nace pendiente, mantiene su ocupación sin caducidad automática y muestra el folio y resumen correctos.
8. La entrega supera compilación, lint y pruebas relevantes. Los casos de integración que dependan del escritor manual del módulo 4 permanecen identificados como diferidos; no se presenta como completa la integración de RF-35–RF-37 del módulo 2 mientras falten las verificaciones correspondientes.
