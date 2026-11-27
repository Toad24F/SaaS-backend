# Fase 6, Módulo 5: Automatizaciones, reportes y mejoras operativas

## Objetivo y referencias

Completar la gestión de citas por el Profesional, mejorar consultas administrativas, mantener una ficha única por cliente, personalizar el portal e incorporar confirmación por WhatsApp, cancelación automática, recordatorios y reportes imprimibles.

Esta especificación aplica la [constitución del módulo](constitucion-modulo-5.md) y las [reglas](../reglas.md) compatibles de módulos anteriores. Sustituye, dentro de su alcance, las restricciones anteriores sobre gestión de citas por el Profesional, creación independiente de fichas coincidentes, permanencia indefinida de reservas Pendientes y conservación del folio.

El [documento original de requisitos](<../../../../Solicitud de Requerimientos de Software de Citas.pdf>) se utiliza como antecedente de requisitos; las decisiones posteriores del responsable prevalecen sobre sus propuestas de folio y generación de PDF.

### Decisiones acordadas

- Una cita es próxima si al registrarla faltan **hasta seis horas**, incluido el límite.
- Las próximas tienen **15 minutos** para confirmar; si ese plazo no termina antes del inicio, requieren seguimiento manual.
- Las normales vencen al cumplirse su plazo asignado o **una hora antes del inicio**, lo que ocurra primero.
- El cliente confirma mediante la acción ofrecida por **WhatsApp**; el personal conserva la confirmación manual.
- Reprogramar una Pendiente o reactivar una Cancelada la deja **Confirmada**.
- Cada combinación de nombre normalizado y teléfono corresponde a una sola ficha por negocio.
- Ante una edición coincidente, **Administrador y Recepción** pueden aceptar una unión explícita o regresar a corregir los datos.

### Convenciones propuestas para completar el alcance

Estas convenciones forman parte de la propuesta; no se presentan como respuestas a las seis preguntas:

- Los reportes del negocio estarán disponibles para el Administrador.
- La normalización de nombres ignorará mayúsculas, espacios sobrantes y diferencias de representación Unicode; conservará acentos, ñ y signos. No habrá coincidencia aproximada.
- Las tasas usarán las fórmulas definidas en RF-49; no se interpretarán como indicadores financieros.
- Las configuraciones de plazos y recordatorios serán por negocio y exclusivas del Administrador.
- Al unir fichas, permanecerá la ficha existente que originó la advertencia; recibirá las relaciones de la ficha editada sin cambiar los datos históricos de sus citas.

## Requisitos funcionales en EARS

### A. Gestión operativa y permisos

**Por qué:** permitir que cada Profesional gestione su trabajo sin acceder a datos u operaciones de otros.

- **RF-01.** Cuando un Profesional gestione su agenda, el sistema deberá permitirle crear, reprogramar, cancelar, reactivar y cambiar el estado de sus propias citas dentro de su negocio.
- **RF-02.** Si una operación referencia una cita ajena, otro Profesional o un recurso no autorizado, el sistema deberá rechazarla sin revelar información ni modificar registros.
- **RF-03.** Cuando el Profesional registre una cita, el sistema deberá permitirle capturar el contacto del cliente y reutilizar su ficha conforme a esta especificación, sin conceder acceso al directorio completo ni al historial de citas ajenas.
- **RF-04.** Cuando se registre, reprograme o reactive una cita, el sistema deberá verificar permisos, licencia, oferta, horarios, bloqueos y disponibilidad vigentes, conservando las reglas de modalidad manual, duración y separación históricas que correspondan.
- **RF-05.** Cuando se cambie el estado de una cita, el sistema deberá conservar los estados y restricciones compatibles del módulo 4, incluida la prohibición de marcar Completada o No asistió antes del fin de la atención.
- **RF-06.** Cuando se reprograme una cita Pendiente o se reactive una Cancelada, el sistema deberá dejarla Confirmada por el personal, conservar su origen y desactivar su cancelación pendiente por falta de confirmación.
- **RF-07.** Si una reprogramación, reactivación o cambio de estado falla o entra en conflicto con otra operación, el sistema deberá conservar un resultado íntegro e informar que es necesario revisar la situación vigente.

### B. Historial de correos y listado de bloqueos

**Por qué:** consultar conjuntos completos sin depender de los registros visibles en pantalla ni alterar la disponibilidad.

- **RF-08.** Cuando el Superadmin consulte el historial de correos de un negocio, el sistema deberá ofrecer paginación desde el backend y filtros combinables por estado, tipo de correo y fecha de registro del envío.
- **RF-09.** Cuando se muestre dicho historial, el sistema deberá calcular el total coincidente y los contadores por estado sobre todos los registros correspondientes a los filtros, independientemente de la página visible.
- **RF-10.** Cuando el Administrador abra el listado de bloqueos, el sistema deberá mostrar por defecto los vigentes y próximos y permitir consultar anteriores o todos, con paginación desde el backend.
- **RF-11.** Cuando se clasifique un bloqueo, el sistema deberá considerarlo vigente si ya comenzó y no terminó, próximo si aún no comienza y anterior si su fin ya se alcanzó.
- **RF-12.** Cuando se consulte el listado de bloqueos, el sistema deberá conservar filtros combinables por motivo, tipo, sucursal, Profesional y fechas, incluyendo los bloqueos que se solapen con el periodo solicitado.
- **RF-13.** Mientras un listado de bloqueos esté paginado o filtrado, el sistema deberá calcular la disponibilidad con todos los bloqueos aplicables, independientemente de lo mostrado en pantalla.
- **RF-14.** Si una consulta recibe filtros inválidos o falla, el sistema deberá distinguir el error de un resultado vacío legítimo y no presentar datos parciales como completos.

### C. Clientes: unicidad, reutilización y unión explícita

**Por qué:** mantener un historial vinculado sin crear fichas repetidas ni alterar lo registrado en cada cita.

- **RF-15.** Cuando se cree o modifique una ficha, el sistema deberá mantener una única ficha por combinación de negocio, nombre normalizado y teléfono normalizado, incluso ante operaciones simultáneas.
- **RF-16.** Cuando se comparen nombres y teléfonos, el sistema deberá aplicar la misma normalización en portal, agendamiento manual y directorio; el teléfono conservará las reglas mexicanas vigentes y el nombre las convenciones de esta especificación.
- **RF-17.** Cuando se registre una cita pública o manual con una única coincidencia, el sistema deberá vincularla automáticamente a esa ficha sin sobrescribir sus datos.
- **RF-18.** Cuando se registre una cita sin coincidencia, el sistema deberá crear una ficha y vincularla a la cita sin dejar registros parciales si falla la operación.
- **RF-19.** Si dos personas tienen nombres normalizados distintos y comparten teléfono, el sistema deberá conservar fichas independientes; la coincidencia de teléfono por sí sola no deberá vincular ni unir clientes.
- **RF-20.** Si una edición produciría una combinación ya existente, el sistema deberá detener su guardado, explicar la coincidencia y ofrecer a Administrador o Recepción aceptar la unión o regresar a modificar los datos.
- **RF-21.** Cuando Administrador o Recepción acepte expresamente una unión, el sistema deberá conservar la ficha existente indicada en la advertencia, reunir las relaciones e historiales de ambas y registrar quién autorizó la operación y cuándo.
- **RF-22.** Si se rechaza la unión, cambia alguna ficha antes de aceptarla o falla la operación, el sistema deberá conservar los datos anteriores y permitir revisar o corregir sin dejar una unión parcial.
- **RF-23.** Mientras se reutilice, corrija o una una ficha, el sistema deberá conservar en cada cita su contacto, costo, servicio, sucursal, Profesional y demás datos históricos.
- **RF-24.** Si existen duplicados heredados, el sistema deberá impedir una selección arbitraria o una unión automática y exigir su resolución explícita antes de considerar cumplida la unicidad.
- **RF-25.** Cuando el portal vincule una ficha, el sistema deberá mostrar únicamente el resultado de la reserva propia, sin revelar la existencia de fichas anteriores ni sus historiales.

### D. Personalización del portal público

**Por qué:** identificar cada negocio sin perjudicar la lectura, la reserva ni el aislamiento de recursos.

- **RF-26.** Cuando el Administrador personalice su portal, el sistema deberá permitirle configurar el logo y el color de acento, previsualizar el resultado y guardar o descartar los cambios. El fondo y el texto provienen del tema claro u oscuro.
- **RF-27.** Cuando el Administrador solicite restaurar los valores predeterminados, el sistema deberá permitir previsualizarlos y aplicarlos únicamente a su negocio.
- **RF-28.** Si una imagen no es válida, contiene contenido ejecutable o no puede utilizarse como logo, el sistema deberá rechazarla con un mensaje comprensible y conservar el logo anterior.
- **RF-29.** El servidor deberá rechazar acentos que no sean hexadecimales opacos. La vista previa y el portal deberán ajustar el tono del acento para enlaces, bordes y foco si hace falta contraste en el tema activo. Las etiquetas de botones deben contrastar con su relleno y los estados semánticos conservan sus colores.
- **RF-30.** Mientras se almacenen, consulten o sustituyan recursos de personalización, el sistema deberá mantenerlos separados por negocio y preservar el uso del portal en móvil y mediante teclado.

### E. WhatsApp y confirmación

**Por qué:** comunicar el resultado real de la reserva y distinguir una acción del cliente de una simple entrega de mensaje.

- **RF-31.** Cuando se registre correctamente una cita con autorización de contacto y canal habilitado, el sistema deberá preparar el envío de un mensaje de WhatsApp con su resumen al destino internacional validado, identificando la reserva pública como Pendiente y la cita manual como Confirmada. La preparación no confirma aceptación ni entrega por Meta; un destino no utilizable deriva a seguimiento manual.
- **RF-32.** Cuando el mensaje corresponda a una reserva Pendiente, el sistema deberá ofrecer una acción de confirmación vinculada exclusivamente a esa cita e informar su vencimiento exacto y las consecuencias de no confirmar.
- **RF-33.** Cuando el cliente ejecute una confirmación válida antes del vencimiento, el sistema deberá dejar la cita Confirmada y conservar evidencia del momento y origen de la confirmación.
- **RF-34.** Si se recibe una notificación de mensaje enviado, entregado o leído, el sistema deberá actualizar el estado de comunicación sin tratarla como confirmación de asistencia.
- **RF-35.** Si una confirmación se repite, llega vencida o corresponde a una cita cancelada o a condiciones sustituidas, el sistema deberá responder conforme al estado vigente sin duplicar cambios, reactivar citas ni confirmar condiciones antiguas.
- **RF-36.** Si falla el envío o su resultado es incierto, el sistema deberá conservar la cita, distinguir el fallo de la entrega confirmada y gestionar los reintentos sin crear otra cita ni repetir innecesariamente mensajes ya entregados.
- **RF-37.** Si no existe constancia de que se ofreció al cliente un mecanismo utilizable de confirmación por WhatsApp antes del vencimiento, el sistema deberá derivar la cita al personal y excluirla de la cancelación automática por ese plazo.
- **RF-38.** Cuando una cita requiera seguimiento manual, el sistema deberá mostrar al personal autorizado la causa y la situación del envío; una entrega tardía no deberá provocar su cancelación retroactiva.

### F. Plazos y cancelación automática

**Por qué:** liberar reservas pendientes sin cancelar citas confirmadas ni penalizar al cliente por un fallo del canal.

- **RF-39.** Cuando el Administrador configure el plazo normal de confirmación, el sistema deberá admitir entre 6 y 24 horas desde el registro, con 12 horas predeterminadas, y rechazar valores fuera de ese intervalo.
- **RF-40.** Cuando se registre una reserva con más de seis horas hasta su inicio, el sistema deberá fijar su vencimiento en el instante más temprano entre el cumplimiento del plazo configurado y una hora antes del inicio.
- **RF-41.** Cuando se registre una reserva con hasta seis horas hasta su inicio, el sistema deberá clasificarla como próxima y asignar 15 minutos para confirmar únicamente si ese plazo termina antes del inicio.
- **RF-42.** Si los 15 minutos no terminan antes del inicio, el sistema deberá mantener la cita bajo seguimiento manual, sin cancelación automática por ese plazo.
- **RF-43.** Cuando se asigne un plazo, el sistema deberá conservar la categoría, condiciones y vencimiento aplicados a la cita y mostrarlos al cliente en la zona horaria de la sucursal; un cambio posterior de configuración no deberá modificarlos.
- **RF-44.** Cuando se alcance el vencimiento de una cita que continúe Pendiente y cumpla las condiciones de cancelación automática, el sistema deberá cancelarla, registrar el motivo «Falta de confirmación dentro del plazo» y liberar únicamente su ocupación.
- **RF-45.** Si compiten confirmación, cancelación automática, cancelación manual o reprogramación, el sistema deberá conservar un único resultado coherente; una cita ya Confirmada no deberá cancelarse por falta de confirmación.
- **RF-46.** Si el personal devuelve una cita a Pendiente después de haber estado Confirmada, el sistema deberá exigir seguimiento manual sin reutilizar un plazo vencido ni iniciar silenciosamente otro.

### G. Recordatorios

**Por qué:** recordar compromisos confirmados sin enviar mensajes tardíos ni convertir el silencio en una cancelación.

- **RF-47.** Cuando el Administrador configure recordatorios, el sistema deberá admitir una anticipación de entre 12 y 48 horas antes del inicio, con 24 horas predeterminadas; solo deberá enviar el recordatorio si la cita está Confirmada, no es próxima y el momento previsto aún era futuro al confirmarla.
- **RF-48.** Cuando se reprograme una cita, el sistema deberá descartar el recordatorio anterior y evaluar el nuevo horario con la configuración vigente y el umbral de seis horas desde el cambio; al cancelarla deberá descartar el recordatorio pendiente, y la ausencia de respuesta a un recordatorio no deberá cancelarla.

### H. Reportes e indicadores

**Por qué:** medir resultados operativos con cifras reproducibles y distinguir estimaciones de ingresos de dinero cobrado.

- **RF-49.** Cuando el Administrador consulte reportes, el sistema deberá permitir seleccionar periodo, sucursal, Profesional y servicio de su negocio y mostrar los siguientes resultados sobre el conjunto completo filtrado:

  | Resultado | Definición |
  |---|---|
  | Atendidas, canceladas y no asistencias | Cantidades en estados Completada, Cancelada y No asistió. |
  | Ingresos estimados | Suma del costo histórico de las citas Completadas, desglosada por servicio y sucursal. |
  | Tasa de inasistencia | No asistió ÷ (Completadas + No asistió) × 100. |
  | Tasa de cancelación | Canceladas ÷ total de citas del periodo × 100. |
  | Pasadas sin resultado | Citas cuyo fin ya se alcanzó y permanecen Pendientes o Confirmadas. |
  | Origen de reservas | Cantidad y proporción procedentes del portal y del personal. |
  | Servicios más solicitados | Cantidad de citas registradas por servicio, incluidas las canceladas. |
  | Evolución | Cantidad de citas por semana o mes, incluyendo desglose por estado. |
  | Cancelaciones automáticas | Citas actualmente Canceladas por falta de confirmación, como subconjunto de las canceladas. |

- **RF-50.** Cuando se determine la pertenencia al periodo, el sistema deberá usar la fecha de inicio de la cita en la zona horaria de su sucursal, incluir las fechas extremas seleccionadas y expresar la fecha de corte del reporte.
- **RF-51.** Cuando se calculen indicadores, el sistema deberá usar el estado vigente a la fecha de corte, contar cada cita una sola vez y mostrar «Sin datos» cuando el denominador de una tasa sea cero.
- **RF-52.** Mientras se muestren ingresos estimados, el sistema deberá identificarlos como estimaciones de servicios completados, sin presentarlos como cobros reales ni reconstruirlos con precios actuales.
- **RF-53.** Si se modifica un catálogo, se une un cliente o se pagina una tabla, el sistema deberá conservar la atribución histórica de las citas y la coherencia entre totales, desgloses e indicadores.
- **RF-54.** Si una consulta de reportes falla, el sistema deberá informar el fallo sin mostrar ceros como resultados reales ni permitir imprimir información incompleta como un reporte completo.

### I. Impresión y PDF

**Por qué:** obtener un documento consistente desde la misma página de reportes sin mantener un generador independiente.

- **RF-55.** Cuando el Administrador solicite imprimir un reporte, el sistema deberá preparar la misma página para la impresión del navegador y permitir utilizar «Guardar como PDF», mientras el backend proporciona métricas, indicadores y datos.
- **RF-56.** Cuando se prepare la impresión, el sistema deberá incluir negocio, periodo, filtros aplicados, fecha de corte y tablas completas, ocultando navegación, botones y controles.
- **RF-57.** Si una tabla está paginada en pantalla, el sistema deberá incluir todas sus filas filtradas en la impresión y mantenerlas coherentes con los indicadores del mismo corte; si no puede obtenerlas completas, deberá informar el error.

### J. Eliminación del folio e integridad transversal

**Por qué:** retirar un identificador de presentación innecesario sin perder relaciones, recuperación de operaciones ni prevención de duplicados.

- **RF-58.** Cuando se complete la actualización del módulo, el sistema deberá haber retirado el folio de las interfaces, mensajes, reportes, impresión, contratos y respuestas, así como su generación, campo persistido e índices exclusivos.
- **RF-59.** Cuando se actualice una instalación existente, el sistema deberá conservar citas, clientes y relaciones sin exigir su borrado, manteniendo los IDs internos y claves de operación necesarias para recuperar resultados y evitar duplicados.
- **RF-60.** Cuando una operación sensible cambie citas, una fichas, modifique configuración o cancele automáticamente una reserva, el sistema deberá conservar evidencia de actor o proceso, momento y motivo sin registrar secretos ni duplicar datos sensibles innecesariamente.
- **RF-61.** Si una solicitud intenta acceder a datos, recursos de marca, mensajes o reportes fuera de su alcance autorizado, el sistema deberá rechazarla sin revelar información de otros negocios.
- **RF-62.** Si una operación se repite, pierde su respuesta o coincide con otra modificación, el sistema deberá permitir conocer su resultado sin duplicar citas, fichas, uniones ni efectos ya realizados.

## Fuera de alcance

- Indicadores de clientes recurrentes y ocupación histórica.
- Pagos, cobros reales, facturación y conciliación financiera.
- Generación independiente de PDF en el backend.
- Confirmación del cliente desde el portal o mediante otros canales distintos de WhatsApp.
- Confirmación inferida por entrega, lectura o respuesta libre no reconocida como acción de confirmación.
- Fusión automática, coincidencia aproximada o unión de clientes entre negocios.
- Acceso del Profesional al directorio completo, unión de fichas o gestión de citas ajenas.
- Cambio de servicio, sucursal, Profesional o costo histórico mediante reprogramación.
- Cuentas de clientes y consulta pública de historiales.
- Campañas de WhatsApp y avisos adicionales distintos del mensaje inicial y recordatorio.
- Borrado de citas o clientes como parte de la actualización.
- Elección de proveedor, arquitectura, rutas, esquemas y mecanismos técnicos: corresponden al plan posterior.

## Criterios de finalización

1. Cada RF cuenta con evidencia propia de aceptación; las capacidades descritas no se consideran implementadas por aparecer en esta especificación.
2. Se verifican permisos y aislamiento con dos negocios, diferentes profesionales y los cuatro roles, incluyendo intentos de manipulación de identificadores.
3. El Profesional completa las operaciones permitidas sobre sus citas y recibe rechazos correctos ante citas ajenas, licencia no habilitada, horarios inválidos y conflictos de disponibilidad.
4. Correos y bloqueos presentan páginas, filtros y totales correctos; cambiar de página no altera contadores ni disponibilidad.
5. Portal, agendamiento manual y directorio respetan la ficha única incluso ante registros simultáneos; se verifican teléfonos compartidos con nombres distintos y las variantes de normalización.
6. Administrador y Recepción pueden aceptar o rechazar una unión con advertencia previa; fallos y ediciones concurrentes no dejan cambios parciales y las citas conservan sus datos históricos.
7. Logo, colores, vista previa y restauración funcionan por negocio; se verifican rechazo de imágenes inválidas, legibilidad y uso móvil y mediante teclado.
8. Se acredita el envío real de WhatsApp a números de prueba autorizados, con distinción entre Pendiente y Confirmada y una acción de confirmación funcional; entregar o leer no confirma asistencia.
9. Se prueban los límites antes, exactamente en y después de seis horas, del vencimiento, del corte de una hora y del plazo de 15 minutos; el caso en que este último termina exactamente al inicio requiere seguimiento manual.
10. Se verifican fallos de canal, entrega incierta o tardía, confirmación repetida o vencida y competencia entre confirmar, cancelar, reprogramar y reservar el horario liberado.
11. Reprogramar una Pendiente y reactivar una Cancelada las deja Confirmadas; los recordatorios se recalculan, omiten o descartan según corresponda y su falta de respuesta nunca cancela.
12. Los reportes concilian con datos conocidos, incluidos denominadores cero, citas pasadas sin resultado, costos de catálogo modificados, cancelaciones automáticas y citas reactivadas.
13. La impresión y «Guardar como PDF» muestran todas las filas, filtros y fecha de corte, sin controles ni folios y sin discrepancias con los indicadores.
14. Se verifica la actualización con datos existentes en una base desechable de prueba, conservando relaciones e IDs internos, retirando el folio y sin depender de un borrado previo.
15. Se completan build, lint disponible y pruebas pertinentes de backend y frontend; se registra evidencia y no se declara cerrado el módulo con RF pendientes.
