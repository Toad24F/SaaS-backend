# Especificación del módulo 2 — Motor Inteligente de Disponibilidad y Reglas de Agenda

## Objetivo y acuerdos aplicables

Permitir consultar horarios reservables para una combinación de negocio, sucursal, servicio y Profesional, respetando su oferta, horarios, ocupaciones y reglas de agenda.

Esta fase comprende el motor y su consulta por personal autorizado. Define las reglas que deberán compartir las futuras reservas públicas y manuales, sin implementar sus flujos completos.

Se conservan la [constitución aprobada de fase 3](constitucion-fase-3.md) y las reglas compatibles de autenticación, licencias, horarios y oferta del [módulo 1](../fase-2-modulo-1/spec-modulo-1.md) y [su fix](../Fix-modulo-1/spec-fix.md). La elección de otro día deja de depender de llenar el anterior y sustituye esa condición del PDF original.

Los identificadores RF siguientes pertenecen únicamente a esta especificación.

## Requisitos funcionales en EARS

### Configuración del negocio

**Por qué:** permitir que cada negocio adapte su agenda y evitar comportamientos indefinidos antes de configurarla.

- **RF-01.** Cuando el administrador configure las reglas de agenda, el sistema deberá aplicarlas únicamente a su negocio y denegar su modificación a los demás roles.
- **RF-02.** Mientras el negocio no haya modificado su configuración inicial, el sistema deberá usar Ventana Libre, intervalos de 15 minutos, anticipación mínima de 15 minutos y un límite de 60 días futuros.
- **RF-03.** Cuando se configure el intervalo entre inicios, el sistema deberá aceptar únicamente 5, 10, 15, 20, 30 o 60 minutos y aplicarlo a ambos modos de agenda pública.
- **RF-04.** Cuando se configure la anticipación mínima, el sistema deberá aceptar minutos no negativos en múltiplos de 5; el valor 0 deberá permitir reservar sin espera mínima.
- **RF-05.** Cuando se configure el límite de días futuros, el sistema deberá aceptar días enteros no negativos; el valor 0 deberá limitar las reservas públicas al día actual de cada sucursal.
- **RF-06.** Si una configuración contiene valores inválidos, el sistema deberá rechazar el cambio completo, indicar los valores afectados y conservar la configuración anterior.
- **RF-07.** Cuando cambien las reglas comerciales, el sistema deberá aplicarlas a las consultas y nuevas reservas, sin modificar las citas existentes.

### Permisos y oferta efectiva

**Por qué:** proteger los datos de cada negocio y ofrecer únicamente combinaciones que puedan atenderse.

- **RF-08.** Cuando se consulte disponibilidad, el sistema deberá permitir al administrador y al recepcionista consultar al personal de su negocio, y al Profesional consultar únicamente su propia agenda.
- **RF-09.** Si una operación referencia datos de otro negocio o un perfil no autorizado, el sistema deberá denegarla sin revelar ni alterar esos datos.
- **RF-10.** Mientras la cuenta o la licencia impidan el acceso, el sistema deberá denegar la consulta; una suspensión manual pendiente deberá respetar las 48 horas acordadas, salvo que el vencimiento natural ocurra antes.
- **RF-11.** Cuando se solicite disponibilidad, el sistema deberá comprobar que la sucursal está asignada al Profesional y que están activos la sucursal, su cuenta, el servicio, su selección individual, su atención en la sucursal y la selección del servicio para esa sucursal.
- **RF-12.** Mientras alguna condición de oferta efectiva no se cumpla, el sistema deberá excluir esa combinación de las nuevas reservas, también en modalidad manual, conservando su configuración e historial.

### Fechas, horarios y duración

**Por qué:** calcular espacios que puedan atenderse completos y comparar correctamente la ocupación entre sucursales.

- **RF-13.** Cuando se calcule disponibilidad para una fecha, el sistema deberá aplicar el horario semanal o su sustitución por horario especial, descontando descansos y todos los bloqueos aplicables.
- **RF-14.** Mientras un descanso o bloqueo afecte un intervalo, el sistema deberá impedir cualquier ranura que lo atraviese; un horario especial no deberá anular un bloqueo.
- **RF-15.** Cuando se ofrezca una ranura, el sistema deberá garantizar que cabe la duración completa del servicio dentro de la atención disponible y que no existe ocupación incompatible.
- **RF-16.** Cuando dos bloques consecutivos correspondan al mismo Profesional y sucursal, el sistema deberá permitir una cita que cruce su límite si la atención es continua y no hay descansos ni bloqueos.
- **RF-17.** Cuando una cita termine exactamente al cierre de la atención o al comienzo de otra ocupación, el sistema deberá considerar válido ese límite; también deberá permitir iniciar exactamente al terminar una ocupación.
- **RF-18.** Cuando se interpreten fechas y horarios, el sistema deberá usar la zona horaria de la sucursal y comparar ocupaciones entre sucursales por su coincidencia real en el tiempo.
- **RF-19.** Si una solicitud contiene horas locales inexistentes o ambiguas, el sistema deberá rechazarla. Cuando una recurrencia resulte inválida por un cambio de hora, deberá omitir e informar la ocurrencia afectada conforme a las reglas del módulo 1.
- **RF-20.** Cuando cambie la duración de un servicio, el sistema deberá usar la nueva duración para nuevas reservas y conservar el inicio y fin de las citas existentes.

### Ventana Libre y Agenda Compacta

**Por qué:** ofrecer alternativas previsibles y permitir compactar citas sin obligar al cliente a llenar un día antes de elegir otro.

- **RF-21.** Cuando se generen inicios con el intervalo configurado, el sistema deberá conservar la secuencia anclada al comienzo de cada bloque original; una cita, un descanso o un bloqueo no deberá desplazarla.
- **RF-22.** Mientras esté activo Ventana Libre, el sistema deberá mostrar todos los inicios de esa secuencia que cumplan las condiciones de disponibilidad.
- **RF-23.** Mientras esté activa Agenda Compacta, cada bloque o tramo separado por descansos o bloqueos deberá poder iniciar su propio grupo de citas sin esperar a que otro se llene.
- **RF-24.** Cuando un bloque o tramo no tenga ocupaciones que sirvan de referencia, Agenda Compacta deberá ofrecer su primer inicio válido; si la anticipación dejó atrás su comienzo, deberá avanzar al siguiente inicio válido de la secuencia original.
- **RF-25.** Cuando existan citas o apartados vigentes, Agenda Compacta deberá ofrecer los inicios válidos más cercanos antes y después de esas ocupaciones, ajustados al intervalo configurado, admitiendo el pequeño hueco que produzca ese ajuste.
- **RF-26.** Si no cabe el servicio junto a las ocupaciones existentes, pero queda otro espacio válido en el mismo bloque o tramo, Agenda Compacta deberá permitir iniciar otro grupo desde el primer inicio válido restante.
- **RF-27.** Cuando el usuario elija otro día dentro del límite permitido, el sistema deberá consultar y ofrecer su disponibilidad aunque los días anteriores conserven espacios libres.

### Restricciones públicas y modalidad manual

**Por qué:** distinguir las reglas comerciales del portal de las condiciones necesarias para atender una cita.

- **RF-28.** Cuando se consulte con reglas públicas, el sistema deberá ofrecer únicamente inicios iguales o posteriores al momento actual más la anticipación mínima, y fechas desde hoy hasta el límite de días futuros, ambos días incluidos.
- **RF-29.** Cuando el personal autorizado consulte o valide una reserva manual, el sistema deberá permitir cualquier minuto válido, omitiendo compactación, intervalo público, anticipación mínima y límite de días futuros.
- **RF-30.** Cuando se use la modalidad manual, el sistema deberá seguir exigiendo permisos, licencia, oferta activa, duración completa, horarios, ausencia de bloqueos y ausencia de empalmes; deberá rechazar inicios pasados.

### Ocupaciones e integración con reservas

**Por qué:** evitar que las consultas públicas y manuales ofrezcan el mismo tiempo a reservas incompatibles.

- **RF-31.** Mientras una cita tenga un estado distinto de Cancelada, el sistema deberá considerar ocupado todo su intervalo, independientemente del servicio o sucursal donde se haya reservado al Profesional.
- **RF-32.** Cuando una cita pase a Cancelada, el sistema deberá dejar de considerarla una ocupación, sin eliminar su registro ni liberar intervalos restringidos por otras causas.
- **RF-33.** Mientras un apartado temporal siga vigente, el sistema deberá considerar ocupado su intervalo y permitir que sirva de referencia para Agenda Compacta.
- **RF-34.** Cuando se alcance el vencimiento de un apartado o este sea liberado, el sistema deberá dejar de usarlo como ocupación y como referencia de compactación, sin depender de su eliminación física.
- **RF-35.** Cuando el futuro flujo de reservas confirme una cita, deberá comprobar nuevamente las condiciones vigentes; la consulta previa o la existencia de un apartado no deberán garantizar por sí solas la confirmación.
- **RF-36.** Cuando se confirme desde un apartado propio vigente, el sistema deberá reconocer esa relación sin tratarlo como una ocupación ajena; los apartados de otras personas deberán seguir impidiendo el empalme.
- **RF-37.** Si solicitudes simultáneas intentan ocupar intervalos incompatibles del mismo Profesional, el comportamiento integrado de reservas deberá aceptar como máximo una y comunicar el conflicto a las demás, incluso entre sucursales.

### Citas afectadas por cambios

**Por qué:** permitir cambios operativos sin ocultar compromisos existentes ni cancelar citas sin gestión posterior.

- **RF-38.** Cuando un bloqueo o cambio de horario afecte citas existentes, el sistema deberá permitir guardar el cambio e identificar las citas afectadas y su causa, conservando sus horarios y estados.
- **RF-39.** Cuando se desactive una sucursal, un Profesional o una oferta de servicio, el sistema deberá impedir nuevas reservas para esa combinación e identificar las citas futuras afectadas, sin cancelarlas.
- **RF-40.** Cuando se consulten las citas afectadas, el sistema deberá respetar los permisos del negocio y del Profesional, excluir las canceladas y reflejar las restricciones que continúen vigentes.
- **RF-41.** Cuando desaparezca una causa de afectación, el sistema deberá dejar de señalarla, conservando cualquier otra causa aplicable.

### Resultados y errores

**Por qué:** permitir al personal distinguir una agenda sin espacios de una configuración inválida o un fallo de consulta.

- **RF-42.** Cuando una consulta válida finalice correctamente, el sistema deberá devolver los horarios disponibles para la combinación y fechas solicitadas, identificando su inicio, fin y zona horaria.
- **RF-43.** Si una consulta válida no encuentra horarios disponibles, el sistema deberá comunicar la ausencia de disponibilidad sin presentarla como un fallo técnico.
- **RF-44.** Si falla la comprobación de disponibilidad, el sistema deberá informar que no pudo completarse y permitir reintentar, sin presentar una agenda llena ni horarios como confirmados.
- **RF-45.** Si las fechas, el rango o la combinación solicitada son inválidos, el sistema deberá comunicar el problema sin realizar cambios ni revelar información no autorizada.

## Fuera de alcance

- Pantallas del portal público y su consulta anónima, formulario de contacto, contador y creación, renovación o liberación de apartados por el usuario: módulo 3. El apartado comenzará al entrar al último paso del portal; esta fase define su reconocimiento como ocupación.
- Flujo completo de creación y confirmación de reservas públicas o manuales. Sus reglas de disponibilidad y concurrencia quedan definidas como obligaciones de integración.
- Calendario operativo y gestión del ciclo de vida de citas, incluidas cancelación automática y reprogramación: módulo 4.
- Envío de confirmaciones, recordatorios y avisos para reagendar por WhatsApp, así como reportes PDF: módulo 5.
- Captura de citas históricas, pagos anticipados, tiempos automáticos de traslado y precios o duraciones distintos por sucursal o Profesional.
- Modificaciones a las reglas de autenticación, licencias y catálogo que no sean necesarias para respetar los acuerdos existentes.

## Criterios de finalización

1. Cada RF cuenta con evidencia nueva de aceptación o se identifica expresamente como obligación de integración futura; las pruebas históricas no acreditan este módulo.
2. Se verifican permisos por rol, aislamiento entre negocios, oferta efectiva y acceso según la licencia, incluido el límite exacto de las 48 horas.
3. Se verifican los valores predeterminados, todos los intervalos permitidos, anticipación en pasos de 5, anticipación 0, horizonte 0 y rechazo íntegro de configuraciones inválidas.
4. Se comprueban duración completa, cierre exacto, citas consecutivas, cruce de bloques continuos, descansos, bloqueos superpuestos y cambios de zona horaria.
5. Se comprueba que la secuencia original no cambia por ocupaciones intermedias; con inicios cada 15 minutos, una ocupación que termine a las 10:07 permite el siguiente inicio a las 10:15.
6. Se demuestra que Agenda Compacta inicia independientemente cada tramo, ofrece opciones antes y después de ocupaciones y permite elegir otro día sin llenar los anteriores.
7. Se verifica que, para un bloque de 09:00 a 13:00 sin citas, a las 10:07 y con 30 minutos de anticipación e intervalos de 15, el primer inicio ofrecido es 10:45 si cabe el servicio.
8. Se comprueban todos los estados de cita, liberación por cancelación, vigencia de apartados y vencimiento en el instante exacto, usando reloj controlado.
9. Se verifica que la modalidad manual omite únicamente las restricciones comerciales acordadas y rechaza horarios pasados, bloqueos, oferta inactiva y empalmes.
10. Se demuestra la identificación de citas afectadas sin cancelarlas ni cambiar su duración, y la actualización de sus causas cuando cambian las restricciones.
11. Se distingue mediante casos de aceptación una consulta sin espacios, una solicitud inválida, un acceso denegado y un fallo de comprobación que permite reintentar.
12. La entrega de código supera compilación, lint y pruebas relevantes. La comprobación integral con reservas simultáneas queda como condición de aceptación de los módulos que implementen ese flujo y no se presenta como completada únicamente con pruebas del motor.
