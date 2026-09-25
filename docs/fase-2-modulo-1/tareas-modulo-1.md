# Tareas — Fase 2, módulo 1

Desglose del [plan del módulo 1](plan-modulo-1.md), conforme a la [constitución](constitucion-modulo.1.md), la [especificación RF-01–RF-88](spec-modulo-1.md) y [AGENTS.md](../../AGENTS.md).

## Cómo usar esta lista

- **140 tareas pendientes**, con estimaciones individuales de **10 a 25 minutos de trabajo activo**, siempre menores de 30 minutos. Son estimaciones, no garantías: si una tarea supera ese tamaño al examinarla, dividirla antes de continuar, conservando RF y dependencias.
- El orden es topológico: cada dependencia aparece antes que la tarea que la necesita. Las dependencias indicadas son directas y heredan las de sus prerrequisitos. No empezar una tarea con un prerrequisito pendiente.
- Los identificadores **M1-T001–M1-T140** son tareas; no sustituyen los RF ni los escenarios T01–T18 del plan. Las tareas de infraestructura/calidad apoyan los RF citados, pero no los acreditan por sí solas.
- Cada checkbox se marca solo después de verificar su **Hecho cuando:** y registrar evidencia. Los tiempos no incluyen esperas de aprobación, servicios o ejecución desatendida. Un fallo exige corrección y nueva verificación; no equivale a tarea terminada.
- Las cuatro primeras tareas recogen decisiones todavía abiertas en el plan. Preparar una propuesta no equivale a obtener aprobación. Una instalación con datos necesita además su propio plan de conversión aprobado y ensayado antes del despliegue.
- Esta lista describe implementación futura: al crearla no se escribe código de aplicación, no se ejecutan migraciones ni pruebas de aplicación y ninguna tarea se da por completada.
- Mantener las evidencias históricas de fase 1. No incorporar pantallas, reservas/citas reales, ranuras, Ventana libre, Agenda compacta, traslados configurables, pagos, WhatsApp ni PDF. En **RF-88**, aquí se verifica selección/oferta vacía; el rechazo de citas reales queda para la integración futura.
- Trabajar con bases temporales comprobadas, reloj controlado y transporte de correo local/falso; ninguna tarea de prueba autoriza modificar la base cotidiana ni enviar correos a destinatarios reales. Una verificación externa de entrega requiere configuración y autorización de su entorno.

## 1. Decisiones y preparación

- [ ] **M1-T001 — Cerrar el dominio permitido del cupo** · 10 min · RF-20–RF-24

  Dependencias: ninguna.

  Hecho cuando: la decisión del usuario sobre admitir o rechazar cupo cero queda registrada en plan y spec con ejemplos de valores válidos e inválidos; sin respuesta, la tarea permanece pendiente.

- [ ] **M1-T002 — Cerrar la política de horas locales ambiguas** · 20 min · RF-44–RF-47, RF-58–RF-61

  Dependencias: ninguna.

  Hecho cuando: el usuario confirma el tratamiento de horas inexistentes o repetidas y de recurrencias afectadas, con ejemplos verificables documentados; no se asume una política por defecto.

- [ ] **M1-T003 — Precisar el historial que impide eliminar** · 15 min · RF-66–RF-68

  Dependencias: ninguna.

  Hecho cuando: queda confirmada y documentada la elegibilidad de un registro con auditoría técnica de alta pero sin uso operativo, sin autorizar eliminar evidencias.

- [ ] **M1-T004 — Confirmar el destino de instalación** · 15 min · RF-06–RF-19, RF-69–RF-79

  Dependencias: ninguna.

  Hecho cuando: se documenta si se usará base nueva o datos existentes; si hay datos, la conversión queda como trabajo separado obligatorio antes del despliegue y no se autorizan borrados.

- [ ] **M1-T005 — Fijar los contratos HTTP que faltan** · 25 min · RF-06–RF-88

  Dependencias: ninguna.

  Hecho cuando: el plan enumera rutas y operaciones nuevas, entradas mínimas, permisos y errores; se conserva activación con correo, último guardado válido y ningún código utilizable en respuestas.

- [ ] **M1-T006 — Extender fixtures de dos negocios y cuatro roles** · 25 min · RF-01–RF-05, RF-29–RF-30

  Dependencias: ninguna.

  Hecho cuando: las factorías de datos de prueba describen Profesional, invitación sin cuenta y recursos de dos negocios con IDs independientes y reloj controlado; su persistencia se conectará conforme existan las migraciones.

- [ ] **M1-T007 — Preparar carreras deterministas de prueba** · 20 min · RF-11–RF-13, RF-23, RF-47, RF-53, RF-79

  Dependencias: M1-T006.

  Hecho cuando: una prueba de soporte coordina dos conexiones mediante barreras y cierra los recursos sin sleeps arbitrarios ni acceso a la base cotidiana.

- [ ] **M1-T008 — Declarar composición de módulos nuevos** · 25 min · RF-20–RF-65, RF-86–RF-88

  Dependencias: ninguna.

  Hecho cuando: Sucursales, Servicios, Profesionales, Horarios, Bloqueos y Correos se componen en una prueba Nest, sin dependencias circulares ni envío automático durante tests.

- [ ] **M1-T009 — Ampliar rol y matriz de permisos** · 25 min · RF-01–RF-05, RF-29–RF-30, RF-63–RF-64

  Dependencias: M1-T006.

  Hecho cuando: pruebas de política permiten los casos de administrador/Profesional y rechazan recepción, recursos ajenos y cambios del Profesional sobre otras personas.

- [ ] **M1-T010 — Definir orden común de bloqueos** · 20 min · RF-11–RF-13, RF-23–RF-26, RF-47, RF-51–RF-53, RF-79

  Dependencias: ninguna.

  Hecho cuando: el plan registra un orden consistente por recurso e ID para identidad, negocio, licencia y perfiles; los casos de cruce no requieren adquirir los mismos recursos en orden inverso.

## 2. Identidad y persistencia inicial

- [ ] **M1-T011 — Extender entidad de negocio** · 20 min · RF-06–RF-08, RF-20–RF-24

  Dependencias: M1-T001.

  Hecho cuando: la entidad incluye RFC no único, destinatario y cupo predeterminado 1, con validadores para la decisión de cupo confirmada.

- [ ] **M1-T012 — Representar alta pendiente y reserva de correo** · 25 min · RF-08–RF-13

  Dependencias: M1-T011.

  Hecho cuando: las entidades modelan invitación sin usuario y correo normalizado con titular exclusivo pendiente o cuenta; no requieren credenciales ficticias.

- [ ] **M1-T013 — Migrar negocios, invitaciones y reservas** · 25 min · RF-06–RF-13, RF-20

  Dependencias: M1-T012, M1-T004.

  Hecho cuando: una base temporal aplica las nuevas tablas/columnas y restricciones de unicidad sin reescribir las migraciones históricas; los datos reales no se convierten.

- [ ] **M1-T014 — Ajustar cuenta completa y rol Profesional** · 25 min · RF-09, RF-29–RF-30, RF-35–RF-36

  Dependencias: M1-T009, M1-T012.

  Hecho cuando: el modelo acepta Profesional con negocio y credenciales completas, conserva un admin por negocio y define la correspondencia con la reserva de correo.

- [ ] **M1-T015 — Migrar restricciones de cuenta** · 25 min · RF-09, RF-13, RF-29–RF-30

  Dependencias: M1-T014, M1-T013.

  Hecho cuando: MariaDB acepta las nuevas cuentas completas y rechaza roles/pertenencias inválidos y dos administradores del mismo negocio en pruebas aisladas.

- [ ] **M1-T016 — Extender destinos de auditoría** · 25 min · RF-09–RF-13, RF-19, RF-66–RF-79

  Dependencias: M1-T012.

  Hecho cuando: se registran destinos de altas pendientes y dominios nuevos sin usuario administrador ficticio ni secretos; pruebas rechazan destinos de otro negocio.

- [ ] **M1-T017 — Implementar reserva y transferencia de correo** · 25 min · RF-09–RF-13, RF-30

  Dependencias: M1-T015, M1-T010.

  Hecho cuando: reservar, transferir a cuenta y liberar por corrección operan en la transacción recibida; la unicidad normalizada se mantiene y un fallo revierte la operación.

- [ ] **M1-T018 — Integrar reserva en altas de cuentas existentes** · 25 min · RF-13, RF-29–RF-30

  Dependencias: M1-T017.

  Hecho cuando: las altas existentes de recepción y superadmin usan la misma autoridad de correo sin cambiar sus permisos ni permitir correos reservados por invitaciones.

- [ ] **M1-T019 — Probar competencia por el mismo correo** · 25 min · RF-11–RF-13, RF-30

  Dependencias: M1-T018, M1-T007.

  Hecho cuando: dos altas con correo equivalente, o cuenta contra invitación, aceptan un solo titular y no dejan datos parciales del intento rechazado.

## 3. Códigos y correo durable

- [ ] **M1-T020 — Separar destinatarios de activación y recuperación** · 25 min · RF-08–RF-16

  Dependencias: M1-T012.

  Hecho cuando: CodigoAcceso admite exactamente un destino según propósito: invitación para activación o cuenta para recuperación, con versión de destinatario y hash.

- [ ] **M1-T021 — Migrar destinatarios y vigencia de códigos** · 25 min · RF-10–RF-16

  Dependencias: M1-T020, M1-T013.

  Hecho cuando: la base temporal rechaza combinaciones de propósito/destino inválidas, pertenencias cruzadas y más de un código vigente por destino y propósito.

- [ ] **M1-T022 — Preparar derivación y versiones de clave** · 25 min · RF-14–RF-19

  Dependencias: M1-T020.

  Hecho cuando: pruebas reproducen el mismo código para la misma emisión, diferencian nonce/propósito/destinatario y comprueban que solo se persisten hash y metadatos no secretos.

- [ ] **M1-T023 — Adaptar emisión y reemplazo de códigos** · 25 min · RF-12, RF-14–RF-16

  Dependencias: M1-T021, M1-T022, M1-T016, M1-T010.

  Hecho cuando: emitir asigna 48 horas o 30 minutos según propósito y reemplazar invalida el anterior sin iniciar licencia ni exponer código en auditoría.

- [ ] **M1-T024 — Adaptar validación y consumo único** · 25 min · RF-09–RF-11, RF-15–RF-16

  Dependencias: M1-T023.

  Hecho cuando: consumir comprueba hash, propósito, destinatario, expiración y estado bajo bloqueo; el consumo y la operación asociada se revierten juntos ante un fallo.

- [ ] **M1-T025 — Definir bandeja de envíos** · 25 min · RF-14–RF-19, RF-80–RF-82

  Dependencias: M1-T020.

  Hecho cuando: la entidad contiene deduplicación, estado, intentos, próxima ejecución, arrendamiento y referencia de dominio, sin cuerpo persistido con código utilizable.

- [ ] **M1-T026 — Migrar la bandeja de correo** · 20 min · RF-14–RF-19, RF-80–RF-82

  Dependencias: M1-T025, M1-T021.

  Hecho cuando: una base temporal impide duplicar la clave de envío y conserva estados e intentos tras reconectar.

- [ ] **M1-T027 — Definir adaptador y transporte controlado** · 20 min · RF-14, RF-17, RF-19, RF-81

  Dependencias: M1-T008.

  Hecho cuando: el adaptador de pruebas simula aceptación, rechazo y timeout y captura solo en memoria; ninguna prueba envía a destinatarios reales.

- [ ] **M1-T028 — Configurar adaptador de entrega real** · 25 min · RF-14, RF-17, RF-19

  Dependencias: M1-T027.

  Hecho cuando: el adaptador obtiene remitente y credenciales de configuración, falla claramente si faltan y pasa su contrato con transporte local/controlado sin guardar secretos en el repositorio.

- [ ] **M1-T029 — Encolar correo con la operación de dominio** · 20 min · RF-14–RF-19

  Dependencias: M1-T026.

  Hecho cuando: crear el envío usa la transacción del llamador; rollback elimina el pendiente y no se contacta al transporte antes del commit.

- [ ] **M1-T030 — Coordinar toma de envíos entre procesadores** · 25 min · RF-17–RF-18, RF-81

  Dependencias: M1-T029, M1-T007.

  Hecho cuando: dos procesadores no toman simultáneamente un envío disponible y un arrendamiento vencido puede recuperarse tras caída.

- [ ] **M1-T031 — Revalidar códigos antes de enviarlos** · 25 min · RF-14–RF-19

  Dependencias: M1-T030, M1-T024, M1-T027.

  Hecho cuando: el emisor reconstruye transitoriamente el código y descarta vencidos, consumidos, invalidados o destinatarios sustituidos sin ampliar su vigencia.

- [ ] **M1-T032 — Registrar resultados y reintentos** · 25 min · RF-17–RF-19, RF-81

  Dependencias: M1-T031.

  Hecho cuando: se persisten resultado sanitizado y próximo intento; los confirmados no se reenvían y el reinicio conserva el trabajo pendiente.

- [ ] **M1-T033 — Probar fallos y recuperación de entrega** · 25 min · RF-14–RF-19

  Dependencias: M1-T032, M1-T028.

  Hecho cuando: pruebas cubren timeout, reinicio y caída tras aceptación; documentan posible duplicación de transporte sin consumo doble del código ni secretos persistidos.

- [ ] **M1-T034 — Exponer estado y reintento autorizado** · 25 min · RF-02, RF-17–RF-19

  Dependencias: M1-T005, M1-T032, M1-T009.

  Hecho cuando: el superadmin consulta y solicita reintento sin recibir el código; otros roles se rechazan y un pendiente no se presenta como entregado.

## 4. Negocios y activación

- [ ] **M1-T035 — Reemplazar el alta con invitación sin usuario** · 25 min · RF-06–RF-08, RF-13–RF-14, RF-20

  Dependencias: M1-T017, M1-T023, M1-T029, M1-T016.

  Hecho cuando: el servicio confirma negocio, licencia pendiente, invitación, reserva, código y envío en conjunto; no crea Usuario para el administrador.

- [ ] **M1-T036 — Probar alta y rollback conjunto** · 25 min · RF-06–RF-08, RF-13, RF-17, RF-20

  Dependencias: M1-T035.

  Hecho cuando: RFC repetido se acepta, correo/slug duplicados se rechazan y fallos inyectados no dejan altas parciales; fallo de correo conserva el negocio pendiente.

- [ ] **M1-T037 — Crear la cuenta al activar** · 25 min · RF-09–RF-11

  Dependencias: M1-T035, M1-T024, M1-T014.

  Hecho cuando: correo y código válidos crean la cuenta completa, transfieren reserva, consumen código e inician negocio/licencia una sola vez dentro de la transacción.

- [ ] **M1-T038 — Corregir destinatario antes de activar** · 25 min · RF-12–RF-13, RF-18

  Dependencias: M1-T037.

  Hecho cuando: el superadmin cambia al correo disponible, invalida código y envío anteriores y encola uno nuevo; no puede corregir una invitación ya activada.

- [ ] **M1-T039 — Adaptar reemisión a invitaciones** · 20 min · RF-12, RF-15, RF-18

  Dependencias: M1-T038.

  Hecho cuando: reemisión mantiene destinatario y negocio, renueva las 48 horas del nuevo código, anula el anterior y no inicia la licencia.

- [ ] **M1-T040 — Enviar recuperación de administrador por correo** · 25 min · RF-14, RF-16, RF-19

  Dependencias: M1-T029, M1-T024, M1-T018.

  Hecho cuando: la recuperación autorizada conserva 30 minutos y los bloqueos previos, entrega por correo y no introduce códigos para recepción o Profesional.

- [ ] **M1-T041 — Actualizar HTTP de alta y activación** · 25 min · RF-06–RF-19, RF-20

  Dependencias: M1-T005, M1-T039, M1-T040.

  Hecho cuando: los DTO exigen RFC/correo según operación y respuestas no incluyen usuario pendiente ni código; errores y roles se verifican por HTTP.

- [ ] **M1-T042 — Probar activación frente a activación** · 20 min · RF-09–RF-11

  Dependencias: M1-T037, M1-T007.

  Hecho cuando: dos conexiones consumen el mismo código y solo una crea cuenta, inicia licencia y audita, sin registros parciales.

- [ ] **M1-T043 — Probar activación frente a reemplazo** · 25 min · RF-10–RF-13, RF-18

  Dependencias: M1-T039, M1-T038, M1-T007.

  Hecho cuando: ambos órdenes entre activación, reemisión y corrección respetan el ganador del bloqueo; ningún código o correo sustituido activa después.

- [ ] **M1-T044 — Probar invalidaciones y secretos por HTTP** · 25 min · RF-09–RF-19

  Dependencias: M1-T041, M1-T042, M1-T043.

  Hecho cuando: correo distinto, código vencido/usado/sustituido y entradas extra se rechazan sin activar; ninguna respuesta o log de los recorridos contiene secretos.

## 5. Licencias y control de acceso

- [ ] **M1-T045 — Ampliar los estados persistidos de licencia** · 25 min · RF-69–RF-79, RF-82–RF-85

  Dependencias: M1-T011.

  Hecho cuando: las entidades distinguen solicitud, bloqueo previsto, congelación efectiva, remanente y versión de vencimiento, sin confundir suspensión pendiente con efectiva.

- [ ] **M1-T046 — Crear la migración incremental de licencias** · 25 min · RF-69–RF-79, RF-82–RF-85

  Dependencias: M1-T045, M1-T013.

  Hecho cuando: una base temporal con las migraciones anteriores admite la nueva migración y conserva sus licencias; no se modifican migraciones históricas.

- [ ] **M1-T047 — Definir la política temporal compartida de acceso** · 25 min · RF-69–RF-72, RF-77–RF-78

  Dependencias: M1-T045.

  Hecho cuando: pruebas con reloj fijo resuelven acceso antes, exactamente en y después del menor entre vencimiento y bloqueo previsto; una licencia inicial suspendida no permite activación.

- [ ] **M1-T048 — Solicitar suspensión de forma transaccional** · 25 min · RF-69–RF-73, RF-77, RF-79

  Dependencias: M1-T046, M1-T047, M1-T010, M1-T016.

  Hecho cuando: una solicitud fija el plazo una sola vez; repetirla no lo reinicia y la suspensión inicial impide activar sin consumir tiempo.

- [ ] **M1-T049 — Materializar la congelación al instante efectivo** · 25 min · RF-71–RF-73, RF-78–RF-79

  Dependencias: M1-T048.

  Hecho cuando: materializar tarde calcula el remanente desde el instante efectivo original, nunca desde la ejecución tardía; repetir no duplica tiempo ni eventos.

- [ ] **M1-T050 — Separar reactivación anticipada y posterior** · 25 min · RF-74–RF-75, RF-79

  Dependencias: M1-T049.

  Hecho cuando: pruebas verifican que cancelar durante la gracia no devuelve tiempo y reactivar después restaura exactamente el remanente congelado una sola vez.

- [ ] **M1-T051 — Adaptar la renovación anual a la suspensión** · 25 min · RF-76, RF-79

  Dependencias: M1-T050.

  Hecho cuando: renovar usa el calendario anual existente y conserva suspensión pendiente o efectiva; pruebas comprueban tiempo acumulado y auditoría sin duplicados.

- [ ] **M1-T052 — Aplicar vigencia en cada solicitud autenticada** · 25 min · RF-69–RF-72, RF-77–RF-78

  Dependencias: M1-T049, M1-T009.

  Hecho cuando: un token emitido antes de suspender sirve durante la gracia válida y falla exactamente al bloqueo; la decisión no depende de que haya corrido un proceso programado.

- [ ] **M1-T053 — Unificar login, logout y acceso de superadmin con la política** · 20 min · RF-02, RF-35–RF-36, RF-69–RF-78

  Dependencias: M1-T052.

  Hecho cuando: login usa la misma vigencia que las solicitudes protegidas; se conserva logout compatible y el superadmin sigue gestionando negocios bloqueados sin habilitar a sus usuarios.

- [ ] **M1-T054 — Integrar la política de licencia con la activación** · 20 min · RF-09–RF-11, RF-77, RF-79

  Dependencias: M1-T037, M1-T048.

  Hecho cuando: activar una alta suspendida no crea cuenta ni consume código; la activación válida inicia la licencia una sola vez dentro de la misma transacción.

- [ ] **M1-T055 — Calcular la vista de vigencia sin ambigüedades** · 25 min · RF-83–RF-85

  Dependencias: M1-T047, M1-T050, M1-T051.

  Hecho cuando: pruebas de reloj verifican vencimiento, hora del servidor, días/horas/minutos y estados pendiente, en gracia, congelado y vencido, sin cuenta regresiva falsa.

- [ ] **M1-T056 — Exponer la consulta y ajustar comandos de licencia** · 25 min · RF-02, RF-69–RF-79, RF-83–RF-85

  Dependencias: M1-T005, M1-T055, M1-T052, M1-T051.

  Hecho cuando: los contratos HTTP acordados devuelven la vista y cambios permitidos; una licencia bloqueada no obtiene una excepción de acceso implícita a la consulta.

- [ ] **M1-T057 — Probar la frontera exacta de 48 horas por HTTP** · 25 min · RF-69–RF-78, RF-83–RF-85

  Dependencias: M1-T056, M1-T054.

  Hecho cuando: casos a 48 h menos un instante, a 48 h y después, y vencimiento natural anterior verifican acceso, datos intactos y vista temporal con reloj controlado.

- [ ] **M1-T058 — Probar carreras entre transiciones de licencia** · 25 min · RF-73–RF-76, RF-79

  Dependencias: M1-T056, M1-T007.

  Hecho cuando: dos conexiones fuerzan suspensión/repetición, renovación/reactivación y congelación/reactivación; estado, remanente y eventos coinciden con un orden válido sin duplicados.

## 6. Sucursales y catálogo de servicios

- [ ] **M1-T059 — Definir la entidad de sucursal y su pertenencia** · 20 min · RF-21–RF-26

  Dependencias: M1-T011, M1-T008.

  Hecho cuando: la entidad incluye campos aprobados, zona IANA y estado, con pertenencia inequívoca al negocio.

- [ ] **M1-T060 — Crear la migración incremental de sucursales** · 25 min · RF-20–RF-26

  Dependencias: M1-T059, M1-T013.

  Hecho cuando: la migración sobre base temporal crea índices y restricciones necesarios sin borrar tablas ni datos existentes.

- [ ] **M1-T061 — Validar entradas de sucursal** · 20 min · RF-21

  Dependencias: M1-T059, M1-T005.

  Hecho cuando: pruebas aceptan mapas/notas ausentes y rechazan obligatorios ausentes, zona desconocida y formatos inválidos conforme al contrato, con errores por campo.

- [ ] **M1-T062 — Crear sucursal bajo el cupo del negocio** · 25 min · RF-20–RF-23

  Dependencias: M1-T060, M1-T061, M1-T010.

  Hecho cuando: el alta cuenta únicamente sucursales activas dentro de la transacción protegida del negocio y rechaza sobrecupo sin escritura parcial.

- [ ] **M1-T063 — Cambiar el límite exclusivamente como superadmin** · 20 min · RF-02, RF-20, RF-24

  Dependencias: M1-T062, M1-T009, M1-T001.

  Hecho cuando: aumentar funciona y reducir por debajo de activas se rechaza; cualquier valor cero sigue la decisión aprobada y ningún otro rol puede modificarlo.

- [ ] **M1-T064 — Consultar, editar y desactivar sucursales** · 25 min · RF-01–RF-04, RF-21, RF-25, RF-66

  Dependencias: M1-T062.

  Hecho cuando: las operaciones validan negocio y permisos; desactivar conserva el registro y deja de contarlo en el cupo, sin habilitar su uso operativo.

- [ ] **M1-T065 — Exponer operaciones iniciales de sucursal y cupo** · 25 min · RF-01–RF-04, RF-20–RF-25

  Dependencias: M1-T005, M1-T064, M1-T063.

  Hecho cuando: pruebas HTTP de alta, consulta, edición, desactivación y cambio de cupo verifican roles, pertenencia y errores; la reactivación queda para su tarea dependiente de horarios.

- [ ] **M1-T066 — Probar altas y cambios de cupo simultáneos** · 25 min · RF-22–RF-24

  Dependencias: M1-T065, M1-T007.

  Hecho cuando: dos conexiones compiten por el último lugar y por reducir el cupo; no termina ningún negocio con más sucursales activas que su límite.

- [ ] **M1-T067 — Definir entidad y migración del catálogo de servicios** · 25 min · RF-27–RF-28, RF-34

  Dependencias: M1-T008, M1-T013.

  Hecho cuando: una migración nueva en base temporal persiste costo decimal exacto, duración entera, nombre, pertenencia y estado; no introduce tarifas por sucursal o profesional.

- [ ] **M1-T068 — Crear, consultar y modificar servicios del negocio** · 25 min · RF-01–RF-04, RF-27–RF-28

  Dependencias: M1-T067, M1-T005.

  Hecho cuando: pruebas cubren costo cero válido, costo negativo rechazado y duración entera positiva; lectura y modificación no cruzan negocios.

- [ ] **M1-T069 — Desactivar y reactivar servicios sin perder datos** · 20 min · RF-34, RF-66

  Dependencias: M1-T068.

  Hecho cuando: las transiciones preservan el catálogo y distinguen estado global de futuras selecciones individuales.

- [ ] **M1-T070 — Exponer y probar el catálogo por HTTP** · 25 min · RF-01–RF-05, RF-27–RF-28, RF-34, RF-66

  Dependencias: M1-T069, M1-T009.

  Hecho cuando: las rutas permiten gestionar el catálogo al administrador y rechazan recepción, Profesional e IDs de otro negocio; los datos conservan costo y duración comunes.

## 7. Profesionales y selección de servicios

- [ ] **M1-T071 — Definir perfiles y relaciones con sucursales y servicios** · 25 min · RF-29–RF-34, RF-86–RF-88

  Dependencias: M1-T014, M1-T059, M1-T067.

  Hecho cuando: las entidades separan perfil y cuenta sin duplicar credenciales, y representan relaciones múltiples con claves de pertenencia al negocio.

- [ ] **M1-T072 — Crear la migración de perfiles y relaciones** · 25 min · RF-29–RF-34, RF-86–RF-88

  Dependencias: M1-T071, M1-T015, M1-T060, M1-T067.

  Hecho cuando: la base temporal impide perfil duplicado, selección duplicada y relaciones entre negocios mediante las restricciones previstas.

- [ ] **M1-T073 — Crear cuenta completa y perfil Profesional** · 25 min · RF-29–RF-30

  Dependencias: M1-T072, M1-T018, M1-T009.

  Hecho cuando: el administrador crea cuenta y perfil atómicamente con nombre, correo único y contraseña válida; cualquier fallo no deja cuenta ni reserva de correo huérfana.

- [ ] **M1-T074 — Gestionar pertenencia del Profesional a sucursales** · 25 min · RF-01, RF-03, RF-05, RF-31

  Dependencias: M1-T073, M1-T010.

  Hecho cuando: el administrador asigna varias sucursales del negocio y se rechazan sucursales ajenas; el propio Profesional no adquiere permiso para cambiar sus asignaciones.

- [ ] **M1-T075 — Desactivar y reactivar acceso del Profesional** · 25 min · RF-35–RF-36, RF-66

  Dependencias: M1-T073, M1-T052.

  Hecho cuando: desactivar invalida el acceso con sesiones abiertas sin borrar el perfil; reactivar conserva credenciales, exige nuevo login y no revive sesiones anteriores.

- [ ] **M1-T076 — Consultar y modificar los datos permitidos del perfil** · 25 min · RF-01–RF-05, RF-29–RF-30, RF-35–RF-36

  Dependencias: M1-T073, M1-T075, M1-T017.

  Hecho cuando: los cambios admitidos en el contrato no duplican identidad ni evaden la reserva de correo o permisos; pruebas conservan los datos previos ante actualización inválida.

- [ ] **M1-T077 — Consultar selección de servicios del Profesional** · 20 min · RF-32, RF-34, RF-86

  Dependencias: M1-T072, M1-T068.

  Hecho cuando: la consulta devuelve opciones activas y selecciones persistidas, incluidas las globalmente desactivadas con su estado, para representar los checkboxes.

- [ ] **M1-T078 — Guardar el conjunto exacto de servicios seleccionados** · 25 min · RF-32, RF-34, RF-87–RF-88

  Dependencias: M1-T077, M1-T010.

  Hecho cuando: guardar agrega y retira únicamente relaciones del perfil autorizado; una lista vacía es válida y ningún dato de sucursales, horarios o catálogo se modifica.

- [ ] **M1-T079 — Resolver la oferta efectiva por sucursal** · 25 min · RF-25, RF-31–RF-35, RF-88

  Dependencias: M1-T078, M1-T074, M1-T075, M1-T064.

  Hecho cuando: pruebas muestran solo servicios globalmente activos seleccionados por profesionales activos asignados a una sucursal activa; selección vacía produce oferta vacía.

- [ ] **M1-T080 — Exponer operaciones de perfiles y selección** · 25 min · RF-01–RF-05, RF-29–RF-36, RF-86–RF-88

  Dependencias: M1-T005, M1-T079, M1-T076.

  Hecho cuando: las rutas separan asignaciones de sucursal del formulario de servicios; admin y Profesional propio guardan selecciones y se rechaza editar otro perfil.

- [ ] **M1-T081 — Probar persistencia y aislamiento de los checkboxes** · 25 min · RF-32–RF-34, RF-86–RF-88

  Dependencias: M1-T080.

  Hecho cuando: guardar, desmarcar y volver a consultar conserva el conjunto esperado; selección vacía no borra cuenta/relaciones y editar un perfil no altera otro ni el catálogo.

- [ ] **M1-T082 — Probar altas y selecciones concurrentes de perfiles** · 25 min · RF-01, RF-29–RF-34, RF-87–RF-88

  Dependencias: M1-T080, M1-T007.

  Hecho cuando: las carreras por correo y por el mismo perfil no producen cuentas duplicadas ni conjuntos parciales; no se habilita oferta de un servicio globalmente desactivado.

## 8. Horarios semanales y excepciones

- [ ] **M1-T083 — Definir persistencia de franjas y borradores** · 25 min · RF-37–RF-43, RF-45, RF-54

  Dependencias: M1-T071.

  Hecho cuando: las entidades tienen identificador estable, día, sucursal, minutos de entrada/salida, descanso y estado; admiten campos incompletos solo en borradores inactivos.

- [ ] **M1-T084 — Migrar franjas con pertenencia y estados** · 25 min · RF-37–RF-43, RF-54

  Dependencias: M1-T083, M1-T072.

  Hecho cuando: la migración temporal conserva integridad del negocio y permite almacenar/recuperar borradores sin exigirles campos propios de una franja activa.

- [ ] **M1-T085 — Definir y migrar excepciones por fecha** · 25 min · RF-44–RF-47

  Dependencias: M1-T084.

  Hecho cuando: existen cabecera única por profesional/sucursal/fecha y franjas hijas; una cabecera sin franjas se distingue de la ausencia de excepción.

- [ ] **M1-T086 — Validar franja, descanso y cambio de estado** · 25 min · RF-38–RF-43, RF-45, RF-49–RF-50

  Dependencias: M1-T083.

  Hecho cuando: pruebas cubren borrador, activación incompleta, intervalo invertido, descanso parcial o fuera de franja y salida 24:00; los errores identifican campos.

- [ ] **M1-T087 — Resolver intervalos locales conforme a la decisión horaria** · 25 min · RF-44–RF-46, RF-58–RF-61

  Dependencias: M1-T002, M1-T086.

  Hecho cuando: pruebas con zonas y cambios de desplazamiento convierten intervalos y aplican la política aprobada para horas inexistentes/repetidas, sin desplazamientos silenciosos.

- [ ] **M1-T088 — Detectar empalmes entre sucursales y días locales** · 25 min · RF-41, RF-43, RF-46–RF-48

  Dependencias: M1-T087, M1-T074.

  Hecho cuando: el detector compara intervalos completos, no resta descansos y permite límites consecutivos; detecta coincidencias aunque los días locales difieran.

- [ ] **M1-T089 — Validar recurrencias y sustituciones por fecha** · 25 min · RF-44–RF-48

  Dependencias: M1-T088, M1-T085.

  Hecho cuando: pruebas combinan semana, excepción normal/vacía y transiciones de zona; comprobar una semana actual no se usa como prueba de validez de toda la recurrencia.

- [ ] **M1-T090 — Guardar una semana como reemplazo atómico** · 25 min · RF-37–RF-43, RF-47, RF-51–RF-53

  Dependencias: M1-T089, M1-T084, M1-T010.

  Hecho cuando: la transacción bloquea al Profesional, valida el conjunto contra el estado vigente y lo reemplaza completo; cualquier error conserva íntegra la versión anterior.

- [ ] **M1-T091 — Recuperar semana y errores identificables** · 20 min · RF-39–RF-40, RF-52, RF-54

  Dependencias: M1-T090.

  Hecho cuando: la consulta devuelve también franjas inactivas/borradores y semana vacía; un error de guardado referencia fila/campo sin exigir recapturar el resto.

- [ ] **M1-T092 — Crear, sustituir y retirar una excepción de fecha** · 25 min · RF-44–RF-47, RF-51–RF-53

  Dependencias: M1-T089, M1-T090.

  Hecho cuando: crear o sustituir valida empalmes bajo el mismo bloqueo del perfil; la excepción vacía elimina atención de esa fecha y retirarla restaura la semana solo si el resultado es válido.

- [ ] **M1-T093 — Exponer semana y excepciones con permisos de propietario** · 25 min · RF-01–RF-05, RF-37–RF-54

  Dependencias: M1-T005, M1-T091, M1-T092.

  Hecho cuando: admin y Profesional propio consultan/guardan; recepción y otro Profesional no editan, y las respuestas preservan identificadores y errores por campo.

- [ ] **M1-T094 — Probar interruptores, borradores y descansos** · 25 min · RF-37–RF-43, RF-49–RF-54

  Dependencias: M1-T093.

  Hecho cuando: pruebas comprueban interruptores independientes, quitar última franja, semana vacía, borrador recuperable, activación inválida y todos los límites del descanso.

- [ ] **M1-T095 — Probar días distintos, excepciones y consecutividad** · 25 min · RF-43–RF-50

  Dependencias: M1-T093.

  Hecho cuando: casos verifican cambio de sucursal con franjas separadas, descanso que no libera asignación, medianoche, excepción vacía y choques reales entre zonas distintas.

- [ ] **M1-T096 — Probar último guardado válido y rollback semanal** · 25 min · RF-47, RF-51–RF-54

  Dependencias: M1-T093, M1-T007.

  Hecho cuando: dos reemplazos válidos dejan la última versión confirmada; un segundo inválido y un fallo provocado conservan la primera completa, sin filas mezcladas.

- [ ] **M1-T097 — Reactivar sucursal validando cupo y horarios** · 25 min · RF-23–RF-26, RF-46–RF-47

  Dependencias: M1-T089, M1-T064, M1-T063, M1-T010.

  Hecho cuando: reactivar valida cupo y horarios conservados en una transacción coordinada por negocio/perfiles; un conflicto deja la sucursal inactiva e identifica las franjas. La operación queda conectada a su ruta HTTP autorizada.

- [ ] **M1-T098 — Validar cambios de zona y asignaciones con horarios existentes** · 25 min · RF-21, RF-26, RF-31, RF-41, RF-46–RF-47

  Dependencias: M1-T097, M1-T074.

  Hecho cuando: cambiar zona o asignaciones no deja franjas activas inválidas; la validación usa el mismo orden de bloqueos que el guardado semanal.

- [ ] **M1-T099 — Probar cruces entre horarios y sus dependencias** · 25 min · RF-23–RF-26, RF-41, RF-44, RF-47, RF-51–RF-53

  Dependencias: M1-T098, M1-T092, M1-T007.

  Hecho cuando: carreras semana/excepción, semana/asignación y semana/reactivación se serializan sin empalmes ni sobrecupo; una operación rechazada no deja cambios parciales.

- [ ] **M1-T100 — Probar reactivaciones simultáneas en el último cupo** · 20 min · RF-23–RF-26

  Dependencias: M1-T097, M1-T007.

  Hecho cuando: dos reactivaciones o alta/reactivación compiten por un único lugar; solo una se confirma y la rechazada conserva estado y horarios anteriores.

## 9. Bloqueos y disponibilidad resultante

- [ ] **M1-T101 — Definir y migrar bloqueos individuales y colectivos** · 25 min · RF-55–RF-61

  Dependencias: M1-T072, M1-T008.

  Hecho cuando: la migración temporal persiste motivo, tipo, fechas, horas opcionales y alcances; identifica inequívocamente equipo/todas las sucursales sin relaciones ajenas.

- [ ] **M1-T102 — Validar datos e intervalos de bloqueo** · 25 min · RF-55, RF-58–RF-61

  Dependencias: M1-T101, M1-T087.

  Hecho cuando: pruebas aceptan rango continuo con dos horas o días completos inclusivos y rechazan tipo/motivo ausentes, una sola hora, inversión y duración nula.

- [ ] **M1-T103 — Resolver permisos de lectura y gestión de bloqueos** · 25 min · RF-03, RF-05, RF-56–RF-57, RF-63–RF-64

  Dependencias: M1-T101, M1-T009, M1-T074.

  Hecho cuando: la matriz distingue admin, Profesional afectado y creador; el Profesional gestiona bloqueos individuales propios incluso creados por admin, nunca colectivos ni ajenos.

- [ ] **M1-T104 — Crear y editar bloqueos preservando su alcance autorizado** · 25 min · RF-55–RF-61, RF-63–RF-64

  Dependencias: M1-T102, M1-T103, M1-T010.

  Hecho cuando: crear/editar valida pertenencia y alcance antes y después del cambio; cambiar IDs no convierte un bloqueo propio en colectivo ni afecta otro Profesional.

- [ ] **M1-T105 — Consultar y eliminar un bloqueo autorizado** · 20 min · RF-62–RF-64

  Dependencias: M1-T104.

  Hecho cuando: listar incluye bloqueos que afectan al Profesional y eliminar actúa únicamente sobre el ID autorizado; los demás bloqueos se conservan.

- [ ] **M1-T106 — Interpretar alcance colectivo en zonas locales** · 25 min · RF-56–RF-61

  Dependencias: M1-T104, M1-T074.

  Hecho cuando: cada sucursal afectada usa su zona local; el alcance todas/equipo se resuelve sobre las asignaciones vigentes conforme al plan, no como una copia congelada de destinatarios.

- [ ] **M1-T107 — Combinar restricciones sin borrar horarios** · 25 min · RF-50, RF-62, RF-65

  Dependencias: M1-T106, M1-T105, M1-T089.

  Hecho cuando: pruebas demuestran unión de bloqueos superpuestos y prioridad sobre excepciones; quitar uno no libera el tramo cubierto por otro ni modifica franjas.

- [ ] **M1-T108 — Exponer y probar contratos de gestión de bloqueos** · 25 min · RF-01–RF-05, RF-55–RF-65

  Dependencias: M1-T005, M1-T107.

  Hecho cuando: rutas de consulta, alta, edición y baja validan rol, negocio, perfil y alcance; HTTP conserva datos anteriores ante entradas inválidas.

- [ ] **M1-T109 — Probar rangos, superposición y permisos por HTTP** · 25 min · RF-55–RF-65

  Dependencias: M1-T108.

  Hecho cuando: casos atraviesan varios días/sucursales y verifican horas continuas, días inclusivos, rechazo de hora parcial, modificación individual por Profesional y prohibición de colectivo.

- [ ] **M1-T110 — Exponer intervalos de atención por fechas, sin ranuras de citas** · 25 min · RF-25, RF-37–RF-50, RF-54, RF-62, RF-65

  Dependencias: M1-T093, M1-T107, M1-T108.

  Hecho cuando: la consulta autorizada combina semana o excepción, sucursal operativa, descansos y unión de bloqueos; omite borradores/inactivas y no genera slots ni citas.

## 10. Bajas seguras y conservación

- [ ] **M1-T111 — Definir política de eliminación por relaciones e historial** · 20 min · RF-66–RF-68

  Dependencias: M1-T003, M1-T072, M1-T084, M1-T101.

  Hecho cuando: la política implementa el significado aprobado de historial y enumera relaciones impeditivas sin borrar auditoría para permitir una eliminación.

- [ ] **M1-T112 — Eliminar únicamente sucursales elegibles** · 25 min · RF-66–RF-68

  Dependencias: M1-T111, M1-T097.

  Hecho cuando: el endpoint rechaza una sucursal relacionada/con historial indicando desactivación como alternativa; una elegible se elimina sin afectar otros registros.

- [ ] **M1-T113 — Eliminar únicamente servicios elegibles** · 20 min · RF-66–RF-68

  Dependencias: M1-T111, M1-T078.

  Hecho cuando: un servicio con selección o historial no se elimina; la baja elegible y la desactivación conservan las relaciones no afectadas.

- [ ] **M1-T114 — Resolver la baja elegible del perfil y su cuenta vinculada** · 25 min · RF-35–RF-36, RF-66–RF-68

  Dependencias: M1-T111, M1-T075.

  Hecho cuando: la operación aplica la política aprobada al agregado perfil/cuenta, rechaza cualquier relación o historial impeditivo y no deja credenciales o referencias huérfanas.

- [ ] **M1-T115 — Probar eliminación frente a creación de relaciones** · 25 min · RF-66–RF-68

  Dependencias: M1-T112, M1-T113, M1-T114, M1-T007.

  Hecho cuando: dos conexiones intentan eliminar y relacionar el mismo registro; una falla limpiamente y no quedan huérfanos ni auditoría de cambios revertidos.

## 11. Avisos de vencimiento

- [ ] **M1-T116 — Detectar licencias dentro de la ventana de aviso** · 25 min · RF-80–RF-82

  Dependencias: M1-T055, M1-T049.

  Hecho cuando: con reloj fijo se detecta el umbral de dos días y envío tardío permitido antes de vencer; no se seleccionan licencias o vencimientos obsoletos.

- [ ] **M1-T117 — Encolar un aviso por versión de vencimiento** · 25 min · RF-80–RF-82

  Dependencias: M1-T116, M1-T029.

  Hecho cuando: el envío refiere a la administradora vigente y a la versión de vencimiento; dos detecciones no crean dos avisos lógicos para la misma versión.

- [ ] **M1-T118 — Revalidar y enviar avisos desde la bandeja** · 25 min · RF-80–RF-82

  Dependencias: M1-T117, M1-T032.

  Hecho cuando: antes del envío se revalida vencimiento/destinatario, se descartan avisos obsoletos y se reintenta solo mientras siga vigente; un confirmado no se reenvía.

- [ ] **M1-T119 — Invalidar avisos al cambiar vencimiento o estado** · 20 min · RF-75–RF-76, RF-80–RF-82

  Dependencias: M1-T118, M1-T051.

  Hecho cuando: renovar, suspender efectivamente o reactivar actualiza la elegibilidad y versión; un aviso pendiente anterior no anuncia un vencimiento sustituido.

- [ ] **M1-T120 — Probar avisos con reloj, fallos y dos procesadores** · 25 min · RF-80–RF-85

  Dependencias: M1-T119, M1-T007.

  Hecho cuando: pruebas verifican frontera de 48 h, caída/reintento, expiración, renovación y procesadores simultáneos, sin repetir confirmados ni enviar avisos ya invalidados.

## 12. Integración, regresión y cierre

- [ ] **M1-T121 — Conectar ejecución periódica y recuperación de la bandeja** · 25 min · RF-14–RF-18, RF-80–RF-82

  Dependencias: M1-T033, M1-T120.

  Hecho cuando: el ejecutor toma envíos y detecta avisos al arrancar/ejecutarse, recupera arrendamientos vencidos y una prueba con reinicio usa transporte falso sin perder pendientes.

- [ ] **M1-T122 — Conectar conciliación de suspensiones vencidas** · 20 min · RF-72–RF-73, RF-79

  Dependencias: M1-T049, M1-T058.

  Hecho cuando: un ciclo con reloj fijo materializa suspensiones vencidas una sola vez; acceso y remanente siguen correctos si el ciclo se retrasa o no corre.

- [ ] **M1-T123 — Verificar configuración y rotación de claves de correo** · 20 min · RF-14–RF-19, RF-80–RF-82

  Dependencias: M1-T028, M1-T022, M1-T121.

  Hecho cuando: la configuración documentada separa claves de JWT/códigos y remitente/transporte, no contiene secretos y las pruebas cubren versión anterior vigente y configuración faltante sin destinatarios reales.

- [ ] **M1-T124 — Sincronizar el SQL de identidad y mensajería** · 25 min · RF-06–RF-19, RF-29–RF-30

  Dependencias: M1-T044, M1-T072, M1-T026.

  Hecho cuando: db/schema.sql coincide con entidades/migraciones en cuentas, invitaciones, reserva de correos y envíos; el diff no reescribe migraciones históricas.

- [ ] **M1-T125 — Sincronizar el SQL de catálogos y calendario** · 25 min · RF-20–RF-68, RF-86–RF-88

  Dependencias: M1-T115, M1-T099, M1-T110.

  Hecho cuando: db/schema.sql coincide con entidades/migraciones de sucursales, servicios, perfiles, relaciones, franjas, excepciones y bloqueos, con las restricciones de pertenencia.

- [ ] **M1-T126 — Sincronizar el SQL de licencias** · 15 min · RF-69–RF-85

  Dependencias: M1-T057, M1-T058, M1-T120.

  Hecho cuando: el SQL representa las fechas, estados, remanente y versión adoptados en las migraciones y admite suspensión con remanente cero.

- [ ] **M1-T127 — Verificar instalación completa sobre base desechable** · 25 min · RF-01–RF-88

  Dependencias: M1-T124, M1-T125, M1-T126, M1-T004.

  Hecho cuando: las migraciones históricas más las nuevas se aplican en una base temporal validada, una segunda ejecución no agrega cambios y la comparación con el esquema queda registrada; no se toca la base cotidiana.

- [ ] **M1-T128 — Actualizar y ejecutar la regresión compatible de autenticación** · 25 min · RF-01–RF-19, RF-29–RF-30, RF-35–RF-36

  Dependencias: M1-T044, M1-T080, M1-T053.

  Hecho cuando: sesiones, contraseñas, recepción y límites de intentos conservan contratos compatibles; se sustituyen expectativas de cuentas incompletas/códigos en respuestas sin cambiar evidencias históricas ni añadir recuperación por código al Profesional.

- [ ] **M1-T129 — Completar regresión anual y rollback de licencias** · 25 min · RF-69–RF-85

  Dependencias: M1-T058, M1-T057, M1-T122.

  Hecho cuando: casos de aniversario bisiesto, remanente cero, renovaciones simultáneas y fallo transaccional verifican calendario America/Chihuahua y ausencia de tiempo o eventos duplicados.

- [ ] **M1-T130 — Auditar permisos HTTP de catálogos y perfiles** · 25 min · RF-01–RF-05, RF-20–RF-36, RF-66–RF-68, RF-86–RF-88

  Dependencias: M1-T065, M1-T080, M1-T070, M1-T115, M1-T100.

  Hecho cuando: pruebas de los cuatro roles e IDs cruzados por ruta/cuerpo rechazan permisos indebidos, incluido cupo por admin y selección de otro Profesional, sin efectos laterales.

- [ ] **M1-T131 — Auditar permisos HTTP de horarios y bloqueos** · 25 min · RF-01–RF-05, RF-37–RF-65

  Dependencias: M1-T093, M1-T108, M1-T110.

  Hecho cuando: dos negocios y perfiles diferentes prueban pertenencia en semana, excepciones, consulta y bloqueos; un cambio de alcance no evade permisos.

- [ ] **M1-T132 — Probar corte de acceso sobre todas las rutas nuevas** · 25 min · RF-35–RF-36, RF-69–RF-78, RF-83–RF-85

  Dependencias: M1-T130, M1-T131, M1-T053, M1-T056.

  Hecho cuando: una matriz parametrizada cubre lectura y escritura con sesión abierta antes/en/después del bloqueo y cuenta desactivada; el superadmin conserva gestión y nadie obtiene un bypass por la consulta.

- [ ] **M1-T133 — Ejecutar el recorrido funcional conjunto sin citas** · 25 min · RF-06–RF-88

  Dependencias: M1-T127, M1-T132, M1-T121, M1-T110, M1-T081.

  Hecho cuando: un caso HTTP recorre alta, correo falso, activación, catálogos, Profesional, selección vacía/restablecida, horario, bloqueo, suspensión y reactivación; comprueba preservación de horarios al desmarcar sin registrar citas.

- [ ] **M1-T134 — Ejecutar compilación y lint del cambio de código** · 15 min · RF-01–RF-88

  Dependencias: M1-T133, M1-T128, M1-T129, M1-T123.

  Hecho cuando: npm run build y npm run lint finalizan sin errores; se revisa cualquier cambio del formateador y se registran resultados, sin marcar esta tarea si falla alguno.

- [ ] **M1-T135 — Ejecutar la suite unitaria completa** · 15 min · RF-01–RF-88

  Dependencias: M1-T134.

  Hecho cuando: npm test -- --runInBand finaliza sin fallos y se registra el resultado; pruebas omitidas no se presentan como evidencia de aceptación.

- [ ] **M1-T136 — Ejecutar integración con MariaDB temporal real** · 20 min · RF-01–RF-88

  Dependencias: M1-T135, M1-T019, M1-T042, M1-T043, M1-T066, M1-T082, M1-T096, M1-T099, M1-T100, M1-T115, M1-T058, M1-T120.

  Hecho cuando: npm run test:integration -- --runInBand pasa sobre una base desechable segura, incluidas carreras y rollback; los resultados identifican el entorno y no sustituyen MariaDB por mocks.

- [ ] **M1-T137 — Ejecutar la suite HTTP/e2e completa** · 20 min · RF-01–RF-88

  Dependencias: M1-T136, M1-T132.

  Hecho cuando: npm run test:e2e -- --runInBand pasa con reloj/transporte controlados, sin correos reales ni pruebas de citas declaradas como terminadas.

- [ ] **M1-T138 — Vincular RF y criterios de cierre de identidad y catálogos** · 25 min · RF-01–RF-36, RF-66–RF-68, RF-86–RF-88

  Dependencias: M1-T137.

  Hecho cuando: la matriz RF → caso → resultado/evidencia enlaza cada requisito indicado y criterios 1–6, 24–27 de la spec; RF-88 distingue oferta vacía de rechazo futuro de citas reales.

- [ ] **M1-T139 — Vincular RF y criterios de cierre de calendario y licencias** · 25 min · RF-37–RF-65, RF-69–RF-85

  Dependencias: M1-T137.

  Hecho cuando: la matriz enlaza casos y resultados para cada requisito indicado y criterios 7–23; no se usan evidencias antiguas para acreditar comportamientos nuevos.

- [ ] **M1-T140 — Cerrar trazabilidad y documentar pendientes de entrega** · 20 min · RF-01–RF-88

  Dependencias: M1-T138, M1-T139.

  Hecho cuando: los 88 RF y 27 criterios quedan revisados con evidencias reales y alcance explícito; se consignan pendientes de despliegue/conversión sin declararlos completados y se excluyen frontend, reservas, modos de agenda, pagos, WhatsApp y PDF.


