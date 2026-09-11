# Tareas de autenticación, negocios y licencias anuales

Basado en [plan.md](plan.md), [spec-auth.md](../spec/spec-auth.md) y [Constitución](Constitución.md).

**Estado: 75 tareas; 7 completadas (T01–T07) y 68 pendientes.** Los identificadores se conservan. Las nuevas T69–T75 se ubican por dependencia, por lo que el orden numérico no siempre coincide con el orden de ejecución. Las duraciones son estimaciones de trabajo activo inferiores a 30 minutos; si una tarea requiere más tiempo, se subdivide sin marcarla parcialmente completada.

**Alcance:** implementación posterior de backend sobre base nueva, con datos desechables exclusivos para pruebas. Sin borrar bases existentes, implementar pantallas o construir reservas. La actualización de esta lista es documental: no ejecuta las tareas pendientes ni acredita sus criterios.

**Avance conservado:** [evidencia T01–T05](results/resultados-t01-t05.md), [T06](results/resultados-t06.md) y [T07](results/resultados-t07.md). Las referencias RF de esos informes corresponden a la especificación histórica y no se reescriben. Aquí se utiliza la cobertura vigente RF-01–RF-38; T01–T07 acreditan infraestructura, no todos los comportamientos asociados.

**Reglas confirmadas:** licencia anual automática, aislamiento por negocio_id, suspensión exclusivamente en licencia y recuperación autorizada solo por superadmin para administradores. RF-20 permite terminar atómicamente una operación ya autorizada y rechaza las solicitudes nuevas al expirar la sesión. Activación y reemisión se serializan por orden de bloqueo de base de datos.

## 1. Preparación y modelo de datos

- [X] **T01 — Identificar el bloqueo de Jest** · 15 min · RF: soporte transversal RF-01–38 · Depende de: ninguna.
  **Hecho cuando:** se reproduce y documenta el error de carga ESM con una suite mínima, identificando la configuración involucrada.

- [X] **T02 — Corregir la configuración de pruebas** · 25 min · RF: soporte transversal RF-01–38 · Depende de: T01.
  **Hecho cuando:** una prueba que utiliza NestJS carga y ejecuta sus assertions sin errores ESM.

- [X] **T03 — Completar dependencias de las pruebas existentes** · 20 min · RF: RF-15–16, RF-19 · Depende de: T02.
  **Hecho cuando:** las suites actuales ejecutan sus casos sin fallar por servicios o repositorios no registrados.

- [X] **T04 — Aislar la configuración de la base de pruebas** · 20 min · RF: soporte transversal RF-01–38 · Depende de: T02.
  **Hecho cuando:** el entorno exige una base exclusiva de pruebas y rechaza conectarse con una configuración no identificada como tal.

- [X] **T05 — Preparar el ejecutor de integración** · 25 min · RF: RF-03, RF-11, RF-38 · Depende de: T04.
  **Hecho cuando:** una prueba abre dos conexiones independientes a MariaDB y cierra ambas sin dejar recursos abiertos.

- [X] **T06 — Preparar reloj y datos de prueba reutilizables** · 20 min · RF: RF-06, RF-10, RF-20, RF-23, RF-28 · Depende de: T03.
  **Hecho cuando:** las pruebas pueden fijar el tiempo y generar dos negocios con sus usuarios sin compartir identificadores.

- [X] **T07 — Declarar los módulos y sus dependencias** · 20 min · RF: RF-01–38 · Depende de: T03.
  **Hecho cuando:** Auth, Usuarios, Negocios, Licencias, Codigos, Altas y Auditoria pueden componerse sin dependencias circulares.

- [ ] **T70 — Preparar configuración de migraciones y producción** · 25 min · RF: soporte transversal RF-01–38 · Depende de: T04, T07.
  **Hecho cuando:** existe una configuración DataSource y comandos de migración para la instalación nueva y pruebas, con synchronize deshabilitado en producción y tests; se conserva el aislamiento TEST_DB_* y no se ejecutan migraciones al importar módulos.

- [ ] **T08 — Ajustar la entidad Negocio** · 20 min · RF: RF-01–02, RF-09, RF-33–34 · Depende de: T07.
  **Hecho cuando:** el modelo conserva identidad y contacto, incorpora activación, aloja Negocio en su módulo y deja de administrar una suspensión independiente; se actualizan los imports afectados.

- [ ] **T09 — Representar usuarios pendientes de activación** · 25 min · RF: RF-03, RF-05–08, RF-13, RF-15 · Depende de: T08.
  **Hecho cuando:** una cuenta pendiente reserva su correo normalizado y puede carecer de nombre y contraseña, sin representarse como activada.

- [ ] **T10 — Definir la entidad Licencia anual** · 25 min · RF: RF-02, RF-09, RF-28–34, RF-36–38 · Depende de: T08.
  **Hecho cuando:** se representa una licencia por negocio con habilitación, vencimiento y suspensión, sin modalidad ni plan; habilitación y vencimiento están nulos antes de activar.

- [ ] **T11 — Definir códigos de acceso** · 20 min · RF: RF-08–14, RF-22–24 · Depende de: T09.
  **Hecho cuando:** el modelo relaciona cuenta, propósito, hash, emisor, expiración, consumo e invalidación sin almacenar el código utilizable.

- [ ] **T12 — Definir sesiones persistidas** · 15 min · RF: RF-15, RF-18–20, RF-24–25 · Depende de: T09.
  **Hecho cuando:** cada sesión tiene identificador único, usuario, creación, vencimiento y revocación; el JWT puede identificar la sesión persistida.

- [ ] **T13 — Definir eventos de auditoría** · 20 min · RF: RF-35, RF-38 · Depende de: T09, T10.
  **Hecho cuando:** el modelo admite actor, negocio/cuenta/licencia destino, acción y valores anteriores/nuevos, sin modalidades ni campos para secretos.

- [ ] **T14 — Definir el contador compartido de intentos** · 15 min · RF: RF-17 · Depende de: T07.
  **Hecho cuando:** se representan IP, ventana, contador y bloqueo hasta, con un único registro coordinable por IP compartido entre login y validación de códigos.

- [ ] **T69 — Adaptar fixtures y pruebas al nuevo modelo** · 25 min · RF: RF-06, RF-14–15, RF-28 · Depende de: T06–T10.
  **Hecho cuando:** las fixtures en memoria representan negocio activado, cuentas pendientes/activadas y licencia anual con sus estados; las pruebas existentes dejan de depender de EstadoNegocio y mantienen aislamiento. Se conserva T06 completada como antecedente.

- [ ] **T15 — Preparar migración de negocios y usuarios** · 25 min · RF: RF-01–08, RF-13 · Depende de: T05, T09, T70.
  **Hecho cuando:** la migración inicial crea negocios y usuarios; MariaDB rechaza correos normalizados duplicados, roles sin pertenencia válida y dos administradores del mismo negocio, incluidas cuentas pendientes.

- [ ] **T16 — Preparar migración de licencias** · 20 min · RF: RF-02, RF-09, RF-28, RF-36–38 · Depende de: T10, T15.
  **Hecho cuando:** la base admite una licencia anual por negocio; rechaza habilitación sin vencimiento o vencimiento sin habilitación y fechas de suspensión incompatibles, sin columnas de modalidad o plan.

- [ ] **T17 — Preparar migración de códigos y sesiones** · 25 min · RF: RF-08–12, RF-18–25 · Depende de: T11, T12, T15.
  **Hecho cuando:** las tablas y relaciones se crean y rechazan códigos o sesiones vinculados a cuentas inexistentes; el código conserva propósito, historial y hash único.

- [ ] **T18 — Preparar migración de auditoría e intentos** · 20 min · RF: RF-17, RF-35, RF-38 · Depende de: T13, T14, T16.
  **Hecho cuando:** ambas tablas se crean con sus restricciones e índices; se rechazan destinos de auditoría incompatibles con su negocio y se coordina un contador por IP.

- [ ] **T71 — Ampliar el ejecutor de integración para persistencia** · 25 min · RF: RF-03, RF-06, RF-11, RF-35, RF-38 · Depende de: T05, T15–T18.
  **Hecho cuando:** las pruebas usan entidades y migraciones de la entrega, IDs asignados por MariaDB y dos conexiones independientes; preparan y limpian exclusivamente sus datos de prueba y cierran conexiones incluso al fallar. T05 permanece completada como infraestructura previa.

- [ ] **T19 — Sincronizar y versionar el SQL de referencia** · 25 min · RF: RF-01–38 · Depende de: T15–T18.
  **Hecho cuando:** db/schema.sql dentro del backend refleja las mismas tablas, columnas y restricciones de auth que entidades y migraciones; retira modalidades y ajusta RF. Se modifica la exclusión de Git solo para versionar ese archivo, sin incluir datos ni secretos; ../db/schema.sql queda como antecedente.

## 2. Reglas y servicios compartidos

- [ ] **T20 — Centralizar la política de contraseñas** · 20 min · RF: RF-21, RF-27 · Depende de: T06.
  **Hecho cuando:** pruebas verifican el mínimo de 12 caracteres, hash y comparación, sin truncamiento silencioso.

- [ ] **T21 — Calcular años calendario en Chihuahua** · 25 min · RF: RF-28, RF-31 · Depende de: T06.
  **Hecho cuando:** pruebas de aniversario, fin de mes, 29 de febrero y reglas de America/Chihuahua producen vencimientos correctos almacenados en UTC; las renovaciones sucesivas suman un año desde su base, sin usar 365 días ni offset fijo.

- [ ] **T22 — Definir la política de acceso por licencia** · 25 min · RF: RF-14–15, RF-29–30, RF-33–34 · Depende de: T06, T10, T69.
  **Hecho cuando:** una matriz cubre pendiente, vigente, vencida y suspendida, junto con cuenta activa/activada y negocio activado; una suspensión prolongada no consume el tiempo conservado.

- [ ] **T23 — Registrar auditoría dentro de transacciones** · 20 min · RF: RF-35 · Depende de: T18.
  **Hecho cuando:** un evento conserva actor y destino y un fallo de registro provoca rollback de la operación que lo incluye.

- [ ] **T24 — Emitir códigos y mostrar su valor una sola vez** · 25 min · RF: RF-08, RF-13, RF-22–23 · Depende de: T17, T23.
  **Hecho cuando:** activación recibe 48 horas, recuperación 30 minutos y la persistencia contiene únicamente hashes de códigos aleatorios; cada código queda vinculado a destinatario, propósito y emisor y se muestra solo en la respuesta de emisión.

- [ ] **T25 — Validar y consumir códigos** · 25 min · RF: RF-08–11, RF-24 · Depende de: T24.
  **Hecho cuando:** se rechazan propósito incorrecto, vencimiento exacto, invalidación y reutilización; el estado se revalida bajo bloqueo y el consumo comparte la transacción de la operación.

- [ ] **T26 — Reemplazar códigos pendientes** · 20 min · RF: RF-12, RF-23 · Depende de: T25.
  **Hecho cuando:** emitir el reemplazo invalida el anterior sin cambiar destinatario ni iniciar la licencia; usa el bloqueo de cuenta/código compatible con el consumo y rechaza reemisión inicial si la cuenta ya se activó.

- [ ] **T27 — Aplicar el límite compartido de intentos** · 25 min · RF: RF-17 · Depende de: T06, T18.
  **Hecho cuando:** @nestjs/throttler utiliza almacenamiento MariaDB y una clave conjunta por IP para login y validación de códigos; el sexto intento bloquea un minuto, los bloqueados no prolongan la ventana y otra IP tiene su propio límite.

- [ ] **T28 — Crear y revocar sesiones** · 25 min · RF: RF-18, RF-20, RF-24–25 · Depende de: T06, T17.
  **Hecho cuando:** pruebas verifican duración exacta de una hora desde el inicio, sin extensión deslizante ni refresh tokens, revocación individual y revocación de todas las sesiones de una cuenta.

- [ ] **T29 — Consultar usuarios con pertenencia validada** · 20 min · RF: RF-05–07 · Depende de: T15.
  **Hecho cuando:** un administrador encuentra sus recepcionistas y recibe recurso no disponible al consultar uno de otro negocio.

- [ ] **T30 — Aplicar permisos por rol** · 20 min · RF: RF-04–07, RF-22 · Depende de: T06, T29.
  **Hecho cuando:** una matriz prueba operaciones exclusivas del superadmin, operaciones propias del administrador y rechazo del recepcionista; solo superadmin puede autorizar recuperación y solo de cuentas de administrador.

## 3. Casos de uso

- [ ] **T31 — Crear negocio con licencia y administrador pendiente** · 25 min · RF: RF-01–04, RF-35 · Depende de: T16, T23, T24, T30.
  **Hecho cuando:** una operación válida crea negocio, administrador pendiente, licencia anual y código con auditoría, rechaza duplicados sin altas parciales y no recibe modalidad ni período.

- [ ] **T32 — Invitar recepcionistas** · 25 min · RF: RF-03, RF-05–07, RF-13 · Depende de: T22, T24, T29, T30.
  **Hecho cuando:** un administrador autorizado reserva el correo y obtiene un código ligado exclusivamente a su negocio y al rol recepcionista.

- [ ] **T33 — Activar al primer administrador** · 25 min · RF: RF-08–11, RF-14, RF-27–28, RF-35 · Depende de: T20–T25, T31.
  **Hecho cuando:** establecer nombre y contraseña consume el código, activa cuenta y negocio e inicia un año calendario de licencia en una transacción; una suspensión previa impide la activación.

- [ ] **T34 — Activar recepcionistas** · 20 min · RF: RF-08, RF-10–11, RF-13–14, RF-27 · Depende de: T20, T22, T25, T32.
  **Hecho cuando:** la cuenta se activa solo con código válido, licencia habilitada, vigente y no suspendida; no cambia correo, negocio, rol ni vigencia de licencia.

- [ ] **T35 — Completar el inicio de sesión** · 25 min · RF: RF-15–16, RF-20 · Depende de: T20, T22, T28, T33.
  **Hecho cuando:** credenciales válidas producen sesión persistida y token; cuentas pendientes, inactivas o sin acceso son rechazadas y los errores de credenciales son uniformes.

- [ ] **T36 — Validar sesión y permisos actuales en JWT** · 25 min · RF: RF-15, RF-19–20, RF-29, RF-33 · Depende de: T22, T28, T35.
  **Hecho cuando:** cada solicitud protegida consulta sesión, cuenta y licencia actuales; devuelve 401 si sesión está revocada/vencida, cuenta desactivada o licencia bloqueada, usando permisos actuales y sin interrumpir por expiración una operación previamente autorizada.

- [ ] **T37 — Cerrar sesión aunque la licencia esté bloqueada** · 20 min · RF: RF-18, RF-33 · Depende de: T28, T36.
  **Hecho cuando:** logout revoca una sesión reconocida incluso con licencia suspendida, y reutilizarla falla.

- [ ] **T38 — Desactivar recepcionistas propios** · 20 min · RF: RF-05–07, RF-19, RF-30 · Depende de: T29, T30, T36.
  **Hecho cuando:** el administrador desactiva únicamente cuentas permitidas, conserva los registros y la siguiente solicitud autenticada del recepcionista desactivado es rechazada.

- [ ] **T39 — Autorizar recuperación de administradores** · 25 min · RF: RF-22–23, RF-26, RF-35 · Depende de: T23, T26, T30.
  **Hecho cuando:** solo el superadmin emite recuperación para una cuenta de administrador, incluso desactivada o bloqueada por licencia; rechaza otros emisores y destinatarios, invalida el código anterior y audita sin levantar restricciones.

- [ ] **T40 — Recuperar contraseña y retirar sesiones** · 25 min · RF: RF-23–24, RF-26–27 · Depende de: T20, T25, T28, T39.
  **Hecho cuando:** un código válido cambia la contraseña, se consume y revoca todas las sesiones sin activar cuentas ni levantar restricciones de licencia.

- [ ] **T41 — Cambiar contraseña con sesión iniciada** · 25 min · RF: RF-21, RF-25, RF-27 · Depende de: T20, T28, T36.
  **Hecho cuando:** se exige la contraseña actual, la nueva cumple la política y todas las sesiones anteriores quedan inutilizables.

- [ ] **T42 — Suspender licencias** · 25 min · RF: RF-04, RF-33, RF-35–36, RF-38 · Depende de: T16, T22, T23, T30.
  **Hecho cuando:** registra el inicio de suspensión una sola vez y conserva el vencimiento; admite pendientes sin generar tiempo, rechaza licencias vencidas no suspendidas y no duplica eventos al repetir.

- [ ] **T43 — Reactivar licencias** · 25 min · RF: RF-34–35, RF-37–38 · Depende de: T42.
  **Hecho cuando:** para una licencia habilitada suma al vencimiento conservado la duración exacta de suspensión y limpia su inicio; pendientes solo retiran la suspensión; repetir no añade tiempo, activa cuentas ni duplica eventos.

- [ ] **T44 — Renovar licencias anuales** · 25 min · RF: RF-31–32, RF-35, RF-37 · Depende de: T21, T23, T42.
  **Hecho cuando:** añade un año desde vencimiento vigente, instante actual si venció o vencimiento conservado si suspendida; mantiene suspensión e inicio de pausa, acumula renovaciones y rechaza licencias pendientes.

## 4. Operaciones HTTP y pruebas de integración

- [ ] **T45 — Exponer login, perfil y logout** · 25 min · RF: RF-15–20 · Depende de: T27, T35–T37.
  **Hecho cuando:** conserva POST /auth/login y GET /auth/profile y expone logout; pruebas HTTP verifican respuestas sin hashes, entradas válidas, errores uniformes, bloqueo de intentos y rechazo de tokens revocados o vencidos.

- [ ] **T46 — Exponer activación y recuperación** · 25 min · RF: RF-08–14, RF-17, RF-23–24, RF-27 · Depende de: T27, T33–T34, T40.
  **Hecho cuando:** las rutas aceptan solo código y contraseña, más nombre al activar; comparten límite por IP, rechazan campos de destinatario/rol/negocio y aplican Guards y validaciones equivalentes a producción.

- [ ] **T47 — Exponer alta y consulta administrativa de negocios** · 25 min · RF: RF-01–04, RF-30 · Depende de: T30, T31, T36.
  **Hecho cuando:** solo superadmin crea o consulta negocios globalmente y puede consultar uno bloqueado sin revelar secretos; el alta asigna licencia anual y rechaza campos de modalidad o período.

- [ ] **T48 — Exponer administración de recepcionistas y reemisión inicial** · 25 min · RF: RF-04–07, RF-12–13, RF-19 · Depende de: T26, T30, T32, T36, T38.
  **Hecho cuando:** cada operación exige el rol y pertenencia correctos; reemitir el código inicial no modifica destinatario ni habilita la licencia.

- [ ] **T49 — Exponer cambio de contraseña y autorización de recuperación** · 20 min · RF: RF-21–27 · Depende de: T36, T39, T41.
  **Hecho cuando:** pruebas HTTP verifican contraseña actual, retiro de sesiones y autorización de recuperación exclusiva del superadmin para administradores; no se expone recuperación de recepcionistas.

- [ ] **T50 — Exponer suspensión, reactivación y renovación** · 25 min · RF: RF-04, RF-31–38 · Depende de: T36, T42–T44.
  **Hecho cuando:** solo superadmin ejecuta las operaciones sobre la licencia; conflictos de estado producen 409 y no se exponen selección de modalidad/período, cancelación definitiva ni suspensión del negocio.

- [ ] **T51 — Probar aislamiento entre dos negocios** · 25 min · RF: RF-04–07, RF-13, RF-22 · Depende de: T47–T50.
  **Hecho cuando:** con dos negocios, consultas y desactivaciones ajenas se rechazan sin alterar registros; invitaciones no pueden elegir otro negocio. Un administrador no autoriza recuperación de ninguna cuenta y el recepcionista no administra permisos.

- [ ] **T52 — Probar consumo concurrente de activación** · 25 min · RF: RF-03, RF-09–11, RF-35 · Depende de: T33–T34, T71.
  **Hecho cuando:** dos conexiones con el mismo código producen una única activación, consumo y evento; el código inicial habilita una única licencia y el de recepcionista no modifica la vigencia, sin registros parciales.

- [ ] **T53 — Probar reemplazo frente a consumo de código** · 25 min · RF: RF-10–12, RF-23–24 · Depende de: T26, T33, T40, T71.
  **Hecho cuando:** se prueban ambos órdenes del bloqueo: reemplazo primero invalida el código anterior; activación primero impide reemisión inicial. Reemplazo/consumo de recuperación se serializan y ningún código invalidado completa una operación posterior.

- [ ] **T54 — Probar login frente a cambio o recuperación de contraseña** · 25 min · RF: RF-15, RF-24–25 · Depende de: T35, T40–T41, T71.
  **Hecho cuando:** después del cambio no sobrevive una sesión creada concurrentemente mediante la contraseña anterior.

- [ ] **T55 — Probar doble suspensión y doble reactivación** · 25 min · RF: RF-35–38 · Depende de: T42–T43, T71.
  **Hecho cuando:** operaciones concurrentes no reinician la pausa, duplican tiempo ni generan dos eventos para una misma transición.

- [ ] **T56 — Probar renovaciones concurrentes y cruces de licencia** · 25 min · RF: RF-31–32, RF-35, RF-37–38 · Depende de: T42–T44, T71.
  **Hecho cuando:** dos renovaciones distintas suman dos años sin sobrescribirse; renovación cruzada con suspensión/reactivación produce estado, vencimiento y auditoría equivalentes a un orden serial, sin pérdida ni duplicación de tiempo.

- [ ] **T57 — Probar rollback de operaciones sensibles** · 25 min · RF: RF-03, RF-09, RF-24, RF-35 · Depende de: T31, T33, T40, T42–T44, T71.
  **Hecho cuando:** fallos provocados antes de confirmar revierten altas, consumo de códigos, cambios de contraseña y modificaciones de licencia junto con su auditoría.

- [ ] **T58 — Probar el recorrido HTTP de licencia anual** · 25 min · RF: RF-01–02, RF-09, RF-15, RF-28, RF-30–34 · Depende de: T45–T50.
  **Hecho cuando:** alta, activación, login, renovación, suspensión y reactivación funcionan por HTTP con licencia anual; se rechazan modalidades y períodos enviados por el cliente y se conservan los datos durante bloqueos.

- [ ] **T59 — Probar vencimientos y tiempo conservado** · 25 min · RF: RF-28–34, RF-36–37 · Depende de: T45, T46, T50.
  **Hecho cuando:** con reloj controlado se verifican vencimiento exacto, renovación anticipada/tardía, pausas sucesivas y prolongadas, renovación suspendida y restitución exacta del tiempo, también alrededor de aniversarios bisiestos.

- [ ] **T60 — Probar suspensión antes de activar** · 20 min · RF: RF-09–14, RF-34 · Depende de: T46, T48, T50.
  **Hecho cuando:** suspender impide activar, el código sigue caducando a las 48 horas y reactivar no inicia vigencia ni rehabilita códigos vencidos.

- [ ] **T72 — Probar expiración durante una operación autorizada** · 25 min · RF: RF-19–20 · Depende de: T36, T57.
  **Hecho cuando:** una operación admitida antes de cumplir la hora termina atómicamente aunque expire la sesión durante su ejecución; una nueva solicitud se rechaza con 401 en el límite exacto y un fallo de la operación revierte todas sus escrituras.

- [ ] **T73 — Probar límite conjunto por IP y concurrencia** · 25 min · RF: RF-17 · Depende de: T27, T45–T46, T71.
  **Hecho cuando:** login, activación y recuperación comparten los cinco intentos; solicitudes concurrentes por la misma IP no eluden el límite, el sexto bloquea un minuto sin prolongación por intentos bloqueados, otra IP permanece independiente y se verifica el desbloqueo exacto.

- [ ] **T74 — Probar altas concurrentes con identidad duplicada** · 25 min · RF: RF-01–03, RF-35 · Depende de: T31, T47, T71.
  **Hecho cuando:** dos altas con slug o correo normalizado duplicado aceptan como máximo una; no quedan negocio, licencia, cuenta, código ni auditoría de un alta rechazada, incluidos correos distintos solo en mayúsculas o espacios.

- [ ] **T75 — Probar bloqueos en todos los endpoints protegidos** · 25 min · RF: RF-04–07, RF-14–16, RF-18–19, RF-26, RF-29–30, RF-33–34 · Depende de: T45–T50, T71.
  **Hecho cuando:** una matriz de rutas verifica 401 tras desactivar la cuenta, suspender o vencer la licencia con sesión abierta, 403 por rol y 404 por recurso ajeno. También verifica logout con licencia bloqueada y gestión del superadmin; recuperar contraseña conserva bloqueos. No acredita confirmaciones de reservas reales.

## 5. Instalación, verificación y cierre

- [ ] **T61 — Verificar instalación desde cero** · 25 min · RF: RF-01–38 · Depende de: T19, T50, T70–T71.
  **Hecho cuando:** las migraciones se aplican en una base nueva desechable, la aplicación inicia sin sincronización en producción y una segunda ejecución no reaplica migraciones; no se ejecuta CREATE DATABASE contra una base existente ni se modifica la base cotidiana.

- [ ] **T62 — Verificar compilación** · 15 min · RF: soporte transversal RF-01–38 · Depende de: T51–T61, T72–T75.
  **Hecho cuando:** `npm run build` termina correctamente; cualquier corrección necesaria queda resuelta y comprobada antes de marcar la tarea.

- [ ] **T63 — Verificar lint** · 15 min · RF: soporte transversal RF-01–38 · Depende de: T62.
  **Hecho cuando:** `npm run lint` termina sin errores.

- [ ] **T64 — Ejecutar la suite unitaria completa** · 20 min · RF: RF-01–38 · Depende de: T63.
  **Hecho cuando:** todas las pruebas unitarias ejecutan sus casos y pasan, sin ocultar fallos mediante exclusiones.

- [ ] **T65 — Ejecutar integración y pruebas HTTP completas** · 25 min · RF: RF-01–38 · Depende de: T64.
  **Hecho cuando:** las suites pasan sobre MariaDB desechable, incluyen las carreras previstas y cierran sus conexiones.

- [ ] **T66 — Completar la matriz RF → evidencia** · 20 min · RF: RF-01–38 · Depende de: T65.
  **Hecho cuando:** cada RF señala pruebas concretas y resultados; RF-29 y RF-33 distinguen la política de acceso comprobada de la integración de reservas pendiente.

- [ ] **T67 — Actualizar las referencias documentales** · 15 min · RF: soporte documental RF-01–38 · Depende de: T66.
  **Hecho cuando:** plan y tareas enlazan la Constitución vigente, usan RF-01–RF-38, conservan las decisiones confirmadas sobre sesión y concurrencia y documentan los comandos; los informes históricos no se reescriben ni presentan como aceptación de RF nuevos.

- [ ] **T68 — Revisar alcance y entregar resultados** · 15 min · RF: RF-01–38 · Depende de: T67.
  **Hecho cuando:** el resumen identifica cambios, verificaciones y pendientes, confirma que no se tocaron datos existentes y no presenta las reservas reales como implementadas.

**Pendiente externo al alcance:** integrar la comprobación de licencia en la confirmación transaccional de reservas cuando exista ese módulo. No marcar completos esos escenarios de RF-29 y RF-33 únicamente por superar las pruebas de autenticación.
