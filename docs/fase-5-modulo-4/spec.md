# Módulo 4: Panel de Control y Gestión Operativa

## Objetivo y reglas de referencia

Permitir que el personal autorizado gestione la agenda diaria de cada negocio, registre citas manuales, cambie el estado o el horario de citas existentes y consulte su directorio de clientes sin perder el aislamiento ni la integridad de las reservas.

Se aplica la [constitución del módulo 4](constitucion-modulo-4.md) y se conservan las reglas compatibles del [motor de disponibilidad](../fase-3/spec-modulo-2.md), el [contrato de coordinación de escritores](../fase-3/resultados-tareas/contrato-escritores-t078-t079.md) y la [especificación del portal público](../fase-4-modulo-3/spec.md). Una cita pública nace pendiente; una cita manual nace confirmada. Los RF siguientes son locales a este módulo.

## Requisitos funcionales en EARS

### Acceso y pertenencia

**Por qué:** permitir el trabajo operativo sin exponer citas ni datos de pacientes de otro negocio o de otro Profesional.

- **RF-01.** Cuando un Administrador o Recepcionista acceda al panel, el sistema deberá permitirle consultar y gestionar las citas y clientes de su negocio conforme a su rol.
- **RF-02.** Cuando un Profesional consulte la agenda, el sistema deberá mostrarle únicamente sus propias citas, incluidos el contacto y las notas necesarios para la atención, sin permitirle crear, mover, cancelar ni cambiar estados de citas.
- **RF-03.** Si una solicitud referencia un negocio, cliente, cita, sucursal o Profesional ajeno o no autorizado, el sistema deberá denegarla sin revelar sus datos ni alterar registros.
- **RF-04.** Mientras la cuenta o la licencia impidan el acceso según las reglas vigentes, el sistema deberá denegar las operaciones privadas correspondientes, incluso con una sesión que ya estuviera abierta.
- **RF-05.** Cuando se deniegue una acción, el sistema deberá comunicar al usuario que no puede realizarla sin mostrar datos privados de otros negocios o detalles internos.

### Agenda operativa

**Por qué:** dar al personal una vista fiable de los compromisos del negocio y de los cambios que ocurren durante su jornada.

- **RF-06.** Cuando el personal autorizado abra la agenda, el sistema deberá permitir consultar las citas en vistas diaria, semanal y mensual.
- **RF-07.** Cuando se muestre una cita, el sistema deberá identificar su fecha, horario, sucursal, servicio, Profesional y estado, usando la zona horaria de la sucursal para expresar el horario.
- **RF-08.** Cuando se consulte la agenda, el sistema deberá permitir filtrar por sucursal, Profesional y estado, y buscar citas por el nombre del paciente dentro del alcance autorizado.
- **RF-09.** Mientras una cita permanezca registrada, el sistema deberá permitir verla en su periodo correspondiente aunque haya sido cancelada o marcada como No asistió, distinguiendo visualmente los cinco estados.
- **RF-10.** Cuando otra persona registre o modifique una cita visible, el sistema deberá actualizar la agenda abierta automáticamente e informar si una selección o formulario abierto dejó de reflejar el estado vigente.
- **RF-11.** Cuando un cambio operativo de horario, bloqueo u oferta afecte citas existentes, la agenda deberá permitir identificar esas citas y sus causas vigentes sin modificarlas automáticamente.
- **RF-12.** Mientras el personal utilice la agenda en móvil o mediante teclado, el sistema deberá permitir consultar citas y completar las acciones autorizadas con controles, foco y mensajes comprensibles.

### Directorio de clientes

**Por qué:** encontrar a la persona correcta sin usar el teléfono como identidad ni alterar el resumen histórico de sus citas.

- **RF-13.** Cuando un Administrador o Recepcionista abra el directorio, el sistema deberá mostrar únicamente clientes de su negocio y permitir buscar por nombre o teléfono.
- **RF-14.** Cuando el personal consulte un cliente autorizado, el sistema deberá mostrar su ficha y el historial de sus citas del mismo negocio.
- **RF-15.** Cuando el personal cree una ficha sin agendar una cita, el sistema deberá exigir nombre no vacío de hasta 150 caracteres y un teléfono mexicano normalizable a diez dígitos, y admitir el mismo teléfono en fichas distintas.
- **RF-16.** Cuando el personal cree una cita manual, el sistema deberá permitir elegir expresamente una ficha existente del negocio o registrar un cliente nuevo.
- **RF-17.** Si varias fichas comparten teléfono, el sistema deberá mantenerlas independientes y exigir una elección explícita; no deberá fusionarlas ni seleccionar una automáticamente por el número.
- **RF-18.** Cuando el personal corrija nombre o teléfono de una ficha, el sistema deberá guardar la corrección para usos posteriores sin reescribir el contacto ni los demás datos históricos de citas ya registradas.
- **RF-19.** Si los datos de una ficha son inválidos o la ficha pertenece a otro negocio, el sistema deberá rechazar el alta, la consulta o la corrección sin dejar cambios parciales ni revelar datos ajenos.

### Agendamiento manual

**Por qué:** registrar atenciones acordadas por teléfono o en persona bajo las mismas condiciones reales de ocupación que el portal público.

- **RF-20.** Cuando un Administrador o Recepcionista prepare una cita manual, el sistema deberá permitir seleccionar cliente, servicio, sucursal, Profesional, fecha y hora, y capturar notas opcionales.
- **RF-21.** Cuando se consulte un horario para una cita manual, el sistema deberá aplicar la modalidad manual del módulo 2: omitir compactación, intervalo público, anticipación y horizonte, pero mantener permisos, licencia, oferta activa, duración completa, horario, bloqueos, ocupaciones y rechazo de inicios pasados.
- **RF-22.** Cuando se solicite guardar una cita manual, el sistema deberá comprobar nuevamente las condiciones vigentes; un horario mostrado previamente no deberá garantizar su registro.
- **RF-23.** Si la cita manual coincide total o parcialmente con otra cita no cancelada o un apartado público vigente del mismo Profesional, el sistema deberá rechazar el registro e informar del conflicto, incluso entre sucursales.
- **RF-24.** Cuando se registre una cita manual, el sistema deberá crearla una sola vez en estado **Confirmada**, con folio único, duración y costo vigentes del servicio y un resumen histórico de contacto, negocio, servicio, sucursal, Profesional, inicio, fin y zona horaria.
- **RF-25.** Si el catálogo cambia después del registro, el sistema deberá conservar el costo y el resumen aceptados en la cita manual; el cambio solo deberá afectar nuevas reservas.
- **RF-26.** Si falla el registro de una cita manual, el sistema deberá conservar el estado previo sin cliente o cita parcial ni ocupación nueva, y permitir corregir o reintentar según el resultado conocido.
- **RF-27.** Si se pierde la respuesta al guardar una cita manual, el sistema deberá comprobar el resultado de ese mismo envío antes de permitir otro; si quedó registrada, deberá mostrar la misma cita y folio sin duplicarla, y si aún no puede conocerse, deberá informar la incertidumbre.
- **RF-28.** Si dos solicitudes intentan registrar ocupaciones incompatibles al mismo tiempo, el sistema deberá confirmar como máximo una e informar del conflicto a la otra, también cuando una provenga del portal público.

### Ciclo de vida de la cita

**Por qué:** reflejar lo ocurrido en cada atención sin liberar horarios por error ni borrar el historial.

- **RF-29.** Cuando un Administrador o Recepcionista consulte una cita autorizada, el sistema deberá mostrar su estado entre Pendiente, Confirmada, Completada, Cancelada y No asistió, junto con su origen público o manual.
- **RF-30.** Cuando el personal autorizado cambie el estado de una cita, el sistema deberá permitir cualquier cambio que satisfaga las restricciones de tiempo, ocupación y pertenencia de esta especificación, y conservar el cambio en su historial.
- **RF-31.** Si se intenta marcar una cita como Completada o No asistió antes de que termine su horario, el sistema deberá rechazar el cambio sin alterar la cita.
- **RF-32.** Cuando se cancele una cita o se marque como No asistió, el sistema deberá admitir un motivo opcional y conservarlo para la consulta operativa.
- **RF-33.** Mientras una cita tenga un estado distinto de Cancelada, el sistema deberá mantener ocupado su intervalo, incluido el estado No asistió; cuando pase a Cancelada, deberá liberar únicamente la ocupación causada por esa cita.
- **RF-34.** Cuando el personal intente reactivar una cita cancelada cuyo inicio aún no pasó, el sistema deberá comprobar de nuevo permisos, licencia, oferta, horario, bloqueos y ocupaciones, y permitir la reactivación solo si el intervalo sigue disponible.
- **RF-35.** Si el inicio de una cita cancelada ya pasó o su intervalo ya no está disponible, el sistema deberá rechazar su reactivación sin sobrescribir otras ocupaciones.
- **RF-36.** Cuando se corrija el estado de una cita Completada o No asistió, el sistema deberá conservar el estado anterior, el nuevo, el actor y el momento del cambio; una corrección no deberá borrar la cita ni su historial.
- **RF-37.** Mientras una cita pública permanezca Pendiente, el sistema deberá conservar su ocupación sin cancelarla automáticamente por falta de confirmación en este módulo.

### Cambio de horario

**Por qué:** atender una solicitud de cambio sin perder el folio ni desplazar una cita sobre compromisos existentes.

- **RF-38.** Cuando un Administrador o Recepcionista cambie una cita futura no cancelada, el sistema deberá permitir modificar únicamente su fecha y hora, conservando folio, cliente, servicio, sucursal, Profesional y costo histórico.
- **RF-39.** Cuando se proponga un nuevo horario, el sistema deberá interpretarlo en la zona horaria de la sucursal, rechazar una hora local ambigua o inexistente y comprobar la duración completa y las condiciones manuales vigentes.
- **RF-40.** Si el nuevo intervalo coincide con una cita no cancelada o un apartado vigente del mismo Profesional, incluso en otra sucursal, el sistema deberá rechazar el cambio y conservar íntegramente el horario anterior.
- **RF-41.** Cuando el cambio de horario se confirme, el sistema deberá conservar en el historial el horario y zona anteriores y los nuevos, y mostrar el nuevo horario bajo el mismo folio.
- **RF-42.** Si el cambio de horario falla o se intenta sobre una cita pasada, el sistema deberá conservar íntegramente la cita anterior e informar por qué no pudo modificarse.

### Errores, cambios simultáneos y trazabilidad

**Por qué:** impedir duplicados o sobrescrituras silenciosas y permitir explicar los cambios operativos sin revelar información sensible.

- **RF-43.** Si dos personas intentan modificar la misma cita a partir de versiones distintas, el sistema deberá impedir que la edición anterior sobrescriba la más reciente e informar que es necesario revisar los datos vigentes.
- **RF-44.** Si una acción válida entra en conflicto con una modificación concurrente de licencia, oferta, horario, bloqueo, apartado o cita, el sistema deberá respetar el orden efectivo de los cambios confirmados y conservar un resultado íntegro.
- **RF-45.** Cuando se registre, mueva, cancele, reactive o cambie el estado de una cita, o se corrija una ficha de cliente, el sistema deberá conservar quién realizó el cambio, cuándo ocurrió y los valores relevantes anteriores y nuevos, sin registrar secretos.
- **RF-46.** Si una consulta válida no encuentra citas, clientes u horarios, el sistema deberá informar un resultado vacío legítimo; si falla la comprobación, deberá informar el fallo y permitir reintentar sin mostrar resultados parciales como completos.
- **RF-47.** Si una entrada es inválida, un recurso no está autorizado o existe un conflicto, el sistema deberá distinguir esos resultados de un fallo técnico, conservar los datos que el usuario pueda corregir y no exponer SQL, trazas ni datos privados.

## Fuera de alcance

- Confirmación del cliente por WhatsApp, mensajes, recordatorios y avisos automáticos: módulo 5. La confirmación manual por el personal sí pertenece a este módulo.
- Configurar o aplicar un plazo previo a la cita para cancelar automáticamente reservas públicas pendientes por falta de confirmación: módulo 5, junto con WhatsApp. Hasta entonces, la cita pendiente permanece ocupando su intervalo.
- Reportes de ingresos, exportación PDF y pagos; la pantalla de reportes de la demo no constituye una función operativa de este módulo.
- Cambiar servicio, sucursal, Profesional o costo al mover una cita; descuentos, precios manuales especiales y captura de citas históricas.
- Borrado o fusión automática de clientes, búsqueda pública de citas por teléfono o folio y cuentas de clientes.
- Cambios a las reglas de licencias, disponibilidad, oferta o apartados que no sean necesarios para integrar la gestión operativa.

## Criterios de finalización

1. Cada RF tiene evidencia de aceptación propia del módulo 4; la demo, las pruebas históricas y los dobles del escritor no sustituyen los recorridos reales.
2. Administrador y Recepcionista gestionan únicamente citas y clientes de su negocio; el Profesional consulta solo sus propias citas con contacto y notas; se verifican accesos denegados, sesiones abiertas y licencia en sus límites vigentes.
3. La agenda conectada muestra datos reales en día, semana y mes, con filtros, búsqueda, cinco estados, zonas de sucursal, actualización automática, uso móvil y teclado, y causas vigentes de citas afectadas.
4. El directorio permite alta independiente, búsqueda, historial, selección expresa y corrección de fichas; teléfonos compartidos no fusionan personas y las citas anteriores conservan sus datos históricos.
5. El agendamiento manual conserva folio, costo, contacto, inicio, fin y zona; respeta oferta, licencia, duración, horario, bloqueos y modalidad manual, sin aceptar inicios pasados ni dejar filas parciales ante fallos.
6. Se verifican los cinco estados, el límite temporal para Completada y No asistió, motivos opcionales, liberación solo por Cancelada, correcciones auditadas y reactivación únicamente de citas futuras con horario libre.
7. Mover una cita futura cambia solo fecha y hora bajo el mismo folio; conflictos, horas locales inválidas, cambios concurrentes y fallos conservan el estado anterior y su historial.
8. Una respuesta perdida del registro manual recupera el mismo resultado sin duplicar; dos ediciones de una cita no se sobrescriben silenciosamente y los errores técnicos se distinguen de resultados vacíos o conflictos.
9. M2-I004 y M3-I001 se acreditan con el escritor manual real frente a un apartado público mediante dos conexiones y barreras, incluidos intervalos entre sucursales; solo una ocupación incompatible queda confirmada.
10. La entrega supera compilación, lint y pruebas unitarias, de integración, HTTP y de navegador relevantes para los cambios de backend y frontend; no se declara implementada ninguna función del módulo 5.
