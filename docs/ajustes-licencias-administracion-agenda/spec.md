# Especificación — Ajustes de licencias, administración y agenda

Estado: propuesta para revisión y aprobación. Este documento no acredita implementación ni modifica por sí mismo las normas vigentes.

## Objetivo y alcance

Adaptar exclusivamente el backend a los acuerdos sobre licencias, cupos, inhabilitación recuperable, precios públicos, horarios, disponibilidad y reservas por teléfono. Expresar el comportamiento observable y su propósito, sin definir arquitectura, algoritmos, tablas, rutas ni pasos de implementación.

El panel administrativo y el portal público consumirán estas capacidades en un trabajo posterior. «Mostrar», «ocultar» y «ofrecer» se refieren aquí a la información que entrega el backend, no a cambios visuales.

Según lo informado por el responsable del proyecto, todavía no existen negocios ni usuarios operativos. No se requiere una transición de negocios existentes con cupos excedidos ni de horarios operativos anteriores; esto no autoriza borrar información del entorno.

## Referencias y precedencia propuesta

- [Constitución de estos ajustes](constitucion.md): continúa pendiente de aprobación. Su terminología «archivado» corresponde aquí a «inhabilitación»; el alcance de esta especificación es exclusivamente backend.
- [Módulo 1](../fase-2-modulo-1/spec-modulo-1.md) y [ajustes del módulo 1](../Fix-modulo-1/spec-fix.md): conservar las reglas compatibles de cuentas, licencias, permisos y oferta.
- [Motor de disponibilidad](../fase-3-modulo-2/spec-modulo-2.md): conservar las restricciones compatibles de atención, zonas horarias, ocupaciones y disponibilidad.
- [Portal público](../fase-4-modulo-3/spec.md): conservar propiedad de apartados, seguridad, idempotencia, recuperación e historial, salvo las modificaciones expresas de este documento.

Después de su aprobación, estos RF sustituirán únicamente las reglas incompatibles sobre aviso a dos días, plazo fijo de suspensión, usuarios sin cupo, borrado físico de los recursos incluidos, descansos, excepciones por fecha, exposición obligatoria de precios, intervalo entre inicios, compactación por tramos y reservas sin límite por teléfono. La aprobación no equivaldrá a acreditar su implementación. Los RF de este documento tienen numeración local y no renumeran otras especificaciones.

## Definiciones de negocio

- **Activo:** cuenta o recurso habilitado individualmente, sujeto además a licencia, pertenencia y oferta efectiva. Suspender una licencia o inhabilitar una sucursal no libera por sí mismo cupos de cuentas que siguen activas.
- **Inactivo:** registro desactivado que permanece en la consulta administrativa habitual.
- **Inhabilitado:** registro retirado de la consulta administrativa habitual y de la operación, conservado para recuperación. No es sinónimo de inactivo.
- **Restaurar:** devolver un registro inhabilitado a la consulta administrativa habitual, en estado inactivo.
- **Tiempo entre citas:** separación protegida después de cada atención; no forma parte de la duración del servicio ni cambia la hora de finalización de la atención.
- **Espacio libre:** intervalo de atención disponible después de considerar ocupaciones, separaciones protegidas y restricciones vigentes.
- **Horario redondeado:** inicio expresado en la hora local de la sucursal, sin segundos, en un minuto múltiplo de cinco, nunca anterior al límite que debe cumplir.
- **Cita futura para el cupo telefónico:** cita no cancelada cuyo inicio sea estrictamente posterior al instante actual. Al llegar a su inicio deja de consumir cupo, aunque no haya terminado.

## Requisitos funcionales en EARS

### 1. Licencias y correos

**Por qué:** advertir oportunamente sobre la continuidad del servicio, permitir al superadmin decidir el plazo de suspensión y evitar pérdidas de vigencia o avisos contradictorios.

- **RF-01.** Cuando una licencia vigente alcance los umbrales de quince y siete días antes de vencer, el sistema deberá emitir al correo del administrador del negocio un aviso correspondiente a cada umbral, sustituyendo el aviso anterior de dos días.
- **RF-02.** Si una falla retrasa los avisos preventivos y posteriormente se recupera el envío mientras la licencia sigue vigente, el sistema deberá emitir un único aviso pendiente aplicable con el tiempo restante real, sin acumular avisos atrasados; un umbral posterior todavía no alcanzado deberá conservar su aviso propio.
- **RF-03.** Cuando el superadmin solicite suspender una licencia elegible, el sistema deberá admitir un plazo de cero a treinta días enteros y usar dos días si no se especifica un plazo; un plazo inválido deberá rechazarse sin cambiar la licencia.
- **RF-04.** Mientras exista una suspensión pendiente o efectiva, el sistema deberá impedir solicitar otro plazo de suspensión y conservar la fecha y los efectos originales, sin generar nuevos avisos por repeticiones.
- **RF-05.** Cuando se programe una suspensión con plazo mayor que cero, el sistema deberá emitir un correo al administrador con el plazo elegido y el momento previsto de bloqueo; cuando la suspensión se haga efectiva, deberá emitir otro correo que informe que la licencia está suspendida.
- **RF-06.** Cuando se solicite una suspensión con plazo cero, el sistema deberá bloquear el acceso inmediatamente y emitir un único correo de suspensión inmediata, sin un aviso previo adicional.
- **RF-07.** Mientras una suspensión esté pendiente, el sistema deberá conservar el acceso hasta el primero de los límites aplicables: bloqueo programado o vencimiento natural; al alcanzar ese límite deberá negar el acceso, incluidas las sesiones abiertas.
- **RF-08.** Cuando una licencia alcance su vencimiento natural, el sistema deberá emitir un aviso de licencia vencida; si ese vencimiento ocurre antes del bloqueo programado, deberá omitir el posterior aviso de suspensión.
- **RF-09.** Si falla la entrega de un correo de licencia, el sistema deberá mantener los cambios y bloqueos que correspondan y reintentar el aviso todavía aplicable, sin extender acceso, reiniciar plazos ni crear avisos lógicos duplicados.
- **RF-10.** Cuando el superadmin reactive una licencia antes del bloqueo programado, el sistema deberá revocar la suspensión pendiente, cancelar su bloqueo y su aviso pendiente de efectividad, y emitir un correo de revocación.
- **RF-11.** Cuando una suspensión se haga efectiva, el sistema deberá conservar el tiempo de vigencia restante en ese instante; cuando el superadmin reactive la licencia suspendida, deberá restituir ese tiempo desde la reactivación y emitir un correo con la nueva fecha de vencimiento.
- **RF-12.** Cuando el superadmin renueve una licencia elegible, el sistema deberá conservar las reglas vigentes de renovación anual y emitir una confirmación; para una licencia vencida o vigente deberá indicar la nueva fecha de vencimiento, y para una suspendida deberá comunicar la vigencia renovada sin presentar el acceso como restablecido.
- **RF-13.** Mientras una licencia tenga suspensión pendiente o efectiva, el sistema deberá mantenerla después de renovar y aclarar esa condición en el correo de confirmación; la renovación no deberá reiniciar el plazo de suspensión.
- **RF-14.** Si una renovación, revocación o reactivación deja obsoleto un correo todavía pendiente, el sistema deberá descartarlo para no comunicar un vencimiento o bloqueo que ya no corresponda.
- **RF-15.** Si coinciden o se repiten operaciones de suspensión, renovación o reactivación, el sistema deberá conservar un resultado coherente, sin perder ni duplicar tiempo de licencia, cambios de estado ni avisos lógicos.

### 2. Cupos de profesionales y recepcionistas

**Por qué:** limitar la capacidad contratada de cada negocio sin retirar cuentas automáticamente ni permitir que altas simultáneas excedan el límite.

- **RF-16.** Cuando se cree un negocio, el sistema deberá asignarle cupos iniciales de cinco profesionales activos y tres recepcionistas activos, independientes del cupo de sucursales.
- **RF-17.** Cuando el superadmin modifique uno de estos cupos, el sistema deberá admitir únicamente cantidades enteras de al menos uno; si otro rol intenta modificarlos, deberá denegar la operación.
- **RF-18.** Mientras se calcule el consumo de un cupo de cuentas, el sistema deberá contar únicamente las cuentas activas del rol y negocio correspondientes, sin contar administradores, cuentas inactivas o inhabilitadas ni multiplicar profesionales por sus sucursales asignadas.
- **RF-19.** Si crear o activar una cuenta supera el cupo del rol correspondiente, el sistema deberá rechazar la operación sin dejar una cuenta parcialmente creada o activada, incluso ante solicitudes simultáneas.
- **RF-20.** Cuando una cuenta se desactive o inhabilite, el sistema deberá liberar su lugar del cupo; cuando se intente activarla posteriormente, deberá exigir cupo disponible.
- **RF-21.** Si el superadmin intenta reducir un cupo por debajo de la cantidad de cuentas activas de ese rol, el sistema deberá rechazar el cambio y mantener el límite anterior, sin desactivar cuentas automáticamente.

### 3. Inhabilitación y restauración

**Por qué:** retirar recursos de la operación sin perder historial y permitir corregir bajas equivocadas mediante acciones administrativas del backend.

- **RF-22.** Cuando el administrador del negocio solicite retirar un profesional, recepcionista, servicio o sucursal, el sistema deberá permitir su inhabilitación recuperable en lugar del borrado físico, conservando datos, relaciones e historial.
- **RF-23.** Mientras un registro esté inhabilitado, el sistema deberá excluirlo de la consulta administrativa habitual y de nuevas operaciones que requieran su oferta o acceso, y permitir consultarlo como inhabilitado exclusivamente al administrador de su negocio.
- **RF-24.** Cuando se desactive un registro sin inhabilitarlo, el sistema deberá mantenerlo en la consulta administrativa habitual, distinguiendo ambas condiciones.
- **RF-25.** Cuando se inhabilite a un profesional o recepcionista, el sistema deberá impedir inmediatamente su acceso, incluidas las sesiones abiertas, y conservar sus credenciales sin exponerlas.
- **RF-26.** Mientras un registro permanezca inhabilitado, el sistema deberá conservar las restricciones de unicidad de nombre y correo que ya le correspondan, evitando altas incompatibles con su posterior restauración.
- **RF-27.** Cuando el administrador restaure un registro de su negocio, el sistema deberá devolverlo a la consulta habitual como inactivo, sin habilitar automáticamente su acceso u oferta; su activación posterior deberá validar cupos y conflictos aplicables.
- **RF-28.** Si un recurso tiene citas futuras al inhabilitarse, el sistema deberá permitir la inhabilitación, conservar las citas y su ocupación, e identificarlas como afectadas sin cancelarlas, reprogramarlas ni cambiar su estado automáticamente.
- **RF-29.** Si se intenta registrar una reserva cuyo servicio, sucursal o profesional haya sido inhabilitado, el sistema deberá rechazarla aunque exista un apartado propio todavía vigente.
- **RF-30.** Cuando se active una sucursal restaurada, el sistema deberá recuperar su oferta que cumpla las condiciones vigentes, respetando las relaciones conservadas y los estados individuales de profesionales y servicios; no deberá activar los que permanezcan inactivos o inhabilitados por separado.
- **RF-31.** Si una acción de inhabilitación o restauración se repite, el sistema deberá conservar un resultado consistente sin duplicar efectos ni eliminar historia; si el actor no es administrador del negocio correspondiente, deberá impedir la acción.

### 4. Visibilidad pública de precios

**Por qué:** permitir que cada negocio decida si publica sus precios sin perder el costo histórico ni atribuir al cliente aceptación de un importe oculto.

- **RF-32.** Cuando se cree un negocio, el sistema deberá configurar sus precios públicos como visibles; cuando su administrador cambie esa configuración, deberá aplicarla globalmente a todos los servicios, incluidos los que se creen después.
- **RF-33.** Mientras un negocio tenga los precios ocultos, el sistema deberá omitir importes de todas las respuestas públicas pertinentes, incluidos catálogo, apartado, resultado y recuperación de reserva, manteniéndolos disponibles para la administración autorizada.
- **RF-34.** Cuando cambie la visibilidad pública de precios, el sistema deberá aplicar el valor vigente en las siguientes respuestas públicas, incluidas las de apartados y reservas ya existentes, sin alterar sus costos históricos.
- **RF-35.** Cuando se conceda un apartado, el sistema deberá conservar el costo que le corresponde y trasladarlo a la cita registrada, aunque cambie posteriormente el precio del servicio o su visibilidad; si el importe no fue expuesto, no deberá afirmar que el cliente lo vio o aceptó.

### 5. Horarios y configuración de agenda

**Por qué:** simplificar la administración de horarios y expresar explícitamente el tiempo necesario entre atenciones, sin restricciones ocultas o jornadas artificialmente fragmentadas.

- **RF-36.** Cuando se configure un horario, el sistema deberá permitir franjas de atención separadas sin el campo de descanso opcional; un descanso deberá representarse como un hueco entre franjas y no deberá aceptarse como una opción operativa independiente.
- **RF-37.** Cuando se solicite configurar disponibilidad especial por fecha, el sistema deberá impedir crear o mantener excepciones de horario como capacidad operativa; deberá conservar los bloqueos temporales para restringir la atención, sin permitir que agreguen horas fuera de la jornada.
- **RF-38.** Cuando se guarden franjas consecutivas del mismo profesional, sucursal, día y estado, el sistema deberá tratarlas y devolverlas como una sola franja, conservando el inicio más temprano y el fin más tardío; no deberá fusionar franjas separadas por huecos ni de distinta sucursal, día o estado.
- **RF-39.** Cuando se cree un negocio, el sistema deberá establecer un tiempo entre citas de cero minutos; cuando su administrador lo configure, deberá aceptar únicamente cero o múltiplos de cinco hasta sesenta minutos inclusive y aplicarlo globalmente a sus servicios y profesionales.
- **RF-40.** Cuando se configure la agenda, el sistema deberá sustituir el intervalo entre inicios por el tiempo entre citas, sin conservar una cuadrícula independiente configurable de inicios; solo el administrador del negocio podrá modificar este tiempo o el modo de agenda.
- **RF-41.** Mientras no exista una configuración distinta autorizada, el sistema deberá usar Agenda Libre y una anticipación mínima de quince minutos; deberá conservar las reglas vigentes de validación, permisos y horizonte futuro que no contradigan estos ajustes.
- **RF-42.** Si se solicita una configuración no admitida, el sistema deberá rechazarla sin reemplazar parcialmente la configuración anterior ni cambiar apartados o citas existentes.

### 6. Disponibilidad, separación y redondeo

**Por qué:** ofrecer horarios ordenados, aprovechar los espacios libres y evitar que el tiempo necesario después de una consulta pueda ser ocupado por otra reserva.

- **RF-43.** Cuando se conceda un apartado o registre su cita, el sistema deberá conservar el tiempo entre citas correspondiente y protegerlo después del fin de atención, sin ampliar la duración del servicio ni confundir el final de la atención con el final de la ocupación.
- **RF-44.** Mientras una cita no cancelada o un apartado vigente proteja un intervalo de atención y separación, el sistema deberá impedir reservas incompatibles del mismo profesional en cualquier servicio o sucursal; los extremos exactamente contiguos deberán seguir siendo válidos.
- **RF-45.** Cuando se evalúe un horario, el sistema deberá exigir que quepan la duración completa del servicio y su separación dentro de la atención continua disponible, sin atravesar cierres, huecos, bloqueos u ocupaciones; las franjas consecutivas fusionadas deberán permitir continuidad.
- **RF-46.** Cuando se ofrezca cualquier inicio público, el sistema deberá expresarlo en múltiplos locales de cinco minutos y redondear hacia arriba cuando corresponda, respetando anticipación, atención y demás restricciones, sin ofrecer horas locales ambiguas o inexistentes.
- **RF-47.** Si la anticipación mínima desplaza el comienzo disponible, el sistema deberá ofrecer únicamente horarios a partir del límite resultante redondeado hacia arriba; por ejemplo, a las 09:07 con quince minutos de anticipación no deberá ofrecer antes de las 09:25.
- **RF-48.** Si el fin de una ocupación protegida no coincide con un múltiplo de cinco, el sistema deberá redondear el siguiente inicio público hacia arriba, sin agregar esos minutos de redondeo a la ocupación de la cita anterior; por ejemplo, una ocupación que termine a las 09:42 permitirá ofrecer desde las 09:45.
- **RF-49.** Mientras esté activa Agenda Libre, el sistema deberá ofrecer todas las opciones válidas desde el inicio de cada espacio libre, avanzando desde cada inicio ofrecido por la duración del servicio más la separación y aplicando el redondeo hacia arriba; no deberá exigir el anclaje a la cuadrícula original de la jornada.
- **RF-50.** Mientras esté activa Agenda Compacta, el sistema deberá ofrecer como máximo el primer inicio válido de cada día para el servicio, sucursal y profesional seleccionados, considerando conjuntamente todos sus tramos de ese día; si no existe ninguno, deberá devolver ausencia legítima de horarios.
- **RF-51.** Mientras exista un inicio válido anterior en el día para esa combinación, el sistema deberá mantener ocultos los posteriores en Agenda Compacta, incluidos los de la tarde; deberá permitir elegir otro día aunque el anterior conserve disponibilidad.
- **RF-52.** Cuando el primer horario de Agenda Compacta quede ocupado por una cita o un apartado vigente, el sistema deberá ofrecer el siguiente inicio válido; si esa ocupación deja de aplicar, deberá volver a considerar el horario anterior.
- **RF-53.** Si se libera un horario anterior mientras un cliente conserva un apartado vigente de Agenda Compacta, el sistema deberá permitir registrar el horario apartado sin exigir que siga siendo el primero disponible, sujeto a las demás condiciones de reserva.
- **RF-54.** Cuando el administrador cambie el modo de agenda o el tiempo entre citas, el sistema deberá aplicar los nuevos valores a los apartados nuevos y conservar las condiciones originales de los vigentes hasta su consumo, liberación o vencimiento, así como la separación de las citas registradas.
- **RF-55.** Mientras se conserve un apartado con condiciones originales, el sistema deberá seguir exigiendo las demás condiciones vigentes de licencia, oferta, atención y ausencia de conflictos; conservar modo y separación no deberá autorizar una reserva sobre un recurso inhabilitado.

### 7. Máximo de reservas futuras por teléfono

**Por qué:** limitar la ocupación futura asociada a un contacto sin impedir reservas para personas diferentes que compartan teléfono ni revelar sus datos.

- **RF-56.** Cuando se intente registrar una cita, el sistema deberá permitir como máximo dos citas futuras no canceladas con el mismo teléfono normalizado en la misma sucursal del negocio, contando conjuntamente todos sus profesionales y servicios.
- **RF-57.** Mientras se calcule el cupo telefónico, el sistema deberá excluir las citas pasadas, las que ya comenzaron, las canceladas y los apartados todavía no convertidos en citas; al alcanzar exactamente el inicio de una cita, deberá dejar de contarla aunque no haya terminado.
- **RF-58.** Cuando el mismo teléfono reserve en otra sucursal, el sistema deberá aplicar un cupo independiente para esa sucursal, sin trasladar el consumo de otras sucursales ni negocios.
- **RF-59.** Si dos solicitudes concurrentes compiten por el último lugar del mismo cupo telefónico, el sistema deberá admitir como máximo una y rechazar la excedente sin crear una cita o cliente parcial.
- **RF-60.** Si una reserva se rechaza por superar el cupo telefónico, el sistema deberá conservar su apartado hasta el vencimiento original, sin renovarlo, y permitir al cliente corregir el teléfono o volver atrás; una corrección no deberá alterar una reserva ya registrada ni el contenido de un envío todavía incierto.
- **RF-61.** Si se alcanza el cupo telefónico, el sistema deberá responder «No se puede registrar otra cita con este teléfono en esta sucursal. Contacta al negocio», sin revelar nombres, horarios, notas ni otros detalles de reservas existentes.
- **RF-62.** Cuando se permita otra reserva con el mismo teléfono, el sistema deberá conservar los datos de cada persona por separado, sin fusionar clientes ni sobrescribir contactos anteriores por coincidencia telefónica.
- **RF-63.** Cuando se incorpore el escritor manual real, el sistema deberá aplicar el mismo cupo telefónico compartido con las reservas públicas; esta regla no deberá considerarse integrada con el canal manual hasta verificar dicho escritor.

### 8. Seguridad, errores y continuidad

**Por qué:** introducir las reglas nuevas sin debilitar el aislamiento, duplicar reservas, perder resultados o confundir errores con disponibilidad vacía.

- **RF-64.** Cuando se consulte o modifique cualquier recurso de estos ajustes, el sistema deberá validar el rol y la pertenencia al negocio, sin aceptar como autoridad las identidades, estados, costos o permisos aportados por el solicitante.
- **RF-65.** Cuando se confirme un apartado o una reserva, el sistema deberá revalidar las restricciones aplicables y producir un resultado consistente ante operaciones simultáneas, sin empalmes ni escrituras parciales; un fallo no deberá renovar el apartado.
- **RF-66.** Si un envío se repite o su respuesta se pierde, el sistema deberá conservar la idempotencia y la recuperación del resultado propio; deberá devolver la misma reserva ya registrada sin consumir otro lugar del cupo telefónico ni reevaluarlo como una reserva nueva.
- **RF-67.** Si un fallo técnico impide determinar disponibilidad o el resultado de una reserva, el sistema deberá comunicar el fallo conforme al contrato vigente, sin presentarlo como agenda vacía, reserva rechazada definitivamente ni resultado parcial, y sin exponer información interna.
- **RF-68.** Mientras un cliente conserve la credencial necesaria, el sistema deberá permitir recuperar su resultado registrado y liberar su apartado propio aun cuando la licencia deje de aceptar reservas, manteniendo la política vigente de privacidad y la visibilidad actual del precio.
- **RF-69.** Cuando se produzca un cambio administrativo real de licencia, cupo, estado, horario o configuración incluido en estos ajustes, el sistema deberá conservar una evidencia auditable sin secretos; una repetición sin cambio no deberá duplicar el efecto real.

## Fuera de alcance

- Cambios visuales, navegación, formularios, componentes, accesibilidad o pruebas de navegador del panel administrativo y del portal público. Las capacidades de consulta de inhabilitados y restauración se exigen al backend, no a una pantalla en esta entrega.
- Implementar el calendario administrativo, el escritor manual, cancelaciones, reprogramaciones o cambios posteriores de estado. El cupo compartido con el escritor manual queda como obligación de su futura integración.
- Confirmación por WhatsApp, mensajes a clientes, recordatorios de citas, PDF, pagos o anticipos.
- Cuentas de clientes, verificación telefónica, búsqueda pública de citas por teléfono o folio y fusión de personas por teléfono.
- Configuración de separación por servicio o profesional, visibilidad de precio por servicio, precios distintos por sucursal y nuevos límites al catálogo de servicios.
- Excepciones por fecha, descanso incrustado en una franja y una cuadrícula configurable independiente de inicios.
- Borrado físico de los cuatro tipos de recursos incluidos, limpieza de históricos, purga de auditoría o eliminación general de información de la base de datos.
- Aumentar la duración de apartados, extenderla por errores o ampliar el acceso por fallos de correo.
- Migración funcional de negocios operativos previos, dado que no existen según lo confirmado; esto no excluye verificar la evolución del esquema ni preservar las evidencias del proyecto.

## Criterios de finalización

1. **Trazabilidad y aprobación:** la versión aprobada distingue los acuerdos nuevos de las reglas conservadas y vincula cada RF con pruebas y resultados verificables. La constitución, especificaciones y tareas aplicables quedan coherentes antes de declarar terminado el ajuste; este documento por sí solo no marca tareas realizadas.
2. **Licencias y correos:** se verifican avisos de quince y siete días, ausencia del aviso de dos días, recuperación sin acumulación, suspensión de cero y treinta días, rechazo de plazos inválidos o repetidos, bloqueo exacto, vencimiento anterior, revocación, reactivación, renovación con suspensión y fallos de correo sin prolongación de acceso ni pérdida de vigencia.
3. **Cupos y recuperación de recursos:** se verifican valores iniciales, mínimo uno, permisos de superadmin, consumo solo por cuentas activas, altas y activaciones simultáneas, reducción rechazada, inhabilitación de los cuatro recursos, bloqueo de sesiones abiertas, conservación de unicidad y restauración como inactivo con reactivación validada.
4. **Precios y privacidad:** se verifica visibilidad inicial, configuración global, herencia de nuevos servicios, ausencia de importes en todas las respuestas públicas cuando se ocultan, cambios durante apartados y recuperación, acceso administrativo autorizado y conservación del costo histórico sin aceptación ficticia.
5. **Horarios y motor:** se verifica retirada de descansos y excepciones, conservación de bloqueos, unión de franjas compatibles, rechazo de separación fuera de 0–60 o no múltiplo de cinco, redondeo de todos los inicios, anticipación, libre desde cada espacio, compacta con un único inicio entre varios tramos, separación completa dentro de atención y conflictos entre sucursales con distintas zonas horarias.
6. **Apartados y carreras:** se demuestra que cambios de modo o separación conservan apartados previos; liberar una ocupación anterior no invalida el apartado posterior; inhabilitar oferta sí impide reservar; citas e intervalos protegidos se conservan, y las carreras reales contra reservas y cambios administrativos no producen empalmes, excedentes ni filas parciales. El redondeo no añade tiempo a la ocupación persistida.
7. **Cupo telefónico:** se prueban teléfonos equivalentes normalizados, dos personas con el mismo número, rechazo de la tercera cita futura en una sucursal, independencia entre sucursales, liberación exacta al inicio, exclusión de canceladas y apartados, concurrencia por el último lugar, corrección después del rechazo y repetición idempotente sin doble consumo. No se acredita el canal manual con dobles o evidencia histórica.
8. **Calidad y límites:** pasan compilación, lint y pruebas unitarias, de integración y HTTP relevantes del backend, con regresión de las reglas conservadas y verificación de esquema en bases desechables de prueba. Se documentan fallos y verificaciones diferidas, incluidas M3-I001/M2-I004 hasta disponer del escritor manual real. No se exige implementación frontend ni se declara producción habilitada o fase cerrada por terminar este documento.

## Ejemplos de aceptación

| Situación | Resultado esperado |
|---|---|
| Agenda Libre, atención desde 09:00, servicio de 30 minutos y separación 0 | Ofrecer 09:00, 09:30, 10:00… mientras quepa la atención completa. |
| Agenda Libre, servicio de 30 minutos y separación de 10 | Ofrecer 09:00, 09:40, 10:20… mientras quepan atención y separación. |
| Espacio libre desde 09:40, servicio de 30 minutos, separación 0 | Ofrecer 09:40, 10:10, 10:40… sin volver a la cuadrícula inicial de la jornada. |
| Inicio 09:00, servicio de 32 minutos y separación 0 | La ocupación termina 09:32; el siguiente inicio público es 09:35 y los tres minutos de redondeo no quedan protegidos por la cita anterior. |
| Son 09:07, anticipación 15 minutos, atención disponible | Primer inicio no anterior a 09:25, siempre que quepan servicio y separación. |
| Cierre 13:00 y separación 10 minutos | No admitir una atención que termine después de 12:50 en ese tramo. |
| Franjas 09:00–12:00 y 12:00–15:00, con mismo profesional, sucursal, día y estado | Conservar y devolver una sola franja 09:00–15:00. |
| Compacta con mañana y tarde disponibles en la misma sucursal | Ofrecer solo el primer inicio válido del día para la combinación solicitada. |
| Dos citas futuras con el mismo teléfono en sucursal A | Rechazar una tercera en A; permitir reservar en B si B tiene cupo propio y se cumplen las demás reglas. |
| Una de esas dos citas comienza exactamente ahora | Dejar de contarla en el cupo, aunque todavía esté en atención. |
| Restaurar un profesional cuando el cupo activo está completo | Restaurarlo como inactivo; rechazar su activación mientras no exista lugar. |

Los ejemplos no autorizan omitir otras condiciones de licencia, pertenencia, oferta, horario, anticipación, zona horaria o ausencia de conflictos.
