# Fase 3 — Especificación del módulo 2: Motor Inteligente de Disponibilidad y Reglas de Agenda

Documento destinado a `docs/fase-3/spec-modulo-2.md`.

## Objetivo y alcance

Determinar qué horarios puede ofrecer cada negocio para un servicio, profesional y sucursal, evitando empalmes y respetando sus condiciones de atención.

Esta fase comprende el motor, la configuración de sus reglas y la consulta de disponibilidad por personal autorizado. Preparará su uso posterior por el portal público y el panel operativo, sin implementar sus flujos de reservas ni gestión de citas.

Los requisitos describen **qué comportamiento se exige y por qué**. No definen código, arquitectura interna ni contratos técnicos.

### Relación con los acuerdos anteriores

- Se conserva la constitución aprobada de fase 3 y las reglas compatibles del módulo 1.
- La referencia temporal será la **zona horaria de cada sucursal**, conforme al módulo 1, precisando la referencia general al negocio de la constitución.
- En agenda compacta, el cliente podrá elegir otro día aunque el anterior tenga disponibilidad. Este acuerdo sustituye la restricción original del PDF.
- La agenda compacta respetará el intervalo configurado y podrá dejar un hueco menor que ese intervalo junto a una ocupación.
- El agendamiento manual podrá omitir las restricciones de estrategia, anticipación mínima y horizonte futuro, conservando las condiciones reales de disponibilidad.
- Las citas afectadas por bloqueos se identificarán en esta fase. Su cancelación automática y los avisos para reagendar corresponden a las integraciones futuras con los módulos 4 y 5.

## Requisitos funcionales en EARS

Los identificadores RF pertenecen exclusivamente a esta especificación.

### 1. Configuración del negocio

**Por qué:** permitir que cada negocio determine cómo ofrecer sus horarios y con cuánta anticipación recibir reservas.

- **RF-01.** Cuando el administrador configure la estrategia de su negocio, el sistema deberá permitir elegir entre ventana libre y agenda compacta y aplicar la elección a sus sucursales y profesionales.
- **RF-02.** Mientras el administrador no haya elegido una estrategia, el sistema deberá utilizar ventana libre.
- **RF-03.** Cuando el administrador configure la separación entre horas de inicio, el sistema deberá permitir únicamente 5, 10, 15, 20, 30 o 60 minutos y utilizar 15 minutos como valor inicial.
- **RF-04.** Cuando el administrador configure la anticipación mínima, el sistema deberá admitir minutos enteros entre 0 y 10,080 y utilizar 30 minutos como valor inicial.
- **RF-05.** Cuando el administrador configure el horizonte de disponibilidad pública, el sistema deberá admitir entre 1 y 365 días y utilizar 60 días como valor inicial.
- **RF-06.** Si una modificación de configuración contiene valores inválidos o procede de un usuario sin autorización, el sistema deberá rechazarla y conservar la configuración anterior.
- **RF-07.** Cuando se acepte una modificación de configuración, el sistema deberá aplicarla a las nuevas consultas sin modificar las citas existentes.

### 2. Acceso y aislamiento

**Por qué:** permitir consultas útiles sin exponer información de otros negocios o profesionales.

- **RF-08.** Cuando el administrador o un recepcionista autorizado consulte disponibilidad, el sistema deberá permitirle consultar los profesionales de su propio negocio.
- **RF-09.** Cuando un Profesional consulte disponibilidad, el sistema deberá permitirle consultar únicamente la suya.
- **RF-10.** Si una solicitud utiliza recursos de otro negocio o excede los permisos del solicitante, el sistema deberá rechazarla sin revelar información ajena.
- **RF-11.** Cuando se consulte disponibilidad, el sistema deberá proporcionar los horarios resultantes sin revelar nombres, teléfonos, motivos de consulta ni otros datos de los clientes que ocupan la agenda.
- **RF-12.** Mientras las condiciones de cuenta, negocio o licencia impidan la operación según las reglas vigentes, el sistema deberá denegar la consulta o validación correspondiente y distinguir esa restricción de una agenda sin espacios.

### 3. Condiciones de atención

**Por qué:** ofrecer únicamente horarios en los que el profesional realmente pueda atender el servicio solicitado.

- **RF-13.** Cuando se calcule disponibilidad, el sistema deberá considerar conjuntamente el negocio, la sucursal, el profesional y el servicio solicitados.
- **RF-14.** Si la sucursal, el profesional o el servicio están inactivos, o la combinación carece de las asignaciones y habilitaciones necesarias, el sistema deberá indicar que esa combinación no permite nuevas citas y no ofrecer horarios.
- **RF-15.** Cuando se calcule disponibilidad para una fecha, el sistema deberá utilizar los horarios efectivos del módulo 1, incluidas sus excepciones, descansos y bloqueos aplicables.
- **RF-16.** Mientras exista un descanso o bloqueo aplicable, el sistema deberá excluir ese intervalo aunque un horario especial permita atender durante él.
- **RF-17.** Cuando se evalúe un horario candidato, el sistema deberá exigir que la duración completa del servicio quepa en un tramo continuo de atención de la sucursal elegida.
- **RF-18.** Si un horario candidato cruza la medianoche local, el sistema deberá descartarlo en esta fase, aunque exista atención al comenzar el día siguiente.
- **RF-19.** Cuando se comparen citas, apartados y horarios de un profesional entre sucursales, el sistema deberá considerar su coincidencia real en el tiempo y evitar empalmes incluso cuando las fechas u horas locales sean distintas.
- **RF-20.** Cuando un intervalo termine exactamente al comenzar otro, el sistema deberá considerarlos consecutivos y permitirlos si cumplen las demás condiciones, sin exigir un tiempo adicional de traslado.
- **RF-21.** Cuando un cambio de zona horaria produzca horas inexistentes, repetidas o franjas omitidas, el sistema deberá respetar las reglas y omisiones definidas en el módulo 1, sin convertir esos intervalos en horarios disponibles.

### 4. Fechas, anticipación y secuencia de inicios

**Por qué:** evitar horarios pasados y mantener opciones previsibles dentro del periodo permitido.

- **RF-22.** Cuando se solicite disponibilidad para reserva pública, el sistema deberá excluir los inicios pasados, los que no cumplan la anticipación mínima y los posteriores al horizonte configurado.
- **RF-23.** Cuando un inicio coincida exactamente con el límite de anticipación mínima, el sistema deberá admitirlo si sigue siendo futuro y cumple las demás condiciones.
- **RF-24.** Cuando se determine el horizonte futuro, el sistema deberá utilizar la fecha actual de la sucursal y permitir fechas hasta el número configurado de días después de ella, inclusive.
- **RF-25.** Cuando se generen horas de inicio, el sistema deberá mantener la secuencia marcada por el comienzo del bloque de atención y el intervalo configurado.
- **RF-26.** Cuando una cita, descanso, bloqueo o apartado termine entre dos posiciones de esa secuencia, el sistema deberá conservar la secuencia original y utilizar el siguiente inicio que cumpla todas las condiciones.

### 5. Ventana libre y agenda compacta

**Por qué:** permitir elegir entre mayor libertad de horarios y concentración de citas, con resultados claros para cada modo.

- **RF-27.** Mientras el negocio utilice ventana libre, el sistema deberá ofrecer todos los inicios de la secuencia que permitan atender el servicio completo sin infringir las demás restricciones.
- **RF-28.** Cuando la agenda compacta encuentre un tramo de atención sin citas ni apartados vigentes, el sistema deberá ofrecer el primer inicio permitido de ese tramo.
- **RF-29.** Cuando existan varios bloques de atención, o un descanso o bloqueo divida la atención en varios tramos, el sistema deberá permitir que cada tramo vacío comience a llenarse independientemente.
- **RF-30.** Cuando la hora actual o la anticipación mínima deje atrás el inicio de un tramo vacío, el sistema deberá ofrecer su primer inicio posterior permitido y alineado con la secuencia configurada.
- **RF-31.** Cuando un tramo contenga citas o apartados vigentes, el sistema deberá ofrecer los inicios válidos más cercanos antes y después de esas ocupaciones, respetando la duración del servicio y la secuencia configurada.
- **RF-32.** Si la secuencia impide la contigüidad exacta, el sistema deberá permitir el hueco menor que un intervalo necesario para ajustar el inicio anterior o posterior, sin ofrecer posiciones adicionales más alejadas de la ocupación.
- **RF-33.** Cuando una fecha elegida tenga disponibilidad, el sistema deberá permitir consultarla aunque existan espacios libres en fechas anteriores.
- **RF-34.** Si el servicio no cabe en ninguna opción permitida de la fecha solicitada, el sistema deberá informar que no hay horarios disponibles para esa selección, sin cambiar automáticamente el día elegido.

### 6. Citas y apartados temporales

**Por qué:** reflejar correctamente la ocupación existente y preparar el motor para las futuras reservas.

- **RF-35.** Cuando se determine la ocupación del profesional, el sistema deberá considerar ocupados los intervalos de citas pendientes, confirmadas, completadas y marcadas como no asistió.
- **RF-36.** Cuando una cita esté cancelada, el sistema deberá dejar de considerarla ocupación, manteniendo cualquier otra restricción aplicable a ese intervalo.
- **RF-37.** Cuando cambie la duración de un servicio, el sistema deberá conservar la duración original de las citas existentes y utilizar la nueva duración para los nuevos horarios candidatos.
- **RF-38.** Mientras un apartado temporal esté vigente, el sistema deberá tratar su intervalo como ocupado y permitir que sirva de referencia para ofrecer opciones cercanas en agenda compacta.
- **RF-39.** Cuando se alcance el vencimiento de un apartado, el sistema deberá dejar de considerarlo ocupación desde ese instante y recalcular los horarios conforme a las restricciones restantes.
- **RF-40.** Cuando se valide el horario del titular de un apartado vigente, el sistema deberá reconocer ese apartado sin tratarlo como un conflicto consigo mismo y conservar la comprobación de las demás ocupaciones.
- **RF-41.** Cuando cambien las reglas comerciales de agenda mientras exista un apartado vigente, el sistema deberá conservar su horario y vencimiento original, sujeto a la ausencia de nuevos conflictos, bloqueos o restricciones de acceso.
- **RF-42.** Cuando se consulte o valide disponibilidad, el sistema no deberá crear por ese solo hecho una cita ni un apartado temporal.

El inicio del contador al entrar al formulario de contacto, la duración del apartado y su creación o confirmación pertenecen al módulo 3. Esta fase consume su vigencia, sin implementar ese flujo.

### 7. Preparación para agendamiento manual

**Por qué:** permitir que el personal resuelva necesidades operativas sin comprometer la disponibilidad real.

- **RF-43.** Cuando se soliciten opciones para agendamiento manual autorizado, el sistema deberá permitir horarios futuros fuera de las restricciones de agenda compacta, anticipación mínima y horizonte público.
- **RF-44.** Cuando se valide un horario manual, el sistema deberá conservar las restricciones de permisos, pertenencia, recursos activos, duración completa, secuencia de inicios, jornadas, descansos, bloqueos y ausencia de empalmes.

La creación de la cita manual y sus pantallas corresponden al módulo 4.

### 8. Cambios, conflictos y errores

**Por qué:** impedir que una consulta anterior se interprete como una garantía permanente y distinguir errores de la ausencia real de espacios.

- **RF-45.** Cuando se vuelva a validar un horario previamente ofrecido, el sistema deberá comprobar las condiciones vigentes en ese momento.
- **RF-46.** Si el horario previamente ofrecido ya no cumple las condiciones aplicables, el sistema deberá informar que dejó de estar disponible, sin sustituirlo automáticamente por otro.
- **RF-47.** Cuando existan cambios simultáneos de ocupación o restricciones, el sistema deberá permitir una comprobación final coherente con las condiciones vigentes; una consulta previa no deberá considerarse autorización definitiva para reservar.
- **RF-48.** Si una solicitud contiene fechas inválidas, un rango invertido, datos obligatorios incompletos o una combinación de recursos no válida, el sistema deberá rechazarla e identificar el problema sin devolverla como una consulta válida sin resultados.
- **RF-49.** Si un fallo temporal impide comprobar horarios, bloqueos u ocupación, el sistema deberá informar que no pudo comprobar la disponibilidad y permitir reintentar, sin presentar horarios sin verificar ni afirmar que la agenda está llena.
- **RF-50.** Cuando una consulta válida concluya sin espacios, el sistema deberá distinguir ese resultado de un error de consulta o una restricción de acceso.

### 9. Bloqueos que afectan citas

**Por qué:** preparar la atención de cancelaciones por vacaciones, días festivos o emergencias sin mezclarla con el cálculo de horarios.

- **RF-51.** Cuando un bloqueo aplicable se superponga con citas no canceladas, el sistema deberá identificar las citas afectadas dentro del negocio y excluir el intervalo bloqueado de la disponibilidad.
- **RF-52.** Cuando el bloqueo afecte citas existentes, el sistema deberá permitir proporcionar esa identificación a la futura gestión operativa, sin cancelar citas ni enviar mensajes en esta fase.

El comportamiento acordado para la integración futura será cancelar automáticamente las citas afectadas y avisar por WhatsApp para que los clientes reagenden. Su ejecución y tratamiento de errores se especificarán en los módulos 4 y 5.

## Fuera de alcance

- Pantallas del portal público y del panel administrativo.
- Consulta pública de disponibilidad sin autenticación; se incorporará con el módulo 3.
- Creación, confirmación, reprogramación y cancelación de citas.
- Agendamiento manual operativo, calendario y cambios de estado de citas.
- Creación, renovación o liberación explícita de apartados; contador del formulario y definición de su duración.
- Cancelación automática por bloqueos y envío de WhatsApp para reagendar.
- Rechazo o gestión completa de cambios de horarios que afecten citas existentes; esta fase calcula con las restricciones vigentes.
- Implementación de catálogos, asignaciones, horarios y bloqueos propios del módulo 1.
- Configuración de estrategias diferentes por profesional o sucursal.
- Citas que crucen la medianoche local y cálculo automático de tiempos de traslado.
- Pagos, facturación y reportes.
- Acreditar como terminados los flujos completos de concurrencia de reservas de los módulos 3 y 4 mediante pruebas exclusivas del motor.

## Criterios de finalización

1. Todos los RF cuentan con evidencia verificable y los comportamientos heredados se distinguen de los incorporados en esta fase.
2. Se demuestran los valores iniciales, los límites configurables y el rechazo de cambios inválidos o no autorizados.
3. Se comprueban aislamiento entre negocios, consultas por rol y ausencia de datos personales de clientes en los resultados.
4. Se verifica disponibilidad con servicios y recursos activos, horarios especiales, descansos, bloqueos superpuestos y diferentes zonas horarias.
5. Se comprueban duración completa, intervalos consecutivos, ausencia de empalmes entre sucursales, cierre de jornada y rechazo de citas que cruzan medianoche.
6. Se comprueban anticipación mínima y horizonte en sus límites exactos, así como exclusión de horarios pasados.
7. En ventana libre se demuestra que una cita terminada a las 10:10 conserva el siguiente inicio a las 10:15 cuando esa es la secuencia del bloque.
8. En agenda compacta se verifican inicios independientes por tramo, elección libre de fecha, ajuste por anticipación y opciones antes y después de ocupaciones.
9. Se verifica que, con intervalo de 15 minutos, una ocupación terminada a las 10:10 permita el inicio a las 10:15; y que una cita iniciada a las 10:10 permita una opción de 9:30 a 10:00 para un servicio de 30 minutos.
10. Se comprueban todos los estados de cita, conservación de su duración original, apartados vigentes y vencidos, reconocimiento del apartado propio y cambios de configuración durante su vigencia.
11. Se demuestra que las opciones manuales omiten las restricciones comerciales acordadas y mantienen las condiciones reales de disponibilidad.
12. Se prueban cambios entre consulta y validación, condiciones concurrentes, datos inválidos y fallos temporales, diferenciándolos de una consulta válida sin espacios.
13. Se verifica la identificación de citas afectadas por bloqueos sin ejecutar su cancelación ni enviar avisos.
14. Las verificaciones de calidad y regresión exigidas por la constitución resultan satisfactorias.
15. Las dependencias pendientes del módulo 1 y las integraciones futuras quedan identificadas; ninguna evidencia del motor se presenta como prueba de un portal o panel operativo completo.
