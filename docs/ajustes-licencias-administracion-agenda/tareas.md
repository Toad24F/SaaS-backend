# Tareas — Ajustes de licencias, administración y agenda

Estado: propuesta normativa pendiente de aprobación; ALA-T001–ALA-T045 tienen evidencia de sus criterios específicos. Las tareas posteriores permanecen pendientes y estos cambios no acreditan los RF completos.

Desglose del [plan](plan.md), conforme a la [constitución](constitucion.md) y la [especificación](spec.md). Los RF son locales a esta última; A01–A08 y T01–T16 remiten a las áreas y grupos de pruebas del plan. Alcance exclusivo de backend, sin implementación frontend, despliegue ni cambios de fase en este ajuste.

## Reglas de ejecución y evidencia

- Hay **154 tareas ordinarias**, estimadas en **15 o 25 minutos**, y **3 verificaciones de integración manual diferidas**, de 25 minutos cada una. Cada estimación incluye la comprobación focalizada y su evidencia; no garantiza duración real.
- Las dependencias indicadas son obligatorias y transitivas y siempre aparecen antes de la tarea. Dentro de cada bloque se fija una secuencia conservadora; entre bloques independientes solo obligan sus referencias expresas. Esto no autoriza delegación ni agentes paralelos.
- Si una tarea necesita treinta minutos o más, dividirla antes de continuar en subtareas de menos de treinta minutos con RF, dependencias y «Hecho cuando:» propios. Conservar el identificador padre como agrupador pendiente hasta completar las subtareas; no marcar por tiempo consumido.
- Toda prueba incluye preparación y ejecución real. Los casos de carrera usan dos conexiones y barreras, con inspección de filas finales; una prueba omitida, un fallo o infraestructura ausente deja la tarea pendiente.
- Cada casilla requiere evidencia en `resultados-tareas/`: revisión, RF, archivos afectados, comando o comprobación, resultado y pendientes. Crear evidencias al ejecutar, no inventarlas durante esta planificación.
- La creación de campos o contratos no acredita el RF completo: las tareas posteriores de integración, errores y concurrencia también son necesarias. No usar fixtures o dobles como acreditación de un escritor inexistente.
- Las comprobaciones finales reutilizan resultados válidos de la misma revisión cuando no cambió su alcance. Si falta ejecutar una suite o supera el tiempo disponible, crear tareas hijas por lote de menos de treinta minutos antes de su comprobación de cobertura. No concentrar una ejecución larga ni todas sus correcciones en una casilla.
- Para esos lotes usar los scripts del plan: `npm test -- --runInBand`, `npm run test:integration -- --runInBand` y `npm run test:e2e -- --runInBand`, con selección explícita de archivos o particiones. El manifiesto debe demostrar que la unión cubre la suite completa requerida; no reducir cobertura para cumplir el tiempo.
- No editar migraciones históricas ni ejecutar escrituras de prueba sobre la base cotidiana. No interpretar «no existen negocios operativos» como permiso de borrar información.
- La constitución y spec conservan su estado de propuesta hasta aprobación real. Esta lista no los aprueba ni marca tareas de otras fases. RF-63 manual y M3-I001/M2-I004 no pueden cerrarse antes de contar con el escritor manual real.

## 1. Preparación y controles de prueba

- [x] **ALA-T001 — Preparar matriz de aceptación** · 15 min · Depende de: ninguna · RF-01–RF-69
  Hecho cuando: Existe una matriz RF → área A01–A08 → grupo T01–T16 → criterio de finalización, con RF-63 manual expresamente diferido.
  Evidencia: [matriz](resultados-tareas/matriz-aceptacion-t001.md) y [resultado de pruebas](resultados-tareas/resultado-t001.md).

- [x] **ALA-T002 — Alinear las referencias documentales del ajuste** · 15 min · Depende de: ALA-T001 · RF-22–RF-24, RF-36–RF-42, RF-64
  Hecho cuando: La propuesta documental usa inhabilitación y alcance solo backend, identifica precedencias y no atribuye una aprobación inexistente.
  Evidencia: [resultado del bloque](resultados-tareas/resultado-t002-t007.md).

- [x] **ALA-T003 — Registrar cambios de contratos y reglas conservadas** · 25 min · Depende de: ALA-T002 · RF-03, RF-15, RF-32–RF-42, RF-60, RF-64–RF-68
  Hecho cuando: Un inventario enumera entradas retiradas/nuevas, nueve rutas públicas, cinco privadas y permisos que deben conservarse.
  Evidencia: [inventario](resultados-tareas/inventario-contratos-t003.md) y [resultado](resultados-tareas/resultado-t002-t007.md).

- [x] **ALA-T004 — Verificar protección de la base de pruebas** · 25 min · Depende de: ALA-T003 · RF-64–RF-65, RF-67
  Hecho cuando: Una comprobación con el ejecutor existente usa una base desechable identificada como test y demuestra rechazo de un destino no autorizado.
  Evidencia: [resultado de integración](resultados-tareas/resultado-t002-t007.md).

- [x] **ALA-T005 — Preparar fixtures mínimos del ajuste** · 25 min · Depende de: ALA-T004 · RF-16, RF-22, RF-43, RF-56–RF-58
  Hecho cuando: Se pueden crear dos negocios, dos sucursales, profesionales distintos y teléfonos compartidos; la limpieza no alcanza bases externas.
  Evidencia: [resultado de fixtures](resultados-tareas/resultado-t002-t007.md).

- [x] **ALA-T006 — Verificar reloj y barreras reutilizables** · 25 min · Depende de: ALA-T005 · RF-07, RF-15, RF-59, RF-65
  Hecho cuando: Un caso de control demuestra avance exacto del reloj y espera entre dos conexiones independientes, con cierre y rollback al fallar.
  Evidencia: [resultado de reloj y concurrencia](resultados-tareas/resultado-t002-t007.md).

- [x] **ALA-T007 — Crear plantilla de evidencia por tarea** · 15 min · Depende de: ALA-T006 · RF-01–RF-69
  Hecho cuando: La plantilla exige revisión, RF, comprobación/comando, resultado y pruebas omitidas; distingue preparación documental de funcionalidad acreditada.
  Evidencia: [plantilla](resultados-tareas/plantilla-evidencia.md) y [resultado](resultados-tareas/resultado-t002-t007.md).

## 2. Entidades, esquema y migraciones

- [x] **ALA-T008 — Definir persistencia de cupos y visibilidad del negocio** · 25 min · Depende de: ALA-T007 · RF-16–RF-18, RF-32
  Hecho cuando: Entidad y esquema declaran cupos 5/3 positivos y visibilidad verdadera; una comprobación de metadatos confirma nombres y valores.
  Evidencia: [resultado y pruebas](resultados-tareas/resultado-t008-t012.md).

- [x] **ALA-T009 — Añadir migración de cupos y visibilidad** · 25 min · Depende de: ALA-T008 · RF-16–RF-18, RF-32
  Hecho cuando: La migración nueva aplica en base desechable y sus checks rechazan cero sin modificar migraciones históricas.
  Evidencia: [resultado y pruebas](resultados-tareas/resultado-t008-t012.md).

- [x] **ALA-T010 — Definir inhabilitación en cuentas** · 25 min · Depende de: ALA-T009 · RF-22–RF-27
  Hecho cuando: Usuario incorpora marca anulable y coherencia con activo; Personal sigue obteniendo estado de Usuario y no duplica la identidad.
  Evidencia: [resultado y pruebas](resultados-tareas/resultado-t008-t012.md).

- [x] **ALA-T011 — Definir inhabilitación en servicios y sucursales** · 25 min · Depende de: ALA-T010 · RF-22–RF-27
  Hecho cuando: Entidades y esquema conservan claves únicas y distinguen inactivo de inhabilitado mediante restricciones verificadas.
  Evidencia: [resultado y pruebas](resultados-tareas/resultado-t008-t012.md).

- [x] **ALA-T012 — Migrar marcas de inhabilitación** · 25 min · Depende de: ALA-T011 · RF-22–RF-27, RF-31
  Hecho cuando: Una base desechable admite las nuevas marcas, rechaza inhabilitado activo y conserva nombres, correos y relaciones previas.
  Evidencia: [resultado y pruebas](resultados-tareas/resultado-t008-t012.md).

- [x] **ALA-T013 — Definir plazo y ciclo de suspensión** · 25 min · Depende de: ALA-T012 · RF-03–RF-15
  Hecho cuando: Entidad y esquema incorporan plazo 0–30 y versión de suspensión sin sustituir el remanente ni la versión de vencimiento.
  Evidencia: [resultado y pruebas](resultados-tareas/resultado-t013-t018.md).

- [x] **ALA-T014 — Migrar plazo y ciclo de suspensión** · 25 min · Depende de: ALA-T013 · RF-03–RF-15
  Hecho cuando: La migración conserva fechas y remanente existentes y rechaza plazos negativos o mayores que treinta.
  Evidencia: [resultado y pruebas](resultados-tareas/resultado-t013-t018.md).

- [x] **ALA-T015 — Definir operaciones idempotentes de licencia** · 25 min · Depende de: ALA-T014 · RF-04, RF-12–RF-15
  Hecho cuando: Entidad y esquema representan clave, actor, acción, huella y resultado reducido con pertenencia a licencia y negocio.
  Evidencia: [resultado y pruebas](resultados-tareas/resultado-t013-t018.md).

- [x] **ALA-T016 — Migrar operaciones de licencia** · 25 min · Depende de: ALA-T015 · RF-04, RF-12–RF-15
  Hecho cuando: La migración impide duplicar una clave en la misma licencia y rechaza una referencia cruzada entre negocios.
  Evidencia: [resultado y pruebas](resultados-tareas/resultado-t013-t018.md).

- [x] **ALA-T017 — Ampliar modelo de avisos de licencia** · 25 min · Depende de: ALA-T016 · RF-01–RF-15
  Hecho cuando: Tipos, umbral, ciclo y referencia a operación permiten los avisos del plan sin almacenar cuerpos ni secretos.
  Evidencia: [resultado y pruebas](resultados-tareas/resultado-t013-t018.md).

- [x] **ALA-T018 — Migrar referencias y checks de correo** · 15 min · Depende de: ALA-T017 · RF-01–RF-15
  Hecho cuando: Una tabla de casos acepta combinaciones válidas por tipo y rechaza referencias incompatibles, conservando deduplicación.
  Evidencia: [resultado y pruebas](resultados-tareas/resultado-t013-t018.md).

- [x] **ALA-T019 — Definir separación en configuración** · 25 min · Depende de: ALA-T018 · RF-39–RF-42
  Hecho cuando: Entidad y esquema incorporan separación inicial cero con rango 0–60 y múltiplos de cinco; no convierten el intervalo anterior en separación.
  Evidencia: [resultado y pruebas](resultados-tareas/resultado-t019-t022.md).

- [x] **ALA-T020 — Migrar configuración de separación** · 25 min · Depende de: ALA-T019 · RF-39–RF-42
  Hecho cuando: La actualización conserva modo, anticipación y horizonte, crea separación cero y rechaza valores no admitidos.
  Evidencia: [resultado y pruebas](resultados-tareas/resultado-t019-t022.md).

- [x] **ALA-T021 — Definir extremos protegidos de apartados y citas** · 25 min · Depende de: ALA-T020 · RF-43–RF-48, RF-54
  Hecho cuando: Entidades y esquema distinguen fin de atención y fin protegido, guardan separación y contexto de concesión sin incluir redondeo como ocupación.
  Evidencia: [resultado y pruebas](resultados-tareas/resultado-t019-t022.md).

- [x] **ALA-T022 — Migrar extremos protegidos** · 25 min · Depende de: ALA-T021 · RF-43–RF-48, RF-54
  Hecho cuando: Citas históricas de prueba conservan extremos y obtienen separación cero; la migración no inventa condiciones de apartados operativos antiguos.
  Evidencia: [resultado y pruebas](resultados-tareas/resultado-t019-t022.md).

- [x] **ALA-T023 — Definir origen único de cita y consulta telefónica** · 25 min · Depende de: ALA-T022 · RF-56–RF-59, RF-65–RF-66
  Hecho cuando: Entidad y esquema incluyen origen de apartado único por negocio e índice de contacto por negocio, sucursal e inicio.
  Evidencia: [resultado y pruebas](resultados-tareas/resultado-t023-t027.md).

- [x] **ALA-T024 — Migrar origen e índice telefónico** · 25 min · Depende de: ALA-T023 · RF-56–RF-59, RF-65–RF-66
  Hecho cuando: Se rechazan dos citas con el mismo apartado de origen y se conserva la posibilidad de clientes distintos con el mismo teléfono.
  Evidencia: [resultado y pruebas](resultados-tareas/resultado-t023-t027.md).

- [x] **ALA-T025 — Definir sucesión de intentos y puntero actual** · 25 min · Depende de: ALA-T024 · RF-60, RF-65–RF-68
  Hecho cuando: El modelo representa predecesor y puntero de apartado con pertenencia compuesta y sin añadir un estado dependiente de procesos vivos.
  Evidencia: [resultado y pruebas](resultados-tareas/resultado-t023-t027.md).

- [x] **ALA-T026 — Migrar relaciones de sucesión** · 25 min · Depende de: ALA-T025 · RF-60, RF-65–RF-68
  Hecho cuando: Las referencias nuevas se crean en orden válido, rechazan cruces de negocio y evitan dos sucesores del mismo intento.
  Evidencia: [resultado y pruebas](resultados-tareas/resultado-t023-t027.md).

- [x] **ALA-T027 — Verificar equivalencia del esquema ampliado** · 25 min · Depende de: ALA-T026 · RF-01–RF-69
  Hecho cuando: Una comparación de instalación por migraciones y esquema canónico no muestra diferencias en campos, índices o checks nuevos.
  Evidencia: [resultado y pruebas](resultados-tareas/resultado-t023-t027.md).

## 3. Licencias y correo durable

- [x] **ALA-T028 — Validar plazo y clave de operaciones de licencia** · 25 min · Depende de: ALA-T027 · RF-03–RF-04, RF-15
  Hecho cuando: Pruebas unitarias aceptan plazo omitido/0/30 y clave válida, y rechazan fracciones, negativos, 31 y claves inválidas.
  Evidencia: [resultado y pruebas](resultados-tareas/resultado-t028-t034.md).

- [x] **ALA-T029 — Implementar reconocimiento de operaciones de licencia** · 25 min · Depende de: ALA-T028 · RF-04, RF-12–RF-15
  Hecho cuando: Misma clave y contenido devuelve resultado previo; distinto contenido o acción produce conflicto sin mutar la licencia.
  Evidencia: [resultado y pruebas](resultados-tareas/resultado-t028-t034.md).

- [x] **ALA-T030 — Integrar reconocimiento en renovación** · 25 min · Depende de: ALA-T029 · RF-12–RF-15
  Hecho cuando: Repetir una renovación suma una sola anualidad; una clave nueva permite otra y conserva el cálculo anual vigente.
  Evidencia: [resultado y pruebas](resultados-tareas/resultado-t028-t034.md).

- [x] **ALA-T031 — Aplicar plazo configurable a suspensión** · 25 min · Depende de: ALA-T030 · RF-03–RF-07
  Hecho cuando: Casos controlados calculan bloqueo con 0/2/30 días, impiden cambiar un plazo pendiente y preservan restricciones de licencias sin habilitar.
  Evidencia: [resultado y pruebas](resultados-tareas/resultado-t028-t034.md).

- [x] **ALA-T032 — Resolver prioridad entre vencimiento y suspensión** · 25 min · Depende de: ALA-T031 · RF-07–RF-08, RF-11
  Hecho cuando: Antes, después y coincidencia exacta de ambos límites producen acceso y remanente según la tabla del plan.
  Evidencia: [resultado y pruebas](resultados-tareas/resultado-t028-t034.md).

- [x] **ALA-T033 — Adaptar revocación de suspensión pendiente** · 25 min · Depende de: ALA-T032 · RF-10, RF-14–RF-15
  Hecho cuando: Revocar cancela bloqueo pendiente sin regalar vigencia y repetir la misma operación no duplica efectos.
  Evidencia: [resultado y pruebas](resultados-tareas/resultado-t028-t034.md).

- [x] **ALA-T034 — Adaptar reactivación efectiva** · 25 min · Depende de: ALA-T033 · RF-11, RF-13–RF-15
  Hecho cuando: Reactivar restituye el remanente exacto desde el instante de reactivación; renovar previamente no levanta la suspensión.
  Evidencia: [resultado y pruebas](resultados-tareas/resultado-t028-t034.md).

- [x] **ALA-T035 — Exponer operaciones HTTP idempotentes de licencia** · 25 min · Depende de: ALA-T034 · RF-03–RF-15, RF-64
  Hecho cuando: Los tres endpoints exigen superadmin y clave, aceptan sus cuerpos previstos y reproducen la operación sin ejecutar una segunda transición.
  Evidencia: [resultado y pruebas](resultados-tareas/resultado-t035.md).

- [x] **ALA-T036 — Definir deduplicación de los nuevos avisos** · 25 min · Depende de: ALA-T035 · RF-01–RF-15
  Hecho cuando: Pruebas confirman claves diferentes por umbral/ciclo/operación y estabilidad de la clave al reintentar el mismo aviso.
  Evidencia: [resultado y pruebas](resultados-tareas/resultado-t036-t040.md).

- [x] **ALA-T037 — Encolar correo de suspensión programada** · 25 min · Depende de: ALA-T036 · RF-05–RF-06, RF-09
  Hecho cuando: Solicitud con plazo positivo deja un aviso con plazo y bloqueo; plazo cero no crea un aviso previo separado.
  Evidencia: [resultado y pruebas](resultados-tareas/resultado-t036-t040.md).

- [x] **ALA-T038 — Encolar suspensión efectiva y vencimiento** · 25 min · Depende de: ALA-T037 · RF-05–RF-09
  Hecho cuando: Cada límite crea su aviso aplicable; vencimiento primero o simultáneo impide un segundo correo de bloqueo.
  Evidencia: [resultado y pruebas](resultados-tareas/resultado-t036-t040.md).

- [x] **ALA-T039 — Encolar revocación y reactivación** · 25 min · Depende de: ALA-T038 · RF-10–RF-11, RF-14
  Hecho cuando: Las transiciones crean su confirmación correcta y cancelan avisos pendientes incompatibles, sin duplicarlos al repetir.
  Evidencia: [resultado y pruebas](resultados-tareas/resultado-t036-t040.md).

- [x] **ALA-T040 — Encolar confirmación de renovación** · 25 min · Depende de: ALA-T039 · RF-12–RF-14
  Hecho cuando: Vigente, vencida y suspendida producen confirmación; la última no afirma acceso restablecido.
  Evidencia: [resultado y pruebas](resultados-tareas/resultado-t036-t040.md).

- [x] **ALA-T041 — Seleccionar umbrales preventivos de 15 y 7 días** · 25 min · Depende de: ALA-T040 · RF-01–RF-02
  Hecho cuando: Casos antes/en/después de cada umbral eligen el aviso correcto y no existe una nueva ventana de dos días.
  Evidencia: [resultado T041–T045](resultados-tareas/resultado-t041-t045.md).

- [x] **ALA-T042 — Resolver avisos preventivos atrasados** · 25 min · Depende de: ALA-T041 · RF-02, RF-09, RF-14
  Hecho cuando: Recuperar el procesador a seis días descarta el pendiente de quince y emite solo el de siete con tiempo restante real.
  Evidencia: [resultado T041–T045](resultados-tareas/resultado-t041-t045.md).

- [x] **ALA-T043 — Preparar mensajes de licencia sin datos obsoletos** · 25 min · Depende de: ALA-T042 · RF-05–RF-14
  Hecho cuando: El transporte controlado recibe destinatario, estado y fechas correctos; versiones o ciclos sustituidos no llegan a envío.
  Evidencia: [resultado T041–T045](resultados-tareas/resultado-t041-t045.md).

- [x] **ALA-T044 — Revisar orden de bloqueos del procesador** · 25 min · Depende de: ALA-T043 · RF-09, RF-15, RF-65
  Hecho cuando: La reclamación de trabajo termina antes de tomar recursos de dominio y una prueba no mantiene envío bloqueado esperando negocio en orden inverso.
  Evidencia: [resultado T041–T045](resultados-tareas/resultado-t041-t045.md).

- [x] **ALA-T045 — Integrar nuevos avisos al ejecutor periódico** · 25 min · Depende de: ALA-T044 · RF-01–RF-02, RF-05–RF-09
  Hecho cuando: Un ciclo controlado procesa umbrales y límites vencidos una sola vez y una ejecución tardía congela al instante originalmente previsto.
  Evidencia: [resultado T041–T045](resultados-tareas/resultado-t041-t045.md).

- [x] **ALA-T046 — Verificar atomicidad de transición y bandeja** · 25 min · Depende de: ALA-T045 · RF-09, RF-15, RF-69
  Hecho cuando: Un fallo al registrar el aviso revierte la transición y auditoría; ningún estado queda cambiado sin su trabajo durable correspondiente.
  Evidencia: [resultado T046–T050](resultados-tareas/resultado-t046-t050.md).

- [x] **ALA-T047 — Verificar fallos y reentrega SMTP** · 25 min · Depende de: ALA-T046 · RF-09, RF-14
  Hecho cuando: Error/timeout no extienden acceso; caída tras aceptación conserva identidad lógica y evidencia el límite de reentrega física.
  Evidencia: [resultado T046–T050](resultados-tareas/resultado-t046-t050.md).

- [x] **ALA-T048 — Probar carrera renovación contra suspensión** · 25 min · Depende de: ALA-T047 · RF-11–RF-15
  Hecho cuando: Con dos conexiones y ambos órdenes se conservan anualidad, remanente, suspensión y avisos aplicables sin duplicación.
  Evidencia: [resultado T046–T050](resultados-tareas/resultado-t046-t050.md).

- [x] **ALA-T049 — Probar carrera renovación contra reactivación** · 25 min · Depende de: ALA-T048 · RF-11–RF-15
  Hecho cuando: Ambos órdenes producen el saldo esperado y dejan eventos y correos coherentes con las transiciones realmente realizadas.
  Evidencia: [resultado T046–T050](resultados-tareas/resultado-t046-t050.md).

- [x] **ALA-T050 — Verificar acceso HTTP en límites de licencia** · 25 min · Depende de: ALA-T049 · RF-07–RF-08, RF-64
  Hecho cuando: Sesión ya abierta accede antes del límite y es rechazada en el instante exacto y después; un rol ajeno no gestiona licencias.
  Evidencia: [resultado T046–T050](resultados-tareas/resultado-t046-t050.md).

## 4. Cupos de cuentas

- [ ] **ALA-T051 — Implementar política de conteo por rol** · 25 min · Depende de: ALA-T027 · RF-16–RF-18
  Hecho cuando: Pruebas cuentan solo activos no inhabilitados del negocio; un profesional multisucursal cuenta una vez y el administrador no consume esos cupos.

- [ ] **ALA-T052 — Implementar modificación atómica de límites** · 25 min · Depende de: ALA-T051 · RF-17, RF-21, RF-69
  Hecho cuando: Ambos límites se guardan juntos bajo la barrera; un límite inferior al consumo revierte todo y no desactiva cuentas.

- [ ] **ALA-T053 — Aplicar cupo al alta de profesionales** · 25 min · Depende de: ALA-T052 · RF-19, RF-64–RF-65
  Hecho cuando: Alta con cupo completo se rechaza sin perfil, usuario, reserva de correo ni auditoría parcial.

- [ ] **ALA-T054 — Aplicar cupo al alta de recepcionistas** · 25 min · Depende de: ALA-T053 · RF-19, RF-64–RF-65
  Hecho cuando: Alta excedente no crea cuenta parcial; otro negocio puede usar su cupo independiente.

- [ ] **ALA-T055 — Aplicar cupo a altas por invitación** · 25 min · Depende de: ALA-T054 · RF-19–RF-20, RF-65
  Hecho cuando: Toda ruta real que active cuentas por invitación comprueba cupo antes de consumirla; si no existe una ruta aplicable, se acredita el inventario sin inventar un escritor.

- [ ] **ALA-T056 — Aplicar cupo a reactivaciones** · 25 min · Depende de: ALA-T055 · RF-19–RF-20
  Hecho cuando: Profesional y recepcionista solo vuelven a activo con lugar disponible; desactivación libera exactamente un lugar.

- [ ] **ALA-T057 — Exponer consultas y modificación de cupos** · 25 min · Depende de: ALA-T056 · RF-16–RF-21, RF-64
  Hecho cuando: Superadmin modifica; administrador propio consulta límite/activos/disponibles; roles y negocios ajenos reciben denegación.

- [ ] **ALA-T058 — Probar carrera por último cupo profesional** · 25 min · Depende de: ALA-T057 · RF-19–RF-20, RF-65
  Hecho cuando: Dos conexiones con alta y reactivación aceptan como máximo una y dejan filas finales dentro del límite.

- [ ] **ALA-T059 — Probar carrera por último cupo de recepción** · 25 min · Depende de: ALA-T058 · RF-19–RF-20, RF-65
  Hecho cuando: Dos altas concurrentes por el último lugar no crean cuentas excedentes ni reservas de correo huérfanas.

- [ ] **ALA-T060 — Probar reducción de cupo contra alta** · 25 min · Depende de: ALA-T059 · RF-19–RF-21, RF-65
  Hecho cuando: Ambos órdenes conservan consumo no mayor al límite y ningún usuario se desactiva automáticamente.

## 5. Inhabilitación y restauración

- [ ] **ALA-T061 — Implementar inhabilitación de profesional** · 25 min · Depende de: ALA-T060 · RF-22, RF-25–RF-26, RF-31
  Hecho cuando: Marca su cuenta inactiva/inhabilitada sin borrar perfil, credenciales, reservas de correo o relaciones; repetir no duplica auditoría.

- [ ] **ALA-T062 — Implementar inhabilitación de recepcionista** · 25 min · Depende de: ALA-T061 · RF-22, RF-25–RF-26, RF-31
  Hecho cuando: La cuenta conserva identidad e historial y deja de consumir cupo sin eliminarse.

- [ ] **ALA-T063 — Implementar inhabilitación de servicio** · 25 min · Depende de: ALA-T062 · RF-22–RF-24, RF-26, RF-31
  Hecho cuando: El servicio deja de operar y conserva costo, nombre y selecciones de profesionales y sucursales.

- [ ] **ALA-T064 — Implementar inhabilitación de sucursal** · 25 min · Depende de: ALA-T063 · RF-22–RF-24, RF-26, RF-30–RF-31
  Hecho cuando: La sucursal conserva asignaciones y horarios sin cambiar estados individuales de cuentas o servicios.

- [ ] **ALA-T065 — Bloquear sesiones de cuentas inhabilitadas** · 25 min · Depende de: ALA-T064 · RF-25, RF-64
  Hecho cuando: Un test HTTP con sesión emitida antes de la baja y otro de inicio de sesión rechazan acceso inmediatamente.

- [ ] **ALA-T066 — Restaurar cuentas como inactivas** · 25 min · Depende de: ALA-T065 · RF-27, RF-31
  Hecho cuando: Profesional y recepcionista vuelven a consulta habitual inactivos; restaurarlos de nuevo no desactiva una activación posterior.

- [ ] **ALA-T067 — Restaurar servicios y sucursales como inactivos** · 25 min · Depende de: ALA-T066 · RF-27, RF-30–RF-31
  Hecho cuando: Restauración no habilita oferta ni modifica estados de relacionados y reactivar requiere las condiciones vigentes.

- [ ] **ALA-T068 — Separar consultas habituales e inhabilitados** · 25 min · Depende de: ALA-T067 · RF-23–RF-24, RF-31, RF-64
  Hecho cuando: Listados/detalles habituales omiten bajas y consultas específicas solo entregan registros del administrador propietario.

- [ ] **ALA-T069 — Exponer operaciones de inhabilitación de cuentas** · 25 min · Depende de: ALA-T068 · RF-22–RF-27, RF-31, RF-64
  Hecho cuando: Endpoints de profesionales y recepción devuelven estado verificable; otros roles y negocios no pueden ejecutar ni consultar la baja.

- [ ] **ALA-T070 — Exponer operaciones de inhabilitación de catálogo** · 25 min · Depende de: ALA-T069 · RF-22–RF-27, RF-31, RF-64
  Hecho cuando: Endpoints de servicios y sucursales distinguen restaurar de reactivar y rechazan activar directamente inhabilitados.

- [ ] **ALA-T071 — Retirar borrado físico de los recursos incluidos** · 25 min · Depende de: ALA-T070 · RF-22–RF-24
  Hecho cuando: DELETE anteriores devuelven 404 sin escritura y una búsqueda de llamadas confirma que las nuevas bajas no invocan eliminación física.

- [ ] **ALA-T072 — Excluir inhabilitados de la oferta efectiva** · 25 min · Depende de: ALA-T071 · RF-23, RF-29–RF-30
  Hecho cuando: Catálogo y validación de oferta excluyen cualquier recurso inhabilitado sin borrar relaciones ni ocupaciones existentes.

- [ ] **ALA-T073 — Ampliar causas de citas afectadas** · 25 min · Depende de: ALA-T072 · RF-28–RF-30
  Hecho cuando: Cita futura conserva estado e intervalo y reporta inhabilitación junto a otras causas; restaurar no oculta causas todavía vigentes.

- [ ] **ALA-T074 — Verificar restauración y unicidad retenida** · 25 min · Depende de: ALA-T073 · RF-26–RF-27, RF-30
  Hecho cuando: No se reutilizan nombres/correos reservados; activar sucursal restaurada recupera solo oferta individual habilitada y rechaza conflictos reales.

## 6. Publicación de precios

- [ ] **ALA-T075 — Implementar servicio de configuración de precios** · 25 min · Depende de: ALA-T027 · RF-32, RF-64, RF-69
  Hecho cuando: Solo administrador propio cambia el valor global bajo barrera y auditoría; los campos de contacto no enviados se conservan.

- [ ] **ALA-T076 — Exponer GET y PATCH de publicación** · 25 min · Depende de: ALA-T075 · RF-32, RF-64
  Hecho cuando: Consulta devuelve la opción vigente y PATCH acepta mostrarPreciosPublicos sin exigir editar contacto; nuevos servicios heredan el valor global.

- [ ] **ALA-T077 — Crear proyección pública sin importes ocultos** · 25 min · Depende de: ALA-T076 · RF-33–RF-35
  Hecho cuando: Prueba de objetos anidados confirma omisión de todos los campos monetarios, sin sustituirlos por cero/null ni alterar el objeto histórico.

- [ ] **ALA-T078 — Aplicar proyección a catálogo y apartados** · 25 min · Depende de: ALA-T077 · RF-33–RF-35
  Hecho cuando: Ambas respuestas respetan la configuración vigente y el apartado conserva internamente el costo fijado.

- [ ] **ALA-T079 — Aplicar proyección a registro y recuperación** · 25 min · Depende de: ALA-T078 · RF-33–RF-35, RF-66, RF-68
  Hecho cuando: Registro, repetición y resolución omiten precio al ocultarlo y conservan folio, historia y acceso propio tras bloqueo de licencia.

- [ ] **ALA-T080 — Probar cambios de visibilidad durante el flujo** · 25 min · Depende de: ALA-T079 · RF-32–RF-35, RF-68
  Hecho cuando: Una reserva iniciada visible se recupera sin precio tras ocultarlo; volver a mostrar devuelve costo histórico y nunca afirma aceptación de precio oculto.

- [ ] **ALA-T081 — Verificar caché y permisos de precios** · 25 min · Depende de: ALA-T080 · RF-33, RF-64, RF-68
  Hecho cuando: Respuestas públicas configurables usan no-store, administración autorizada conserva importes y una credencial ajena no recupera el resultado.

## 7. Horarios y configuración

- [ ] **ALA-T082 — Retirar descansos del contrato de horarios** · 25 min · Depende de: ALA-T027 · RF-36, RF-42
  Hecho cuando: Campos de descanso provocan 400 por desconocidos y respuestas semanales dejan de incluirlos, conservando huecos entre franjas.

- [ ] **ALA-T083 — Retirar rutas y lecturas operativas de excepciones** · 25 min · Depende de: ALA-T082 · RF-37
  Hecho cuando: Rutas antiguas dan 404 y el inventario de lectores operativos ya no aplica excepciones; tablas históricas no se borran.

- [ ] **ALA-T084 — Implementar fusión de franjas contiguas** · 25 min · Depende de: ALA-T083 · RF-38
  Hecho cuando: Tests unitarios fusionan transitivamente mismo día/sucursal/estado y conservan separados huecos, otros estados y borradores incompletos.

- [ ] **ALA-T085 — Integrar fusión al reemplazo semanal** · 25 min · Depende de: ALA-T084 · RF-38, RF-42, RF-69
  Hecho cuando: Se devuelve una semana canónica con ID estable según plan y auditoría antes/después; un conflicto revierte el conjunto.

- [ ] **ALA-T086 — Verificar horarios entre sucursales y bloqueos** · 25 min · Depende de: ALA-T085 · RF-36–RF-38, RF-64–RF-65
  Hecho cuando: Franjas fusionadas no eluden asignaciones, zonas o empalmes entre sucursales y los bloqueos siguen restringiendo atención.

- [ ] **ALA-T087 — Validar configuración con tiempo entre citas** · 25 min · Depende de: ALA-T086 · RF-39–RF-42
  Hecho cuando: Validador admite 0/5/60, rechaza otros valores y el antiguo intervaloMinutos; conserva default Libre, anticipación 15 y horizonte vigente.

- [ ] **ALA-T088 — Integrar reemplazo atómico de configuración** · 25 min · Depende de: ALA-T087 · RF-39–RF-42, RF-69
  Hecho cuando: Servicio y GET/PUT usan tiempoEntreCitasMinutos; entrada inválida no cambia ningún campo y solo administrador puede escribir.

- [ ] **ALA-T089 — Verificar permisos y modalidad manual del motor** · 25 min · Depende de: ALA-T088 · RF-40–RF-42, RF-64
  Hecho cuando: Las cinco rutas privadas conservan permisos y la validación manual sigue omitiendo solo restricciones públicas previstas, sin crear escritor manual.

## 8. Motor y ocupaciones

- [ ] **ALA-T090 — Extender contrato interno de ocupación protegida** · 25 min · Depende de: ALA-T089, ALA-T074 · RF-43–RF-45
  Hecho cuando: El contrato distingue atención y ocupación y una prueba demuestra que el redondeo no amplía el fin protegido.

- [ ] **ALA-T091 — Leer separación de citas entre sucursales** · 25 min · Depende de: ALA-T090 · RF-44–RF-45
  Hecho cuando: El lector incluye cita cuya atención acabó antes del rango pero su separación lo invade, sin filtrar por sucursal o servicio.

- [ ] **ALA-T092 — Leer separación de apartados vigentes** · 25 min · Depende de: ALA-T091 · RF-43–RF-45, RF-52
  Hecho cuando: Se incluye protección hasta fin_ocupacion_utc solo antes de expiración y sin liberación; límite exacto deja de ocupar.

- [ ] **ALA-T093 — Construir espacios libres con separación** · 25 min · Depende de: ALA-T092 · RF-44–RF-45
  Hecho cuando: Casos de bloqueos y ocupaciones dejan huecos correctos y permiten extremos contiguos sin invadir cierres.

- [ ] **ALA-T094 — Implementar redondeo local a cinco minutos** · 25 min · Depende de: ALA-T093 · RF-46–RF-48
  Hecho cuando: Casos de segundos, múltiplo exacto, 09:22→09:25 y 09:42→09:45 redondean hacia arriba sin cambiar ocupación.

- [ ] **ALA-T095 — Verificar redondeo ante cambios de hora** · 25 min · Depende de: ALA-T094 · RF-46–RF-48
  Hecho cuando: Fechas de prueba con horas ambiguas/inexistentes no generan candidatos inválidos y conservan comparación UTC entre sucursales.

- [ ] **ALA-T096 — Generar candidatos de Agenda Libre** · 25 min · Depende de: ALA-T095 · RF-45, RF-49
  Hecho cuando: Espacios desde 09:40 con duración 30 generan 09:40/10:10 y duración 32 avanza con redondeo; servicio más separación cabe completo.

- [ ] **ALA-T097 — Aplicar anticipación y horizonte a candidatos** · 25 min · Depende de: ALA-T096 · RF-41, RF-46–RF-49
  Hecho cuando: 09:07 con anticipación 15 ofrece desde 09:25; se conservan límites inclusivos de fechas y máximo de consulta vigente.

- [ ] **ALA-T098 — Seleccionar único inicio de Agenda Compacta** · 25 min · Depende de: ALA-T097 · RF-50–RF-51
  Hecho cuando: Mañana y tarde de una combinación devuelven solo el primer inicio válido por fecha, sin bloquear elección de otros días.

- [ ] **ALA-T099 — Verificar avance y retorno de Compacta** · 25 min · Depende de: ALA-T098 · RF-52
  Hecho cuando: Un apartado mueve la oferta al siguiente inicio y su liberación o vencimiento vuelve a considerar el anterior.

- [ ] **ALA-T100 — Conectar generación y validación de nuevas concesiones** · 25 min · Depende de: ALA-T099 · RF-43–RF-52, RF-65
  Hecho cuando: Consultar y conceder usan el mismo resultado de estrategia; el cliente no puede imponer separación, precio ni una modalidad manual.

- [ ] **ALA-T101 — Verificar errores y vacíos del motor** · 25 min · Depende de: ALA-T100 · RF-67
  Hecho cuando: Cálculo correcto sin candidatos da vacío legítimo y fallos inyectados dan 500/503 sin resultados parciales.

## 9. Apartados preservados y escritor público

- [ ] **ALA-T102 — Capturar condiciones al conceder apartado** · 25 min · Depende de: ALA-T101, ALA-T081 · RF-35, RF-43, RF-54
  Hecho cuando: Fila nueva guarda modo, versión, separación, costo, zona y extremos del servidor sin modificar los cinco minutos.

- [ ] **ALA-T103 — Separar validación de consumo propio** · 25 min · Depende de: ALA-T102 · RF-53–RF-55
  Hecho cuando: Consumir apartado propio omite solo nueva selección/anclaje/primer horario y sigue comprobando licencia, oferta y conflictos.

- [ ] **ALA-T104 — Transferir separación al registrar cita** · 25 min · Depende de: ALA-T103 · RF-43–RF-44, RF-54, RF-65
  Hecho cuando: Cita copia condiciones del apartado y consume su origen una sola vez, en el mismo commit que cliente y resultado.

- [ ] **ALA-T105 — Verificar apartado tras cambio de modo y separación** · 25 min · Depende de: ALA-T104 · RF-53–RF-54
  Hecho cuando: Casos cambian Libre/Compacta o separación y liberan un horario anterior; el apartado original válido registra con su separación inicial.

- [ ] **ALA-T106 — Verificar condiciones que sí invalidan consumo** · 25 min · Depende de: ALA-T105 · RF-29, RF-55, RF-65
  Hecho cuando: Inhabilitar recurso o invalidar licencia/horario impide registro con apartado vigente, sin filas parciales ni plazo ampliado.

- [ ] **ALA-T107 — Adaptar afectaciones a separación histórica** · 25 min · Depende de: ALA-T106 · RF-28, RF-44–RF-45, RF-54
  Hecho cuando: El lector evalúa fin protegido histórico, detecta conflicto operativo y no reescribe citas al cambiar configuración.

- [ ] **ALA-T108 — Verificar reemplazo y límites de apartados** · 25 min · Depende de: ALA-T107 · RF-52, RF-54, RF-65
  Hecho cuando: Reemplazo fallido deja anterior liberado; expiración exacta y fallos de consumo no renuevan ni resucitan apartados.

- [ ] **ALA-T109 — Probar rollback del registro protegido** · 25 min · Depende de: ALA-T108 · RF-43, RF-65–RF-66
  Hecho cuando: Fallos después de cliente, cita y consumo revierten el conjunto; una repetición válida conserva misma cita y folio.

## 10. Cupo telefónico y corrección

- [ ] **ALA-T110 — Implementar conteo futuro por teléfono y sucursal** · 25 min · Depende de: ALA-T109 · RF-56–RF-58, RF-62
  Hecho cuando: Teléfonos normalizados cuentan citas no canceladas con inicio posterior a ahora; otra sucursal/negocio y apartados no consumen cupo.

- [ ] **ALA-T111 — Integrar conteo bajo barrera de negocio** · 25 min · Depende de: ALA-T110 · RF-56, RF-59, RF-65
  Hecho cuando: Conteo y nueva cita comparten exclusión existente incluso entre profesionales distintos; no se añaden contadores redundantes.

- [ ] **ALA-T112 — Persistir rechazo terminal por cupo** · 25 min · Depende de: ALA-T111 · RF-59–RF-61
  Hecho cuando: Rechazo confirma estado/huella/causa sin cliente o cita y conserva apartado vigente; el 409 se emite después del commit.

- [ ] **ALA-T113 — Asignar intento actual al preparar envío** · 25 min · Depende de: ALA-T112 · RF-60, RF-65–RF-66
  Hecho cuando: Preparación inicial fija puntero y repetición devuelve el mismo intento; otro envío no autorizado sobre el apartado produce conflicto.

- [ ] **ALA-T114 — Preparar sucesor explícito por corrección** · 25 min · Depende de: ALA-T113 · RF-60, RF-65–RF-66
  Hecho cuando: Solo predecesor propio terminal por cupo permite nueva clave y actualiza puntero sin ampliar expiración.

- [ ] **ALA-T115 — Impedir escritura de intentos anteriores** · 25 min · Depende de: ALA-T114 · RF-60, RF-65–RF-66
  Hecho cuando: Envío atrasado del predecesor conserva rechazo y no inserta cita, aun si el contacto nuevo tiene cupo.

- [ ] **ALA-T116 — Resolver rechazo conocido sin liberar apartado** · 25 min · Depende de: ALA-T115 · RF-60, RF-66–RF-68
  Hecho cuando: Resolución devuelve causa y posibilidad real de corrección tras respuesta perdida al rechazo, sin liberación genérica.

- [ ] **ALA-T117 — Conservar resolución de incertidumbre general** · 25 min · Depende de: ALA-T116 · RF-65–RF-68
  Hecho cuando: Ausencia simple no autoriza corrección; resolución terminal genérica conserva liberación y un timeout responde 503.

- [ ] **ALA-T118 — Exponer contratos HTTP de corrección** · 25 min · Depende de: ALA-T117 · RF-60–RF-61, RF-64, RF-66
  Hecho cuando: Preparación acepta intentoAnteriorId solo cuando procede y el conflicto entrega el mensaje exacto de RF-61 sin datos de citas ajenas.

- [ ] **ALA-T119 — Probar límites temporales del cupo** · 25 min · Depende de: ALA-T118 · RF-56–RF-58
  Hecho cuando: Justo antes/en/después del inicio el conteo cambia como se especificó; citas canceladas quedan excluidas sin crear endpoints de cancelación.

- [ ] **ALA-T120 — Probar teléfonos compartidos e idempotencia** · 25 min · Depende de: ALA-T119 · RF-62, RF-66
  Hecho cuando: Dos nombres conservan contactos independientes; repetir reserva registrada no vuelve a consumir cupo aunque ahora esté lleno.

- [ ] **ALA-T121 — Probar corrección con vencimiento y propiedad** · 25 min · Depende de: ALA-T120 · RF-60, RF-64–RF-68
  Hecho cuando: Apartado vencido o ajeno impide sucesor y una clave incompatible no modifica formulario registrado o envío incierto.

## 11. Carreras del escritor real

- [ ] **ALA-T122 — Probar carrera por último lugar telefónico** · 25 min · Depende de: ALA-T121, ALA-T050 · RF-56–RF-59, RF-65
  Hecho cuando: Dos conexiones con profesionales distintos aceptan una reserva y rechazan la otra, comprobando clientes, citas, intentos y apartados finales.

- [ ] **ALA-T123 — Probar carrera de dos sucesores** · 25 min · Depende de: ALA-T122 · RF-60, RF-65–RF-66
  Hecho cuando: Solo un sucesor queda actual; repetición del ganador funciona y perdedor/envío anterior no escriben.

- [ ] **ALA-T124 — Probar escritor antes que resolutor** · 25 min · Depende de: ALA-T123 · RF-65–RF-68
  Hecho cuando: Barrera fuerza escritor primero y el resolutor recupera el resultado confirmado sin cerrar falsamente no_registrado.

- [ ] **ALA-T125 — Probar resolutor antes que escritor** · 25 min · Depende de: ALA-T124 · RF-65–RF-68
  Hecho cuando: Barrera fuerza cierre terminal primero y el escritor atrasado no crea cita ni revive el apartado.

- [ ] **ALA-T126 — Probar dos reservas contra separación protegida** · 25 min · Depende de: ALA-T125 · RF-43–RF-45, RF-65
  Hecho cuando: Intervalos de atención no empalmados pero con separación incompatible en distintas sucursales aceptan como máximo una ocupación.

- [ ] **ALA-T127 — Probar reserva contra cambio de modo/separación** · 25 min · Depende de: ALA-T126 · RF-53–RF-55, RF-65
  Hecho cuando: Ambos órdenes preservan apartado existente y aplican valores nuevos solo a nuevas concesiones, con filas finales verificadas.

- [ ] **ALA-T128 — Probar reserva contra inhabilitación de profesional** · 25 min · Depende de: ALA-T127 · RF-25, RF-28–RF-29, RF-55, RF-65
  Hecho cuando: Ambos órdenes dejan cita previa afectada o reserva rechazada; nunca registran después de la baja efectiva bajo la misma exclusión.

- [ ] **ALA-T129 — Probar reserva contra inhabilitación de sucursal o servicio** · 25 min · Depende de: ALA-T128 · RF-28–RF-30, RF-55, RF-65
  Hecho cuando: Casos parametrizados en ambos órdenes conservan ocupaciones previas y rechazan concesión/registro sobre oferta retirada.

- [ ] **ALA-T130 — Probar reserva contra vencimiento de licencia** · 25 min · Depende de: ALA-T129 · RF-07–RF-08, RF-55, RF-65
  Hecho cuando: Tras esperar bloqueo se reevalúa el instante y no se registra con licencia ya vencida; la recuperación propia sigue disponible.

- [ ] **ALA-T131 — Probar reserva contra cambio de horario o bloqueo** · 25 min · Depende de: ALA-T130 · RF-38, RF-45, RF-55, RF-65
  Hecho cuando: Ambos órdenes conservan cita previa afectada o rechazan reserva incompatible, sin modificarla automáticamente.

- [ ] **ALA-T132 — Probar reserva contra costo o duración** · 25 min · Depende de: ALA-T131 · RF-35, RF-55, RF-65
  Hecho cuando: Cambio de costo conserva el fijado; duración incompatible con extremos del apartado rechaza sin resultados parciales.

## 12. Contratos, seguridad y regresiones focalizadas

- [ ] **ALA-T133 — Verificar permisos de operaciones administrativas nuevas** · 25 min · Depende de: ALA-T132 · RF-17, RF-23, RF-31–RF-32, RF-40, RF-64
  Hecho cuando: Matriz HTTP prueba roles y dos negocios para cupos, inhabilitación, restauración, precios y configuración, sin cruces de pertenencia.

- [ ] **ALA-T134 — Verificar entradas públicas sin autoridad adicional** · 25 min · Depende de: ALA-T133 · RF-64–RF-65
  Hecho cuando: Mutaciones públicas rechazan negocio, precio, separación, estado, modalidad y exclusiones no permitidos en el cuerpo.

- [ ] **ALA-T135 — Verificar protección pública existente** · 25 min · Depende de: ALA-T134 · RF-64, RF-67–RF-68
  Hecho cuando: Casos de cookie, origen, CSRF y límite de 32 KiB conservan respuestas seguras y no permiten mutaciones ajenas.

- [ ] **ALA-T136 — Verificar fallos transitorios y agotamiento** · 25 min · Depende de: ALA-T135 · RF-65–RF-67
  Hecho cuando: Deadlock/timeout controlado reintenta con clave estable y acaba en 503 si se agota, sin cita parcial ni cierre ficticio.

- [ ] **ALA-T137 — Verificar redacción de errores y respuestas personales** · 25 min · Depende de: ALA-T136 · RF-33, RF-61, RF-67–RF-68
  Hecho cuando: HTTP no contiene SQL, trazas, importes ocultos ni datos de otras reservas; respuestas personales mantienen no-store.

- [ ] **ALA-T138 — Verificar auditoría de cambios reales** · 25 min · Depende de: ALA-T137 · RF-15, RF-31, RF-69
  Hecho cuando: Repeticiones de operaciones no duplican eventos y cambios de cupo, estado, configuración y licencia registran antes/después sin secretos.

- [ ] **ALA-T139 — Verificar nueve rutas públicas** · 25 min · Depende de: ALA-T138 · RF-32–RF-35, RF-43–RF-68
  Hecho cuando: Inventario y casos HTTP recorren catálogo, sesión, disponibilidad, tres acciones de apartado y tres de intento con estados previstos.

- [ ] **ALA-T140 — Verificar cinco rutas privadas de disponibilidad** · 25 min · Depende de: ALA-T139 · RF-39–RF-55, RF-64, RF-67
  Hecho cuando: Configuración GET/PUT, consulta, validación y afectaciones conservan permisos y distinguen negativo funcional de error técnico.

- [ ] **ALA-T141 — Revisar expectativas históricas incompatibles** · 25 min · Depende de: ALA-T140 · RF-01–RF-69
  Hecho cuando: Cada cambio de expectativa sobre 48 h, intervalos, bajas, descansos, excepciones o teléfonos cita su RF nuevo; evidencia histórica permanece intacta.

## 13. Migración segura, comprobaciones finales y evidencia

- [ ] **ALA-T142 — Implementar comprobación previa de datos incompatibles** · 25 min · Depende de: ALA-T141 · RF-36–RF-42, RF-54–RF-55
  Hecho cuando: Se detectan apartados antiguos vigentes y descansos/excepciones operativos; su presencia impide activar reglas sin limpiar datos.

- [ ] **ALA-T143 — Probar preservación de datos históricos de actualización** · 25 min · Depende de: ALA-T142 · RF-22, RF-35–RF-38, RF-43, RF-54
  Hecho cuando: Fixtures históricos conservan cuentas, relaciones, costos y citas; nuevos campos no atribuyen visibilidad pasada ni separación inexistente.

- [ ] **ALA-T144 — Verificar instalación limpia final** · 25 min · Depende de: ALA-T143 · RF-01–RF-69
  Hecho cuando: Base desechable vacía aplica todas las migraciones y coincide con el esquema canónico en restricciones del ajuste.

- [ ] **ALA-T145 — Verificar actualización final y rechazo de destino inseguro** · 25 min · Depende de: ALA-T144 · RF-01–RF-69
  Hecho cuando: Base de prueba con esquema previo se actualiza sin pérdida y el ejecutor rechaza un nombre de base cotidiana.

- [ ] **ALA-T146 — Preparar inventario completo de suites y lotes acotados** · 15 min · Depende de: ALA-T145 · RF-01–RF-69
  Hecho cuando: Un manifiesto enumera todos los tests requeridos, sin exclusiones silenciosas, y asigna lotes con duración prevista menor de treinta minutos.

- [ ] **ALA-T147 — Ejecutar compilación final** · 25 min · Depende de: ALA-T146 · RF-01–RF-69
  Hecho cuando: npm run build termina con código cero y se conserva revisión y salida; si falla, la tarea permanece pendiente.

- [ ] **ALA-T148 — Ejecutar lint final** · 25 min · Depende de: ALA-T147 · RF-01–RF-69
  Hecho cuando: npm run lint termina con código cero sin usar format como comprobación y se conserva su salida.

- [ ] **ALA-T149 — Verificar cobertura de ejecución unitaria final** · 25 min · Depende de: ALA-T148 · RF-01–RF-62, RF-64–RF-69
  Hecho cuando: El manifiesto acredita cada test unitario requerido con ejecución exitosa en revisión vigente, sin saltados; los lotes adicionales tienen sus propias tareas.

- [ ] **ALA-T150 — Verificar cobertura de integración final** · 25 min · Depende de: ALA-T149 · RF-01–RF-62, RF-64–RF-69
  Hecho cuando: El manifiesto acredita cada test de integración requerido ejecutado en base segura, con filas finales y sin casos omitidos.

- [ ] **ALA-T151 — Verificar cobertura HTTP final** · 25 min · Depende de: ALA-T150 · RF-01–RF-62, RF-64–RF-69
  Hecho cuando: Todos los casos e2e requeridos constan exitosos en revisión vigente; no se usa evidencia de frontend como sustituto.

- [ ] **ALA-T152 — Consolidar matriz RF a prueba y resultado** · 15 min · Depende de: ALA-T151 · RF-01–RF-69
  Hecho cuando: Cada RF enlaza casos y evidencia; RF-63 manual está diferido y ninguna preparación o demo aparece como integración real.

- [ ] **ALA-T153 — Documentar compatibilidad y recuperación de despliegue** · 25 min · Depende de: ALA-T152 · RF-22, RF-33, RF-36–RF-42, RF-54, RF-60, RF-65
  Hecho cuando: El documento enumera cambios incompatibles, condición para abrir escrituras y límites de rollback sin ejecutar despliegue ni habilitar producción.

- [ ] **ALA-T154 — Contrastar los ocho criterios de finalización** · 15 min · Depende de: ALA-T153 · RF-01–RF-69
  Hecho cuando: Cada criterio enlaza evidencia vigente o una limitación explícita; quedan pendientes manuales identificados y no se declara cerrada fase 4.

## 14. Integración manual diferida — fuera de la ejecución actual

Estas tres tareas dependen además de que el módulo 4 entregue su escritor manual real y fixtures seguros. No incluyen construirlo. Sus RF no quedan acreditados con el escritor público ni con mocks. Si las carreras del contrato previo M3-I001/M2-I004 requieren más casos, se conservan sus listas originales y solo se cierran con toda su evidencia.

- [ ] **ALA-I001 — Verificar cupo telefónico compartido con reserva manual real** · 25 min · Depende de: ALA-T121; escritor manual real disponible · RF-56–RF-59, RF-63.
  Hecho cuando: dos citas futuras repartidas entre ambos canales impiden una tercera en la misma sucursal y otra sucursal conserva su cupo independiente, usando el escritor real.

- [ ] **ALA-I002 — Verificar carrera pública/manual por último lugar telefónico** · 25 min · Depende de: ALA-I001, ALA-T132; escritor manual real disponible · RF-59, RF-63, RF-65.
  Hecho cuando: dos conexiones con barreras en ambos órdenes aceptan como máximo una reserva por el último lugar y se verifican clientes, citas e intentos finales.

- [ ] **ALA-I003 — Verificar ocupación y separación entre escritores reales** · 25 min · Depende de: ALA-I002; escritor manual real disponible · RF-43–RF-45, RF-63, RF-65.
  Hecho cuando: una carrera pública/manual entre sucursales respeta fin protegido y contigüidad sin empalmes; su evidencia se vincula a M3-I001/M2-I004 sin atribuir cobertura a los casos todavía pendientes.

