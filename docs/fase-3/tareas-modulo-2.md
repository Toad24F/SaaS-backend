# Tareas — Fase 3, módulo 2

Desglose del [plan](plan.md), conforme a la [constitución](constitucion.md), la [especificación RF-01–RF-52](spec-modulo-2.md) y [AGENTS.md](../../AGENTS.md).

## Cómo usar esta lista

- **122 tareas pendientes**, con estimaciones individuales de **15 a 25 minutos de trabajo activo**, todas menores de 30 minutos. La suma estimada es **43 horas y 40 minutos de trabajo activo**; no es una fecha de entrega ni incluye esperas de infraestructura o ejecución desatendida.
- Las estimaciones suponen los prerrequisitos satisfechos. Si al revisar una tarea no cabe en menos de 30 minutos, dividirla antes de implementarla y actualizar IDs, dependencias y trazabilidad. No ampliar silenciosamente su alcance ni marcarla terminada por agotar el tiempo.
- El orden es topológico. Cada dependencia interna aparece antes de su tarea; las dependencias directas heredan las de sus prerrequisitos. Una tarea con dependencia pendiente no empieza, pero puede continuarse otra cuyo conjunto de dependencias esté completo.
- **M2-T001–M2-T122** son tareas; **RF-01–RF-52** son requisitos de esta fase; **T01–T20** son los grupos de pruebas del plan. Los RF del módulo 1 no se mezclan con los de esta lista.
- Cada checkbox se marca después de verificar su línea **Hecho cuando:** y registrar evidencia del resultado, con referencia a archivos/pruebas y a la revisión evaluada. Las tareas de contratos o preparación apoyan sus RF; no los acreditan como funcionalidad terminada.
- Las comprobaciones de cierre no incluyen corregir defectos arbitrariamente grandes. Si fallan, mantenerlas pendientes, desglosar la corrección y repetir solo los controles afectados o exigidos por el cierre.
- Todas las tareas describen trabajo futuro. Crear esta lista no escribe código de aplicación, no ejecuta migraciones/pruebas funcionales y no completa ningún checkbox.
- Mantener los límites del plan: el soporte de datos de citas/apartados es para lectura, integridad y fixtures. El motor no crea, confirma, consume, renueva, libera ni cancela reservas. No se agregan pantallas, consulta anónima, WhatsApp ni reportes.
- Los tests usan bases temporales confirmadas y reloj controlado. Los escritores de concurrencia existen solo en pruebas; no acreditan los flujos de reservas futuros de los módulos 3 y 4.

## Dependencias externas del módulo 1

Estas claves son condiciones de entrada, no tareas de implementación incluidas en la estimación. Su verificación se registra en M2-T001; si falta una capacidad, se mantiene pendiente dentro del módulo 1 y no se sustituye con un lector vacío para aparentar integración. Las referencias apuntan a sus [tareas](../fase-2-modulo-1/tareas-modulo-1.md); las capacidades reales y sus evidencias prevalecen sobre el nombre de una tarea.

| Clave | Condición verificable para usarla | Referencias del módulo 1 |
|---|---|---|
| EXT-CATALOGOS | Existen tablas, entidades y consultas reales de sucursales con zona IANA, servicios, perfiles vinculados a cuentas, asignaciones y oferta; las relaciones respetan negocio y estados actuales. | M1-T059–M1-T082, incluidos sus prerrequisitos. |
| EXT-CALENDARIO | La atención por fechas aplica recurrencias, excepciones, descansos y omisiones por huso; conserva el bloque/origen necesario para la secuencia y puede consultarse con el gestor recibido. | M1-T083–M1-T099 y M1-T110. |
| EXT-BLOQUEOS | Los bloqueos individuales/colectivos y por sucursal/todas existen, se interpretan por zona y se combinan sin perder restricciones; su alcance puede consultarse realmente. | M1-T101–M1-T110. |
| EXT-ACCESO | Cuenta, sesión, rol y licencia se reevalúan con la política vigente; la gracia de suspensión y su vencimiento anticipado cuentan con evidencia, al igual que desactivar al Profesional. | M1-T052–M1-T054, M1-T057, M1-T073 y M1-T075. |
| EXT-COORDINACION | Los escritores del módulo 1 que cambian agenda respetan el orden común de recursos y la coordinación por negocio. Una función que solo ordena IDs no acredita adquisición de bloqueos. | M1-T010 y los guardados de configuración operativa, horarios, asignaciones, estados y bloqueos; verificar cada escritor participante. |

## 1. Contratos y preparación

- [ ] **M2-T001 — Registrar la trazabilidad y las dependencias de entrada** · 20 min · RF-01–RF-52

  Dependencias: ninguna.

  Hecho cuando: existe una matriz inicial con los 52 RF, las dependencias externas y sus evidencias disponibles o pendientes; ningún requisito figura implementado por tener documentación.

- [ ] **M2-T002 — Definir las proyecciones de calendario y ocupación** · 20 min · RF-11, RF-13–RF-21, RF-35–RF-39

  Dependencias: M2-T001.

  Hecho cuando: los contratos representan bloque original, origen de secuencia, zona, tramos, omisiones e intervalos de ocupación sin datos del cliente.

- [ ] **M2-T003 — Definir entrada y resultados de la consulta** · 15 min · RF-13, RF-22–RF-34, RF-43–RF-44, RF-48–RF-50

  Dependencias: M2-T002.

  Hecho cuando: el contrato distingue uso público/manual, fechas locales, configuración efectiva, horarios, motivos de vacío y omisiones, sin aceptar un negocio arbitrario.

- [ ] **M2-T004 — Definir el contrato de validación y afectaciones** · 20 min · RF-10–RF-12, RF-35–RF-47, RF-51–RF-52

  Dependencias: M2-T002, M2-T003.

  Hecho cuando: se documentan candidato exacto, titularidad acreditada, gestor transaccional recibido, rechazos y referencias de citas afectadas; no hay operaciones de reserva.

- [ ] **M2-T005 — Definir causas de rechazo y fallo temporal** · 15 min · RF-06, RF-12, RF-14, RF-34, RF-46, RF-48–RF-50

  Dependencias: M2-T003, M2-T004.

  Hecho cuando: las causas separan entrada inválida, prohibición, combinación no habilitada, horario perdido, vacío y dependencia caída con ejemplos verificables.

- [ ] **M2-T006 — Preparar fixtures puros con reloj controlado** · 20 min · RF-17–RF-39, RF-43–RF-44

  Dependencias: M2-T002, M2-T003.

  Hecho cuando: los datos de prueba incluyen dos sucursales, duraciones distintas, bloques partidos, estados de cita y apartados con vencimiento conocido, sin depender de la fecha de ejecución.

- [ ] **M2-T007 — Registrar los módulos internos y sus dependencias** · 20 min · RF-01–RF-07, RF-13–RF-52

  Dependencias: M2-T002–M2-T005.

  Hecho cuando: la composición mínima de configuración y disponibilidad carga sin ciclos ni acceso a red, sin registrar controladores de reservas ni ejecutar trabajos al iniciar.

- [ ] **M2-T008 — Validar el entorno desechable de integración** · 15 min · RF-10, RF-19–RF-21, RF-35–RF-42, RF-47

  Dependencias: M2-T001.

  Hecho cuando: se comprueba el uso de TEST_DB confirmado, base temporal y dos conexiones; una configuración que apunte a la base cotidiana se rechaza sin modificarla.

## 2. Cálculo puro y estrategias

- [ ] **M2-T009 — Implementar comparación de intervalos semiabiertos** · 20 min · RF-17–RF-20, RF-51

  Dependencias: M2-T002, M2-T006.

  Hecho cuando: las pruebas distinguen cruce real, inclusión y contacto exacto; terminar al comenzar otro intervalo no produce empalme.

- [ ] **M2-T010 — Implementar la secuencia desde el bloque original** · 20 min · RF-25–RF-26, RF-44

  Dependencias: M2-T002, M2-T006.

  Hecho cuando: con intervalo 15 se producen 09:00/09:15 y, para bloque 09:05, 09:05/09:20; descontar una ocupación no cambia el origen.

- [ ] **M2-T011 — Separar tramos por descansos y unión de bloqueos** · 25 min · RF-15–RF-17, RF-29

  Dependencias: M2-T009, M2-T010.

  Hecho cuando: se obtienen tramos sin restricciones duplicadas, conservando bloque y origen; las citas y apartados todavía no dividen esos tramos.

- [ ] **M2-T012 — Probar particiones y precedencia de restricciones** · 20 min · RF-15–RF-17, RF-29

  Dependencias: M2-T011.

  Hecho cuando: pasan descanso, bloqueos superpuestos, retiro de uno y excepción que no anula bloqueo; se conserva el origen posterior al descanso.

- [ ] **M2-T013 — Aplicar futuro estricto y anticipación mínima** · 20 min · RF-22–RF-23

  Dependencias: M2-T006, M2-T010.

  Hecho cuando: se rechazan pasado y exactamente ahora, incluso con anticipación cero, y se acepta el límite exacto futuro configurado.

- [ ] **M2-T014 — Aplicar el horizonte por fecha local** · 20 min · RF-24, RF-33

  Dependencias: M2-T003, M2-T006.

  Hecho cuando: se acepta hoy local más horizonte inclusive y se excluye la fecha siguiente, sin sustituir la fecha elegida ni limitarla por el posible vencimiento futuro de licencia.

- [ ] **M2-T015 — Probar las fronteras temporales públicas** · 20 min · RF-04–RF-05, RF-22–RF-24

  Dependencias: M2-T013, M2-T014.

  Hecho cuando: pasan antes/igual/después de anticipación, horizonte 1/60/365 y cambio de fecha local con reloj controlado.

- [ ] **M2-T016 — Generar candidatos completos dentro de cada tramo** · 25 min · RF-17–RF-18, RF-20, RF-25–RF-26

  Dependencias: M2-T009–M2-T011.

  Hecho cuando: cada candidato cabe completo en un tramo del bloque original; se permite fin 24:00 y se rechaza prolongación al día siguiente o a otra franja.

- [ ] **M2-T017 — Probar duración, cierre y medianoche** · 20 min · RF-17–RF-20

  Dependencias: M2-T016.

  Hecho cuando: pasan cierre exacto, servicio demasiado largo, cruce de descanso, franjas consecutivas sin fusionar y 23:30–24:00 frente a 23:30–00:30.

- [ ] **M2-T018 — Normalizar ocupación por estado y vigencia** · 20 min · RF-35–RF-39

  Dependencias: M2-T002, M2-T006, M2-T009.

  Hecho cuando: solo las citas canceladas y apartados con expiración igual o anterior a ahora dejan de ocupar; se utilizan los intervalos originales registrados.

- [ ] **M2-T019 — Probar estados y duración histórica** · 20 min · RF-35–RF-39

  Dependencias: M2-T018.

  Hecho cuando: los cinco estados se verifican y cambiar el servicio de 30 a 45 minutos no altera la cita previa; la expiración exacta libera sin limpieza.

- [ ] **M2-T020 — Implementar selección de ventana libre** · 20 min · RF-22–RF-27

  Dependencias: M2-T013, M2-T014, M2-T016, M2-T018.

  Hecho cuando: se devuelven todos y solo los candidatos alineados que cumplen restricciones temporales y no cruzan ocupaciones.

- [ ] **M2-T021 — Probar secuencia y completitud de ventana libre** · 20 min · RF-25–RF-27

  Dependencias: M2-T020.

  Hecho cuando: se verifican bloque 09:05, final de cita 10:10 con siguiente 10:15, descanso irregular y listado completo de candidatos válidos.

- [ ] **M2-T022 — Implementar agenda compacta para tramos vacíos** · 20 min · RF-28–RF-30

  Dependencias: M2-T013, M2-T014, M2-T016, M2-T018.

  Hecho cuando: cada tramo sin ocupación aporta solo su primer candidato permitido y respeta la anticipación sobre la secuencia original.

- [ ] **M2-T023 — Probar los inicios independientes de agenda compacta** · 20 min · RF-13, RF-28–RF-30

  Dependencias: M2-T022.

  Hecho cuando: se ofrecen 09:00 y 16:00, y 09:00 y 14:00 tras descanso; un límite 10:37 produce 10:45 con intervalo 15.

- [ ] **M2-T024 — Agrupar ocupaciones contiguas y superpuestas** · 20 min · RF-19–RF-20, RF-31, RF-35–RF-39

  Dependencias: M2-T009, M2-T018.

  Hecho cuando: las ocupaciones se agrupan sin perder extremos externos ni crear huecos ficticios entre intervalos que se tocan.

- [ ] **M2-T025 — Implementar candidatos compactos antes y después** · 25 min · RF-25–RF-26, RF-31–RF-32

  Dependencias: M2-T016, M2-T022, M2-T024.

  Hecho cuando: cada grupo ocupado aporta las posiciones alineadas inmediatas que caben antes/después, con hueco menor al intervalo y sin cruzar otra ocupación.

- [ ] **M2-T026 — Probar ajuste compacto anterior y posterior** · 20 min · RF-25–RF-26, RF-31–RF-32

  Dependencias: M2-T025.

  Hecho cuando: una cita 10:00–10:30 permite 09:30 y 10:30; fin 10:10 permite 10:15; inicio 10:10 permite 09:30–10:00 para duración 30.

- [ ] **M2-T027 — Excluir alternativas compactas remotas y duplicadas** · 20 min · RF-31–RF-32, RF-34

  Dependencias: M2-T025.

  Hecho cuando: si la posición inmediata falla, no se ofrece otra más alejada; una misma posición obtenida desde dos ocupaciones aparece una sola vez.

- [ ] **M2-T028 — Probar recálculo de anclas de compactación** · 20 min · RF-28–RF-32, RF-35–RF-39

  Dependencias: M2-T024, M2-T025, M2-T027.

  Hecho cuando: cancelar una cita de fixture o vencer un apartado cambia las opciones derivadas, sin alterar ocupaciones restantes ni crear citas.

- [ ] **M2-T029 — Implementar opciones manuales con restricciones físicas** · 20 min · RF-43–RF-44

  Dependencias: M2-T020.

  Hecho cuando: el contexto manual omite compactación, anticipación y horizonte, manteniendo futuro, secuencia, duración, jornada y ausencia de empalmes.

- [ ] **M2-T030 — Probar las excepciones y límites manuales** · 20 min · RF-17–RF-20, RF-25, RF-43–RF-44

  Dependencias: M2-T029.

  Hecho cuando: se admiten horarios fuera del horizonte público pero se rechazan pasado, desalineación, descanso, bloqueo, cierre y ocupación.

- [ ] **M2-T031 — Componer las estrategias en el motor común** · 25 min · RF-22–RF-34, RF-43–RF-44, RF-50

  Dependencias: M2-T020, M2-T022, M2-T025, M2-T027, M2-T029.

  Hecho cuando: el mismo punto de entrada selecciona estrategia por uso/configuración y devuelve resultados ordenados, deduplicados y separados por fecha solicitada.

- [ ] **M2-T032 — Probar selección de fechas y ausencia de opciones** · 20 min · RF-24, RF-33–RF-34, RF-50

  Dependencias: M2-T031.

  Hecho cuando: se puede consultar mañana aunque hoy tenga espacio; un día lleno se devuelve vacío sin adelantar la fecha ni confundirlo con un error.

## 3. Autorización y configuración por negocio

- [ ] **M2-T033 — Ampliar la matriz de permisos de agenda** · 20 min · RF-06, RF-08–RF-10, RF-43–RF-44

  Dependencias: M2-T003, M2-T007.

  Hecho cuando: administrador configura/consulta, recepción consulta y Profesional consulta lo propio; superadmin no obtiene acceso clínico por su rol.

- [ ] **M2-T034 — Resolver negocio y propiedad del perfil** · 20 min · RF-08–RF-10, RF-13

  Dependencias: M2-T033, EXT-CATALOGOS.

  Hecho cuando: la autorización resuelve personal.usuario_id y rechaza IDs ajenos; una prueba usa IDs distintos para perfil y usuario sin alterar el resultado.

- [ ] **M2-T035 — Aplicar acceso vigente en los casos de uso** · 20 min · RF-12, RF-45–RF-46

  Dependencias: M2-T033, EXT-ACCESO.

  Hecho cuando: consulta y validación usan cuenta, sesión, negocio y licencia actuales; las restricciones de acceso no se presentan como falta de espacios.

- [ ] **M2-T036 — Probar la autorización interna por rol y propietario** · 20 min · RF-06, RF-08–RF-10, RF-40, RF-43–RF-44

  Dependencias: M2-T034, M2-T035.

  Hecho cuando: la matriz incluye dos negocios, perfil propio/ajeno y superadmin; cambiar el uso o el negocio en la entrada no concede acceso.

- [ ] **M2-T037 — Validar la combinación de recursos y oferta** · 25 min · RF-13–RF-14, RF-44, RF-48

  Dependencias: M2-T034, EXT-CATALOGOS.

  Hecho cuando: se consultan estados y asignaciones vigentes; la combinación inactiva o no habilitada produce rechazo específico y no una lista vacía.

- [ ] **M2-T038 — Probar combinaciones habilitadas y rechazadas** · 20 min · RF-13–RF-14, RF-48

  Dependencias: M2-T037.

  Hecho cuando: pasan sucursal/servicio/profesional inactivos, asignación ausente, selección vacía, servicio no seleccionado y combinación válida.

- [ ] **M2-T039 — Validar el conjunto completo de configuración** · 20 min · RF-01–RF-06, RF-48

  Dependencias: M2-T003, M2-T005.

  Hecho cuando: se aceptan solo modos y valores aprobados; faltantes, fracciones y campos desconocidos identifican errores antes del guardado.

- [ ] **M2-T040 — Definir la entidad de configuración de agenda** · 20 min · RF-01–RF-07

  Dependencias: M2-T007, M2-T039.

  Hecho cuando: la entidad refleja una fila por negocio, cuatro valores configurables, versión y fechas, con nombres y tipos compatibles con el proyecto.

- [ ] **M2-T041 — Crear la migración de configuración** · 25 min · RF-01–RF-07

  Dependencias: M2-T008, M2-T040.

  Hecho cuando: la migración crea pertenencia y restricciones de valores en la base temporal sin reescribir migraciones previas ni activar sincronización automática.

- [ ] **M2-T042 — Implementar lectura de valores efectivos** · 20 min · RF-01–RF-05, RF-07

  Dependencias: M2-T040, M2-T041.

  Hecho cuando: sin fila se obtienen ventana libre/15/30/60 y versión 0; leer no inserta ni modifica filas.

- [ ] **M2-T043 — Guardar configuración como reemplazo atómico** · 25 min · RF-01–RF-07

  Dependencias: M2-T033, M2-T035, M2-T039, M2-T041, M2-T042.

  Hecho cuando: un administrador autorizado guarda los cuatro valores bajo coordinación del negocio; entradas inválidas conservan íntegramente el conjunto anterior.

- [ ] **M2-T044 — Auditar cambios y evitar efectos por repetición** · 20 min · RF-06–RF-07, RF-11

  Dependencias: M2-T043.

  Hecho cuando: un cambio real incrementa versión y registra antes/después con actor; repetir los mismos valores no crea otro cambio ni toca citas o apartados.

- [ ] **M2-T045 — Probar configuración persistida y valores límite** · 25 min · RF-01–RF-07

  Dependencias: M2-T042–M2-T044.

  Hecho cuando: se verifican valores iniciales, cada intervalo admitido, límites 0/10080 y 1/365, guardado inválido y repetición, con filas y auditoría comprobadas.

- [ ] **M2-T046 — Probar guardados concurrentes y rollback de configuración** · 25 min · RF-06–RF-07, RF-47

  Dependencias: M2-T008, M2-T043, M2-T044.

  Hecho cuando: dos conexiones dejan un conjunto completo según el último guardado válido; un fallo provocado revierte configuración y auditoría sin mezcla de campos.

## 4. Persistencia mínima y fixtures de ocupación

- [ ] **M2-T047 — Preparar la entidad base de clientes si falta** · 15 min · RF-11, RF-35–RF-37

  Dependencias: M2-T002, M2-T007.

  Hecho cuando: existe un único mapeo del esquema canónico de clientes necesario para citas, sin controladores ni casos de uso de gestión de clientes.

- [ ] **M2-T048 — Preparar la migración base de clientes si falta** · 20 min · RF-10–RF-11, RF-35–RF-37

  Dependencias: M2-T008, M2-T047.

  Hecho cuando: la instalación temporal dispone de clientes con pertenencia y relaciones canónicas; si la migración ya existe, se reutiliza sin crear otra tabla.

- [ ] **M2-T049 — Definir la entidad canónica de citas para lectura** · 25 min · RF-11, RF-19–RF-20, RF-35–RF-37, RF-51

  Dependencias: M2-T002, M2-T047, EXT-CATALOGOS.

  Hecho cuando: el mapeo conserva referencias, estado/origen/folio e intervalo UTC con duración y zona originales; no introduce métodos de creación o cambio de estado.

- [ ] **M2-T050 — Migrar la persistencia canónica de citas** · 25 min · RF-10, RF-19–RF-20, RF-35–RF-37

  Dependencias: M2-T008, M2-T048, M2-T049.

  Hecho cuando: la base temporal tiene citas con intervalo válido, pertenencia compuesta e índices por negocio/perfil/inicio, sin cascadas que borren historial.

- [ ] **M2-T051 — Definir la entidad de apartados para lectura** · 20 min · RF-19, RF-38–RF-42

  Dependencias: M2-T002, M2-T004, M2-T007, EXT-CATALOGOS.

  Hecho cuando: el mapeo de bloqueos_temporales incluye recursos, intervalo UTC, expiración y hash de titularidad, distinguiéndolo de bloqueos del calendario.

- [ ] **M2-T052 — Migrar la persistencia mínima de apartados** · 25 min · RF-10, RF-19, RF-38–RF-42

  Dependencias: M2-T008, M2-T051.

  Hecho cuando: la base temporal contiene pertenencia, intervalos y vencimiento válidos e índices de consulta; no almacena el comprobante utilizable ni habilita altas HTTP.

- [ ] **M2-T053 — Sincronizar el esquema de entrega con los modelos nuevos** · 25 min · RF-01–RF-07, RF-10, RF-19–RF-21, RF-35–RF-42

  Dependencias: M2-T041, M2-T048, M2-T050, M2-T052.

  Hecho cuando: db/schema.sql, entidades y migraciones coinciden en campos, restricciones y referencias; no existe una agenda paralela ni una segunda autoridad de horas locales.

- [ ] **M2-T054 — Uniformar la interpretación UTC fuera de tests** · 20 min · RF-19–RF-26, RF-37–RF-39

  Dependencias: M2-T008, M2-T050, M2-T052.

  Hecho cuando: los instantes de ocupación se leen/escriben con la misma interpretación UTC en configuración normal y de pruebas, preservando las zonas IANA del calendario.

- [ ] **M2-T055 — Probar la persistencia temporal con zona de proceso distinta** · 20 min · RF-19–RF-21, RF-24, RF-37–RF-39

  Dependencias: M2-T054.

  Hecho cuando: un intervalo y vencimiento conservan los mismos instantes al variar la zona del proceso y se comparan correctamente entre dos sucursales.

- [ ] **M2-T056 — Crear fixtures persistidos de ocupación y dos negocios** · 25 min · RF-10–RF-11, RF-19, RF-35–RF-42

  Dependencias: M2-T006, M2-T048, M2-T050, M2-T052, EXT-CATALOGOS.

  Hecho cuando: las factorías generan usuarios/perfiles con IDs diferentes, citas de los cinco estados y apartados propios/ajenos en una base desechable, sin usar rutas de reservas.

- [ ] **M2-T057 — Probar integridad y pertenencia de citas** · 20 min · RF-10, RF-19–RF-20, RF-35–RF-37

  Dependencias: M2-T050, M2-T056.

  Hecho cuando: la base rechaza referencias cruzadas entre negocios e intervalos no positivos y conserva la duración original tras cambiar el catálogo.

- [ ] **M2-T058 — Probar integridad de apartados y configuración** · 20 min · RF-01–RF-07, RF-10, RF-38–RF-42

  Dependencias: M2-T041, M2-T052, M2-T056.

  Hecho cuando: la base rechaza configuración fuera de dominio y apartados con recursos ajenos o intervalos inválidos; las consultas no exponen hashes.

- [ ] **M2-T059 — Verificar instalación limpia y reaplicación** · 25 min · RF-01–RF-07, RF-10, RF-19–RF-21, RF-35–RF-42

  Dependencias: M2-T053, M2-T054, M2-T057, M2-T058.

  Hecho cuando: la secuencia histórica más las migraciones nuevas instala la base vacía y una segunda ejecución no altera esquema/datos ni aplica migraciones pendientes otra vez.

## 5. Lectores e integración del contexto

- [ ] **M2-T060 — Implementar el lector de citas del profesional** · 25 min · RF-11, RF-19–RF-20, RF-35–RF-37

  Dependencias: M2-T049, M2-T050, M2-T056.

  Hecho cuando: la consulta filtra negocio/perfil y cruce UTC, conserva estados que ocupan y no restringe al servicio o sucursal elegidos ni proyecta datos de clientes.

- [ ] **M2-T061 — Implementar el lector de apartados vigentes** · 20 min · RF-11, RF-19, RF-38–RF-39

  Dependencias: M2-T051, M2-T052, M2-T056.

  Hecho cuando: solo se devuelve ocupación con expiración posterior a ahora, usando el gestor recibido y sin limpiar, renovar o liberar filas.

- [ ] **M2-T062 — Probar ocupación entre servicios y sucursales** · 25 min · RF-11, RF-19–RF-20, RF-35–RF-39

  Dependencias: M2-T055, M2-T060, M2-T061.

  Hecho cuando: citas/apartados de otro servicio o sucursal bloquean al mismo profesional cuando se superponen realmente; canceladas y vencidos no lo hacen.

- [ ] **M2-T063 — Acreditar la identidad del apartado propio** · 25 min · RF-10, RF-40–RF-41

  Dependencias: M2-T004, M2-T034, M2-T051, M2-T052.

  Hecho cuando: la comprobación verifica titularidad y todos los recursos e intervalo del apartado; un ID o bandera de omisión por sí solos no producen una acreditación.

- [ ] **M2-T064 — Probar credenciales ajenas y cambio de candidato** · 20 min · RF-10, RF-40–RF-41

  Dependencias: M2-T056, M2-T063.

  Hecho cuando: se rechazan hash/comprobante inválidos, apartado de otro negocio/titular y cambios de servicio, sucursal, profesional o intervalo.

- [ ] **M2-T065 — Adaptar la atención efectiva del módulo 1** · 25 min · RF-13–RF-21, RF-25–RF-26, RF-29

  Dependencias: M2-T002, M2-T011, M2-T037, EXT-CALENDARIO, EXT-BLOQUEOS.

  Hecho cuando: el lector real devuelve bloques, origen, tramos y omisiones con la conexión recibida; no recalcula de forma independiente las reglas del módulo 1.

- [ ] **M2-T066 — Probar integración de excepciones, descansos y bloqueos** · 25 min · RF-15–RF-17, RF-29

  Dependencias: M2-T012, M2-T056, M2-T065.

  Hecho cuando: los datos persistidos de semana, excepción vacía y restricciones superpuestas producen la atención esperada conservando los orígenes de secuencia.

- [ ] **M2-T067 — Probar omisiones por cambio de huso** · 20 min · RF-19–RF-21, RF-24

  Dependencias: M2-T055, M2-T065.

  Hecho cuando: las fechas inexistentes/repetidas y franjas omitidas se comportan como en el módulo 1, sin desplazar horas ni fabricar candidatos y con omisión identificable.

- [ ] **M2-T068 — Cargar el contexto con una lectura consistente** · 25 min · RF-07, RF-11, RF-13–RF-16, RF-35–RF-39, RF-47

  Dependencias: M2-T035, M2-T037, M2-T042, M2-T060, M2-T061, M2-T065.

  Hecho cuando: configuración, atención y ocupación se obtienen en la misma transacción de lectura y con un único instante de evaluación, sin conexiones auxiliares.

- [ ] **M2-T069 — Probar coherencia y ausencia de efectos de lectura** · 25 min · RF-07, RF-11, RF-39–RF-42, RF-47

  Dependencias: M2-T008, M2-T056, M2-T068.

  Hecho cuando: una escritura controlada intermedia no mezcla vistas de contexto y la lectura no inserta citas, apartados o configuración ni cambia expiraciones.

- [ ] **M2-T070 — Propagar fallos de los lectores sin resultados parciales** · 20 min · RF-49–RF-50

  Dependencias: M2-T005, M2-T068.

  Hecho cuando: un fallo en calendario, configuración u ocupación interrumpe toda la consulta con causa temporal; no devuelve vacío, datos parciales o caché vigente.

- [ ] **M2-T071 — Conectar el caso de uso de consulta al motor** · 25 min · RF-08–RF-34, RF-35–RF-39, RF-43–RF-44, RF-49–RF-50

  Dependencias: M2-T031, M2-T034, M2-T035, M2-T037, M2-T068, M2-T070.

  Hecho cuando: la consulta autorizada evalúa la configuración y datos reales mediante el motor común, conservando uso, selección, zona, instante y causas de ausencia.

- [ ] **M2-T072 — Probar el recorrido de consulta sin reservas** · 25 min · RF-11, RF-24–RF-34, RF-42–RF-44, RF-50

  Dependencias: M2-T032, M2-T062, M2-T066, M2-T067, M2-T069, M2-T071.

  Hecho cuando: una consulta sobre fixtures reales entrega resultados públicos/manuales correctos; varias consultas de rangos separados conservan los resultados por fecha y no mutan ocupación.

## 6. Validación interna y concurrencia

- [ ] **M2-T073 — Validar la forma del candidato exacto** · 15 min · RF-13, RF-17–RF-18, RF-40, RF-48

  Dependencias: M2-T003–M2-T005.

  Hecho cuando: la entrada exige recursos e intervalo inequívocos y rechaza candidato incompleto, invertido o diferente del apartado presentado, sin aceptar ajustes silenciosos.

- [ ] **M2-T074 — Implementar validación de candidato sin apartado** · 25 min · RF-12–RF-20, RF-22–RF-34, RF-43–RF-46

  Dependencias: M2-T031, M2-T035, M2-T037, M2-T068, M2-T073.

  Hecho cuando: el candidato se reevalúa con el uso solicitado y condiciones vigentes; devuelve válido o causa específica y no lo reemplaza por otro horario.

- [ ] **M2-T075 — Integrar reconocimiento y exclusión del apartado propio** · 20 min · RF-10, RF-38–RF-40, RF-45–RF-46

  Dependencias: M2-T061, M2-T063, M2-T074.

  Hecho cuando: solo el apartado acreditado y vigente se excluye de su propia comprobación; las demás ocupaciones siguen causando conflicto y uno vencido se rechaza.

- [ ] **M2-T076 — Conservar el compromiso ante cambios comerciales** · 25 min · RF-37, RF-40–RF-41

  Dependencias: M2-T042, M2-T075.

  Hecho cuando: un apartado válido conserva intervalo y expiración aunque cambien modo, secuencia o límites; mantiene validación de acceso, recursos, atención y otras ocupaciones.

- [ ] **M2-T077 — Probar compromiso original y restricciones nuevas** · 25 min · RF-37–RF-41, RF-45–RF-46

  Dependencias: M2-T064, M2-T076.

  Hecho cuando: pasan cambios comerciales/duración frente al intervalo guardado, mientras desactivación, pérdida de asignación, bloqueo o nueva ocupación lo invalidan.

- [ ] **M2-T078 — Probar que validar no crea ni consume reservas** · 15 min · RF-39–RF-42

  Dependencias: M2-T056, M2-T074–M2-T076.

  Hecho cuando: antes/después de validaciones aceptadas y rechazadas coinciden las filas, estados y vencimientos de citas/apartados; no se emiten mensajes.

- [ ] **M2-T079 — Implementar coordinación con el orden de recursos existente** · 25 min · RF-06–RF-07, RF-12, RF-45–RF-47

  Dependencias: M2-T004, M2-T007, M2-T008, EXT-COORDINACION.

  Hecho cuando: la adquisición usa usuarios, negocio, licencia, sucursales, servicios y perfiles en precedencia e IDs ordenados, sin inversión ni candados solo en memoria.

- [ ] **M2-T080 — Ejecutar validación dentro de la transacción recibida** · 25 min · RF-42, RF-45–RF-47

  Dependencias: M2-T074–M2-T076, M2-T079.

  Hecho cuando: todos los lectores usan el gestor del consumidor; el validador no abre otra transacción, no hace commit y no inserta ocupaciones.

- [ ] **M2-T081 — Releer condiciones y reloj después de esperar** · 25 min · RF-12, RF-39, RF-41, RF-45–RF-47

  Dependencias: M2-T035, M2-T037, M2-T042, M2-T080.

  Hecho cuando: la validación posterior a los bloqueos usa lecturas actuales y un ahora actualizado, reevalúa recursos/licencia/apartado y no reutiliza la instantánea de una consulta anterior.

- [ ] **M2-T082 — Propagar aborto transaccional y timeout** · 20 min · RF-46–RF-49

  Dependencias: M2-T005, M2-T080, M2-T081.

  Hecho cuando: un timeout/deadlock o fallo de lectura no devuelve validación positiva; el consumidor recibe error reintentable y no se reintenta solo la última lectura.

- [ ] **M2-T083 — Preparar escritores de prueba coordinados** · 25 min · RF-42, RF-45–RF-47

  Dependencias: M2-T008, M2-T056, M2-T079.

  Hecho cuando: dos conexiones de la base temporal pueden insertar ocupación de fixture con barreras y commit/rollback controlados; esos escritores no se exportan a la aplicación.

- [ ] **M2-T084 — Probar consulta antigua frente a ocupación confirmada** · 20 min · RF-45–RF-47

  Dependencias: M2-T081, M2-T083.

  Hecho cuando: una consulta obtiene libre, otro escritor confirma ocupación y la validación final detecta el nuevo conflicto sin sugerir sustitución automática.

- [ ] **M2-T085 — Probar validaciones competidoras con agenda vacía** · 25 min · RF-19, RF-45–RF-47

  Dependencias: M2-T081, M2-T083.

  Hecho cuando: la coordinación funciona sin citas previas: tras el commit del primer escritor de fixture, el segundo revalida y rechaza el empalme, incluso entre sucursales.

- [ ] **M2-T086 — Probar rollback y liberación tras fallo** · 20 min · RF-42, RF-47, RF-49

  Dependencias: M2-T082, M2-T083.

  Hecho cuando: la ocupación de fixture revertida no queda persistida, la siguiente operación puede completarse y el fallo no se informa como agenda llena.

- [ ] **M2-T087 — Probar validación frente a cambio de bloqueo** · 25 min · RF-15–RF-16, RF-45–RF-47

  Dependencias: M2-T065, M2-T081, M2-T083, EXT-BLOQUEOS.

  Hecho cuando: un bloqueo confirmado antes de completar la validación la hace rechazar; el caso incluye coordinación por negocio para bloqueo colectivo.

- [ ] **M2-T088 — Probar cambio de configuración durante un apartado** · 20 min · RF-07, RF-40–RF-41, RF-45–RF-47

  Dependencias: M2-T043, M2-T076, M2-T081, M2-T083.

  Hecho cuando: una configuración nueva gobierna nuevas consultas, mientras el compromiso vigente mantiene intervalo y vencimiento sin eludir restricciones físicas.

- [ ] **M2-T089 — Probar expiración mientras se espera un bloqueo** · 20 min · RF-39–RF-40, RF-45–RF-47

  Dependencias: M2-T081, M2-T083.

  Hecho cuando: el reloj avanza durante una espera controlada y el apartado vencido se rechaza tras adquirir recursos, incluido el instante exacto de expiración.

- [ ] **M2-T090 — Probar cambio de acceso durante la espera** · 25 min · RF-12, RF-45–RF-47

  Dependencias: M2-T035, M2-T081, M2-T083, EXT-ACCESO.

  Hecho cuando: desactivar una cuenta o alcanzar vencimiento/suspensión antes de revalidar causa rechazo de acceso, sin devolver una disponibilidad positiva.

## 7. Identificación de citas afectadas por bloqueos

- [ ] **M2-T091 — Resolver el ámbito de afectación del bloqueo** · 20 min · RF-10, RF-19–RF-20, RF-51

  Dependencias: M2-T004, M2-T034, M2-T065, EXT-BLOQUEOS.

  Hecho cuando: el contrato interno resuelve individuo/equipo y una/todas las sucursales dentro del negocio, interpretando los intervalos en cada zona local.

- [ ] **M2-T092 — Consultar citas no canceladas superpuestas** · 25 min · RF-19–RF-20, RF-35–RF-36, RF-51

  Dependencias: M2-T060, M2-T091.

  Hecho cuando: el lector devuelve las citas que cruzan los intervalos y destinatarios del bloqueo, sin filtrar por la habilitación actual del catálogo ni por estrategia compacta.

- [ ] **M2-T093 — Presentar referencias únicas de afectación** · 20 min · RF-10–RF-11, RF-51–RF-52

  Dependencias: M2-T092.

  Hecho cuando: se devuelve una referencia por cita con negocio, perfil, sucursal e intervalo; no aparecen teléfono, motivo ni datos fuera del contexto autorizado.

- [ ] **M2-T094 — Probar ámbitos individuales, colectivos y pertenencia** · 25 min · RF-10–RF-11, RF-51–RF-52

  Dependencias: M2-T056, M2-T091–M2-T093.

  Hecho cuando: las pruebas distinguen perfil/equipo, sucursal/todas y otro negocio; una cita alcanzada varias veces solo aparece una vez.

- [ ] **M2-T095 — Probar fronteras, zonas y estados de afectación** · 20 min · RF-19–RF-20, RF-35–RF-36, RF-51

  Dependencias: M2-T055, M2-T092, M2-T093.

  Hecho cuando: el contacto exacto no afecta, los cruces reales entre zonas sí, y solo las citas canceladas quedan excluidas por estado.

- [ ] **M2-T096 — Probar detección sin cancelaciones ni avisos** · 15 min · RF-11, RF-51–RF-52

  Dependencias: M2-T093–M2-T095.

  Hecho cuando: consultar afectaciones conserva estados e historial, no añade eventos de cancelación o mensajes y no convierte el guardado del bloqueo en rechazo.

## 8. Consulta autenticada y contratos HTTP

- [ ] **M2-T097 — Validar los parámetros de consulta HTTP** · 20 min · RF-13, RF-22–RF-24, RF-33, RF-43, RF-48

  Dependencias: M2-T003, M2-T005.

  Hecho cuando: se validan IDs, fechas locales inclusivas, uso y máximo 31 fechas; los campos negocio arbitrario o ignorar apartado se rechazan.

- [ ] **M2-T098 — Preparar la respuesta pública de la consulta autenticada** · 20 min · RF-11, RF-21, RF-24, RF-33–RF-34, RF-50

  Dependencias: M2-T003, M2-T071.

  Hecho cuando: los resultados contienen contexto, instantes/horas locales con zona, calculadoEn, versión, omisiones y causas de vacío, sin serializar entidades completas.

- [ ] **M2-T099 — Traducir causas a errores HTTP** · 20 min · RF-06, RF-10, RF-12, RF-14, RF-46, RF-48–RF-50

  Dependencias: M2-T005, M2-T070, M2-T082.

  Hecho cuando: el mapeo conserva 401 existente, usa 400/403/404/409/503 según el plan y no confunde recursos ajenos con existentes ni fallo con vacío.

- [ ] **M2-T100 — Exponer GET y PUT de configuración de agenda** · 25 min · RF-01–RF-07, RF-48

  Dependencias: M2-T033, M2-T035, M2-T039, M2-T042–M2-T044, M2-T099.

  Hecho cuando: las dos rutas usan sesión y rol administrador, respuestas limitadas y los casos de uso existentes; PUT no contiene reglas duplicadas de negocio.

- [ ] **M2-T101 — Exponer GET de disponibilidad autenticada** · 25 min · RF-08–RF-34, RF-42–RF-44, RF-48–RF-50

  Dependencias: M2-T034, M2-T035, M2-T071, M2-T097–M2-T099.

  Hecho cuando: la ruta permite los roles/ámbitos acordados y uso pública/manual, pero no acceso anónimo ni facultades clínicas implícitas para superadmin.

- [ ] **M2-T102 — Registrar la composición HTTP y sus dependencias reales** · 20 min · RF-01–RF-14, RF-42–RF-44, RF-48–RF-50

  Dependencias: M2-T007, M2-T100, M2-T101.

  Hecho cuando: la aplicación resuelve los controladores y adaptadores reales sin ciclos, proveedores vacíos, rutas de reservas o ejecución automática de migraciones.

- [ ] **M2-T103 — Probar configuración por HTTP** · 25 min · RF-01–RF-07, RF-48

  Dependencias: M2-T045, M2-T102.

  Hecho cuando: GET inicial no escribe; PUT válido persiste el conjunto; recepción/Profesional/superadmin y datos inválidos son rechazados conservando el estado.

- [ ] **M2-T104 — Probar alcance de consulta por HTTP** · 25 min · RF-08–RF-10, RF-13, RF-43–RF-44

  Dependencias: M2-T036, M2-T038, M2-T102.

  Hecho cuando: administrador/recepción consultan su negocio y Profesional lo propio; IDs cruzados, rol global y uso manipulado no permiten acceso ajeno.

- [ ] **M2-T105 — Probar entradas y límites técnicos por HTTP** · 20 min · RF-24, RF-33, RF-43, RF-48

  Dependencias: M2-T097, M2-T102.

  Hecho cuando: se verifican fecha inexistente, rango invertido, 31 y 32 fechas, faltantes, campos extra y consulta manual lejana sin confundir límite técnico con horizonte.

- [ ] **M2-T106 — Probar vacío, rechazo de combinación y fallo temporal** · 25 min · RF-14, RF-34, RF-48–RF-50

  Dependencias: M2-T070, M2-T098, M2-T099, M2-T102.

  Hecho cuando: se diferencian 200 vacío, 409 por combinación y 503 por lector caído; un fallo en una fecha no produce una respuesta parcial.

- [ ] **M2-T107 — Probar fronteras de licencia y cuenta por HTTP** · 25 min · RF-12, RF-45–RF-46, RF-50

  Dependencias: M2-T035, M2-T102, EXT-ACCESO.

  Hecho cuando: se verifican sesión revocada, cuenta inactiva, negocio pendiente, vencimiento y antes/igual/después de 48 horas con reloj controlado, conservando el rechazo vigente.

- [ ] **M2-T108 — Probar privacidad y ausencia de escrituras en GET** · 20 min · RF-07, RF-11, RF-39–RF-42

  Dependencias: M2-T056, M2-T098, M2-T102.

  Hecho cuando: las respuestas omiten PII/hashes/tokens; GET no crea configuración/citas/apartados ni modifica su expiración.

- [ ] **M2-T109 — Verificar la superficie de rutas y exclusiones** · 15 min · RF-08–RF-12, RF-42, RF-51–RF-52

  Dependencias: M2-T102.

  Hecho cuando: solo se agregan las tres rutas previstas; no aparecen endpoints públicos, de reserva, validación final, cancelación o afectaciones.

## 9. Observabilidad y recuperación

- [ ] **M2-T110 — Registrar errores de disponibilidad sin secretos** · 20 min · RF-11, RF-46, RF-49–RF-50

  Dependencias: M2-T005, M2-T070, M2-T082, M2-T099.

  Hecho cuando: los fallos incluyen operación y causa sanitizada; una prueba de captura no encuentra nombre/teléfono/motivo, comprobantes, hashes ni consultas con secretos.

- [ ] **M2-T111 — Distinguir indicadores de vacío, rechazo y fallo** · 15 min · RF-14, RF-34, RF-46, RF-49–RF-50

  Dependencias: M2-T071, M2-T099, M2-T110.

  Hecho cuando: la observación local distingue los tres resultados y no contabiliza agenda vacía como fallo; no se agregan datos personales como etiquetas.

- [ ] **M2-T112 — Probar recuperación después de un fallo temporal** · 20 min · RF-49–RF-50

  Dependencias: M2-T070, M2-T102, M2-T110, M2-T111.

  Hecho cuando: una consulta falla sin ofrecer datos antiguos; tras recuperar la dependencia, un nuevo intento usa los datos actuales y las trazas siguen sanitizadas.

## 10. Aceptación, regresión y cierre

- [ ] **M2-T113 — Probar el recorrido integrado con datos preparados** · 25 min · RF-01–RF-52

  Dependencias: M2-T059, M2-T072, M2-T077, M2-T078, M2-T084–M2-T090, M2-T096, M2-T103–M2-T109, M2-T112.

  Hecho cuando: en una base nueva, fixtures persistidos permiten configurar, consultar ambos modos/manual, validar internamente e identificar afectaciones; los escritores de prueba no se exponen al producto.

- [ ] **M2-T114 — Ejecutar la compilación de la entrega** · 15 min · RF-01–RF-52

  Dependencias: M2-T001–M2-T113.

  Hecho cuando: npm run build termina exitosamente con los adaptadores reales y queda registrada la evidencia; no se acredita compilación mediante proveedores vacíos.

- [ ] **M2-T115 — Ejecutar lint de la entrega** · 15 min · RF-01–RF-52

  Dependencias: M2-T114.

  Hecho cuando: npm run lint finaliza sin errores y se registra el resultado; no se cambia configuración para ocultar hallazgos.

- [ ] **M2-T116 — Ejecutar la suite unitaria y su regresión** · 25 min · RF-01–RF-52

  Dependencias: M2-T115.

  Hecho cuando: npm test -- --runInBand pasa sin omitir casos nuevos ni degradar expectativas compatibles de fases previas, con reloj controlado.

- [ ] **M2-T117 — Ejecutar la suite de integración MariaDB** · 25 min · RF-01–RF-52

  Dependencias: M2-T116.

  Hecho cuando: npm run test:integration -- --runInBand pasa sobre entorno confirmado; incluye restricciones, lectores y carreras con conexiones reales, sin reemplazarlas por mocks.

- [ ] **M2-T118 — Ejecutar la suite HTTP y su regresión** · 25 min · RF-01–RF-52

  Dependencias: M2-T117.

  Hecho cuando: npm run test:e2e -- --runInBand pasa e incluye sesiones, licencias, permisos, respuesta vacía y fallos; se registran todos los resultados.

- [ ] **M2-T119 — Revisar coherencia final de esquema y contratos** · 20 min · RF-01–RF-07, RF-10–RF-11, RF-19–RF-21, RF-35–RF-42, RF-47–RF-52

  Dependencias: M2-T118.

  Hecho cuando: se verifica que esquema, migraciones, entidades, contratos y rutas corresponden a la entrega probada, sin cambios posteriores sin verificar ni migraciones históricas reescritas.

- [ ] **M2-T120 — Documentar la integración entregada y la pendiente** · 20 min · RF-13–RF-21, RF-35–RF-47, RF-51–RF-52

  Dependencias: M2-T119.

  Hecho cuando: queda documentada la conexión real al módulo 1 y el contrato para escritores futuros; contador, reservas, cancelación y WhatsApp permanecen identificados como pendientes de los módulos 3–5.

- [ ] **M2-T121 — Completar la matriz RF a evidencia** · 25 min · RF-01–RF-52

  Dependencias: M2-T120.

  Hecho cuando: cada uno de los 52 RF enlaza tareas y pruebas T01–T20 con resultados reproducibles; ninguna prueba omitida o sustituida acredita integración real.

- [ ] **M2-T122 — Comprobar los 15 criterios de finalización** · 20 min · RF-01–RF-52

  Dependencias: M2-T121.

  Hecho cuando: los 15 criterios de la spec tienen evidencia, todas las dependencias externas requeridas están satisfechas y no se presenta como entregado un flujo de reservas que aún no existe.

## 11. Correspondencia con las pruebas y el cierre

Esta tabla localiza las tareas que aportan evidencia a cada grupo del plan; no sustituye sus escenarios detallados ni marca sus resultados como aprobados.

| Grupo de pruebas del plan | Tareas de evidencia |
|---|---|
| T01 | M2-T045, M2-T103 |
| T02 | M2-T036, M2-T064, M2-T103, M2-T104 |
| T03 | M2-T090, M2-T107 |
| T04 | M2-T038 |
| T05 | M2-T012, M2-T066 |
| T06 | M2-T009, M2-T017 |
| T07 | M2-T055, M2-T062, M2-T067 |
| T08 | M2-T015 |
| T09 | M2-T021 |
| T10 | M2-T023 |
| T11 | M2-T026–M2-T028 |
| T12 | M2-T032, M2-T072, M2-T106 |
| T13 | M2-T019, M2-T057, M2-T062 |
| T14 | M2-T019, M2-T028, M2-T062, M2-T064, M2-T077, M2-T088, M2-T089 |
| T15 | M2-T030, M2-T072 |
| T16 | M2-T069, M2-T072, M2-T078, M2-T108 |
| T17 | M2-T046, M2-T084–M2-T090 |
| T18 | M2-T070, M2-T086, M2-T105, M2-T106, M2-T110, M2-T112 |
| T19 | M2-T094–M2-T096 |
| T20 | M2-T057–M2-T059, M2-T109, M2-T113, M2-T119 |

El cierre se registra en M2-T121–M2-T122: RF → tareas → prueba → resultado/evidencia, más los 15 criterios de finalización de la spec. La aceptación integrada se mantiene pendiente mientras falte una dependencia externa, una prueba requerida o la evidencia real de un adaptador; un sustituto permite desarrollar el motor, pero no cerrar esa integración.

