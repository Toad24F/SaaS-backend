# Tareas de autenticación, negocios y licencias anuales

Basado en [plan.md](plan.md), [spec-auth.md](../spec/spec-auth.md) y [Constitución](Constitución.md).

**Estado: 85 tareas; 77 completadas (T01–T60, T69–T85) y 8 pendientes.** Los identificadores se conservan. Las nuevas T69–T85 se ubican por dependencia, por lo que el orden numérico no siempre coincide con el orden de ejecución. Las duraciones son estimaciones de trabajo activo inferiores a 30 minutos; si una tarea requiere más tiempo, se subdivide sin marcarla parcialmente completada.

**Alcance:** implementación posterior de backend sobre base nueva, con datos desechables exclusivos para pruebas. Sin borrar bases existentes, implementar pantallas o construir reservas. La actualización de esta lista es documental: no ejecuta las tareas pendientes ni acredita sus criterios.

**Avance conservado:** [evidencia T01–T05](results/resultados-t01-t05.md), [T06](results/resultados-t06.md) y [T07](results/resultados-t07.md). Las referencias RF de esos informes y de las tareas ya completadas corresponden a la especificación vigente al cerrarlos y no se reescriben ni reciben cobertura retroactiva. Aquí se utiliza la cobertura vigente RF-01–RF-44; T01–T07 acreditan infraestructura, no todos los comportamientos asociados.

**Reglas confirmadas:** licencia anual automática, aislamiento por negocio_id, suspensión exclusivamente en licencia y recuperación por código autorizada solo por superadmin para administradores. RF-20 permite terminar atómicamente una operación ya autorizada y rechaza las solicitudes nuevas al expirar la sesión. Activación y reemisión se serializan por orden de bloqueo de base de datos. Los recepcionistas se crean completos por su administrador, sin código; desactivar y restablecer revocan sesiones, reactivar conserva credenciales y el restablecimiento de una cuenta desactivada no la reactiva.

**Contratos históricos sustituidos:** T32, T34, T46 y T48 permanecen completadas con su redacción y evidencia originales, pero su invitación y activación de recepcionistas por código dejan de ser el comportamiento objetivo. T80 retiró ese modelo, T81 incorporó el caso de uso de alta directa, T82 el restablecimiento administrativo y T83 su exposición HTTP; T84–T85 completarán las pruebas posteriores sin atribuir cobertura retroactiva a las tareas históricas.

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

- [X] **T70 — Preparar configuración de migraciones y producción** · 25 min · RF: soporte transversal RF-01–38 · Depende de: T04, T07. · [Evidencia](results/resultados-t70.md)
  **Hecho cuando:** existe una configuración DataSource y comandos de migración para la instalación nueva y pruebas, con synchronize deshabilitado en producción y tests; se conserva el aislamiento TEST_DB_* y no se ejecutan migraciones al importar módulos.

- [X] **T08 — Ajustar la entidad Negocio** · 20 min · RF: RF-01–02, RF-09, RF-33–34 · Depende de: T07. · [Evidencia](results/resultados-t08.md)
  **Hecho cuando:** el modelo conserva identidad y contacto, incorpora activación, aloja Negocio en su módulo y deja de administrar una suspensión independiente; se actualizan los imports afectados.

- [X] **T09 — Representar usuarios pendientes de activación** · 25 min · RF: RF-03, RF-05–08, RF-13, RF-15 · Depende de: T08. · [Evidencia](results/resultados-t09-t12.md)
  **Hecho cuando:** una cuenta pendiente reserva su correo normalizado y puede carecer de nombre y contraseña, sin representarse como activada.

- [X] **T10 — Definir la entidad Licencia anual** · 25 min · RF: RF-02, RF-09, RF-28–34, RF-36–38 · Depende de: T08. · [Evidencia](results/resultados-t09-t12.md)
  **Hecho cuando:** se representa una licencia por negocio con habilitación, vencimiento y suspensión, sin modalidad ni plan; habilitación y vencimiento están nulos antes de activar.

- [X] **T11 — Definir códigos de acceso** · 20 min · RF: RF-08–14, RF-22–24 · Depende de: T09. · [Evidencia](results/resultados-t09-t12.md)
  **Hecho cuando:** el modelo relaciona cuenta, propósito, hash, emisor, expiración, consumo e invalidación sin almacenar el código utilizable.

- [X] **T12 — Definir sesiones persistidas** · 15 min · RF: RF-15, RF-18–20, RF-24–25 · Depende de: T09. · [Evidencia](results/resultados-t09-t12.md)
  **Hecho cuando:** cada sesión tiene identificador único, usuario, creación, vencimiento y revocación; el JWT puede identificar la sesión persistida.

- [X] **T13 — Definir eventos de auditoría** · 20 min · RF: RF-35, RF-38 · Depende de: T09, T10. · [Evidencia](results/resultados-t13-t14-t69.md)
  **Hecho cuando:** el modelo admite actor, negocio/cuenta/licencia destino, acción y valores anteriores/nuevos, sin modalidades ni campos para secretos.

- [X] **T14 — Definir el contador compartido de intentos** · 15 min · RF: RF-17 · Depende de: T07. · [Evidencia](results/resultados-t13-t14-t69.md)
  **Hecho cuando:** se representan IP, ventana, contador y bloqueo hasta, con un único registro coordinable por IP compartido entre login y validación de códigos.

- [X] **T69 — Adaptar fixtures y pruebas al nuevo modelo** · 25 min · RF: RF-06, RF-14–15, RF-28 · Depende de: T06–T10. · [Evidencia](results/resultados-t13-t14-t69.md)
  **Hecho cuando:** las fixtures en memoria representan negocio activado, cuentas pendientes/activadas y licencia anual con sus estados; las pruebas existentes dejan de depender de EstadoNegocio y mantienen aislamiento. Se conserva T06 completada como antecedente.

- [X] **T15 — Preparar migración de negocios y usuarios** · 25 min · RF: RF-01–08, RF-13 · Depende de: T05, T09, T70. · [Evidencia](results/resultados-t15-t19.md)
  **Hecho cuando:** la migración inicial crea negocios y usuarios; MariaDB rechaza correos normalizados duplicados, roles sin pertenencia válida y dos administradores del mismo negocio, incluidas cuentas pendientes.

- [X] **T16 — Preparar migración de licencias** · 20 min · RF: RF-02, RF-09, RF-28, RF-36–38 · Depende de: T10, T15. · [Evidencia](results/resultados-t15-t19.md)
  **Hecho cuando:** la base admite una licencia anual por negocio; rechaza habilitación sin vencimiento o vencimiento sin habilitación y fechas de suspensión incompatibles, sin columnas de modalidad o plan.

- [X] **T17 — Preparar migración de códigos y sesiones** · 25 min · RF: RF-08–12, RF-18–25 · Depende de: T11, T12, T15. · [Evidencia](results/resultados-t15-t19.md)
  **Hecho cuando:** las tablas y relaciones se crean y rechazan códigos o sesiones vinculados a cuentas inexistentes; el código conserva propósito, historial y hash único.

- [X] **T18 — Preparar migración de auditoría e intentos** · 20 min · RF: RF-17, RF-35, RF-38 · Depende de: T13, T14, T16. · [Evidencia](results/resultados-t15-t19.md)
  **Hecho cuando:** ambas tablas se crean con sus restricciones e índices; se rechazan destinos de auditoría incompatibles con su negocio y se coordina un contador por IP.

- [X] **T71 — Ampliar el ejecutor de integración para persistencia** · 25 min · RF: RF-03, RF-06, RF-11, RF-35, RF-38 · Depende de: T05, T15–T18. · [Evidencia](results/resultados-t71.md)
  **Hecho cuando:** las pruebas usan entidades y migraciones de la entrega, IDs asignados por MariaDB y dos conexiones independientes; preparan y limpian exclusivamente sus datos de prueba y cierran conexiones incluso al fallar. T05 permanece completada como infraestructura previa.

- [X] **T19 — Sincronizar y versionar el SQL de referencia** · 25 min · RF: RF-01–38 · Depende de: T15–T18. · [Evidencia](results/resultados-t15-t19.md)
  **Hecho cuando:** db/schema.sql dentro del backend refleja las mismas tablas, columnas y restricciones de auth que entidades y migraciones; retira modalidades y ajusta RF. Se modifica la exclusión de Git solo para versionar ese archivo, sin incluir datos ni secretos; ../db/schema.sql queda como antecedente.

- [X] **T80 — Retirar la activación pendiente de recepcionistas del modelo objetivo** · 25 min · RF: RF-08–13, RF-27, RF-40 · Depende de: T09, T11, T15, T17, T19. · [Evidencia](results/resultados-t80.md)
  **Hecho cuando:** entidad, migraciones para instalación nueva, `db/schema.sql`, enum, módulos y fixtures ya no admiten `activacion_recepcionista`; las restricciones permiten credenciales nulas solo al primer administrador pendiente y exigen nombre, hash y activación a todo recepcionista. No se migran ni eliminan datos de instalaciones anteriores.

## 2. Reglas y servicios compartidos

- [X] **T20 — Centralizar la política de contraseñas** · 20 min · RF: RF-21, RF-27 · Depende de: T06. · [Evidencia](results/resultados-t20-t25.md)
  **Hecho cuando:** pruebas verifican el mínimo de 12 caracteres, hash y comparación, sin truncamiento silencioso.

- [X] **T21 — Calcular años calendario en Chihuahua** · 25 min · RF: RF-28, RF-31 · Depende de: T06. · [Evidencia](results/resultados-t20-t25.md)
  **Hecho cuando:** pruebas de aniversario, fin de mes, 29 de febrero y reglas de America/Chihuahua producen vencimientos correctos almacenados en UTC; las renovaciones sucesivas suman un año desde su base, sin usar 365 días ni offset fijo.

- [X] **T22 — Definir la política de acceso por licencia** · 25 min · RF: RF-14–15, RF-29–30, RF-33–34 · Depende de: T06, T10, T69. · [Evidencia](results/resultados-t20-t25.md)
  **Hecho cuando:** una matriz cubre pendiente, vigente, vencida y suspendida, junto con cuenta activa/activada y negocio activado; una suspensión prolongada no consume el tiempo conservado.

- [X] **T23 — Registrar auditoría dentro de transacciones** · 20 min · RF: RF-35 · Depende de: T18. · [Evidencia](results/resultados-t20-t25.md)
  **Hecho cuando:** un evento conserva actor y destino y un fallo de registro provoca rollback de la operación que lo incluye.

- [X] **T24 — Emitir códigos y mostrar su valor una sola vez** · 25 min · RF: RF-08, RF-13, RF-22–23 · Depende de: T17, T23. · [Evidencia](results/resultados-t20-t25.md)
  **Hecho cuando:** activación recibe 48 horas, recuperación 30 minutos y la persistencia contiene únicamente hashes de códigos aleatorios; cada código queda vinculado a destinatario, propósito y emisor y se muestra solo en la respuesta de emisión.

- [X] **T25 — Validar y consumir códigos** · 25 min · RF: RF-08–11, RF-24 · Depende de: T24. · [Evidencia](results/resultados-t20-t25.md)
  **Hecho cuando:** se rechazan propósito incorrecto, vencimiento exacto, invalidación y reutilización; el estado se revalida bajo bloqueo y el consumo comparte la transacción de la operación.

- [X] **T26 — Reemplazar códigos pendientes** · 20 min · RF: RF-12, RF-23 · Depende de: T25. · [Evidencia](results/resultados-t26-t30.md)
  **Hecho cuando:** emitir el reemplazo invalida el anterior sin cambiar destinatario ni iniciar la licencia; usa el bloqueo de cuenta/código compatible con el consumo y rechaza reemisión inicial si la cuenta ya se activó.

- [X] **T27 — Aplicar el límite compartido de intentos** · 25 min · RF: RF-17 · Depende de: T06, T18. · [Evidencia](results/resultados-t26-t30.md)
  **Hecho cuando:** @nestjs/throttler utiliza almacenamiento MariaDB y una clave conjunta por IP para login y validación de códigos; el sexto intento bloquea un minuto, los bloqueados no prolongan la ventana y otra IP tiene su propio límite.

- [X] **T28 — Crear y revocar sesiones** · 25 min · RF: RF-18, RF-20, RF-24–25 · Depende de: T06, T17. · [Evidencia](results/resultados-t26-t30.md)
  **Hecho cuando:** pruebas verifican duración exacta de una hora desde el inicio, sin extensión deslizante ni refresh tokens, revocación individual y revocación de todas las sesiones de una cuenta.

- [X] **T29 — Consultar usuarios con pertenencia validada** · 20 min · RF: RF-05–07 · Depende de: T15. · [Evidencia](results/resultados-t26-t30.md)
  **Hecho cuando:** un administrador encuentra sus recepcionistas y recibe recurso no disponible al consultar uno de otro negocio.

- [X] **T30 — Aplicar permisos por rol** · 20 min · RF: RF-04–07, RF-22 · Depende de: T06, T29. · [Evidencia](results/resultados-t26-t30.md)
  **Hecho cuando:** una matriz prueba operaciones exclusivas del superadmin, operaciones propias del administrador y rechazo del recepcionista; solo superadmin puede autorizar recuperación y solo de cuentas de administrador.

## 3. Casos de uso

- [X] **T31 — Crear negocio con licencia y administrador pendiente** · 25 min · RF: RF-01–04, RF-35 · Depende de: T16, T23, T24, T30. · [Evidencia](results/resultados-t31.md)
  **Hecho cuando:** una operación válida crea negocio, administrador pendiente, licencia anual y código con auditoría, rechaza duplicados sin altas parciales y no recibe modalidad ni período.

- [X] **T32 — Invitar recepcionistas** · 25 min · RF: RF-03, RF-05–07, RF-13 · Depende de: T22, T24, T29, T30. · [Evidencia](results/resultados-t32.md)
  **Hecho cuando:** un administrador autorizado reserva el correo y obtiene un código ligado exclusivamente a su negocio y al rol recepcionista.

- [X] **T33 — Activar al primer administrador** · 25 min · RF: RF-08–11, RF-14, RF-27–28, RF-35 · Depende de: T20–T25, T31. · [Evidencia](results/resultados-t33-t37.md)
  **Hecho cuando:** establecer nombre y contraseña consume el código, activa cuenta y negocio e inicia un año calendario de licencia en una transacción; una suspensión previa impide la activación.

- [X] **T34 — Activar recepcionistas** · 20 min · RF: RF-08, RF-10–11, RF-13–14, RF-27 · Depende de: T20, T22, T25, T32. · [Evidencia](results/resultados-t33-t37.md)
  **Hecho cuando:** la cuenta se activa solo con código válido, licencia habilitada, vigente y no suspendida; no cambia correo, negocio, rol ni vigencia de licencia.

- [X] **T35 — Completar el inicio de sesión** · 25 min · RF: RF-15–16, RF-20 · Depende de: T20, T22, T28, T33. · [Evidencia](results/resultados-t33-t37.md)
  **Hecho cuando:** credenciales válidas producen sesión persistida y token; cuentas pendientes, inactivas o sin acceso son rechazadas y los errores de credenciales son uniformes.

- [X] **T36 — Validar sesión y permisos actuales en JWT** · 25 min · RF: RF-15, RF-19–20, RF-29, RF-33 · Depende de: T22, T28, T35. · [Evidencia](results/resultados-t33-t37.md)
  **Hecho cuando:** cada solicitud protegida consulta sesión, cuenta y licencia actuales; devuelve 401 si sesión está revocada/vencida, cuenta desactivada o licencia bloqueada, usando permisos actuales y sin interrumpir por expiración una operación previamente autorizada.

- [X] **T37 — Cerrar sesión aunque la licencia esté bloqueada** · 20 min · RF: RF-18, RF-33 · Depende de: T28, T36. · [Evidencia](results/resultados-t33-t37.md)
  **Hecho cuando:** logout revoca una sesión reconocida incluso con licencia suspendida, y reutilizarla falla.

- [X] **T38 — Desactivar recepcionistas propios** · 20 min · RF: RF-05–07, RF-19, RF-30 · Depende de: T29, T30, T36. · [Evidencia](results/resultados-t38-t44.md)
  **Hecho cuando:** el administrador desactiva únicamente cuentas permitidas, conserva los registros y la siguiente solicitud autenticada del recepcionista desactivado es rechazada.

- [X] **T39 — Autorizar recuperación de administradores** · 25 min · RF: RF-22–23, RF-26, RF-35 · Depende de: T23, T26, T30. · [Evidencia](results/resultados-t38-t44.md)
  **Hecho cuando:** solo el superadmin emite recuperación para una cuenta de administrador, incluso desactivada o bloqueada por licencia; rechaza otros emisores y destinatarios, invalida el código anterior y audita sin levantar restricciones.

- [X] **T40 — Recuperar contraseña y retirar sesiones** · 25 min · RF: RF-23–24, RF-26–27 · Depende de: T20, T25, T28, T39. · [Evidencia](results/resultados-t38-t44.md)
  **Hecho cuando:** un código válido cambia la contraseña, se consume y revoca todas las sesiones sin activar cuentas ni levantar restricciones de licencia.

- [X] **T41 — Cambiar contraseña con sesión iniciada** · 25 min · RF: RF-21, RF-25, RF-27 · Depende de: T20, T28, T36. · [Evidencia](results/resultados-t38-t44.md)
  **Hecho cuando:** se exige la contraseña actual, la nueva cumple la política y todas las sesiones anteriores quedan inutilizables.

- [X] **T42 — Suspender licencias** · 25 min · RF: RF-04, RF-33, RF-35–36, RF-38 · Depende de: T16, T22, T23, T30. · [Evidencia](results/resultados-t38-t44.md)
  **Hecho cuando:** registra el inicio de suspensión una sola vez y conserva el vencimiento; admite pendientes sin generar tiempo, rechaza licencias vencidas no suspendidas y no duplica eventos al repetir.

- [X] **T43 — Reactivar licencias** · 25 min · RF: RF-34–35, RF-37–38 · Depende de: T42. · [Evidencia](results/resultados-t38-t44.md)
  **Hecho cuando:** para una licencia habilitada suma al vencimiento conservado la duración exacta de suspensión y limpia su inicio; pendientes solo retiran la suspensión; repetir no añade tiempo, activa cuentas ni duplica eventos.

- [X] **T44 — Renovar licencias anuales** · 25 min · RF: RF-31–32, RF-35, RF-37 · Depende de: T21, T23, T42. · [Evidencia](results/resultados-t38-t44.md)
  **Hecho cuando:** añade un año desde vencimiento vigente, instante actual si venció o vencimiento conservado si suspendida; mantiene suspensión e inicio de pausa, acumula renovaciones y rechaza licencias pendientes.

- [X] **T76 — Implementar transiciones de acceso de recepcionistas** · 25 min · RF: RF-05–07, RF-19, RF-39–42 · Depende de: T23, T28–T30, T36, T38. · [Evidencia](results/resultados-t76-t81.md)
  **Hecho cuando:** desactivar y reactivar bloquean la cuenta destino y solo admiten recepcionistas completos del negocio del administrador; desactivar revoca todas sus sesiones, ambas operaciones conservan identidad y pertenencia, registran únicamente cambios reales y confirman o revierten cuenta, sesiones y auditoría en una sola transacción.

- [X] **T81 — Crear recepcionistas directamente** · 25 min · RF: RF-03, RF-05–07, RF-13, RF-27, RF-35, RF-40 · Depende de: T20, T22–T23, T29–T30, T80. · [Evidencia](results/resultados-t76-t81.md) · [Corrección posterior del reloj](results/correccion-reloj-t81-t82.md)
  **Hecho cuando:** el caso de uso normaliza nombre y correo, valida y hashea la contraseña, deriva negocio y rol del administrador persistido y crea cuenta activa, fecha de activación y auditoría en una sola transacción; no genera códigos y convierte la colisión de correo global en 409 sin alta parcial.

- [X] **T82 — Restablecer contraseñas de recepcionistas propios** · 25 min · RF: RF-05–07, RF-19, RF-27, RF-35, RF-43–44 · Depende de: T20, T22–T23, T28–T30. · [Evidencia](results/resultados-t82.md) · [Corrección posterior del reloj](results/correccion-reloj-t81-t82.md)
  **Hecho cuando:** el administrador bloquea y modifica únicamente un recepcionista de su negocio, activo o desactivado; guarda el nuevo hash, revoca todas sus sesiones y audita sin secretos en una transacción, conservando identidad, pertenencia, activación, estado de cuenta y licencia.

## 4. Operaciones HTTP y pruebas de integración

- [X] **T45 — Exponer login, perfil y logout** · 25 min · RF: RF-15–20 · Depende de: T27, T35–T37. · [Evidencia](results/resultados-t45.md)
  **Hecho cuando:** conserva POST /auth/login y GET /auth/profile y expone logout; pruebas HTTP verifican respuestas sin hashes, entradas válidas, errores uniformes, bloqueo de intentos y rechazo de tokens revocados o vencidos.

- [X] **T46 — Exponer activación y recuperación** · 25 min · RF: RF-08–14, RF-17, RF-23–24, RF-27 · Depende de: T27, T33–T34, T40. · [Evidencia](results/resultados-t46.md)
  **Hecho cuando:** las rutas aceptan solo código y contraseña, más nombre al activar; comparten límite por IP, rechazan campos de destinatario/rol/negocio y aplican Guards y validaciones equivalentes a producción.

- [X] **T47 — Exponer alta y consulta administrativa de negocios** · 25 min · RF: RF-01–04, RF-30 · Depende de: T30, T31, T36. · [Evidencia](results/resultados-t47.md)
  **Hecho cuando:** solo superadmin crea o consulta negocios globalmente y puede consultar uno bloqueado sin revelar secretos; el alta asigna licencia anual y rechaza campos de modalidad o período.

- [X] **T48 — Exponer administración de recepcionistas y reemisión inicial** · 25 min · RF: RF-04–07, RF-12–13, RF-19 · Depende de: T26, T30, T32, T36, T38. · [Evidencia](results/resultados-t48.md)
  **Hecho cuando:** cada operación exige el rol y pertenencia correctos; reemitir el código inicial no modifica destinatario ni habilita la licencia.

- [X] **T49 — Exponer cambio de contraseña y autorización de recuperación** · 20 min · RF: RF-21–27 · Depende de: T36, T39, T41. · [Evidencia](results/resultados-t49.md)
  **Hecho cuando:** pruebas HTTP verifican contraseña actual, retiro de sesiones y autorización de recuperación exclusiva del superadmin para administradores; no se expone recuperación de recepcionistas.

- [X] **T50 — Exponer suspensión, reactivación y renovación** · 25 min · RF: RF-04, RF-31–38 · Depende de: T36, T42–T44. · [Evidencia](results/resultados-t50.md) · [Corrección posterior de concurrencia](results/correccion-carrera-t50.md)
  **Hecho cuando:** solo superadmin ejecuta las operaciones sobre la licencia; conflictos de estado producen 409 y no se exponen selección de modalidad/período, cancelación definitiva ni suspensión del negocio.

- [X] **T77 — Exponer reactivación de recepcionistas** · 20 min · RF: RF-05–07, RF-39–42 · Depende de: T48, T76. · [Evidencia](results/resultados-t77.md)
  **Hecho cuando:** `POST /recepcionistas/:id/reactivar` exige administrador y pertenencia, admite solo cuerpo vacío y responde 204; desactivar y reactivar ocultan recursos ajenos o de otro rol con 404, rechazan entradas inválidas con 400, roles insuficientes con 403 y sesión o licencia bloqueada con 401.

- [X] **T83 — Exponer alta directa y restablecimiento de recepcionistas** · 25 min · RF: RF-05–07, RF-13, RF-19, RF-27, RF-35, RF-40, RF-43–44 · Depende de: T36, T46, T48, T81–T82. · [Evidencia](results/resultados-t83.md)
  **Hecho cuando:** `POST /recepcionistas` acepta solo `emailRecepcionista`, `nombre` y `password` y devuelve 201 con la vista pública; `POST /recepcionistas/:id/restablecer-contrasena` acepta solo `nuevaPassword` y devuelve 204; se elimina `POST /auth/activar-recepcionista` y ninguna respuesta expone contraseña, hash o código.

- [X] **T51 — Probar aislamiento entre dos negocios** · 25 min · RF: RF-04–07, RF-13, RF-22, RF-39–44 · Depende de: T47–T50, T77, T83. · [Evidencia](results/resultados-t51-t60.md)
  **Hecho cuando:** con dos negocios, altas, consultas, desactivaciones, reactivaciones y restablecimientos ajenos se rechazan sin alterar registros; el alta no puede elegir otro negocio ni rol. Un administrador no autoriza recuperación por código y el recepcionista no administra permisos.

- [X] **T52 — Probar consumo concurrente de activación** · 25 min · RF: RF-03, RF-09–11, RF-35 · Depende de: T33, T71. · [Evidencia](results/resultados-t51-t60.md)
  **Hecho cuando:** dos conexiones con el mismo código inicial de administrador producen una única activación, consumo, habilitación de licencia y evento, sin registros parciales.

- [X] **T53 — Probar reemplazo frente a consumo de código** · 25 min · RF: RF-10–12, RF-23–24 · Depende de: T26, T33, T40, T71. · [Evidencia](results/resultados-t51-t60.md)
  **Hecho cuando:** se prueban ambos órdenes del bloqueo: reemplazo primero invalida el código anterior; activación primero impide reemisión inicial. Reemplazo/consumo de recuperación se serializan y ningún código invalidado completa una operación posterior.

- [X] **T54 — Probar login frente a cambio o recuperación de contraseña** · 25 min · RF: RF-15, RF-24–25 · Depende de: T35, T40–T41, T71. · [Evidencia](results/resultados-t51-t60.md)
  **Hecho cuando:** después del cambio no sobrevive una sesión creada concurrentemente mediante la contraseña anterior.

- [X] **T55 — Probar doble suspensión y doble reactivación** · 25 min · RF: RF-35–38 · Depende de: T42–T43, T71. · [Evidencia](results/resultados-t51-t60.md)
  **Hecho cuando:** operaciones concurrentes no reinician la pausa, duplican tiempo ni generan dos eventos para una misma transición.

- [X] **T56 — Probar renovaciones concurrentes y cruces de licencia** · 25 min · RF: RF-31–32, RF-35, RF-37–38 · Depende de: T42–T44, T71. · [Evidencia](results/resultados-t51-t60.md)
  **Hecho cuando:** dos renovaciones distintas suman dos años sin sobrescribirse; renovación cruzada con suspensión/reactivación produce estado, vencimiento y auditoría equivalentes a un orden serial, sin pérdida ni duplicación de tiempo.

- [X] **T57 — Probar rollback de operaciones sensibles** · 25 min · RF: RF-03, RF-09, RF-24, RF-35 · Depende de: T31, T33, T40, T42–T44, T71. · [Evidencia](results/resultados-t51-t60.md)
  **Hecho cuando:** fallos provocados antes de confirmar revierten altas, consumo de códigos, cambios de contraseña y modificaciones de licencia junto con su auditoría.

- [X] **T58 — Probar el recorrido HTTP de licencia anual** · 25 min · RF: RF-01–02, RF-09, RF-15, RF-28, RF-30–34 · Depende de: T45–T50. · [Evidencia](results/resultados-t51-t60.md)
  **Hecho cuando:** alta, activación, login, renovación, suspensión y reactivación funcionan por HTTP con licencia anual; se rechazan modalidades y períodos enviados por el cliente y se conservan los datos durante bloqueos.

- [X] **T59 — Probar vencimientos y tiempo conservado** · 25 min · RF: RF-28–34, RF-36–37 · Depende de: T45, T46, T50. · [Evidencia](results/resultados-t51-t60.md)
  **Hecho cuando:** con reloj controlado se verifican vencimiento exacto, renovación anticipada/tardía, pausas sucesivas y prolongadas, renovación suspendida y restitución exacta del tiempo, también alrededor de aniversarios bisiestos.

- [X] **T60 — Probar suspensión antes de activar** · 20 min · RF: RF-09–12, RF-14, RF-34 · Depende de: T46, T50. · [Evidencia](results/resultados-t51-t60.md)
  **Hecho cuando:** suspender impide activar al primer administrador, su código sigue caducando a las 48 horas y reactivar no inicia vigencia ni rehabilita códigos vencidos.

- [X] **T72 — Probar expiración durante una operación autorizada** · 25 min · RF: RF-19–20 · Depende de: T36, T57. · [Evidencia](results/resultados-t72-t75.md)
  **Hecho cuando:** una operación admitida antes de cumplir la hora termina atómicamente aunque expire la sesión durante su ejecución; una nueva solicitud se rechaza con 401 en el límite exacto y un fallo de la operación revierte todas sus escrituras.

- [X] **T73 — Probar límite conjunto por IP y concurrencia** · 25 min · RF: RF-17 · Depende de: T27, T45–T46, T71. · [Evidencia](results/resultados-t72-t75.md)
  **Hecho cuando:** login, activación del administrador y recuperación por código comparten los cinco intentos; solicitudes concurrentes por la misma IP no eluden el límite, el sexto bloquea un minuto sin prolongación por intentos bloqueados, otra IP permanece independiente y se verifica el desbloqueo exacto.

- [X] **T74 — Probar altas concurrentes con identidad duplicada** · 25 min · RF: RF-01–03, RF-35 · Depende de: T31, T47, T71. · [Evidencia](results/resultados-t72-t75.md)
  **Hecho cuando:** dos altas con slug o correo normalizado duplicado aceptan como máximo una; no quedan negocio, licencia, cuenta, código ni auditoría de un alta rechazada, incluidos correos distintos solo en mayúsculas o espacios.

- [X] **T75 — Probar bloqueos en todos los endpoints protegidos** · 25 min · RF: RF-04–07, RF-14–16, RF-18–19, RF-26, RF-29–30, RF-33–34, RF-39–44 · Depende de: T45–T50, T71, T77, T83. · [Evidencia](results/resultados-t72-t75.md)
  **Hecho cuando:** una matriz de rutas, incluidas alta, desactivación, reactivación y restablecimiento de recepcionistas, verifica 401 tras desactivar la cuenta, suspender o vencer la licencia con sesión abierta, 403 por rol y 404 por recurso ajeno. También verifica logout con licencia bloqueada y gestión del superadmin; recuperar o restablecer contraseñas conserva bloqueos. No acredita confirmaciones de reservas reales.

- [X] **T78 — Probar persistencia y concurrencia de acceso de recepcionistas** · 25 min · RF: RF-39–42 · Depende de: T71, T76. · [Evidencia](results/resultados-t78-t85.md)
  **Hecho cuando:** dos conexiones prueban repeticiones y solicitudes opuestas serializadas sin estados intermedios ni eventos duplicados; desactivar revoca todas las sesiones, reactivar no las rehabilita y un fallo provocado revierte conjuntamente cuenta, sesiones y auditoría.

- [X] **T79 — Probar el contrato HTTP de reactivación** · 25 min · RF: RF-05–07, RF-19, RF-39–42 · Depende de: T77–T78. · [Evidencia](results/resultados-t78-t85.md)
  **Hecho cuando:** pruebas HTTP cubren reactivación propia, repetición idempotente, inicio de sesión nuevo, recurso ajeno o de otro rol, ID y cuerpo inválidos, roles insuficientes, sesión o licencia bloqueada y rechazo permanente de tokens anteriores.

- [X] **T84 — Probar persistencia, concurrencia y rollback del nuevo flujo** · 25 min · RF: RF-03, RF-05–07, RF-13, RF-27, RF-35, RF-40, RF-43–44 · Depende de: T71, T80–T82. · [Evidencia](results/resultados-t78-t85.md)
  **Hecho cuando:** integración MariaDB demuestra alta completa sin código, hash válido, auditoría sin secretos, aislamiento y rollback; dos altas con el mismo correo aceptan como máximo una. El restablecimiento activo o desactivado revoca todas las sesiones y conserva estado e identidad aun ante fallos provocados.

- [X] **T85 — Probar los contratos HTTP de alta y restablecimiento** · 25 min · RF: RF-05–07, RF-13, RF-19, RF-27, RF-35, RF-40, RF-43–44 · Depende de: T83–T84. · [Evidencia](results/resultados-t78-t85.md)
  **Hecho cuando:** pruebas HTTP verifican entrada y respuesta exactas, 201/204, normalización, política de contraseña, correo duplicado, campos extra, roles y estados de licencia, recursos ajenos y cuenta activa o desactivada; confirman que la ruta de activación de recepción ya no existe y que no se filtran secretos ni códigos.

## 5. Instalación, verificación y cierre

- [ ] **T61 — Verificar instalación desde cero** · 25 min · RF: RF-01–44 · Depende de: T50, T70–T71, T80.
  **Hecho cuando:** las migraciones se aplican en una base nueva desechable, la aplicación inicia sin sincronización en producción y una segunda ejecución no reaplica migraciones; no se ejecuta CREATE DATABASE contra una base existente ni se modifica la base cotidiana.

- [ ] **T62 — Verificar compilación** · 15 min · RF: soporte transversal RF-01–44 · Depende de: T51–T61, T72–T85.
  **Hecho cuando:** `npm run build` termina correctamente; cualquier corrección necesaria queda resuelta y comprobada antes de marcar la tarea.

- [ ] **T63 — Verificar lint** · 15 min · RF: soporte transversal RF-01–44 · Depende de: T62.
  **Hecho cuando:** `npm run lint` termina sin errores.

- [ ] **T64 — Ejecutar la suite unitaria completa** · 20 min · RF: RF-01–44 · Depende de: T63.
  **Hecho cuando:** todas las pruebas unitarias ejecutan sus casos y pasan, sin ocultar fallos mediante exclusiones.

- [ ] **T65 — Ejecutar integración y pruebas HTTP completas** · 25 min · RF: RF-01–44 · Depende de: T64.
  **Hecho cuando:** las suites pasan sobre MariaDB desechable, incluyen las carreras previstas y cierran sus conexiones.

- [ ] **T66 — Completar la matriz RF → evidencia** · 20 min · RF: RF-01–44 · Depende de: T65.
  **Hecho cuando:** cada RF señala pruebas concretas y resultados; RF-29 y RF-33 distinguen la política de acceso comprobada de la integración de reservas pendiente.

- [ ] **T67 — Actualizar las referencias documentales** · 15 min · RF: soporte documental RF-01–44 · Depende de: T66.
  **Hecho cuando:** plan y tareas enlazan la Constitución vigente, usan RF-01–RF-44, conservan las decisiones confirmadas sobre sesión y concurrencia y documentan los comandos; los informes históricos no se reescriben ni presentan como aceptación de RF nuevos.

- [ ] **T68 — Revisar alcance y entregar resultados** · 15 min · RF: RF-01–44 · Depende de: T67.
  **Hecho cuando:** el resumen identifica cambios, verificaciones y pendientes, confirma que no se tocaron datos existentes y no presenta las reservas reales como implementadas.

**Pendiente externo al alcance:** integrar la comprobación de licencia en la confirmación transaccional de reservas cuando exista ese módulo. No marcar completos esos escenarios de RF-29 y RF-33 únicamente por superar las pruebas de autenticación.
