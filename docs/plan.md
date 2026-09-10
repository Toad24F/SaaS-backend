# Plan de autenticación, negocios y licencias

Lista de ejecución: [Tareas de autenticación, negocios y licencias](tareas-auth.md). Contiene 68 tareas pendientes, estimadas en menos de 30 minutos cada una, con dependencias, RF y criterios verificables de finalización.

## 1. Base y alcance

Fuentes revisadas: `docs/Constituvio.md` —nombre actual de la constitución—, `spec/spec-auth.md`, entidades del backend y esquema principal `../db/schema.sql`.

**Se conserva el modelo multi-negocio existente:** cada negocio es un tenant y sus usuarios se relacionan mediante `negocio_id`. No hace falta introducir otra entidad “tenant” ni separar bases de datos por negocio.

Esta entrega se instalará en **una base nueva**, según la decisión del usuario. No incluye migración de cuentas o negocios anteriores ni autoriza borrar bases existentes.

Comprende autenticación, recepcionistas, alta de negocios, activación, licencias y auditoría. No incluye pantallas, cobros, envío de códigos ni implementación de reservas.

**Modalidades de licencia:** manual sin vencimiento y por período mensual/anual, ambas sin límites de sucursales, servicios o usuarios. La modalidad se elige al crear y no cambia. Solo el superadmin suspende y reactiva licencias; suspender congela el tiempo restante de las licencias por período. Pausar o desactivar una licencia significa suspenderla. No hay cancelación definitiva ni suspensión independiente del negocio.

Este documento describe implementación pendiente. La actualización de sus reglas no modifica por sí sola entidades, código ni bases existentes.

## 2. Módulos y responsabilidades

| Parte | Responsabilidad y operaciones expuestas | RF cubiertos |
|---|---|---|
| **Auth**, existente | Conservar inicio de sesión y perfil; añadir cierre, cambio de contraseña y recuperación mediante código. Validar sesión, usuario, activación y licencia manual o por período en cada solicitud, incluyendo suspensión. | RF-15–27, RF-29–30, RF-37 |
| **Usuarios**, existente | Reservar correos de acceso, mantener roles y pertenencia, consultar recepcionistas propios y desactivarlos. Impedir cuentas administrativas adicionales por negocio. | RF-03, RF-05–07, RF-13, RF-19, RF-22, RF-26 |
| **Negocios**, nuevo | Mantener identidad y fecha de activación, resolver su identificador público y permitir al superadmin consultar. Alojar la entidad Negocio actualmente situada en Usuarios; retirar su control de suspensión independiente. | RF-01–04, RF-06, RF-30, RF-33–34 |
| **Licencias**, nuevo | Asignar modalidad y, si corresponde, plan; habilitar, renovar, suspender, reactivar y determinar el acceso comercial. Conservar tiempo durante la suspensión y ajustar el vencimiento al reactivar. | RF-09, RF-14, RF-28–34, RF-36–40 |
| **Codigos**, nuevo | Emitir, reemplazar, validar y consumir códigos de activación y recuperación. Guardarlos como hashes y devolver el código utilizable únicamente al emitirlo. | RF-08, RF-10–13, RF-17, RF-22–24 |
| **Altas**, nuevo | Coordinar alta de negocio, invitaciones y activaciones según modalidad y suspensión de licencia. Garantizar que negocio, cuenta pendiente, licencia, código y auditoría cambien como una sola operación. | RF-01–14, RF-27–28, RF-35–37 |
| **Auditoria**, nuevo | Registrar actor, acción, fecha, modalidad y destino de operaciones sensibles, con fechas anteriores/nuevas. No duplicar transiciones ya aplicadas ni exponer edición o eliminación de eventos. | RF-35, RF-40 |

**Dependencias:** Auth y Altas coordinan servicios de dominio. Usuarios, Negocios, Licencias y Codigos no dependen de Auth; reciben el contexto del actor ya autenticado. Auditoria no depende de los módulos anteriores. Esto evita dependencias circulares.

**Contratos compartidos:**

- El contexto autenticado contiene usuario, rol, negocio y sesión; los permisos se obtienen del estado actual del servidor.
- Los administradores operan sobre su negocio autenticado. Los identificadores enviados no conceden pertenencia.
- Activación y recuperación aceptan código y nueva contraseña; la activación también acepta nombre. No permiten elegir correo, rol o negocio.
- Las respuestas nunca incluyen hashes. Los códigos utilizables aparecen solo en la respuesta de emisión o reemplazo.
- Los errores distinguen entrada inválida, credenciales inválidas, operación prohibida, conflicto y exceso de intentos. Un recurso ajeno se presenta como no disponible.
- El alta acepta modalidad manual o por período; el plan mensual/anual es obligatorio solo para la segunda. Suspensión y reactivación operan sobre la licencia; renovación rechaza la modalidad manual. La modalidad no se modifica mediante otras operaciones.

**Cobertura:** RF-01–08, RF-10, RF-15–17, RF-22–27, RF-31, RF-33–37.

## 3. Modelo de datos: qué existe y qué falta

| Entidad | Conservar o incorporar | RF |
|---|---|---|
| **negocios** | Conservar ID, nombre, slug único y contacto. Añadir fecha de activación; su ausencia identifica un negocio pendiente. Retirar del modelo objetivo el estado activo/suspendido independiente; la licencia administra el bloqueo comercial. | RF-01–04, RF-09, RF-14, RF-30–34 |
| **usuarios** | Conservar relación con negocio, correo único, rol y activo. Añadir fecha de activación. Nombre y contraseña pueden estar ausentes únicamente mientras la cuenta esté pendiente; nunca utilizar contraseñas ficticias. | RF-03, RF-05–08, RF-13, RF-15–16, RF-19, RF-21–27 |
| **licencias** | Nueva relación uno a uno con negocio: modalidad manual o por período; plan mensual/anual obligatorio solo para la segunda; habilitada_en, vence_en y suspendida_en. Habilitación y vencimiento están vacíos antes de activar; en manual, plan y vencimiento siempre están vacíos. suspendida_en indica una suspensión vigente y registra su inicio. | RF-02, RF-09, RF-14, RF-28–34, RF-36–40 |
| **codigos_acceso** | Nueva: cuenta destinataria, propósito, hash único, emisión, vencimiento, consumo, invalidación y emisor. Mantener historial de códigos reemplazados. | RF-08–14, RF-22–24, RF-27 |
| **sesiones** | Nueva: identificador único, usuario, creación, vencimiento y revocación. Permite retirar una sesión o todas las del usuario. | RF-15, RF-18–20, RF-24–25 |
| **eventos_auditoria** | Nueva: actor, negocio/cuenta/licencia destino, acción, fecha y cambios relevantes, incluidos modalidad, plan y vencimiento anterior/nuevo. Excluir secretos y transiciones duplicadas. | RF-35, RF-40 |
| **limites_intentos** | Nueva tabla operativa: origen, inicio de ventana, contador y bloqueo hasta. Compartida entre procesos para impedir que reiniciar o distribuir peticiones eluda el límite. | RF-17 |

**Invariantes:**

- Correo normalizado y único globalmente, también para cuentas pendientes. Se reserva al invitar para evitar conflictos durante la activación.
- Solo el superadmin tiene `negocio_id` vacío. Administradores y recepcionistas siempre pertenecen a un negocio.
- Como máximo un administrador por negocio, contando cuentas pendientes.
- Un código pertenece a una cuenta y un propósito; no sirve indistintamente para activar y recuperar.
- Una cuenta pendiente no inicia sesión. Activarla establece nombre, contraseña y fecha de activación.
- Suspender, vencer o desactivar no elimina registros.
- La licencia manual no vence ni se renueva. En modalidad por período, una suspensión conserva tiempo: no se evalúa su vencimiento registrado como si el tiempo siguiera corriendo.
- La fecha de habilitación distingue una licencia pendiente de una habilitada, incluso si es manual. Reactivar no habilita una licencia pendiente ni activa cuentas.
- La suspensión pertenece únicamente a la licencia; el usuario conserva su estado activo/inactivo y el negocio su fecha de activación.
- Las relaciones nuevas deben preservar la pertenencia al negocio; no basta con verificar que los identificadores existan.

La cuenta pendiente es una reserva de identidad, sin acceso; la activación completa su alta. Esto evita introducir un segundo registro de correos reservado a invitaciones.

**Coherencia del esquema:** actualizar entidades y esquema principal conjuntamente. No adoptar el esquema del prototipo como fuente adicional. Las relaciones de citas actuales también requieren refuerzo de pertenencia, pero ese cambio se abordará con el módulo de reservas.

## 4. Decisiones justificadas y alternativas descartadas

| Decisión | Justificación y alternativa descartada | RF |
|---|---|---|
| **Una base compartida con `negocio_id`** | Extiende el diseño existente. Se descarta una base por negocio porque añade administración sin una necesidad establecida. | RF-05–07 |
| **Cuenta pendiente para reservar el correo** | La misma restricción de unicidad protege altas e invitaciones. Se descartan registros de invitación con correos independientes, que podrían competir con cuentas ya creadas. | RF-02–03, RF-08–13 |
| **JWT acompañado de sesión persistida** | Conserva la autenticación actual y permite revocación inmediata. Se descarta depender exclusivamente de la caducidad del JWT. No se añaden tokens de renovación. | RF-15, RF-18–20, RF-24–25 |
| **Estado de acceso evaluado en cada solicitud** | Combina cuenta activa, activación completada y licencia habilitada no suspendida: manual sin vencimiento o por período vigente. Se descarta confiar en permisos antiguos del token o en una tarea periódica que marque vencimientos. | RF-14–15, RF-19, RF-26, RF-29–34, RF-37 |
| **Transacciones y bloqueo de registros** | Activación, reemplazo de códigos, recuperación, renovación, suspensión y reactivación deben protegerse frente a solicitudes simultáneas. Se descarta “consultar y después guardar” sin coordinación. | RF-03, RF-09–12, RF-23–25, RF-31–35, RF-38–40 |
| **Contraseñas con bcrypt; códigos aleatorios almacenados como hash** | Mantiene las contraseñas existentes y permite entregar códigos manualmente sin conservarlos utilizables. Se descarta almacenar secretos legibles. No se permitirá truncamiento silencioso de contraseñas. | RF-08, RF-13, RF-21–27, RF-35 |
| **Meses/años calendario en Chihuahua** | Respeta el período acordado. Se descartan equivalencias de 30 o 365 días. Los instantes se almacenan en UTC y el cálculo calendario utiliza Chihuahua. | RF-20, RF-23, RF-28–31 |
| **Licencia única con historial en auditoría** | Mantiene una licencia por negocio y evidencia de renovaciones y reactivaciones, sin cancelación definitiva. Se descartan licencias superpuestas o crear una nueva por cada reactivación. No hace falta un catálogo de precios o límites. | RF-28–40 |
| **Dos modalidades explícitas** | Diferencia acceso indefinido y tiempo contratado. Se descarta simular licencias manuales con fechas lejanas. La modalidad queda fijada al crear. | RF-01–02, RF-36–37 |
| **Suspensión exclusivamente en la licencia** | Mantiene un solo control administrativo del acceso comercial. Se descartan bloqueos independientes en negocio y licencia. | RF-04, RF-14–15, RF-26, RF-33–34 |
| **Congelar tiempo durante la suspensión** | Conserva el período pendiente de uso. Se descarta mantener el vencimiento original después de reactivar sin compensar la pausa. | RF-32, RF-38–39 |
| **Registrar cuándo comenzó la suspensión** | Permite calcular su duración y ajustar el vencimiento una sola vez al reactivar. Se descarta descontar o devolver tiempo mediante procesos diarios. | RF-35, RF-38–40 |
| **Límite compartido en MariaDB** | Aprovecha la base existente y mantiene cinco intentos conjuntos por minuto para login y validación de códigos. Se descartan contadores solo en memoria y añadir Redis en esta entrega. El sexto intento bloquea un minuto. | RF-17 |
| **Auditoría dentro de la operación** | Evita cambios sensibles sin evidencia. Si no puede registrarse el evento, la operación no se confirma. Repetir una transición ya aplicada no genera otro evento de cambio. Se descartan logs de aplicación como único historial. | RF-35, RF-40 |

**Reglas de transición:**

- Antes de activar, la licencia está asignada pero no habilitada y no corre el tiempo. Suspenderla impide usar el código; reactivarla retira la suspensión sin iniciar vigencia ni acumular tiempo. La primera activación habilita la licencia y solo en modalidad por período fija vencimiento.
- El código mantiene sus 48 horas aunque la licencia esté suspendida; si caduca, debe reemitirse. No se extiende junto con el período contratado.
- Las licencias manuales y las aún no habilitadas no se renuevan. Se rechaza suspender una licencia por período ya vencida que no estuviera suspendida; debe renovarse antes y no recupera tiempo consumido.
- Renovar una licencia por período habilitada no suspendida añade el período desde el vencimiento vigente o desde el momento actual si ya venció. Renovar durante una suspensión añade el mes/año calendario desde el vencimiento conservado, aunque esa fecha ya haya pasado, sin levantar el bloqueo ni reiniciar suspendida_en.
- Al suspender una licencia por período vigente se registra suspendida_en y se conserva vence_en; el tiempo disponible deja de consumirse. Una nueva solicitud de suspensión no reemplaza ese inicio.
- Al reactivar una licencia por período habilitada se desplaza vence_en, incluyendo renovaciones, por el tiempo transcurrido desde suspendida_en y se limpia suspendida_en. Una licencia manual o pendiente solo retira la suspensión, sin crear ni desplazar vencimiento.
- Reactivar una licencia no suspendida no cambia fechas ni recupera una licencia vencida. Las pausas sucesivas se calculan desde su propio inicio y ninguna repetición duplica tiempo o eventos.
- Suspender, reactivar y renovar concurrentemente deben equivaler a un orden serial sobre la licencia, sin perder ni duplicar tiempo. El ajuste de fechas y la auditoría se confirman juntos.
- Recuperar contraseña no reactiva cuentas ni levanta la suspensión o el vencimiento de licencias. El superadmin puede autorizar recuperación de un administrador bloqueado.
- Logout permite revocar una sesión reconocida aunque el negocio haya quedado bloqueado.
- Cuando recuperación o cambio de contraseña coincidan con un login, la coordinación por usuario debe impedir que sobreviva una sesión creada con la contraseña anterior.

**Cobertura:** RF-09–14, RF-18–19, RF-24–26, RF-28–40.

## 5. Estrategia de tests y orden de entrega

### Pruebas por comportamiento

| Grupo | Escenarios mínimos | RF |
|---|---|---|
| **Altas y permisos** | Roles permitidos/prohibidos; IDs de otro negocio; correo y slug duplicados, también concurrentemente; rollback del alta; invitación y desactivación propias; modalidad elegida al crear e inmutable; plan exigido solo por período. | RF-01–07, RF-13, RF-36 |
| **Activación** | Código correcto, incorrecto, vencido justo en el límite, consumido y reemplazado; licencia suspendida antes de activar y código que vence durante esa suspensión; reactivación sin iniciar período; dos activaciones simultáneas con un solo resultado; activación frente a reemisión. | RF-08–14, RF-27–28, RF-37 |
| **Sesiones** | Credenciales válidas e inválidas; cuenta pendiente/inactiva; mensajes uniformes; sexto intento y desbloqueo; logout; caducidad exacta; permisos o licencia cambiados con sesión abierta y bloqueo desde la siguiente solicitud. | RF-15–20, RF-33 |
| **Contraseñas** | Longitud mínima; contraseña actual incorrecta; emisor autorizado; recuperación propia/ajena; reemplazo y consumo simultáneo; revocación de todas las sesiones; conservación de bloqueos. | RF-21–27 |
| **Licencias manuales** | Activación; acceso sin vencimiento; suspensión y reactivación sin fechas de período; rechazo de renovación; modalidad inmutable; conservación de datos. | RF-09, RF-30, RF-33–37 |
| **Licencias por período** | Mensual/anual; fin de mes y 29 de febrero; vencimiento exacto; renovación temprana/tardía; congelación exacta; pausa prolongada más allá del vencimiento registrado; pausas sucesivas; renovación durante pausa sin levantarla; desplazamiento del vencimiento; rechazo de suspensión ya vencida. | RF-28–34, RF-38–39 |
| **Concurrencia de licencias** | Doble suspensión, doble reactivación y cruces con renovación; un único efecto por transición; equivalencia con ejecución serial; ningún reinicio del inicio de pausa, pérdida o duplicación de tiempo. | RF-31–35, RF-38–40 |
| **Auditoría** | Actor y destino correctos; modalidad, fechas anteriores/nuevas y cambios de licencia; ausencia de secretos; ningún evento duplicado de transición; rollback al fallar el registro del evento. | RF-35, RF-40 |

### Niveles y ejecución

1. **Restablecer el entorno de pruebas.** Resolver la carga ESM de Jest sin cambiar el stack y completar los dobles de dependencias ausentes. Las cinco suites fallaron durante la revisión anterior; no constituyen evidencia de aceptación.
2. **Pruebas unitarias.** Reloj controlado para vencimientos; matriz de permisos; política de acceso, períodos y contraseñas. No depender de esperas reales.
3. **Integración en MariaDB desechable.** Verificar restricciones, persistencia, rollback y concurrencia mediante conexiones independientes. No sustituirlas por SQLite ni por repositorios simulados.
4. **Pruebas HTTP.** Aplicar las mismas validaciones y protecciones que en la aplicación real. Cubrir alta → activación → login → recepcionista → recuperación → suspensión/reactivación para ambas modalidades, y renovación para licencias por período. Verificar solo superadmin, conservación de bloqueos al recuperar contraseña y rechazo de cambios de modalidad.
5. **Instalación nueva.** Preparar migraciones iniciales y verificar coherencia con el esquema SQL. Utilizar migraciones en pruebas y producción; conservar sincronización automática únicamente para desarrollo. No conectar las pruebas a la base cotidiana.

**Orden de implementación posterior:** entorno de pruebas → modelo y restricciones → licencias/códigos/auditoría → altas y usuarios → sesiones y recuperación → pruebas integrales.

**Límite de aceptación de reservas:** RF-29 y RF-33 se prueban ahora sobre la política reutilizable que autoriza operar. Como todavía no existe el backend de reservas, bloquear una confirmación real permanece como integración pendiente; no se declarará ese escenario completo basándose únicamente en pruebas de autenticación.

**Finalización:** compilación, lint, pruebas unitarias y de integración aprobados; RF-01–40 vinculados a evidencia o a la limitación anterior; instalación verificada en base nueva y ninguna modificación a datos existentes. La finalización de esta actualización documental requiere coherencia entre especificación, plan, constitución e instrucciones; no implica que las funciones o sus pruebas ya estén implementadas.
