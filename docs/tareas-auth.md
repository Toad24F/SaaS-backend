# Tareas de autenticación, negocios y licencias

Basado en [docs/plan.md](plan.md) y [spec/spec-auth.md](../spec/spec-auth.md).

Todas las tareas están pendientes y ordenadas por dependencia. Las duraciones son estimaciones de trabajo activo, inferiores a 30 minutos. Si una tarea requiere más tiempo, debe subdividirse antes de continuar; no se marca completada parcialmente.

**Alcance:** backend sobre base nueva y desechable para pruebas. Sin borrar bases existentes, implementar pantallas o construir el módulo de reservas.

## 1. Preparación y modelo de datos

- [ ] **T01 — Identificar el bloqueo de Jest** · 15 min · RF: soporte transversal RF-01–40 · Depende de: ninguna.
  **Hecho cuando:** se reproduce y documenta el error de carga ESM con una suite mínima, identificando la configuración involucrada.

- [ ] **T02 — Corregir la configuración de pruebas** · 25 min · RF: soporte transversal RF-01–40 · Depende de: T01.
  **Hecho cuando:** una prueba que utiliza NestJS carga y ejecuta sus assertions sin errores ESM.

- [ ] **T03 — Completar dependencias de las pruebas existentes** · 20 min · RF: RF-15–16, RF-19 · Depende de: T02.
  **Hecho cuando:** las suites actuales ejecutan sus casos sin fallar por servicios o repositorios no registrados.

- [ ] **T04 — Aislar la configuración de la base de pruebas** · 20 min · RF: soporte transversal RF-01–40 · Depende de: T02.
  **Hecho cuando:** el entorno exige una base exclusiva de pruebas y rechaza conectarse con una configuración no identificada como tal.

- [ ] **T05 — Preparar el ejecutor de integración** · 25 min · RF: RF-03, RF-11, RF-40 · Depende de: T04.
  **Hecho cuando:** una prueba abre dos conexiones independientes a MariaDB y cierra ambas sin dejar recursos abiertos.

- [ ] **T06 — Preparar reloj y datos de prueba reutilizables** · 20 min · RF: RF-06, RF-10, RF-20, RF-23, RF-28 · Depende de: T03.
  **Hecho cuando:** las pruebas pueden fijar el tiempo y generar dos negocios con sus usuarios sin compartir identificadores.

- [ ] **T07 — Declarar los módulos y sus dependencias** · 20 min · RF: RF-01–40 · Depende de: T03.
  **Hecho cuando:** Auth, Usuarios, Negocios, Licencias, Codigos, Altas y Auditoria pueden componerse sin dependencias circulares.

- [ ] **T08 — Ajustar la entidad Negocio** · 20 min · RF: RF-01–02, RF-09, RF-33–34 · Depende de: T07.
  **Hecho cuando:** el modelo objetivo conserva identidad y contacto, incorpora activación y deja de administrar una suspensión independiente.

- [ ] **T09 — Representar usuarios pendientes de activación** · 25 min · RF: RF-03, RF-05–08, RF-13, RF-15 · Depende de: T08.
  **Hecho cuando:** una cuenta pendiente reserva su correo normalizado y puede carecer de nombre y contraseña, sin representarse como activada.

- [ ] **T10 — Definir la entidad Licencia** · 25 min · RF: RF-02, RF-28–34, RF-36–39 · Depende de: T08.
  **Hecho cuando:** se representan modalidad, plan, habilitación, vencimiento y suspensión; manual no requiere plan ni vencimiento.

- [ ] **T11 — Definir códigos de acceso** · 20 min · RF: RF-08–14, RF-22–24 · Depende de: T09.
  **Hecho cuando:** el modelo relaciona cuenta, propósito, hash, emisor, expiración, consumo e invalidación sin almacenar el código utilizable.

- [ ] **T12 — Definir sesiones persistidas** · 15 min · RF: RF-15, RF-18–20, RF-24–25 · Depende de: T09.
  **Hecho cuando:** cada sesión tiene identificador único, usuario, creación, vencimiento y revocación.

- [ ] **T13 — Definir eventos de auditoría** · 20 min · RF: RF-35, RF-40 · Depende de: T09, T10.
  **Hecho cuando:** el modelo admite actor, destino, acción, modalidad y valores anteriores/nuevos, sin campos para secretos.

- [ ] **T14 — Definir el contador compartido de intentos** · 15 min · RF: RF-17 · Depende de: T07.
  **Hecho cuando:** se representan origen, ventana, contador y bloqueo hasta, con un único registro coordinable por origen.

- [ ] **T15 — Preparar migración de negocios y usuarios** · 25 min · RF: RF-01–08, RF-13 · Depende de: T05, T09.
  **Hecho cuando:** MariaDB rechaza correos duplicados, roles sin pertenencia válida y dos administradores del mismo negocio, incluidas cuentas pendientes.

- [ ] **T16 — Preparar migración de licencias** · 20 min · RF: RF-02, RF-28, RF-36–39 · Depende de: T10, T15.
  **Hecho cuando:** la base admite una licencia por negocio y rechaza combinaciones incompatibles de modalidad, plan y fechas.

- [ ] **T17 — Preparar migración de códigos y sesiones** · 25 min · RF: RF-08–12, RF-18–25 · Depende de: T11, T12, T15.
  **Hecho cuando:** las tablas y relaciones se crean y rechazan códigos o sesiones vinculados a cuentas inexistentes.

- [ ] **T18 — Preparar migración de auditoría e intentos** · 20 min · RF: RF-17, RF-35, RF-40 · Depende de: T13, T14, T16.
  **Hecho cuando:** ambas tablas se crean con sus restricciones e índices y permiten las inserciones válidas previstas.

- [ ] **T19 — Sincronizar el esquema SQL de referencia** · 25 min · RF: RF-01–40 · Depende de: T15–T18.
  **Hecho cuando:** el esquema principal representa las mismas tablas, columnas y restricciones de esta entrega que las entidades y migraciones.

## 2. Reglas y servicios compartidos

- [ ] **T20 — Centralizar la política de contraseñas** · 20 min · RF: RF-21, RF-27 · Depende de: T06.
  **Hecho cuando:** pruebas verifican el mínimo de 12 caracteres, hash y comparación, sin truncamiento silencioso.

- [ ] **T21 — Calcular períodos en Chihuahua** · 25 min · RF: RF-28, RF-31 · Depende de: T06.
  **Hecho cuando:** pruebas de mes, año, fin de mes y 29 de febrero producen vencimientos calendario correctos almacenables como instantes UTC.

- [ ] **T22 — Definir la política de acceso por licencia** · 25 min · RF: RF-14–15, RF-29–30, RF-33–34, RF-37 · Depende de: T06, T10.
  **Hecho cuando:** una matriz prueba pendiente, manual habilitada, por período vigente, vencida y suspendida, con aceptación o rechazo esperado.

- [ ] **T23 — Registrar auditoría dentro de transacciones** · 20 min · RF: RF-35 · Depende de: T18.
  **Hecho cuando:** un evento conserva actor y destino y un fallo de registro provoca rollback de la operación que lo incluye.

- [ ] **T24 — Emitir códigos y mostrar su valor una sola vez** · 25 min · RF: RF-08, RF-13, RF-22–23 · Depende de: T17, T23.
  **Hecho cuando:** activación recibe 48 horas, recuperación 30 minutos y la persistencia contiene únicamente hashes.

- [ ] **T25 — Validar y consumir códigos** · 25 min · RF: RF-08–11, RF-24 · Depende de: T24.
  **Hecho cuando:** se rechazan propósito incorrecto, vencimiento exacto, invalidación y reutilización; consumo y operación pueden compartir transacción.

- [ ] **T26 — Reemplazar códigos pendientes** · 20 min · RF: RF-12, RF-23 · Depende de: T25.
  **Hecho cuando:** emitir el reemplazo invalida el anterior sin cambiar destinatario ni iniciar la licencia.

- [ ] **T27 — Aplicar el límite compartido de intentos** · 25 min · RF: RF-17 · Depende de: T06, T18.
  **Hecho cuando:** cinco intentos conjuntos de login y validación de códigos son admitidos y el sexto bloquea el origen durante un minuto, incluso desde conexiones distintas.

- [ ] **T28 — Crear y revocar sesiones** · 25 min · RF: RF-18, RF-20, RF-24–25 · Depende de: T06, T17.
  **Hecho cuando:** pruebas verifican duración de una hora, revocación individual y revocación de todas las sesiones de una cuenta.

- [ ] **T29 — Consultar usuarios con pertenencia validada** · 20 min · RF: RF-05–07 · Depende de: T15.
  **Hecho cuando:** un administrador encuentra sus recepcionistas y recibe recurso no disponible al consultar uno de otro negocio.

- [ ] **T30 — Aplicar permisos por rol** · 20 min · RF: RF-04–07, RF-22 · Depende de: T06, T29.
  **Hecho cuando:** una matriz prueba operaciones exclusivas del superadmin, operaciones propias del administrador y rechazo del recepcionista.

## 3. Casos de uso

- [ ] **T31 — Crear negocio con licencia y administrador pendiente** · 25 min · RF: RF-01–04, RF-35–36 · Depende de: T16, T23, T24, T30.
  **Hecho cuando:** una operación válida crea los registros vinculados y rechaza duplicados o un plan incompatible sin dejar altas parciales.

- [ ] **T32 — Invitar recepcionistas** · 25 min · RF: RF-03, RF-05–07, RF-13 · Depende de: T22, T24, T29, T30.
  **Hecho cuando:** un administrador autorizado reserva el correo y obtiene un código ligado exclusivamente a su negocio y al rol recepcionista.

- [ ] **T33 — Activar al primer administrador** · 25 min · RF: RF-08–11, RF-14, RF-27–28, RF-35, RF-37 · Depende de: T20–T25, T31.
  **Hecho cuando:** establecer nombre y contraseña consume el código, activa cuenta y negocio y habilita la licencia según modalidad en una sola transacción.

- [ ] **T34 — Activar recepcionistas** · 20 min · RF: RF-08, RF-10–11, RF-13–14, RF-27 · Depende de: T20, T22, T25, T32.
  **Hecho cuando:** la cuenta se activa solo con código válido y licencia habilitada; no cambia el correo, negocio, rol ni vigencia de licencia.

- [ ] **T35 — Completar el inicio de sesión** · 25 min · RF: RF-15–16, RF-20 · Depende de: T20, T22, T28, T33.
  **Hecho cuando:** credenciales válidas producen sesión persistida y token; cuentas pendientes, inactivas o sin acceso son rechazadas y los errores de credenciales son uniformes.

- [ ] **T36 — Validar sesión y permisos actuales en JWT** · 25 min · RF: RF-15, RF-19–20, RF-29, RF-33, RF-37 · Depende de: T22, T28, T35.
  **Hecho cuando:** el siguiente acceso rechaza una sesión revocada o vencida y aplica cambios actuales de usuario y licencia.

- [ ] **T37 — Cerrar sesión aunque la licencia esté bloqueada** · 20 min · RF: RF-18, RF-33 · Depende de: T28, T36.
  **Hecho cuando:** logout revoca una sesión reconocida incluso con licencia suspendida, y reutilizarla falla.

- [ ] **T38 — Desactivar recepcionistas propios** · 20 min · RF: RF-05–07, RF-19, RF-30 · Depende de: T29, T30, T36.
  **Hecho cuando:** el administrador desactiva únicamente cuentas permitidas, conserva los registros y la siguiente solicitud autenticada del recepcionista desactivado es rechazada.

- [ ] **T39 — Autorizar recuperación manual** · 25 min · RF: RF-22–23, RF-26, RF-35 · Depende de: T23, T26, T30.
  **Hecho cuando:** superadmin recupera administradores y administrador recupera recepcionistas propios; el código anterior queda invalidado y la autorización auditada.

- [ ] **T40 — Recuperar contraseña y retirar sesiones** · 25 min · RF: RF-23–24, RF-26–27 · Depende de: T20, T25, T28, T39.
  **Hecho cuando:** un código válido cambia la contraseña, se consume y revoca todas las sesiones sin activar cuentas ni levantar restricciones de licencia.

- [ ] **T41 — Cambiar contraseña con sesión iniciada** · 25 min · RF: RF-21, RF-25, RF-27 · Depende de: T20, T28, T36.
  **Hecho cuando:** se exige la contraseña actual, la nueva cumple la política y todas las sesiones anteriores quedan inutilizables.

- [ ] **T42 — Suspender licencias** · 25 min · RF: RF-04, RF-33, RF-35, RF-38, RF-40 · Depende de: T16, T22, T23, T30.
  **Hecho cuando:** registra el inicio una sola vez, conserva el vencimiento, admite manuales y pendientes y rechaza suspender una licencia por período ya vencida.

- [ ] **T43 — Reactivar licencias** · 25 min · RF: RF-34–35, RF-37, RF-39–40 · Depende de: T42.
  **Hecho cuando:** desplaza el vencimiento solo en licencias por período habilitadas; manuales y pendientes solo retiran la suspensión y repetir no añade tiempo.

- [ ] **T44 — Renovar licencias por período** · 25 min · RF: RF-31–32, RF-35–36, RF-39 · Depende de: T21, T23, T42.
  **Hecho cuando:** vigente, vencida y suspendida usan su base temporal correspondiente; se mantiene la suspensión y se rechazan manuales o no habilitadas.

## 4. Operaciones HTTP y pruebas de integración

- [ ] **T45 — Exponer login, perfil y logout** · 25 min · RF: RF-15–20 · Depende de: T27, T35–T37.
  **Hecho cuando:** pruebas HTTP verifican respuestas sin hashes, validación de entradas, bloqueo de intentos y rechazo de tokens revocados.

- [ ] **T46 — Exponer activación y recuperación** · 25 min · RF: RF-08–14, RF-17, RF-23–24, RF-27 · Depende de: T27, T33–T34, T40.
  **Hecho cuando:** las rutas aceptan únicamente los campos previstos, comparten el límite de intentos y no permiten elegir destinatario, rol o negocio.

- [ ] **T47 — Exponer alta y consulta administrativa de negocios** · 25 min · RF: RF-01–04, RF-30, RF-36 · Depende de: T30, T31, T36.
  **Hecho cuando:** solo el superadmin crea o consulta negocios globalmente y puede consultar uno bloqueado sin revelar secretos.

- [ ] **T48 — Exponer administración de recepcionistas y reemisión inicial** · 25 min · RF: RF-04–07, RF-12–13, RF-19 · Depende de: T26, T30, T32, T36, T38.
  **Hecho cuando:** cada operación exige el rol y pertenencia correctos; reemitir el código inicial no modifica destinatario ni habilita la licencia.

- [ ] **T49 — Exponer cambio de contraseña y autorización de recuperación** · 20 min · RF: RF-21–27 · Depende de: T36, T39, T41.
  **Hecho cuando:** pruebas HTTP verifican contraseña actual, emisor permitido, retiro de sesiones y rechazo de recuperación de cuentas ajenas.

- [ ] **T50 — Exponer suspensión, reactivación y renovación** · 25 min · RF: RF-04, RF-31–40 · Depende de: T36, T42–T44.
  **Hecho cuando:** solo superadmin ejecuta las operaciones; no existe modificación de modalidad, cancelación definitiva ni suspensión del negocio.

- [ ] **T51 — Probar aislamiento entre dos negocios** · 25 min · RF: RF-04–07, RF-13, RF-22 · Depende de: T47–T50.
  **Hecho cuando:** intentos HTTP de consultar, desactivar, invitar o recuperar cuentas ajenas son rechazados y no alteran registros.

- [ ] **T52 — Probar consumo concurrente de activación** · 25 min · RF: RF-03, RF-09–11, RF-35 · Depende de: T05, T33–T34.
  **Hecho cuando:** dos conexiones con el mismo código producen una única activación y una única habilitación de licencia, sin registros parciales.

- [ ] **T53 — Probar reemplazo frente a consumo de código** · 25 min · RF: RF-10–12, RF-23–24 · Depende de: T05, T26, T33, T40.
  **Hecho cuando:** las carreras entre reemplazo y consumo equivalen a un orden válido y ningún código invalidado completa una operación posterior.

- [ ] **T54 — Probar login frente a cambio o recuperación de contraseña** · 25 min · RF: RF-15, RF-24–25 · Depende de: T05, T35, T40–T41.
  **Hecho cuando:** después del cambio no sobrevive una sesión creada concurrentemente mediante la contraseña anterior.

- [ ] **T55 — Probar doble suspensión y doble reactivación** · 25 min · RF: RF-35, RF-38–40 · Depende de: T05, T42–T43.
  **Hecho cuando:** operaciones concurrentes no reinician la pausa, duplican tiempo ni generan dos eventos para una misma transición.

- [ ] **T56 — Probar renovación concurrente con suspensión o reactivación** · 25 min · RF: RF-31–32, RF-35, RF-39–40 · Depende de: T05, T42–T44.
  **Hecho cuando:** estado, vencimiento y auditoría equivalen a uno de los órdenes seriales posibles, sin perder una renovación.

- [ ] **T57 — Probar rollback de operaciones sensibles** · 25 min · RF: RF-03, RF-09, RF-24, RF-35 · Depende de: T31, T33, T40, T42–T44.
  **Hecho cuando:** fallos provocados antes de confirmar revierten altas, consumo de códigos, cambios de contraseña y modificaciones de licencia junto con su auditoría.

- [ ] **T58 — Probar el recorrido de licencia manual** · 25 min · RF: RF-02, RF-09, RF-15, RF-30, RF-33–37 · Depende de: T45–T50.
  **Hecho cuando:** alta, activación, login, suspensión y reactivación funcionan por HTTP sin vencimiento y la renovación es rechazada.

- [ ] **T59 — Probar el recorrido de licencia por período** · 25 min · RF: RF-28–34, RF-38–39 · Depende de: T45, T46, T50.
  **Hecho cuando:** con reloj controlado se verifica vencimiento, pausa más allá de la fecha registrada, renovación suspendida y recuperación exacta del tiempo al reactivar.

- [ ] **T60 — Probar suspensión antes de activar** · 20 min · RF: RF-09–14, RF-34, RF-37 · Depende de: T46, T48, T50.
  **Hecho cuando:** suspender impide activar, el código sigue caducando a las 48 horas y reactivar no inicia vigencia ni rehabilita códigos vencidos.

## 5. Instalación, verificación y cierre

- [ ] **T61 — Verificar instalación desde cero** · 25 min · RF: RF-01–40 · Depende de: T19, T50.
  **Hecho cuando:** las migraciones se aplican en una base nueva desechable, la aplicación inicia y una segunda ejecución no reaplica migraciones.

- [ ] **T62 — Verificar compilación** · 15 min · RF: soporte transversal RF-01–40 · Depende de: T51–T61.
  **Hecho cuando:** `npm run build` termina correctamente; cualquier corrección necesaria queda resuelta y comprobada antes de marcar la tarea.

- [ ] **T63 — Verificar lint** · 15 min · RF: soporte transversal RF-01–40 · Depende de: T62.
  **Hecho cuando:** `npm run lint` termina sin errores.

- [ ] **T64 — Ejecutar la suite unitaria completa** · 20 min · RF: RF-01–40 · Depende de: T63.
  **Hecho cuando:** todas las pruebas unitarias ejecutan sus casos y pasan, sin ocultar fallos mediante exclusiones.

- [ ] **T65 — Ejecutar integración y pruebas HTTP completas** · 25 min · RF: RF-01–40 · Depende de: T64.
  **Hecho cuando:** las suites pasan sobre MariaDB desechable, incluyen las carreras previstas y cierran sus conexiones.

- [ ] **T66 — Completar la matriz RF → evidencia** · 20 min · RF: RF-01–40 · Depende de: T65.
  **Hecho cuando:** cada RF señala pruebas concretas y resultados; RF-29 y RF-33 distinguen la política de acceso comprobada de la integración de reservas pendiente.

- [ ] **T67 — Actualizar las referencias documentales** · 15 min · RF: soporte documental RF-01–40 · Depende de: T66.
  **Hecho cuando:** los documentos e instrucciones apuntan a `docs/plan.md`, mantienen las mismas reglas y describen cómo ejecutar las verificaciones.

- [ ] **T68 — Revisar alcance y entregar resultados** · 15 min · RF: RF-01–40 · Depende de: T67.
  **Hecho cuando:** el resumen identifica cambios, verificaciones y pendientes, confirma que no se tocaron datos existentes y no presenta las reservas reales como implementadas.

**Pendiente externo al alcance:** integrar la comprobación de licencia en la confirmación transaccional de reservas cuando exista ese módulo. No marcar completos esos escenarios de RF-29 y RF-33 únicamente por superar las pruebas de autenticación.
