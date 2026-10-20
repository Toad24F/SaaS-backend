# Tareas — Fase 4, Módulo 3: Portal Público de Reservas

Desglose del [plan](plan.md), conforme a la [constitución](constitucion-modulo-3.md) y la [especificación](spec.md). Los RF sin prefijo son locales a la especificación del módulo 3; M01–M07, D01–D13, T01–T12 y E1–E6 remiten al plan.

Hay **136 tareas de implementación y verificación**, más **una verificación diferida al módulo 4**. Todas están pendientes y estimadas entre 15 y 25 minutos, siempre menos de 30 minutos. Son estimaciones de trabajo acotado: si aparece una dificultad que exceda ese tamaño, dividir el trabajo restante y actualizar dependencias antes de marcarlo como hecho.

Las dependencias son obligatorias y transitivas; aparecen antes de cada tarea. El orden de presentación no añade dependencias entre tareas independientes. La tarea diferida tiene además una precondición externa explícita.

Marcar una casilla solo al cumplir su línea **Hecho cuando:** y guardar evidencia con RF, revisión, comando o comprobación y resultado. Las tareas de pruebas incluyen preparar el caso y ejecutarlo. Un fallo, una prueba saltada o una base de datos no disponible deja la tarea pendiente. En el cierre se reutiliza evidencia vigente de la misma revisión; solo se repite lo afectado por cambios o dudas concretas.

Este documento organiza trabajo futuro; no implementa funcionalidad ni acredita resultados. No incluye escritores manuales, calendario operativo, cambios posteriores de estado, WhatsApp, PDF ni pagos. La cita pública nace pendiente; registrar la reserva no equivale a la confirmación del cliente por WhatsApp.

Los cambios del backend se harán desde la raíz de SaaS-backend y los del frontend desde la raíz de frontend-saas. Los scripts, pruebas y contratos se corresponden con el plan. Antes de publicar escritores deben pasar las tareas de coordinación y concurrencia; esta lista no autoriza un despliegue en producción.

## 1. Base, contratos y entorno de pruebas

E1; M01–M07; T01, T10 y T11.

- [x] **M3-T001 — Preparar la matriz de aceptación** · 15 min · Depende de: ninguna · RF-01–RF-43
      Hecho cuando: la matriz relaciona los 43 RF y los ocho criterios de finalización con grupos T01–T12, separando evidencia nueva de antecedentes y de M2-I004 diferido.

- [x] **M3-T002 — Identificar los contratos que deben conservarse** · 20 min · Depende de: M3-T001 · RF-01–RF-04, RF-14–RF-18, RF-34, RF-38
      Hecho cuando: quedan registrados las cinco rutas privadas, sus permisos, los límites del motor y el estado inicial pendiente; la demo no figura como funcionalidad pública implementada.

- [x] **M3-T003 — Preparar una base desechable de integración** · 20 min · Depende de: M3-T002 · RF-02, RF-20, RF-35
      Hecho cuando: el ejecutor crea y elimina una base de prueba y rechaza usar la base cotidiana; una ejecución de comprobación termina sin modificar datos de desarrollo.

- [x] **M3-T004 — Preparar datos de dos negocios y varios Profesionales** · 25 min · Depende de: M3-T003 · RF-02–RF-04, RF-12, RF-14–RF-15, RF-20
      Hecho cuando: los fixtures crean oferta activa/inactiva, dos sucursales con zonas distintas, teléfonos compartibles y ocupaciones; su limpieza es comprobable.

- [x] **M3-T005 — Preparar controles del reloj y fallos de escritura** · 20 min · Depende de: M3-T004 · RF-19–RF-23, RF-31, RF-35, RF-40
      Hecho cuando: las pruebas pueden avanzar hasta un milisegundo antes, exactamente y después del vencimiento, e inyectar un fallo antes del commit sin modificar el reloj del sistema.

- [x] **M3-T006 — Preparar dos conexiones y barreras de concurrencia** · 25 min · Depende de: M3-T003, M3-T005 · RF-20, RF-25, RF-33, RF-35, RF-39–RF-41
      Hecho cuando: un caso de control demuestra espera y continuación entre dos conexiones independientes, con rollback y cierre garantizados al fallar; todavía no acredita carreras del escritor real.

- [x] **M3-T007 — Declarar módulos y contratos de reservas públicas** · 20 min · Depende de: M3-T002 · RF-01–RF-04, RF-18, RF-29, RF-31, RF-39–RF-43
      Hecho cuando: los módulos de dominio y HTTP tienen responsabilidades y tipos de entrada/salida separados, sin registrar todavía rutas capaces de crear ocupaciones.

## 2. Persistencia y migraciones

E1; M03–M05 y M07; D06–D09, D12; T10.

- [x] **M3-T008 — Migrar sesiones públicas** · 25 min · Depende de: M3-T007, M3-T003 · RF-25–RF-29, RF-42
      Hecho cuando: la migración crea identidad por negocio y hash, generación y fechas; no almacena la credencial utilizable y deja preparada la referencia anulable al apartado.

- [x] **M3-T009 — Migrar operaciones de apartado** · 25 min · Depende de: M3-T008 · RF-18–RF-27, RF-30, RF-33
      Hecho cuando: la migración incorpora clave única por sesión/negocio, selección, generación, estado y resultado; las referencias circulares quedan reservadas para la tarea de relaciones.

- [x] **M3-T010 — Ampliar apartados con precio y contexto público** · 25 min · Depende de: M3-T009 · RF-19–RF-30, RF-31–RF-35
      Hecho cuando: se añaden costo exacto, zona, sesión, generación y operación sin alterar intervalos, expiraciones ni titulares previos; las filas históricas admiten los nuevos datos ausentes.

- [x] **M3-T011 — Permitir teléfonos repetidos por negocio** · 15 min · Depende de: M3-T003, M3-T002 · RF-08–RF-13, RF-36
      Hecho cuando: la migración sustituye únicamente la unicidad negocio/teléfono por índice no único y conserva IDs, nombres, teléfonos y referencias de clientes existentes.

- [x] **M3-T012 — Añadir datos históricos de reserva a las citas** · 25 min · Depende de: M3-T011 · RF-12, RF-30, RF-34–RF-38
      Hecho cuando: la migración añade costo, contacto y nombres del resumen, anulables para datos anteriores, sin inventar valores ni cambiar folios, estados o intervalos.

- [x] **M3-T013 — Migrar intentos de reserva** · 25 min · Depende de: M3-T008, M3-T010, M3-T012 · RF-34–RF-43
      Hecho cuando: existen estados preparado/registrado/no_registrado, huella, apartado y cita; las claves de intento y cita no nula tienen la unicidad prevista.

- [x] **M3-T014 — Completar relaciones compuestas y referencias circulares** · 25 min · Depende de: M3-T009, M3-T010, M3-T013 · RF-02, RF-20, RF-25, RF-29, RF-34–RF-42
      Hecho cuando: sesión, operación, apartado e intento solo enlazan recursos de su negocio, las referencias opcionales permiten su creación ordenada y no hay borrados en cascada de citas.

- [x] **M3-T015 — Representar sesión y operación en TypeORM** · 25 min · Depende de: M3-T014 · RF-18–RF-29, RF-42
      Hecho cuando: las dos entidades reflejan columnas, estados, índices y referencias de sus migraciones sin persistir tokens.

- [x] **M3-T016 — Actualizar la entidad de apartado** · 20 min · Depende de: M3-T010, M3-T015 · RF-19–RF-30, RF-31–RF-35
      Hecho cuando: la entidad conserva el cálculo de vigencia existente y representa costo decimal, zona, generación y referencias públicas, admitiendo filas históricas.

- [x] **M3-T017 — Actualizar entidades de cliente y cita** · 25 min · Depende de: M3-T011, M3-T012 · RF-08–RF-13, RF-30, RF-34–RF-38
      Hecho cuando: el cliente ya no impone teléfono único y la cita representa las copias históricas y el costo sin cambiar el enum de estados.

- [x] **M3-T018 — Representar intentos de reserva** · 20 min · Depende de: M3-T013, M3-T016, M3-T017 · RF-34–RF-43
      Hecho cuando: la entidad del intento coincide con estados, unicidad y referencias de la migración y no introduce un estado procesando persistente.

- [x] **M3-T019 — Registrar entidades y orden de migraciones** · 20 min · Depende de: M3-T015, M3-T016, M3-T017, M3-T018 · RF-02, RF-20, RF-34–RF-42
      Hecho cuando: la configuración usada por aplicación y CLI descubre todas las entidades y migra una base vacía sin errores de metadatos.

- [x] **M3-T020 — Sincronizar SQL de sesiones y operaciones** · 20 min · Depende de: M3-T014, M3-T015 · RF-18–RF-29, RF-42
      Hecho cuando: db/schema.sql contiene las nuevas tablas de sesión y operación con los mismos índices y relaciones que las migraciones.

- [x] **M3-T021 — Sincronizar SQL de apartados, citas e intentos** · 25 min · Depende de: M3-T020, M3-T019 · RF-02, RF-12, RF-19–RF-43
      Hecho cuando: el esquema refleja los cambios restantes, admite teléfonos repetidos y no rellena importes históricos con el catálogo actual.

- [x] **M3-T022 — Probar instalación limpia y equivalencia del esquema** · 25 min · Depende de: M3-T021, M3-T019 · RF-02, RF-12, RF-20, RF-29, RF-34–RF-39
      Hecho cuando: la instalación por migraciones y la del SQL producen las tablas, columnas e índices esperados en bases desechables.

- [x] **M3-T023 — Probar actualización desde fase 3** · 25 min · Depende de: M3-T022, M3-T004 · RF-12, RF-20, RF-30, RF-36–RF-38
      Hecho cuando: con datos previos, la actualización conserva conteos, IDs, intervalos y estados; los nuevos campos desconocidos permanecen nulos y los apartados previos siguen ocupando.

- [x] **M3-T024 — Probar referencias y unicidad de operaciones** · 25 min · Depende de: M3-T019, M3-T004 · RF-02, RF-12–RF-13, RF-25, RF-29, RF-34, RF-39–RF-42
      Hecho cuando: la base rechaza referencias entre negocios y claves repetidas de una sesión, permite teléfono repetido y distingue claves iguales usadas por sesiones distintas.

## 3. Acceso público y adaptación del motor

E1–E2; M01–M02; D01–D02, D11; T01.

- [x] **M3-T025 — Resolver negocio y política de acceso público** · 20 min · Depende de: M3-T007, M3-T004 · RF-01–RF-04, RF-31
      Hecho cuando: el resolver usa el slug y puedeAceptarReserva, devuelve negocio autorizado sin crear usuario y rechaza negocio inexistente, no activado o sin acceso.

- [x] **M3-T026 — Emitir y comprobar credencial anónima** · 25 min · Depende de: M3-T015, M3-T025 · RF-01–RF-02, RF-11, RF-25, RF-29, RF-42
      Hecho cuando: la credencial aleatoria viaja en cookie con atributos previstos; el servidor deriva su hash y reutiliza una fila por negocio sin guardar el valor utilizable.

- [x] **M3-T027 — Exponer inicialización de sesión pública** · 20 min · Depende de: M3-T026 · RF-01, RF-11, RF-25, RF-29, RF-42
      Hecho cuando: POST /sesion puede repetirse con la cookie existente sin duplicar identidad y no requiere JWT ni datos de contacto.

- [x] **M3-T028 — Proteger origen y mutaciones públicas** · 25 min · Depende de: M3-T027 · RF-02, RF-29, RF-42–RF-43
      Hecho cuando: las mutaciones exigen origen permitido y protección CSRF compatible con las liberaciones; no se habilita CORS con credenciales para orígenes arbitrarios.

- [x] **M3-T029 — Definir respuestas públicas y redacción de registros** · 20 min · Depende de: M3-T007, M3-T028 · RF-02, RF-13, RF-29, RF-42–RF-43
      Hecho cuando: las proyecciones omiten RFC, correo administrativo y datos ajenos; respuestas personales usan no-store y los logs no contienen cookies, contacto, notas ni huellas.

- [x] **M3-T030 — Separar contexto de cálculo de autorización** · 25 min · Depende de: M3-T002, M3-T007 · RF-01–RF-04, RF-14–RF-18, RF-31–RF-33
      Hecho cuando: el contexto común contiene manager, instante, negocio y Profesional; la autorización interna conserva rol/sesión y el contexto público no necesita un usuario ficticio.

- [x] **M3-T031 — Adaptar entradas privadas al contexto compartido** · 25 min · Depende de: M3-T030 · RF-02–RF-04, RF-14–RF-18, RF-29
      Hecho cuando: las entradas existentes siguen reconstruyendo sesión y permisos antes de llamar al cálculo; la modalidad manual conserva su control privado.

- [x] **M3-T032 — Añadir consulta pública al motor compartido** · 25 min · Depende de: M3-T030, M3-T025, M3-T031 · RF-01–RF-04, RF-14–RF-18
      Hecho cuando: el motor calcula desde un contexto público autorizado en una lectura coherente, con un instante y modalidad pública obligatoria, sin duplicar el algoritmo.

- [x] **M3-T033 — Adaptar revalidación transaccional al contexto público** · 25 min · Depende de: M3-T032, M3-T016 · RF-18, RF-20–RF-22, RF-29, RF-31–RF-35
      Hecho cuando: la revalidación recibe la transacción del escritor y solo excluye el apartado propio comprobado; no abre otra transacción ni autoriza exclusiones desde HTTP.

- [x] **M3-T034 — Probar regresión de las cinco rutas privadas** · 25 min · Depende de: M3-T031, M3-T032, M3-T033 · RF-01–RF-04, RF-14–RF-18, RF-29
      Hecho cuando: las pruebas de las cinco rutas conservan permisos, aislamiento y errores previos; abrir la consulta pública no habilita escritura de configuración ni modo manual anónimo.

- [x] **M3-T035 — Probar cookie, origen y privacidad** · 25 min · Depende de: M3-T027, M3-T028, M3-T029 · RF-01–RF-03, RF-11, RF-13, RF-29, RF-42–RF-43
      Hecho cuando: HTTP rechaza credenciales u origen inválidos, no revela recursos ajenos y verifica no-store y ausencia de secretos en los registros capturados.

## 4. Catálogo y disponibilidad por HTTP

E2; M02; T02 y T04.

- [x] **M3-T036 — Consultar servicios de oferta efectiva** · 20 min · Depende de: M3-T032, M3-T029 · RF-02–RF-04, RF-13
      Hecho cuando: el catálogo devuelve solo servicios con al menos una combinación efectiva del negocio, con nombre, costo y duración públicos.

- [x] **M3-T037 — Consultar sucursales y Profesionales compatibles** · 25 min · Depende de: M3-T036 · RF-02, RF-04–RF-06
      Hecho cuando: los filtros progresivos devuelven únicamente sucursales y Profesionales compatibles; IDs ajenos no filtran nombres ni oferta de otro negocio.

- [x] **M3-T038 — Exponer el catálogo progresivo** · 20 min · Depende de: M3-T037 · RF-01–RF-06, RF-13
      Hecho cuando: GET /catalogo valida filtros y devuelve la proyección pública, sin exigir sesión administrativa ni publicar el catálogo de la demo.

- [x] **M3-T039 — Validar entrada de disponibilidad pública** · 20 min · Depende de: M3-T032 · RF-02, RF-14–RF-15, RF-17
      Hecho cuando: las entradas validan IDs, fecha/hora y hasta 31 fechas inclusivas; rechazan negocioId, modalidad manual, titularHash y exclusiones aportadas por cliente.

- [x] **M3-T040 — Exponer disponibilidad pública** · 20 min · Depende de: M3-T039, M3-T029 · RF-14–RF-17
      Hecho cuando: GET /disponibilidad devuelve ranuras, zona e instante del cálculo; el horizonte configurable puede superar 31 fechas aunque cada petición quede acotada.

- [x] **M3-T041 — Normalizar errores del portal** · 25 min · Depende de: M3-T040, M3-T038, M3-T035 · RF-03, RF-10, RF-16–RF-17, RF-29, RF-32–RF-33, RF-40–RF-43
      Hecho cuando: el mapeo distingue 400/401/403/404/409/500/503 y respuesta vacía válida; las causas públicas tienen mensaje y acción y no incluyen SQL ni trazas.

- [x] **M3-T042 — Probar selección y oferta pública** · 25 min · Depende de: M3-T038, M3-T004, M3-T041 · RF-02–RF-06, RF-13
      Hecho cuando: los casos desactivan cada nivel de oferta y cambian servicio/sucursal; ninguna combinación inválida ni dato privado aparece en las respuestas.

- [x] **M3-T043 — Probar límites públicos y fallos de lectura** · 25 min · Depende de: M3-T040, M3-T041, M3-T005 · RF-14, RF-16–RF-17, RF-43
      Hecho cuando: pasan rango inclusivo de 31 fechas, rechazo de 32, anticipación/horizonte exactos, vacío legítimo y fallos técnicos sin ranuras parciales.

- [x] **M3-T044 — Probar continuidad, zonas y estrategias** · 25 min · Depende de: M3-T040, M3-T004, M3-T005 · RF-14–RF-15, RF-18, RF-20
      Hecho cuando: casos sobre el motor compartido cubren DST, extremos contiguos, bloques continuos, descansos y ambos modos mediante la entrada pública.

## 5. Protocolo de escritura y mutaciones concurrentes

E3; M07; D05; T11. Este bloque precede a la habilitación de escritores.

- [x] **M3-T045 — Inventariar el orden de bloqueos de los escritores existentes** · 25 min · Depende de: M3-T002, M3-T033 · RF-03–RF-04, RF-20, RF-31–RF-35
      Hecho cuando: una tabla identifica servicios/métodos que modifican usuarios, licencia, negocio, oferta, configuración, horarios y asignaciones, señalando inversiones respecto al orden del plan.

- [x] **M3-T046 — Preparar transacción pública y reintentos acotados** · 25 min · Depende de: M3-T045, M3-T006, M3-T018 · RF-20–RF-22, RF-31–RF-35, RF-39–RF-43
      Hecho cuando: el colaborador usa READ COMMITTED, rollback íntegro y reintentos acotados con claves estables; agotamiento técnico no se presenta como horario ocupado.

- [x] **M3-T047 — Coordinar sesión, operación e intento** · 25 min · Depende de: M3-T046, M3-T015, M3-T018 · RF-25–RF-29, RF-39–RF-42
      Hecho cuando: los escritores pueden bloquear sesión y operación/intento antes del dominio; la creación simultánea de una misma fila converge a una única identidad.

- [x] **M3-T048 — Implementar adquisición ordenada de recursos de reserva** · 25 min · Depende de: M3-T046, M3-T045 · RF-02–RF-04, RF-18, RF-20, RF-31–RF-35
      Hecho cuando: el colaborador toma usuarios, negocio, licencia, sucursales, servicios, perfiles y ocupaciones en el orden previsto, con IDs ascendentes y perfil común entre sucursales.

- [x] **M3-T049 — Alinear mutaciones de usuario y perfil** · 25 min · Depende de: M3-T048 · RF-04, RF-20, RF-31–RF-33
      Hecho cuando: las rutas identificadas de cuenta/perfil dejan de tomar usuario después del perfil y conservan sus validaciones y permisos.

- [x] **M3-T050 — Alinear transiciones de licencia con reservas** · 25 min · Depende de: M3-T048 · RF-03, RF-31–RF-33
      Hecho cuando: renovación, suspensión, reactivación y conciliación usan los recursos comunes que impiden una escritura pública basada en un estado de licencia obsoleto.

- [x] **M3-T051 — Alinear configuración y cambios de sucursal** · 25 min · Depende de: M3-T048 · RF-04, RF-14–RF-15, RF-31–RF-33
      Hecho cuando: las mutaciones identificadas de configuración y sucursal respetan la barrera del negocio y el orden compartido, incluyendo cambio de zona y desactivación.

- [x] **M3-T052 — Alinear catálogo y selecciones de servicio** · 25 min · Depende de: M3-T048 · RF-04, RF-18, RF-30–RF-33
      Hecho cuando: cambios de costo/duración y selecciones individuales o por sucursal quedan coordinados con las filas que relee el escritor público.

- [x] **M3-T053 — Coordinar altas y cambios de asignación** · 25 min · Depende de: M3-T049, M3-T051 · RF-04, RF-14, RF-20, RF-31–RF-33
      Hecho cuando: toda ruta inventariada que agrega, retira o cambia una asignación respeta la barrera de negocio y no introduce un perfil fuera del alcance de un cambio colectivo concurrente.

- [x] **M3-T054 — Coordinar horarios semanales y excepciones** · 25 min · Depende de: M3-T053 · RF-14–RF-15, RF-20, RF-31–RF-33
      Hecho cuando: horarios y excepciones toman los perfiles necesarios en orden; una prelectura obsoleta reinicia la operación sin adquirir recursos en orden inverso.

- [x] **M3-T055 — Coordinar bloqueos individuales y colectivos** · 25 min · Depende de: M3-T054 · RF-14, RF-20, RF-31–RF-33
      Hecho cuando: los cambios de bloqueos cubren todos los perfiles afectados bajo la barrera de negocio, incluidas asignaciones concurrentes.

- [x] **M3-T056 — Probar regresión de las mutaciones coordinadas** · 25 min · Depende de: M3-T049, M3-T050, M3-T051, M3-T052, M3-T053, M3-T054, M3-T055 · RF-03–RF-04, RF-14, RF-20, RF-31–RF-33
      Hecho cuando: las suites relevantes del catálogo, licencia y horarios conservan permisos y resultados; no quedan inversiones conocidas del inventario sin resolver.

- [x] **M3-T057 — Verificar preparación del protocolo común** · 20 min · Depende de: M3-T047, M3-T056, M3-T034, M3-T043, M3-T044 · RF-02–RF-04, RF-14–RF-15, RF-18–RF-22, RF-25, RF-31–RF-35
      Hecho cuando: la matriz del inventario identifica la coordinación aplicada a cada escritor y el control de espera con dos conexiones pasa; la habilitación externa continúa cerrada hasta probar escritores reales.

## 6. Apartados, reemplazo y liberación

E3; M03; D03–D05, D07; T05–T07.

- [x] **M3-T058 — Validar selección y clave de operación de apartado** · 20 min · Depende de: M3-T039, M3-T057 · RF-18, RF-25, RF-29–RF-30, RF-43
      Hecho cuando: la entrada acepta selección y clave opaca, rechaza precio/fin/titular ajenos y distingue repetición del mismo contenido de clave reutilizada con otra selección.

- [x] **M3-T059 — Liberar un apartado propio exacto** · 25 min · Depende de: M3-T016, M3-T047, M3-T048, M3-T057 · RF-24, RF-26–RF-29
      Hecho cuando: el servicio comprueba negocio, titular, ID y generación, libera idempotentemente y nunca toca un reemplazo posterior ni una cita ya registrada.

- [x] **M3-T060 — Confirmar liberación antes del nuevo apartado** · 25 min · Depende de: M3-T059, M3-T058 · RF-24–RF-27, RF-33
      Hecho cuando: una transacción deduplica operación, incrementa generación, libera el anterior y guarda preparada la nueva operación; su commit termina antes de buscar el nuevo hueco.

- [x] **M3-T061 — Conceder el nuevo apartado tras revalidar** · 25 min · Depende de: M3-T060, M3-T033, M3-T005 · RF-18–RF-22, RF-25, RF-30–RF-33
      Hecho cuando: la segunda transacción comprueba generación actual y disponibilidad, guarda costo/zona y vence cinco minutos después de concederlo; actualiza el apartado actual de sesión.

- [x] **M3-T062 — Resolver operaciones repetidas, sustituidas o interrumpidas** · 25 min · Depende de: M3-T061 · RF-21, RF-25–RF-26, RF-33, RF-43
      Hecho cuando: repetir una concesión conserva expiración, una rechazada no concede y una generación antigua no altera la actual; el fallo entre fases se retoma con la misma clave.

- [x] **M3-T063 — Consultar estado y vigencia del apartado propio** · 20 min · Depende de: M3-T061, M3-T059 · RF-19, RF-22–RF-23, RF-26, RF-29
      Hecho cuando: la consulta devuelve estado, expiración y hora del servidor solo al titular; distingue liberación, sustitución y vencimiento sin depender de borrado físico.

- [x] **M3-T064 — Exponer las tres rutas de apartado** · 25 min · Depende de: M3-T062, M3-T063, M3-T028, M3-T041 · RF-18–RF-30, RF-33, RF-43
      Hecho cuando: crear, consultar y liberar aplican los contratos HTTP y la propiedad; liberar sigue permitido al titular cuando la licencia impide nuevas concesiones.

- [x] **M3-T065 — Probar plazo inmutable y vencimiento exacto** · 25 min · Depende de: M3-T064, M3-T005 · RF-19–RF-23, RF-27, RF-31
      Hecho cuando: con reloj controlado se verifica el límite exacto de cinco minutos y que consultas, errores y repetición de operación no amplían el plazo.

- [x] **M3-T066 — Probar reemplazo fallido y generación obsoleta** · 25 min · Depende de: M3-T064, M3-T006 · RF-24–RF-27, RF-29, RF-33
      Hecho cuando: si el nuevo horario falla, el anterior sigue liberado; dos generaciones y avisos atrasados no dejan dos apartados vigentes ni liberan el más reciente.

- [x] **M3-T067 — Probar interrupción entre fases de apartado** · 25 min · Depende de: M3-T062, M3-T006 · RF-21, RF-25–RF-26, RF-33, RF-43
      Hecho cuando: un fallo después del primer commit conserva la liberación; el reintento con la misma clave concede una sola vez o devuelve una negativa terminal.

- [x] **M3-T068 — Probar propiedad, precio y filas históricas** · 25 min · Depende de: M3-T064, M3-T023, M3-T004 · RF-02, RF-20, RF-29–RF-30, RF-43
      Hecho cuando: otro titular no consulta/libera el apartado, el costo proviene del catálogo y un apartado previo sin contexto público sigue ocupando sin ser consumible desde el portal.

## 7. Registro pendiente y recuperación de envíos

E4; M04–M05; D06–D10; T03, T07–T09.

- [x] **M3-T069 — Validar contacto y límites de captura en servidor** · 20 min · Depende de: M3-T007, M3-T041 · RF-08–RF-11, RF-43
      Hecho cuando: nombre admite acentos y hasta 150 caracteres; teléfono normaliza espacios, guiones y +52 a diez dígitos; notas admiten hasta 2.000 y el cuerpo se limita a 32 KiB sin truncar.

- [x] **M3-T070 — Probar validaciones y normalización** · 20 min · Depende de: M3-T069 · RF-08–RF-11, RF-43
      Hecho cuando: pasan casos válidos y límites exactos, y se rechazan vacíos, letras/prefijos inválidos y excesos con mensajes de campo, sin código de verificación telefónica.

- [x] **M3-T071 — Calcular huella segura del envío normalizado** · 20 min · Depende de: M3-T069, M3-T018 · RF-13, RF-39, RF-42–RF-43
      Hecho cuando: la huella HMAC usa secreto de entorno, es estable para entradas equivalentes y no incorpora datos de contacto ni secretos a logs o errores.

- [x] **M3-T072 — Preparar intento vinculado al apartado propio** · 25 min · Depende de: M3-T018, M3-T064, M3-T047 · RF-29, RF-31, RF-39–RF-42
      Hecho cuando: preparar la misma clave devuelve el mismo intento, verifica titular/combinación y no renueva el apartado ni acepta reabrir un intento terminal.

- [x] **M3-T073 — Reconocer resultado existente o clave incompatible** · 20 min · Depende de: M3-T072, M3-T071 · RF-35, RF-39–RF-42
      Hecho cuando: el colaborador devuelve la reserva ya registrada para igual contenido sin requerir apartado vigente y rechaza cambio de contenido o intento terminal no registrado.

- [x] **M3-T074 — Revalidar un intento nuevo bajo los bloqueos comunes** · 25 min · Depende de: M3-T072, M3-T073, M3-T033, M3-T057 · RF-03, RF-18, RF-20–RF-22, RF-29, RF-31–RF-33
      Hecho cuando: la entrada del escritor relee acceso y oferta tras esperar, comprueba apartado propio, duración e intervalo, y produce negativa funcional sin insertar cita.

- [x] **M3-T075 — Preparar copia histórica y folio de la reserva** · 20 min · Depende de: M3-T017, M3-T069, M3-T074 · RF-12, RF-30, RF-36–RF-37
      Hecho cuando: la proyección toma costo del apartado, UTC/zona validados y nombres/contacto normalizados; genera un folio compatible con la unicidad sin usar teléfono como identidad.

- [x] **M3-T076 — Guardar cliente, cita, consumo y resultado juntos** · 25 min · Depende de: M3-T075, M3-T074, M3-T073 · RF-08, RF-12, RF-30–RF-39
      Hecho cuando: el escritor crea cliente nuevo y una cita pendiente, consume el apartado, retira su puntero y enlaza el intento en un solo commit; no envía efectos externos.

- [x] **M3-T077 — Probar fallos entre escrituras de reserva** · 25 min · Depende de: M3-T076, M3-T005 · RF-34–RF-36, RF-39
      Hecho cuando: fallos después de cliente, cita y antes de resultado revierten todos los cambios; el apartado conserva el vencimiento anterior y no hay clientes o citas huérfanos.

- [x] **M3-T078 — Resolver un intento existente bajo exclusión** · 25 min · Depende de: M3-T076, M3-T059, M3-T047 · RF-28, RF-35, RF-39–RF-43
      Hecho cuando: el resolutor devuelve el resultado registrado o cierra como no registrado y libera solo su apartado; espera al escritor o informa 503 sin inferir ausencia.

- [x] **M3-T079 — Cerrar una clave cuya preparación no llegó** · 25 min · Depende de: M3-T078, M3-T072 · RF-35, RF-39–RF-42
      Hecho cuando: el resolutor crea un registro terminal propio para la clave ausente y una preparación o reserva tardía con esa clave no puede insertar cita.

- [x] **M3-T080 — Exponer preparación y registro de reserva** · 25 min · Depende de: M3-T076, M3-T070, M3-T028, M3-T041 · RF-08–RF-13, RF-30–RF-40, RF-42–RF-43
      Hecho cuando: POST /intentos y POST /intentos/:id/reservar aplican propiedad, validaciones, creación/repetición y errores sin aceptar estado, precio o fin del cliente.

- [x] **M3-T081 — Exponer resolución de envío incierto** · 20 min · Depende de: M3-T079, M3-T080 · RF-03, RF-28, RF-35, RF-39–RF-43
      Hecho cuando: POST /intentos/:id/resolver solo recupera intentos propios, funciona para resultados guardados tras bloqueo de licencia y no crea una ruta de consulta por teléfono/folio.

- [x] **M3-T082 — Probar resultado pendiente y teléfonos compartidos** · 25 min · Depende de: M3-T080, M3-T004 · RF-08–RF-13, RF-34, RF-36–RF-38
      Hecho cuando: dos reservas con el mismo teléfono y nombres distintos conservan sus datos; resumen y folio son correctos y la cita pendiente no vence ni libera su intervalo.

- [x] **M3-T083 — Probar conservación de costo y datos históricos** · 25 min · Depende de: M3-T080, M3-T081 · RF-12, RF-30, RF-36–RF-37, RF-39
      Hecho cuando: cambiar costo durante apartado respeta el anterior; un apartado nuevo toma el nuevo; editar catálogo tras el registro no cambia el resumen recuperado ni el contacto.

- [x] **M3-T084 — Probar invalidación por cambios de oferta y duración** · 25 min · Depende de: M3-T080, M3-T004 · RF-03–RF-04, RF-18, RF-31–RF-32
      Hecho cuando: una selección que dejó de estar activa o cuyo intervalo ya no coincide se rechaza al guardar; tampoco se consumen apartados expirados o ajenos.

- [x] **M3-T085 — Probar seguridad y errores de recuperación** · 25 min · Depende de: M3-T081, M3-T035 · RF-02–RF-03, RF-13, RF-29, RF-40–RF-43
      Hecho cuando: cookie ajena, clave inexistente de otra sesión y negocio distinto no revelan reservas; pérdida de credencial y fallos técnicos no se convierten en éxito ni fracaso falso.

Evidencia de M3-T080–M3-T085: [resultado, flujo HTTP y pruebas](resultados-tareas/resultado-t080-t085.md).

## 8. Carreras con escritores públicos reales

E4; M03–M05 y M07; T05–T11. Conserva la trazabilidad M2-I indicada en cada criterio.

- [x] **M3-T086 — Probar dos solicitudes sobre el mismo intervalo** · 25 min · Depende de: M3-T080, M3-T006, M3-T064 · RF-18, RF-20, RF-33–RF-35
      Hecho cuando: dos conexiones con barrera producen una única ocupación incompatible y conflicto para la otra; se adjunta evidencia real de M2-I001 y M2-I002.

- [x] **M3-T087 — Probar solapamiento entre sucursales** · 25 min · Depende de: M3-T086, M3-T004 · RF-14–RF-15, RF-20, RF-33
      Hecho cuando: se rechazan traslapes parciales del mismo Profesional incluso con fechas locales distintas; un caso de extremos contiguos pasa y se registra M2-I003.

- [x] **M3-T088 — Probar vencimiento del apartado mientras espera** · 25 min · Depende de: M3-T080, M3-T006, M3-T005 · RF-19–RF-22, RF-31, RF-35
      Hecho cuando: el reloj llega exactamente a expira_en antes de obtener el bloqueo y el escritor no consume el apartado ni crea cita; se registra M2-I005.

- [x] **M3-T089 — Probar reserva contra oferta, costo y duración** · 25 min · Depende de: M3-T080, M3-T006, M3-T052, M3-T083 · RF-04, RF-18, RF-30–RF-33, RF-36
      Hecho cuando: ambos órdenes de commit preservan costo aceptado y revalidan oferta/duración vigentes; se anexa la parte de oferta de M2-I006.

- [x] **M3-T090 — Probar reserva contra configuración de agenda** · 25 min · Depende de: M3-T080, M3-T006, M3-T051 · RF-14, RF-18, RF-31–RF-33
      Hecho cuando: cambiar anticipación, horizonte o modo durante la espera no permite reservar usando configuración obsoleta; se completa M2-I006.

- [x] **M3-T091 — Probar reserva contra horario y excepción** · 25 min · Depende de: M3-T080, M3-T006, M3-T054 · RF-14–RF-15, RF-20, RF-31–RF-33, RF-36
      Hecho cuando: si la restricción confirma primero la reserva falla; si confirma primero la cita, el cambio válido la conserva y aparece su afectación; evidencia parcial de M2-I007.

Evidencia de M3-T086–M3-T091: [resultado, carreras y pruebas](resultados-tareas/resultado-t086-t091.md).

- [x] **M3-T092 — Probar bloqueo colectivo contra nuevas asignaciones** · 25 min · Depende de: M3-T091, M3-T006, M3-T055, M3-T053 · RF-04, RF-14, RF-20, RF-31–RF-33
      Hecho cuando: las barreras reproducen ingreso de un perfil al alcance colectivo y no dejan una reserva incompatible fuera de la coordinación; se completa M2-I007.

- [x] **M3-T093 — Probar licencia y suspensión durante la espera** · 25 min · Depende de: M3-T080, M3-T081, M3-T006, M3-T005, M3-T050 · RF-03, RF-31–RF-33, RF-39–RF-41
      Hecho cuando: vencimiento de licencia y límite exacto de 48 horas impiden nuevas reservas tras esperar, pero permiten recuperar un resultado ya guardado; se registra M2-I008.

- [x] **M3-T094 — Probar doble consumo e idempotencia real** · 25 min · Depende de: M3-T080, M3-T006, M3-T077 · RF-34–RF-35, RF-39, RF-42
      Hecho cuando: el mismo intento concurrente devuelve una cita y folio; otro intento sobre el mismo apartado recibe conflicto; junto al rollback se acredita M2-I009.

- [x] **M3-T095 — Probar escritor y resolutor en ambos órdenes** · 25 min · Depende de: M3-T081, M3-T006 · RF-35, RF-39–RF-43
      Hecho cuando: si el escritor gana se recupera su cita; si gana el cierre terminal no llega a crearse; un timeout de espera devuelve incertidumbre, nunca no registrado.

- [x] **M3-T096 — Probar preparación atrasada y respuesta perdida** · 25 min · Depende de: M3-T095, M3-T005 · RF-28, RF-35, RF-39–RF-42
      Hecho cuando: resolver antes de preparar impide un registro tardío y perder la respuesta después del commit recupera la misma cita sin depender del plazo del apartado.

Evidencia de M3-T092–M3-T096: [resultado, carreras y pruebas](resultados-tareas/resultado-t092-t096.md).

- [x] **M3-T097 — Revisar evidencia del escritor antes de habilitarlo** · 20 min · Depende de: M3-T065, M3-T066, M3-T067, M3-T068, M3-T082, M3-T083, M3-T084, M3-T085, M3-T087, M3-T088, M3-T089, M3-T090, M3-T091, M3-T092, M3-T093, M3-T094, M3-T096 · RF-02–RF-04, RF-12–RF-15, RF-18–RF-43
      Hecho cuando: los casos públicos T05–T11 están aprobados o bloquean habilitación; M2-I004 sigue diferido y no se marca integración total de RF-35–RF-37 del módulo 2.

Evidencia de M3-T097: [revisión de habilitación del escritor](resultados-tareas/resultado-t097.md).

## 9. Portal web conectado

E5; M06; D02–D03, D10–D11; T02, T03 y T12. Trabajo en frontend-saas.

- [x] **M3-T098 — Crear entrada pública por slug** · 20 min · Depende de: M3-T097, M3-T038 · RF-01, RF-05, RF-13
      Hecho cuando: /reservas/:slug carga el portal conectado sin login, sin navegación administrativa y sin importar datos de la demo.

- [x] **M3-T099 — Preparar cliente HTTP público del mismo origen** · 20 min · Depende de: M3-T098, M3-T028, M3-T041 · RF-01–RF-03, RF-17, RF-29, RF-43
      Hecho cuando: las peticiones usan la cookie y protección de mutaciones, interpretan códigos públicos y distinguen fallo de red de respuesta funcional.

- [x] **M3-T100 — Coordinar inicialización de navegador entre pestañas** · 25 min · Depende de: M3-T099, M3-T027 · RF-01, RF-25, RF-29, RF-42–RF-43
      Hecho cuando: Web Locks evita inicializaciones simultáneas incompatibles; cookies o coordinación no disponibles impiden continuar con un mensaje explícito.

- [x] **M3-T101 — Definir estados y selecciones dependientes** · 25 min · Depende de: M3-T099 · RF-05–RF-06, RF-10, RF-16–RF-17, RF-23, RF-28, RF-32
      Hecho cuando: el estado distingue selección, apartado, formulario, envío y resultado; cambiar una selección invalida las posteriores y descarta respuestas de consultas obsoletas.

- [x] **M3-T102 — Construir pasos de servicio, sucursal y Profesional** · 25 min · Depende de: M3-T101, M3-T038 · RF-04–RF-07
      Hecho cuando: los tres pasos consumen opciones compatibles y permiten avanzar/volver con etiquetas y foco utilizables mediante teclado.

- [x] **M3-T103 — Construir selector de fecha y horario** · 25 min · Depende de: M3-T102, M3-T040 · RF-05–RF-07, RF-14–RF-17
      Hecho cuando: el selector muestra hora y zona de sucursal, consulta rangos válidos y diferencia sin horarios, selección inválida y error con reintento.

- [x] **M3-T104 — Solicitar apartado antes de abrir formulario** · 25 min · Depende de: M3-T103, M3-T100, M3-T064 · RF-18–RF-19, RF-25–RF-26, RF-30, RF-33
      Hecho cuando: cada selección final genera una clave estable de operación y abre formulario solo tras concesión; el conflicto vuelve a disponibilidad sin inventar un apartado local.

- [x] **M3-T105 — Construir captura y validaciones de contacto** · 25 min · Depende de: M3-T104, M3-T070 · RF-07–RF-11, RF-13, RF-43
      Hecho cuando: el formulario valida nombre, teléfono y notas con los mismos límites del servidor, muestra errores por campo y no consulta datos previos por teléfono.

- [x] **M3-T106 — Conservar datos solo durante la navegación interna** · 20 min · Depende de: M3-T105, M3-T101 · RF-10, RF-23, RF-28, RF-32
      Hecho cuando: volver a disponibilidad por vencimiento o incompatibilidad conserva lo escrito en memoria; contacto y notas no aparecen en URL ni almacenamiento persistente.

- [x] **M3-T107 — Mostrar tiempo restante con referencia al servidor** · 20 min · Depende de: M3-T104, M3-T063 · RF-19, RF-21–RF-23
      Hecho cuando: el contador usa la expiración original y hora del servidor; al vencer deshabilita envío y conserva el formulario, sin ampliar plazo por actividad.

- [x] **M3-T108 — Notificar reemplazos y comprobar vigencia al reenfocar** · 25 min · Depende de: M3-T107, M3-T100 · RF-22–RF-23, RF-25–RF-26, RF-29
      Hecho cuando: BroadcastChannel avisa de sustituciones y la consulta propia confirma estado al reenfocar; una pestaña obsoleta no ofrece reservar con un apartado perdido.

- [x] **M3-T109 — Liberar al volver, recargar o abandonar** · 25 min · Depende de: M3-T108, M3-T059 · RF-24, RF-26–RF-29
      Hecho cuando: volver envía liberación del ID/generación correctos; salida usa aviso de mejor esfuerzo y una recarga ordinaria reinicia sin restaurar el formulario.

- [ ] **M3-T110 — Persistir marcador mínimo antes del envío** · 20 min · Depende de: M3-T106, M3-T072 · RF-28, RF-39–RF-42
      Hecho cuando: sessionStorage recibe solo negocio, apartado y clave de intento antes de preparar/enviar; no se cambia esa clave por timeout ni se incluyen datos de contacto.

- [ ] **M3-T111 — Conectar envío de reserva y repetición** · 25 min · Depende de: M3-T110, M3-T105, M3-T080 · RF-08–RF-10, RF-31–RF-35, RF-39–RF-43
      Hecho cuando: se prepara y envía el intento, se manejan errores de campo/conflicto y el reintento usa el mismo contenido normalizado; un resultado incierto bloquea nuevas reservas.

- [ ] **M3-T112 — Resolver resultados inciertos y recargas** · 25 min · Depende de: M3-T111, M3-T081 · RF-28, RF-35, RF-39–RF-43
      Hecho cuando: ante recarga con marcador se consulta el resolutor antes de reiniciar; se muestra la cita existente o se reinicia solo tras ausencia terminal comprobada.

- [ ] **M3-T113 — Evitar liberación automática durante un envío** · 20 min · Depende de: M3-T112, M3-T109 · RF-27–RF-28, RF-34–RF-35, RF-40–RF-41
      Hecho cuando: salir mientras se registra no emite una liberación competidora; las respuestas y avisos atrasados no borran el resultado ni liberan otro apartado.

- [ ] **M3-T114 — Mostrar resumen de reserva pendiente** · 20 min · Depende de: M3-T112 · RF-30, RF-34, RF-36–RF-38, RF-42–RF-43
      Hecho cuando: el resultado presenta folio, nombres, fecha/hora/zona, costo y estado pendiente guardados, sin afirmar envío de WhatsApp ni añadir enlaces de gestión.

- [ ] **M3-T115 — Ajustar navegación móvil y accesibilidad del flujo** · 25 min · Depende de: M3-T114, M3-T102, M3-T103, M3-T105 · RF-05–RF-07, RF-10, RF-16–RF-17, RF-43
      Hecho cuando: todos los pasos funcionan en ancho móvil sin desbordamiento horizontal, con foco visible, etiquetas y anuncios de error/estado accesibles.

- [ ] **M3-T116 — Probar estado y respuestas desordenadas del portal** · 25 min · Depende de: M3-T101, M3-T106, M3-T112 · RF-05–RF-06, RF-10, RF-23, RF-28, RF-32, RF-39–RF-41
      Hecho cuando: las pruebas Node cubren invalidación de selecciones, respuesta vieja descartada, conservación en memoria y transición incierta sin iniciar otra reserva.

## 10. Pruebas de navegador y cierre de seguridad

E5–E6; M06–M07; T01–T03 y T12.

- [ ] **M3-T117 — Configurar Playwright para portal y API de prueba** · 25 min · Depende de: M3-T098, M3-T003 · RF-01, RF-05–RF-07, RF-25, RF-28, RF-40–RF-41
      Hecho cuando: el runner inicia frontend/API contra base desechable, abre una página pública y cierra recursos al terminar; no utiliza la base cotidiana.

- [ ] **M3-T118 — Probar recorrido móvil completo** · 25 min · Depende de: M3-T117, M3-T115, M3-T082 · RF-01, RF-05–RF-11, RF-15, RF-19, RF-30, RF-34, RF-37
      Hecho cuando: un navegador móvil selecciona oferta, corrige errores, reserva y ve folio/estado pendiente; la base contiene exactamente la cita mostrada.

- [ ] **M3-T119 — Probar teclado, foco y contenido seguro** · 25 min · Depende de: M3-T117, M3-T115 · RF-07–RF-10, RF-13, RF-16–RF-17, RF-43
      Hecho cuando: el recorrido se completa sin ratón, errores y foco resultan comprensibles y las notas con apariencia de HTML no ejecutan ni inyectan contenido.

- [ ] **M3-T120 — Probar pestañas del mismo navegador** · 25 min · Depende de: M3-T117, M3-T108, M3-T109, M3-T066 · RF-19, RF-21–RF-27, RF-29
      Hecho cuando: dos pestañas comparten identidad, mantienen un apartado por negocio y notifican reemplazo; un intento nuevo fallido deja liberado el anterior.

- [ ] **M3-T121 — Probar navegadores distintos y acceso cruzado** · 25 min · Depende de: M3-T117, M3-T099, M3-T085 · RF-01–RF-04, RF-13, RF-20, RF-29, RF-33, RF-42
      Hecho cuando: dos contextos independientes no acceden a apartados/resultados ajenos y disputan un horario sin generar dos ocupaciones incompatibles.

- [ ] **M3-T122 — Probar recarga normal, salida y cookies bloqueadas** · 25 min · Depende de: M3-T117, M3-T109, M3-T100 · RF-23–RF-28, RF-43
      Hecho cuando: recargar sin envío reinicia sin contacto guardado, cerrar sin aviso permite vencer el apartado y cookies bloqueadas muestran imposibilidad de continuar.

- [ ] **M3-T123 — Probar pérdida de respuesta y recarga tras envío** · 25 min · Depende de: M3-T117, M3-T112, M3-T113, M3-T096 · RF-28, RF-35, RF-39–RF-43
      Hecho cuando: interceptar la respuesta después del commit y recargar recupera el mismo folio; interceptar antes del envío permite ausencia terminal sin una cita tardía.

- [ ] **M3-T124 — Probar pestaña suspendida y contador desfasado** · 20 min · Depende de: M3-T117, M3-T107, M3-T108, M3-T065 · RF-19, RF-21–RF-23, RF-26, RF-31
      Hecho cuando: alterar el reloj del navegador o suspender la pestaña no extiende el apartado; al volver se muestra su vigencia real y se impide enviar uno vencido.

- [ ] **M3-T125 — Probar límites HTTP y respuestas seguras finales** · 25 min · Depende de: M3-T080, M3-T081, M3-T064, M3-T035 · RF-02–RF-03, RF-08–RF-10, RF-13, RF-17, RF-29, RF-42–RF-43
      Hecho cuando: las rutas rechazan campos desconocidos y cuerpos excesivos; cada error previsto conserva el contrato seguro y ningún resultado personal queda cacheable o registrado con secretos.

## 11. Verificación y preparación de entrega

E6; M01–M07; ocho criterios de finalización. Estas tareas no autorizan publicar ni activar producción.

- [ ] **M3-T126 — Añadir controles de habilitación y cierre de nuevas reservas** · 25 min · Depende de: M3-T097, M3-T125 · RF-03, RF-17, RF-20, RF-27, RF-35, RF-39–RF-43
      Hecho cuando: con escritura cerrada se rechazan nuevas concesiones y reservas, mientras liberación y recuperación propias siguen operativas; las pruebas verifican ambos modos.

- [ ] **M3-T127 — Registrar métricas operativas sin datos privados** · 20 min · Depende de: M3-T126, M3-T029 · RF-13, RF-17, RF-22, RF-33, RF-40–RF-43
      Hecho cuando: se distinguen conflictos, expiraciones, fallos y recuperaciones usando contadores agregados; los registros capturados no contienen contacto, notas, cookies ni claves utilizables.

- [ ] **M3-T128 — Verificar compilación y lint del backend** · 20 min · Depende de: M3-T126, M3-T127, M3-T125 · RF-01–RF-43
      Hecho cuando: npm run build y npm run lint pasan en la revisión a entregar, con comandos, revisión y resultados registrados; los fallos impiden marcar la tarea.

- [ ] **M3-T129 — Verificar pruebas unitarias y regresión privada** · 25 min · Depende de: M3-T128, M3-T070, M3-T034, M3-T043, M3-T044 · RF-01–RF-04, RF-08–RF-18, RF-19–RF-23, RF-29, RF-31–RF-43
      Hecho cuando: npm test -- --runInBand y las regresiones unitarias relevantes pasan en la revisión final; la evidencia distingue antecedentes de casos nuevos.

- [ ] **M3-T130 — Verificar integración de persistencia y escritores** · 25 min · Depende de: M3-T128, M3-T097, M3-T022, M3-T023, M3-T024, M3-T129 · RF-02–RF-04, RF-12–RF-15, RF-18–RF-43
      Hecho cuando: las suites pertinentes de test:integration pasan en base desechable para la revisión final, sin saltar casos de concurrencia por falta de conexión.

- [ ] **M3-T131 — Verificar suites HTTP públicas y privadas afectadas** · 25 min · Depende de: M3-T130, M3-T125 · RF-01–RF-04, RF-08–RF-18, RF-19–RF-43
      Hecho cuando: las suites pertinentes de test:e2e pasan y los resultados cubren las nueve rutas públicas, además de preservar las cinco privadas.

- [ ] **M3-T132 — Verificar build y pruebas Node del frontend** · 20 min · Depende de: M3-T116, M3-T118, M3-T119, M3-T120, M3-T121, M3-T122, M3-T123, M3-T124 · RF-01, RF-05–RF-11, RF-15–RF-17, RF-19–RF-30, RF-32, RF-37, RF-39–RF-43
      Hecho cuando: npm run build y npm test pasan en frontend-saas; se registra que el repositorio no tiene script de lint frontend sin atribuirle una ejecución ficticia.

- [ ] **M3-T133 — Consolidar evidencia de navegador de la revisión final** · 20 min · Depende de: M3-T132, M3-T131 · RF-01–RF-13, RF-15–RF-17, RF-19–RF-30, RF-32–RF-35, RF-37–RF-43
      Hecho cuando: los casos de navegador de esta revisión constan aprobados con resultados reproducibles; solo se repiten los afectados si cambió código después de su ejecución.

- [ ] **M3-T134 — Consolidar integración pública y pendientes del módulo 2** · 15 min · Depende de: M3-T130, M3-T131 · RF-03–RF-04, RF-14–RF-15, RF-18–RF-22, RF-30–RF-35, RF-39–RF-41
      Hecho cuando: M2-I001–M2-I003 y M2-I005–M2-I009 tienen evidencia con escritores reales; M2-I004 sigue pendiente del escritor manual, sin declarar cerrada toda la integración del módulo 2.

- [ ] **M3-T135 — Documentar instalación, habilitación y recuperación operativa** · 20 min · Depende de: M3-T126, M3-T127, M3-T128, M3-T132 · RF-01–RF-03, RF-17, RF-27, RF-35, RF-39–RF-43
      Hecho cuando: la guía describe migraciones antes de backend/frontend, proxy de mismo origen, configuración sin secretos reales y cierre de nuevas escrituras preservando recuperación, sin borrar citas o intentos.

- [ ] **M3-T136 — Cerrar la matriz RF y criterios de finalización** · 25 min · Depende de: M3-T133, M3-T134, M3-T135 · RF-01–RF-43
      Hecho cuando: cada RF y los ocho criterios apuntan a evidencia de la revisión entregada, las rutas documentales existen y cualquier fallo o pendiente ajeno al alcance queda explícito.

## 12. Verificación diferida al módulo 4

Esta tarea conserva la obligación M2-I004 del [contrato de escritores](../fase-3/resultados-tareas/contrato-escritores-t078-t079.md). No se ejecuta con un escritor manual ficticio ni bloquea por sí sola la entrega acotada del módulo 3; sí impide declarar completa la integración de RF-35–RF-37 del módulo 2.

- [ ] **M3-I001 — Verificar apartado público contra reserva manual real** · 25 min · Depende de: M3-T134; externa: escritor manual real del módulo 4 integrado al protocolo común · RF-14, RF-20, RF-31–RF-35
      Hecho cuando: dos conexiones enfrentan el apartado público y la reserva manual del mismo Profesional, incluidos intervalos entre sucursales, y solo una ocupación incompatible queda confirmada; se adjunta evidencia a M2-I004 sin sustituirla por dobles.

## Referencia de ejecución

Las tareas mantienen sus dependencias aunque se ejecuten en sesiones diferentes. Mantener una evidencia por lote pequeño con enlaces a las tareas realizadas; no marcar secciones completas por haber terminado únicamente su última tarea. Ante cambios de contrato, actualizar primero la trazabilidad al plan y la especificación, sin alterar RF de forma implícita.

La entrega termina cuando M3-T136 satisface los ocho criterios aplicables y no quedan tareas de implementación pendientes. M3-T134 y M3-I001 mantienen visible la integración diferida del módulo 4.
