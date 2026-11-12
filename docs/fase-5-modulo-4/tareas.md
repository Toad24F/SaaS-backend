# Tareas — Fase 5, Módulo 4: Panel de Control y Gestión Operativa

Ejecutar la [constitución](constitucion-modulo-4.md), la [especificación](spec.md) y el [plan](plan.md) en ese orden de precedencia, incorporando los [ajustes aprobados](../ajustes-licencias-administracion-agenda/spec.md) y conservando los contratos compatibles de los módulos 2 y 3. Los RF sin prefijo son locales a `spec.md`; los RF de ajustes se identifican expresamente. Todas las estimaciones son menores de 30 minutos y todas las casillas comienzan sin marcar. Cada tarea se marca solo al cumplir su propia línea «Hecho cuando:» y registrar revisión, comando y resultado en `resultados-tareas/`. M3-T136 continúa independiente; M2-I004/M3-I001 y ALA-I001–ALA-I003 solo se acreditan con el escritor manual real.

## 1. Base y pruebas reproducibles

- [x] **M4-T001 — Crear matriz RF y criterios** · 20 min · Depende de: ninguna · RF-01–RF-47
      Hecho cuando: la matriz enumera los 47 RF locales, los RF de ajustes aplicables y diez criterios; los vincula a tareas y pruebas previstas, incluida ALA-I001–ALA-I003, y separa evidencia nueva de antecedentes.
- [x] **M4-T002 — Inventariar contratos conservados** · 20 min · Depende de: M4-T001 · RF-01–RF-05, RF-21–RF-23, RF-28, RF-33–RF-35
      Hecho cuando: quedan identificados roles, plazo de suspensión configurable, cinco rutas privadas, escritor público, motor manual con separación, cupo telefónico por sucursal y orden de bloqueos sin atribuirles cobertura del módulo 4.
- [x] **M4-T003 — Preparar base desechable de integración** · 20 min · Depende de: M4-T002 · RF-03, RF-26, RF-28, RF-44
      Hecho cuando: el ejecutor crea y elimina una base identificada como test y rechaza conectarse a la base cotidiana.
- [x] **M4-T004 — Sembrar dos negocios y varios perfiles** · 25 min · Depende de: M4-T003 · RF-02–RF-04, RF-17, RF-23, RF-40
      Hecho cuando: los fixtures generan dos negocios, sucursales con zonas distintas, Profesional compartido, cinco estados y teléfonos repetidos con limpieza comprobada.
- [x] **M4-T005 — Preparar reloj y fallos controlados** · 20 min · Depende de: M4-T004 · RF-26–RF-27, RF-31, RF-34–RF-35, RF-42
      Hecho cuando: las pruebas fijan instantes antes, en y después de los límites y pueden forzar rollback sin cambiar el reloj del sistema.
- [x] **M4-T006 — Preparar dos conexiones y barreras** · 25 min · Depende de: M4-T003, M4-T005 · RF-23, RF-28, RF-33–RF-35, RF-40, RF-44
      Hecho cuando: un caso de control demuestra espera y liberación reproducible entre conexiones independientes y cierra ambas aun si falla.

Evidencia del lote M4-T001–M4-T006: [archivos, flujo, pruebas y resultados](resultados-tareas/resultados-m4-t001-t006.md). Ese cierre conservó el fallo documental unitario anterior como pendiente externo y no acreditó tareas posteriores.

## 2. Persistencia aditiva y modelo

Evidencia M4-T007–M4-T012: [archivos, flujo de migración, tests y resultados](resultados-tareas/m4-t007-t012.md). Integración y HTTP completos aprobados; el fallo documental unitario previo permanece identificado. Ese lote no acreditó tareas posteriores.

Evidencia M4-T013–M4-T019: [entidades, flujo del alta pública, tests y resultados](resultados-tareas/m4-t013-t019.md). Integración completa 454/454 y HTTP 199/199 aprobados; se conserva el pendiente documental unitario previo. Ese lote no acreditó tareas posteriores.

- [x] **M4-T007 — Migrar versión de citas** · 20 min · Depende de: M4-T003, M4-T002 · RF-29–RF-30, RF-38, RF-43
      Hecho cuando: citas existentes reciben versión 1 sin alterar estado, folio, intervalos, costo ni contacto.
- [x] **M4-T008 — Migrar versión de clientes** · 15 min · Depende de: M4-T003, M4-T002 · RF-18–RF-19, RF-43
      Hecho cuando: cada ficha recibe versión 1 y el teléfono conserva su índice no único.
- [x] **M4-T009 — Migrar intentos manuales** · 25 min · Depende de: M4-T003, M4-T002 · RF-20, RF-24, RF-26–RF-28
      Hecho cuando: la tabla representa clave única por negocio y actor, huella, tres estados y resultado opcional sin guardar contacto ni notas.
- [x] **M4-T010 — Migrar eventos de cita** · 25 min · Depende de: M4-T003, M4-T002 · RF-24, RF-29–RF-36, RF-41, RF-45
      Hecho cuando: el historial admite actor de personal o sesión pública, valores anterior/nuevo y motivo opcional sin sobrescribir eventos.
- [x] **M4-T011 — Extender auditoría de clientes** · 15 min · Depende de: M4-T003, M4-T002 · RF-15, RF-18, RF-45
      Hecho cuando: la restricción de auditoría admite recurso `cliente` y sigue rechazando tipos no previstos.
- [x] **M4-T012 — Añadir referencias e índices del nuevo modelo** · 25 min · Depende de: M4-T007–M4-T011 · RF-03, RF-17, RF-27, RF-43, RF-45
      Hecho cuando: intentos y eventos no pueden enlazar actor, cita o sesión de otro negocio y sus consultas tienen índices acotados.
- [x] **M4-T013 — Representar versiones en entidades** · 15 min · Depende de: M4-T007–M4-T008 · RF-18, RF-30, RF-38, RF-43
      Hecho cuando: las entidades de cita y cliente reflejan las columnas de versión sin alterar snapshots existentes.
- [x] **M4-T014 — Representar intentos y eventos en entidades** · 25 min · Depende de: M4-T009–M4-T012 · RF-24, RF-27, RF-30, RF-36, RF-41, RF-45
      Hecho cuando: las entidades reflejan estados, índices, referencias y nulabilidad de las migraciones.
- [x] **M4-T015 — Sincronizar esquema de referencia** · 20 min · Depende de: M4-T012–M4-T014 · RF-03, RF-18, RF-24, RF-43, RF-45
      Hecho cuando: `db/schema.sql`, entidades y migraciones describen las mismas columnas y restricciones nuevas.
- [x] **M4-T016 — Probar instalación limpia** · 25 min · Depende de: M4-T015 · RF-03, RF-15–RF-19, RF-24, RF-45
      Hecho cuando: todas las migraciones aplican en una base vacía desechable y sus FKs y versiones se consultan correctamente.
- [x] **M4-T017 — Probar actualización desde fase 4** · 25 min · Depende de: M4-T015 · RF-18, RF-24–RF-25, RF-41, RF-45
      Hecho cuando: una base de fase 4 conserva clientes, citas, apartados, intentos, folios y snapshots sin inventar datos faltantes.
- [x] **M4-T018 — Probar restricciones cruzadas y rollback** · 25 min · Depende de: M4-T016–M4-T017 · RF-03, RF-19, RF-26, RF-45
      Hecho cuando: referencias de otro negocio y eventos parciales fallan sin dejar filas nuevas.
- [x] **M4-T019 — Auditar alta pública en su commit** · 25 min · Depende de: M4-T010, M4-T014 · RF-24, RF-37, RF-45
      Hecho cuando: cada cita pública nueva crea un solo evento de alta con identidad pública comprobada en el mismo commit y la regresión pública sigue aprobada.

## 3. Autorización y respuestas privadas

Evidencia M4-T020–M4-T024: [archivos, flujo de autorización, tests primero y resultados](resultados-tareas/m4-t020-t024.md). Pruebas propias 62/62, integración completa 471/471 y HTTP 203/203 aprobados; build y lint aprobados. Unitarias completas: 452 aprobadas y un fallo documental previo identificado. Ese lote no acreditó tareas posteriores.

- [x] **M4-T020 — Definir permisos operativos cerrados** · 20 min · Depende de: M4-T002 · RF-01–RF-05, RF-13–RF-14, RF-20, RF-29, RF-38
      Hecho cuando: Administración y Recepción tienen permisos de gestión, Profesional solo lectura propia y Superadmin no hereda acceso a citas.
- [x] **M4-T021 — Revalidar identidad y negocio por operación** · 25 min · Depende de: M4-T020 · RF-01–RF-04, RF-13, RF-20, RF-29
      Hecho cuando: cada caso de uso reconstruye sesión, rol, negocio y licencia actuales sin usar `negocioId` del cuerpo o JWT como autorización suficiente.
- [x] **M4-T022 — Probar alcance por rol** · 25 min · Depende de: M4-T021, M4-T004 · RF-01–RF-05, RF-13–RF-14, RF-29
      Hecho cuando: dos negocios y los tres roles prueban lectura propia, denegación de escritura Profesional y ausencia de datos cruzados.
- [x] **M4-T023 — Probar licencia y sesión abierta** · 25 min · Depende de: M4-T021, M4-T005 · RF-04–RF-05, RF-20, RF-34
      Hecho cuando: vencimiento, suspensión inmediata y suspensión con plazo configurable niegan operaciones nuevas en su límite exacto incluso con sesión anterior; la prueba no supone 48 horas para todos los casos.
- [x] **M4-T024 — Normalizar errores operativos seguros** · 20 min · Depende de: M4-T021 · RF-05, RF-19, RF-23, RF-26–RF-27, RF-43, RF-46–RF-47
      Hecho cuando: inválido, ajeno, conflicto, temporal e inesperado producen mensajes distintos sin SQL, trazas ni contacto ajeno.

## 4. Consulta de agenda e historial

Ajuste vigente solicitado por el responsable: [periodo completo de calendario](resultados-tareas/ajuste-agenda-periodo-completo.md). Sustituye las páginas de citas por hasta 42 fechas completas, con tope técnico de 1.000 citas y rechazo del exceso antes de calcular causas. Mantiene historial paginado y disponibilidad de 31 fechas. Se revisan los contratos de M4-T025/M4-T030 y el criterio futuro de M4-T090 sin marcar tareas posteriores; los informes de lotes anteriores conservan su alcance histórico.

Evidencia M4-T025–M4-T030: [archivos, flujo de consulta, tests primero y resultados](resultados-tareas/m4-t025-t030.md). Pruebas propias finales 36/36, regresión de integración completa 478/478 y HTTP 203/203 aprobados; el caso temporal añadido después está incluido en la repetición propia final 8/8, como aclara el informe. Build y lint aprobados. Unitarias completas finales: 480 aprobadas y un fallo documental previo. Ese lote no acreditó tareas posteriores.

- [x] **M4-T025 — Validar rango y filtros de agenda** · 20 min · Depende de: M4-T021 · RF-06–RF-08, RF-46–RF-47
      Hecho cuando: se admiten hasta 42 fechas inclusivas de agenda y se rechazan fechas, filtros o campos desconocidos sin consultar datos; disponibilidad conserva 31 fechas.
- [x] **M4-T026 — Listar citas por negocio y periodo** · 25 min · Depende de: M4-T025, M4-T013 · RF-01, RF-03, RF-06, RF-09
      Hecho cuando: la consulta devuelve todos los estados del negocio dentro del periodo y nunca citas ajenas.
- [x] **M4-T027 — Acotar consulta del Profesional** · 20 min · Depende de: M4-T026, M4-T020 · RF-02–RF-03, RF-07, RF-09
      Hecho cuando: un Profesional solo recibe sus citas y su contacto/notas aunque manipule el filtro de personal.
- [x] **M4-T028 — Proyectar fecha y zona de sucursal** · 25 min · Depende de: M4-T026 · RF-06–RF-07, RF-09
      Hecho cuando: una cita aparece en su fecha local correcta aun cuando sucursales distintas compartan instante UTC.
- [x] **M4-T029 — Aplicar filtros de sucursal, personal y estado** · 20 min · Depende de: M4-T027–M4-T028 · RF-08–RF-09, RF-46
      Hecho cuando: cada filtro y su combinación limitan resultados sin excluir canceladas salvo petición expresa.
- [x] **M4-T030 — Buscar por paciente en el periodo completo** · 25 min · Depende de: M4-T029 · RF-03, RF-08, RF-46–RF-47
      Hecho cuando: búsqueda y periodo completo permanecen dentro del negocio y tienen orden estable; hasta 42 fechas y 1.000 citas, con rechazo explícito del exceso sin truncamiento. Sustituye la paginación anterior por solicitud del responsable; ver evidencia del ajuste.
      Evidencia M4-T031–M4-T036: [archivos, flujo de causas/detalle/historial, tests primero y resultados](resultados-tareas/m4-t031-t036.md). Pruebas nuevas 28/28, integración completa 482/482 y HTTP 210/210 aprobados; build y lint aprobados. Unitarias completas: 498 aprobadas y un fallo documental previo identificado. Ese lote habilitó tres lecturas HTTP privadas; no acreditó frontend, directorio ni escritores y se detuvo en M4-T036.

- [x] **M4-T031 — Incorporar causas de citas afectadas** · 20 min · Depende de: M4-T026, M4-T002 · RF-09, RF-11, RF-46
      Hecho cuando: causas actuales se muestran para citas afectadas sin cambiar horario ni estado y desaparecen al cesar la causa.
- [x] **M4-T032 — Consultar detalle autorizado** · 20 min · Depende de: M4-T027 · RF-02–RF-03, RF-07, RF-29
      Hecho cuando: el detalle muestra origen, estado y snapshot propio, y un ID ajeno equivale a uno inexistente.
- [x] **M4-T033 — Consultar historial de una cita** · 20 min · Depende de: M4-T010, M4-T014, M4-T032 · RF-30, RF-32, RF-36, RF-41, RF-45
      Hecho cuando: eventos se ordenan por momento y versión y solo se muestran a personal autorizado de ese negocio.
- [x] **M4-T034 — Exponer rutas de agenda y detalle** · 25 min · Depende de: M4-T025–M4-T033, M4-T024 · RF-01–RF-09, RF-11, RF-29, RF-45–RF-47
      Hecho cuando: lista, detalle e historial responden bajo guardas privadas y `no-store`, sin rutas públicas nuevas.
- [x] **M4-T035 — Probar filtros, estados y zonas** · 25 min · Depende de: M4-T034, M4-T004 · RF-02–RF-03, RF-06–RF-09, RF-29
      Hecho cuando: día, semana y mes se reconstruyen desde consultas acotadas y cinco estados y zonas aparecen en la fecha correcta.
- [x] **M4-T036 — Probar vacío frente a fallo de agenda** · 20 min · Depende de: M4-T034, M4-T024 · RF-05, RF-46–RF-47
      Hecho cuando: una consulta válida sin citas devuelve vacío, mientras un fallo técnico informa error sin resultado parcial.

## 5. Directorio de clientes

Evidencia M4-T037–M4-T042: [archivos, flujo del directorio, tests primero y resultados](resultados-tareas/m4-t037-t042.md). Pruebas nuevas 47/47, integración completa 492/492 y HTTP 214/214 aprobados; build y lint aprobados. Unitarias completas: 544 aprobadas y un fallo documental previo identificado. Ese lote acreditó el dominio de clientes, sin rutas HTTP ni frontend, y se detuvo en M4-T042; no acreditó tareas posteriores.

Evidencia M4-T043–M4-T047: [archivos, elección por ID, flujo HTTP, tests primero y resultados](resultados-tareas/m4-t043-t047.md). Nueve tests nuevos aprobados; regresión de integración 494/494 y HTTP 221/221 aprobadas. La composición definitiva pasó además 12 tests de integración focalizados, siete HTTP, build y lint. Unitarias completas: 544 aprobadas y un fallo documental previo identificado. Se acredita selección interna y cinco rutas privadas del directorio; frontend y escritor manual siguen pendientes. El trabajo se detiene en M4-T047.

- [x] **M4-T037 — Validar datos de cliente** · 20 min · Depende de: M4-T021 · RF-15, RF-17, RF-19, RF-47
      Hecho cuando: nombre y teléfono siguen límites y normalización acordados, rechazan campos desconocidos y nunca fusionan por teléfono.
- [x] **M4-T038 — Buscar fichas por negocio** · 20 min · Depende de: M4-T037, M4-T013 · RF-03, RF-13, RF-17
      Hecho cuando: nombre y teléfono devuelven fichas paginadas del negocio, incluso varias con el mismo número.
- [x] **M4-T039 — Consultar ficha e historial** · 20 min · Depende de: M4-T038, M4-T026 · RF-13–RF-14, RF-18
      Hecho cuando: el historial usa el ID propio de cliente y muestra solo citas del mismo negocio.
- [x] **M4-T040 — Dar de alta ficha independiente** · 20 min · Depende de: M4-T037, M4-T021 · RF-15, RF-17, RF-19, RF-45
      Hecho cuando: se crea una ficha sin cita con teléfono compartible y un fallo no deja ficha parcial.
- [x] **M4-T041 — Corregir ficha con versión observada** · 25 min · Depende de: M4-T040, M4-T013 · RF-18–RF-19, RF-43, RF-45
      Hecho cuando: una versión anterior recibe conflicto y una corrección válida no modifica snapshots de citas.
- [x] **M4-T042 — Auditar alta y corrección de cliente** · 20 min · Depende de: M4-T011, M4-T041 · RF-15, RF-18, RF-45
      Hecho cuando: alta y cambio efectivos crean un evento con actor y valores permitidos dentro del mismo commit, sin secretos.
- [x] **M4-T043 — Resolver elección de cliente existente** · 20 min · Depende de: M4-T039, M4-T021 · RF-03, RF-16–RF-17, RF-20
      Hecho cuando: un ID propio identifica exactamente una ficha y un ID ajeno no se sustituye por una coincidencia telefónica.
- [x] **M4-T044 — Exponer rutas privadas de clientes** · 25 min · Depende de: M4-T038–M4-T043, M4-T024 · RF-13–RF-19, RF-43, RF-45–RF-47
      Hecho cuando: lista, ficha, historial, alta y corrección aplican permisos, versiones y `no-store`.
- [x] **M4-T045 — Probar teléfonos compartidos** · 20 min · Depende de: M4-T044, M4-T004 · RF-15–RF-17, RF-19
      Hecho cuando: dos fichas con el mismo teléfono conservan IDs y nombres distintos y la selección exige ID explícito.
- [x] **M4-T046 — Probar snapshots ante corrección** · 20 min · Depende de: M4-T044, M4-T004 · RF-14, RF-18, RF-43, RF-45
      Hecho cuando: editar la ficha no altera contacto de citas previas y una segunda edición con versión vieja recibe 409.
- [x] **M4-T047 — Probar aislamiento del directorio** · 20 min · Depende de: M4-T044, M4-T022 · RF-03, RF-13–RF-14, RF-19
      Hecho cuando: negocio ajeno y Profesional no leen ni corrigen fichas y la respuesta no revela su existencia.

## 6. Escritor manual e intentos

Evidencia M4-T048–M4-T052: [archivos, contrato, flujo, tests primero y resultados](resultados-tareas/m4-t048-t052.md). 55 tests nuevos aprobados (35 unitarios y 20 de integración); unitarias completas 580/580, regresión relevante de integración 72/72 y HTTP 41/41, con build y lint aprobados. Ese lote acreditó preparación idempotente y colaboración transaccional bajo bloqueos, sin crear citas ni habilitar rutas manuales, y se detuvo en M4-T052 sin acreditar tareas posteriores.

Evidencia M4-T053–M4-T058: [archivos, snapshots, flujo atómico, tests primero y resultados](resultados-tareas/m4-t053-t058.md). 17 tests de integración nuevos aprobados; regresión relevante de integración 84/84 y HTTP 41/41, unitarias completas 580/580, build y lint aprobados. Se acredita registro manual real de servicio con ficha elegida/nueva, cita Confirmada, evento, intento atómico y repetición sin duplicados. No se exponen rutas ni resolutor; M4-T059 y posteriores permanecen pendientes. El trabajo se detiene en M4-T058.

- [x] **M4-T048 — Validar selección y contacto manual** · 25 min · Depende de: M4-T037, M4-T043, M4-T002 · RF-16–RF-17, RF-20–RF-21, RF-47
      Hecho cuando: se admite cliente propio o nuevo, fecha/hora y notas; se rechazan precio, fin, zona y IDs ajenos enviados como autoridad.
- [x] **M4-T049 — Preparar intento bajo actor y negocio** · 25 min · Depende de: M4-T009, M4-T014, M4-T048, M4-T021 · RF-03, RF-20, RF-27, RF-43
      Hecho cuando: una clave opaca crea una sola fila preparada con huella y sin contacto persistido.
- [x] **M4-T050 — Deduplicar clave y contenido** · 20 min · Depende de: M4-T049 · RF-24, RF-27, RF-43
      Hecho cuando: misma clave y contenido reutilizan intento; contenido diferente recibe 409 sin cambiar su fila.
- [x] **M4-T051 — Integrar bloqueo común del escritor** · 25 min · Depende de: M4-T006, M4-T049, M4-T002 · RF-21–RF-23, RF-28, RF-44
      Hecho cuando: intento precede recursos de dominio y la fila del Profesional serializa sucursales y servicios con `READ COMMITTED`.
- [x] **M4-T052 — Revalidar selección tras la espera** · 25 min · Depende de: M4-T051, M4-T048 · RF-21–RF-23, RF-28, RF-44
      Hecho cuando: el mismo manager relee licencia, oferta, duración, separación vigente, horario, bloqueos, ocupaciones protegidas y cupo telefónico compartido por sucursal antes de escribir.
- [x] **M4-T053 — Copiar costo y nombres actuales** · 20 min · Depende de: M4-T052 · RF-24–RF-25, RF-44
      Hecho cuando: la copia toma costo y nombres vigentes al registro y no admite valores autoritativos del navegador.
- [x] **M4-T054 — Vincular cliente propio o crear uno nuevo** · 25 min · Depende de: M4-T052, M4-T043 · RF-16–RF-17, RF-24, RF-26
      Hecho cuando: un cliente existente se relee por negocio y uno nuevo se crea dentro de la transacción de la cita.
- [x] **M4-T055 — Crear cita manual con folio único** · 25 min · Depende de: M4-T053–M4-T054, M4-T013 · RF-23–RF-25, RF-28
      Hecho cuando: la cita queda Confirmada con inicio, fin de atención, separación capturada, fin protegido, zona, costo y contacto históricos y un folio no duplicado; el alta respeta el cupo telefónico compartido.
- [x] **M4-T056 — Registrar evento inicial manual** · 20 min · Depende de: M4-T055, M4-T010, M4-T014 · RF-24, RF-45
      Hecho cuando: el alta manual tiene un evento con actor real y versión inicial en la misma transacción.
- [x] **M4-T057 — Confirmar resultado e intento juntos** · 20 min · Depende de: M4-T055–M4-T056 · RF-24, RF-26–RF-27
      Hecho cuando: cliente nuevo, cita, evento e intento registrado aparecen juntos o ninguno aparece tras fallo.
- [x] **M4-T058 — Repetir resultado ya registrado** · 20 min · Depende de: M4-T057, M4-T050 · RF-24, RF-27, RF-43
      Hecho cuando: repetir la misma clave y contenido devuelve el mismo folio sin crear cliente, cita o evento adicionales.
- [x] **M4-T059 — Resolver intento frente al escritor** · 25 min · Depende de: M4-T057, M4-T051 · RF-26–RF-27, RF-44, RF-46
      Hecho cuando: el resolutor espera al escritor o responde 503 y nunca declara fracaso por ausencia sin exclusión.
- [x] **M4-T060 — Cerrar ausencia terminal y petición tardía** · 25 min · Depende de: M4-T059, M4-T050 · RF-27, RF-43–RF-44
      Hecho cuando: `no_registrado` queda durable y una preparación o escritura tardía de la misma clave no crea cita.
- [x] **M4-T061 — Probar rollback entre escrituras** · 25 min · Depende de: M4-T057, M4-T005 · RF-24, RF-26–RF-27, RF-45
      Hecho cuando: fallos tras cada inserción revierten cliente nuevo, cita, evento y resultado, permitiendo reintentar la misma clave preparada.
- [x] **M4-T062 — Exponer preparación, registro y resolución** · 25 min · Depende de: M4-T058–M4-T060, M4-T024 · RF-20, RF-22–RF-28, RF-43–RF-47
      Hecho cuando: tres rutas privadas aplican rol, origen del actor, `no-store` y respuestas de creación, repetición, conflicto e incertidumbre.
      Evidencia M4-T059–M4-T062: [archivos, flujo de resolución, tests primero y resultados](resultados-tareas/m4-t059-t062.md). Se verifican resolución contra escritor en ambos órdenes, cierre terminal, timeout SQL real 503, cinco puntos de rollback y tres rutas privadas. Unitarias completas 580/580; integración relevante 90/90 y HTTP relevante 45/45; build y lint aprobados. Se marcan solo estas cuatro tareas y el trabajo se detiene en T062.

- [x] **M4-T063 — Probar reserva manual válida** · 25 min · Depende de: M4-T062, M4-T004 · RF-16–RF-17, RF-20–RF-25
      Hecho cuando: servicio y separación dentro de horario crean exactamente una cita Confirmada con cliente elegido o nuevo y snapshot completo; el tercer registro futuro del mismo teléfono en la sucursal se rechaza sin fusionar fichas ni dejar filas parciales.
- [x] **M4-T064 — Probar ocupaciones de otras sucursales** · 25 min · Depende de: M4-T063, M4-T006 · RF-21–RF-23, RF-28
      Hecho cuando: intervalos protegidos iguales y parciales del mismo Profesional se rechazan entre sucursales, incluso si solo invade la separación; extremos protegidos contiguos se aceptan.
- [x] **M4-T065 — Probar cambios durante la espera** · 25 min · Depende de: M4-T063, M4-T006 · RF-21–RF-26, RF-44
      Hecho cuando: cambios de licencia, oferta, costo, duración, separación y horario confirmados primero se observan antes del registro y no dejan filas parciales.
- [x] **M4-T066 — Probar recuperación HTTP incierta** · 25 min · Depende de: M4-T062, M4-T005 · RF-26–RF-27, RF-43–RF-47
      Hecho cuando: pérdida antes y después del commit devuelve ausencia terminal o el mismo folio, nunca otra cita.

Evidencia M4-T063–M4-T066: [archivos, flujos, tests primero y resultados](resultados-tareas/m4-t063-t066.md). Se añaden 26 casos de aceptación: reserva HTTP con ficha elegida/nueva y cupo, ocupaciones protegidas entre sucursales, seis cambios confirmados durante espera real y recuperación tras pérdida de socket antes/después del commit. Unitarias completas 580/580; integración relevante 108/108 y HTTP relevante 53/53; build y lint aprobados. No requirió cambios de producción. Solo se marcan estas cuatro tareas y el trabajo se detiene en T066.

## 7. Ciclo de vida e historial

- [x] **M4-T067 — Validar entrada de cambio de estado** · 20 min · Depende de: M4-T013, M4-T021 · RF-29–RF-32, RF-43, RF-47
      Hecho cuando: solo se admiten cinco estados, versión y motivo opcional válido; se rechazan campos desconocidos.
- [x] **M4-T068 — Comprobar versión antes de modificar** · 20 min · Depende de: M4-T067 · RF-30, RF-36, RF-43
      Hecho cuando: una versión vieja devuelve 409 y deja estado, versión e historial sin cambios.
- [x] **M4-T069 — Cambiar Pendiente y Confirmada** · 20 min · Depende de: M4-T068, M4-T010 · RF-29–RF-30, RF-36–RF-37, RF-45
      Hecho cuando: un cambio efectivo guarda nuevo estado y evento; repetir el mismo estado con versión vigente no duplica evento.
- [x] **M4-T070 — Restringir Completada y No asistió** · 20 min · Depende de: M4-T069, M4-T005 · RF-30–RF-33, RF-36
      Hecho cuando: antes de `fin_utc` se rechazan ambos estados y desde el límite exacto se admiten sin liberar ocupación.
- [x] **M4-T071 — Cancelar bajo el bloqueo del Profesional** · 25 min · Depende de: M4-T068, M4-T051 · RF-30, RF-32–RF-33, RF-43–RF-45
      Hecho cuando: cancelar conserva la cita y libera solo su ocupación tras confirmar versión y evento en la misma transacción.
- [x] **M4-T072 — Reactivar cita futura** · 25 min · Depende de: M4-T071, M4-T052 · RF-30, RF-33–RF-35, RF-44
      Hecho cuando: solo un inicio futuro con licencia, oferta y horario vigentes y sin solapamiento protegido puede volver a ocupar, conservando la separación histórica; el cupo telefónico no bloquea esta reactivación.
      Evidencia M4-T067–M4-T072: [archivos, flujo transaccional, tests primero y resultados](resultados-tareas/m4-t067-t072.md). Se implementan validación cerrada, versión, cambios de estado con evento atómico, límites de fin de atención, cancelación y reactivación histórica sin cupo de alta. Se añaden 36 unitarios y 29 casos de integración con bloqueos, rollback y dos actores. Unitarias completas 616/616; integración relevante 137/137 y HTTP relevante 53/53; build y lint aprobados. Solo se marcan estas seis tareas y el trabajo se detiene en T072; no se expone aún la ruta de T074.

- [x] **M4-T073 — Conservar motivo opcional y correcciones** · 20 min · Depende de: M4-T070–M4-T072 · RF-32, RF-36, RF-45
      Hecho cuando: el historial muestra motivo solo si se proporcionó y conserva estado anterior, nuevo, actor e instante.
- [x] **M4-T074 — Exponer cambio de estado** · 20 min · Depende de: M4-T067–M4-T073, M4-T024 · RF-29–RF-37, RF-43–RF-47
      Hecho cuando: la ruta privada aplica versión, permisos y errores seguros y devuelve el nuevo estado confirmado.
- [x] **M4-T075 — Probar cinco estados y límite temporal** · 25 min · Depende de: M4-T074, M4-T005 · RF-29–RF-33, RF-36–RF-37
      Hecho cuando: antes/en/después del fin se observan transiciones permitidas y solo Cancelada libera el intervalo.
- [x] **M4-T076 — Probar cancelación y reactivación concurrentes** · 25 min · Depende de: M4-T074, M4-T006 · RF-33–RF-35, RF-43–RF-45
      Hecho cuando: una reserva rival y una reactivación del mismo horario dejan una sola ocupación incompatible y eventos reales únicos.

Evidencia M4-T073–M4-T076: [archivos, flujos, tests primero y resultados](resultados-tareas/m4-t073-t076.md). Se publica PATCH de estado y se proyectan motivos aportados y versiones de correcciones. Los 23 casos nuevos cubren historial, cinco estados/límites HTTP, reserva pública Pendiente y seis carreras con dos conexiones y escritores reales. Unitarias completas 616/616; integración relevante 144/144 y HTTP relevante 72/72; build y lint aprobados. Solo se marcan estas cuatro tareas y el trabajo se detiene en T076; T077 y posteriores permanecen pendientes.

## 8. Cambio de horario

Evidencia M4-T077–M4-T082: [archivos, flujo interno, tests primero y resultados](resultados-tareas/m4-t077-t082.md). Se añade movimiento transaccional con duración/separación históricas, exclusión comprobada de la cita propia, versión y evento atómicos. Suite nueva final 20/20 de integración y 25/25 unitarios; unitarias completas 641/641, integración completa 608/608 y HTTP completo 252/252; build y lint aprobados. Solo se cierran estas seis tareas; el trabajo se detiene en T082, sin exponer la ruta de T083 ni avanzar a frontend.

- [x] **M4-T077 — Autorizar exclusión de cita propia en el motor** · 25 min · Depende de: M4-T052, M4-T068 · RF-03, RF-38–RF-40, RF-44
      Hecho cuando: solo una cita comprobada del negocio y Profesional puede excluir su intervalo al evaluar el destino.
- [x] **M4-T078 — Validar con duración original** · 25 min · Depende de: M4-T077 · RF-38–RF-40
      Hecho cuando: mover una cita usa duración y separación guardadas aunque el servicio o la configuración hayan cambiado, y no modifica su costo histórico.
- [x] **M4-T079 — Validar entrada de fecha y hora nuevas** · 20 min · Depende de: M4-T078 · RF-38–RF-39, RF-42, RF-47
      Hecho cuando: se rechazan fecha pasada, hora ambigua o inexistente y cambios de servicio, sucursal, Profesional, precio o fin enviados por cliente.
- [x] **M4-T080 — Bloquear cita y comprobar versión** · 20 min · Depende de: M4-T079, M4-T051 · RF-38, RF-40, RF-43–RF-44
      Hecho cuando: una versión vieja o cita ajena no modifica el horario y el bloqueo sigue el orden compartido.
- [x] **M4-T081 — Revalidar destino completo** · 25 min · Depende de: M4-T080, M4-T078 · RF-39–RF-40, RF-44
      Hecho cuando: oferta, licencia, horario, bloqueos y ocupaciones protegidas de cualquier sucursal se releen antes de aceptar el destino, con la separación histórica de la cita.
- [x] **M4-T082 — Guardar movimiento e historial atómicos** · 25 min · Depende de: M4-T081, M4-T010 · RF-38, RF-41–RF-43, RF-45
      Hecho cuando: inicio, fin de atención, fin protegido, zona y versión cambian juntos con un evento anterior/nuevo bajo el mismo folio; separación, costo y combinación se conservan, o ninguno cambia.
      Evidencia M4-T083–M4-T087: [archivos, flujo HTTP, tests primero y resultados](resultados-tareas/m4-t083-t087.md). Se expone PATCH privado de horario y se acreditan zonas/límites, conflicto/contigüidad, rollback/versiones y cuatro carreras reales contra apartados públicos. Tests nuevos 25/25; unitarias completas 641/641, integración relevante 136/136 y HTTP completo 277/277; build y lint aprobados. Solo se cierran estas cinco tareas y el trabajo se detiene en T087; T088 y posteriores siguen pendientes.

- [x] **M4-T083 — Exponer cambio privado de horario** · 20 min · Depende de: M4-T082, M4-T024 · RF-38–RF-43, RF-47
      Hecho cuando: la ruta acepta solo fecha, hora y versión y responde conflicto o resultado autorizado sin datos internos.
- [x] **M4-T084 — Probar zona y horario inválido** · 25 min · Depende de: M4-T083, M4-T005 · RF-38–RF-39, RF-42
      Hecho cuando: cambios de hora, inicio pasado y cierre de atención se rechazan sin alterar cita o historial.
- [x] **M4-T085 — Probar conflicto y extremos contiguos** · 25 min · Depende de: M4-T083, M4-T004 · RF-39–RF-42, RF-44
      Hecho cuando: solapamiento parcial de ocupación protegida en otra sucursal se rechaza y un extremo protegido contiguo válido conserva un solo folio.
- [x] **M4-T086 — Probar rollback y versión obsoleta** · 25 min · Depende de: M4-T083, M4-T005 · RF-41–RF-43, RF-45
      Hecho cuando: fallo entre actualización y evento revierte horario, versión e historial, y edición vieja recibe 409.
- [x] **M4-T087 — Probar movimiento contra apartado público** · 25 min · Depende de: M4-T083, M4-T006 · RF-40, RF-43–RF-44
      Hecho cuando: dos conexiones dejan el apartado o el nuevo horario, nunca ambas ocupaciones incompatibles.

## 9. Frontend conectado

- [x] **M4-T088 — Habilitar navegación por rol** · 20 min · Depende de: M4-T034, M4-T044 · RF-01–RF-03, RF-06, RF-13
      Hecho cuando: Agenda y Clientes aparecen en conectado solo para roles autorizados, y Profesional no recibe el directorio.
- [x] **M4-T089 — Crear cliente HTTP de agenda y clientes** · 25 min · Depende de: M4-T034, M4-T044, M4-T088 · RF-03, RF-06–RF-09, RF-13–RF-14, RF-46–RF-47
      Hecho cuando: las vistas usan respuestas reales y no reemplazan fallos con datos de demo.
- [x] **M4-T090 — Conectar vistas día, semana y mes** · 25 min · Depende de: M4-T089 · RF-06–RF-07, RF-09, RF-12
      Hecho cuando: las tres vistas muestran citas reales del periodo completo de hasta 42 fechas, incluida la cuadrícula mensual de seis semanas; ante exceso de volumen se pide acotar sin mostrar resultados parciales.
- [x] **M4-T091 — Conectar filtros y búsqueda de agenda** · 20 min · Depende de: M4-T090 · RF-08–RF-09, RF-46
      Hecho cuando: sucursal, Profesional, estado y nombre actualizan la vista sin mezclar resultados de solicitudes fuera de orden.
- [x] **M4-T092 — Conectar detalle e historial de cita** · 20 min · Depende de: M4-T090, M4-T033 · RF-02, RF-07, RF-29, RF-32, RF-36, RF-41
      Hecho cuando: detalle muestra origen, estado, contacto autorizado, notas e historial real bajo la zona correspondiente.
- [x] **M4-T093 — Construir formulario manual conectado** · 25 min · Depende de: M4-T089, M4-T062 · RF-16, RF-20–RF-21, RF-24
      Hecho cuando: el formulario permite cliente existente o nuevo y no calcula precio, fin ni disponibilidad como autoridad local.
- [x] **M4-T094 — Conectar selección de disponibilidad manual** · 25 min · Depende de: M4-T093, M4-T002 · RF-20–RF-23, RF-46
      Hecho cuando: solo horarios devueltos por el motor privado pueden seleccionarse y un fallo no aparece como agenda llena.
- [x] **M4-T095 — Conectar preparación y recuperación manual** · 25 min · Depende de: M4-T093–M4-T094, M4-T062 · RF-24, RF-26–RF-27, RF-43
      Hecho cuando: doble envío o recarga incierta resuelven la misma clave antes de permitir otra cita y no duplican folio.
- [x] **M4-T096 — Conectar cambio de estado** · 20 min · Depende de: M4-T092, M4-T074 · RF-29–RF-37, RF-43
      Hecho cuando: solo Administración y Recepción ven controles, muestran motivo opcional y manejan versión obsoleta sin sobrescribir.
- [x] **M4-T097 — Conectar cambio de horario** · 25 min · Depende de: M4-T092, M4-T083 · RF-38–RF-43
      Hecho cuando: se editan solo fecha y hora, se conserva folio y un rechazo mantiene el horario anterior visible.
- [x] **M4-T098 — Conectar listado e historial de clientes** · 20 min · Depende de: M4-T089, M4-T044 · RF-13–RF-14, RF-17
      Hecho cuando: búsqueda y detalle muestran datos reales del negocio, incluidos teléfonos compartidos sin fusionarlos.
- [x] **M4-T099 — Conectar alta y corrección de ficha** · 25 min · Depende de: M4-T098 · RF-15, RF-18–RF-19, RF-43
      Hecho cuando: alta y edición envían versión, conservan los datos corregibles ante error y no alteran citas previas.
- [ ] **M4-T100 — Actualizar agenda abierta y avisar obsolescencia** · 25 min · Depende de: M4-T090–M4-T092, M4-T096–M4-T097 · RF-10, RF-43, RF-46
      Hecho cuando: cambios de otra sesión aparecen sin acción manual y un formulario con versión anterior recibe aviso antes de guardarse.
- [ ] **M4-T101 — Mostrar vacío y errores por separado** · 20 min · Depende de: M4-T089–M4-T100 · RF-05, RF-19, RF-26–RF-27, RF-46–RF-47
      Hecho cuando: ausencia legítima, entrada inválida, permiso, conflicto y fallo técnico tienen mensajes distintos y ninguna pantalla usa datos ficticios como respaldo.
- [ ] **M4-T102 — Ajustar móvil, teclado y foco** · 25 min · Depende de: M4-T090–M4-T101 · RF-06–RF-12, RF-13–RF-14, RF-20
      Hecho cuando: agenda, directorio y formularios se completan en móvil y teclado sin controles ocultos, desbordamiento o pérdida de foco.
- [ ] **M4-T103 — Probar estado del frontend con Node** · 25 min · Depende de: M4-T090–M4-T102 · RF-08–RF-10, RF-16–RF-19, RF-27, RF-43, RF-46–RF-47
      Hecho cuando: filtros, respuestas fuera de orden, recuperación y errores tienen pruebas aprobadas sin depender de la demo.

## 10. Navegador, seguridad y carreras finales

- [ ] **M4-T104 — Preparar navegador con API de prueba** · 25 min · Depende de: M4-T103, M4-T003 · RF-01–RF-03, RF-06, RF-20
      Hecho cuando: Playwright usa backend y MariaDB desechable, dos roles y limpieza garantizada sin tocar la base cotidiana.
- [ ] **M4-T105 — Probar roles en navegador** · 25 min · Depende de: M4-T104 · RF-01–RF-05, RF-13–RF-14, RF-29
      Hecho cuando: Administrador y Recepción gestionan sus datos; Profesional ve solo citas propias y no dispone de acciones de escritura.
- [ ] **M4-T106 — Probar alta manual en navegador** · 25 min · Depende de: M4-T104, M4-T095 · RF-16–RF-17, RF-20–RF-25
      Hecho cuando: cliente existente y nuevo producen citas Confirmadas reales, visibles en agenda con folio y costo guardados.
- [ ] **M4-T107 — Probar envío incierto en navegador** · 25 min · Depende de: M4-T104, M4-T095 · RF-26–RF-27, RF-43, RF-46
      Hecho cuando: doble clic, respuesta perdida y recarga muestran un resultado único o incertidumbre sin duplicar cita.
- [ ] **M4-T108 — Probar estados y movimiento en navegador** · 25 min · Depende de: M4-T104, M4-T096–M4-T097 · RF-29–RF-43
      Hecho cuando: cancelación, reactivación, corrección y movimiento actualizan agenda e historial bajo el mismo folio.
- [ ] **M4-T109 — Probar móvil y teclado en navegador** · 25 min · Depende de: M4-T104, M4-T102 · RF-06–RF-12, RF-13–RF-14, RF-20, RF-47
      Hecho cuando: recorridos reales completan consultas y formularios con foco visible y sin desbordamiento horizontal.
- [ ] **M4-T110 — Enfrentar manual y apartado del mismo intervalo** · 25 min · Depende de: M4-T064, M4-T006 · RF-21–RF-23, RF-28, RF-33–RF-35, RF-44
      Hecho cuando: dos conexiones y el escritor manual real dejan solo la cita o el apartado vigente, con respuesta y filas finales comprobadas.
- [ ] **M4-T111 — Enfrentar manual y apartado entre sucursales** · 25 min · Depende de: M4-T110 · RF-23, RF-28, RF-33, RF-40, RF-44
      Hecho cuando: solapamientos UTC parciales, incluida la separación histórica, entre sucursales producen una sola ocupación y los extremos protegidos contiguos siguen válidos.
- [ ] **M4-I001 — Integrar cupo telefónico compartido** · 25 min · Depende de: M4-T063, M4-T006 · Ajustes RF-56–RF-59, RF-63
      Hecho cuando: dos citas futuras repartidas entre portal y escritor manual real impiden una tercera con el mismo teléfono normalizado en la misma sucursal; otra sucursal conserva su cupo. Registrar evidencia también en ALA-I001.
- [ ] **M4-I002 — Correr carrera por el último lugar telefónico** · 25 min · Depende de: M4-I001, M4-T006 · Ajustes RF-59, RF-63, RF-65
      Hecho cuando: dos conexiones enfrentan ambos escritores reales en ambos órdenes y solo una reserva ocupa el último lugar; verificar clientes, citas e intentos finales. Registrar evidencia también en ALA-I002.
- [ ] **M4-I003 — Correr carrera por separación protegida** · 25 min · Depende de: M4-I002, M4-T111 · Ajustes RF-43–RF-45, RF-63, RF-65
      Hecho cuando: una carrera pública/manual entre sucursales respeta fin protegido y extremos contiguos sin empalmes; verificar filas finales y vincular ALA-I003, M3-I001 y M2-I004 sin cerrar sus demás criterios por anticipado.
- [ ] **M4-T112 — Consolidar M2-I004 y M3-I001** · 20 min · Depende de: M4-T110–M4-T111, M4-I001–M4-I003 · RF-21–RF-23, RF-28, RF-33–RF-35, RF-40, RF-44
      Hecho cuando: se anexan revisión, comandos, barreras y filas finales a ambos identificadores sin usar dobles ni marcar otros casos ajenos; M4-I001–M4-I003 y ALA-I001–ALA-I003 tienen evidencia propia.
- [ ] **M4-T113 — Repetir regresión pública y privada** · 25 min · Depende de: M4-T019, M4-T074, M4-T083, M4-T112 · RF-03–RF-04, RF-21–RF-28, RF-33–RF-44
      Hecho cuando: el portal conserva reserva pendiente, apartados, separación, cupo telefónico e idempotencia y las cinco rutas privadas del motor mantienen permisos y respuestas.
- [ ] **M4-T114 — Probar superficie HTTP segura** · 25 min · Depende de: M4-T034, M4-T044, M4-T062, M4-T074, M4-T083 · RF-03–RF-05, RF-19, RF-26–RF-28, RF-43, RF-46–RF-47
      Hecho cuando: 400/401/403/404/409/500/503, `no-store`, límites y campos desconocidos no filtran SQL, trazas ni contacto ajeno.
- [ ] **M4-T115 — Probar fallos sin resultados parciales** · 25 min · Depende de: M4-T061, M4-T086, M4-T114 · RF-19, RF-26–RF-28, RF-42–RF-47
      Hecho cuando: fallos de lectura y escritura no parecen agendas vacías ni dejan cliente, cita, evento o intento incoherentes.

## 11. Verificación y cierre documental

- [ ] **M4-T116 — Verificar build y lint backend** · 20 min · Depende de: M4-T113–M4-T115 · RF-01–RF-47
      Hecho cuando: `npm run build` y `npm run lint` pasan en la revisión a entregar y sus resultados quedan registrados.
- [ ] **M4-T117 — Verificar suite unitaria backend** · 20 min · Depende de: M4-T116 · RF-01–RF-47
      Hecho cuando: `npm test -- --runInBand` pasa sin omitir casos relevantes y se registran conteos y revisión.
- [ ] **M4-T118 — Verificar integración backend** · 25 min · Depende de: M4-T117, M4-T112 · RF-03–RF-04, RF-13–RF-19, RF-21–RF-28, RF-29–RF-45
      Hecho cuando: `npm run test:integration -- --runInBand` pasa en bases desechables con carreras y migraciones nuevas sin skips.
- [ ] **M4-T119 — Verificar HTTP backend** · 25 min · Depende de: M4-T118 · RF-01–RF-05, RF-13–RF-19, RF-20–RF-47
      Hecho cuando: `npm run test:e2e -- --runInBand` pasa y cubre rutas nuevas y regresiones privadas y públicas afectadas.
- [ ] **M4-T120 — Verificar build y Node frontend** · 20 min · Depende de: M4-T103, M4-T119 · RF-06–RF-12, RF-13–RF-20, RF-27, RF-29–RF-30, RF-38, RF-43, RF-46–RF-47
      Hecho cuando: `npm run build` y `npm test` pasan en `frontend-saas`; no se declara lint sin script real.
- [ ] **M4-T121 — Consolidar navegador final** · 25 min · Depende de: M4-T105–M4-T109, M4-T120 · RF-01–RF-20, RF-24, RF-27, RF-29–RF-43, RF-46–RF-47
      Hecho cuando: `npm run test:browser` pasa en la revisión final y se registran navegador, casos, conteos y límites observados.
- [ ] **M4-T122 — Documentar operación y recuperación** · 20 min · Depende de: M4-T119–M4-T121 · RF-20–RF-28, RF-33–RF-35, RF-43–RF-47
      Hecho cuando: la guía indica migraciones antes de escrituras, cierre de altas nuevas, recuperación de intentos y conservación de citas e historiales sin secretos.
- [ ] **M4-T123 — Cerrar matriz RF y diez criterios** · 25 min · Depende de: M4-T112, M4-T116–M4-T122 · RF-01–RF-47
      Hecho cuando: cada RF y criterio enlaza pruebas aprobadas de la revisión actual o un pendiente explícito; la matriz incluye los ajustes RF-43–RF-45 y RF-56–RF-63 y las evidencias ALA-I001–ALA-I003. La demo y evidencia histórica no se cuentan como entrega real.
- [ ] **M4-T124 — Revisar entrega y pendientes externos** · 20 min · Depende de: M4-T123 · RF-01–RF-47
      Hecho cuando: constitución, especificación, plan, tareas y evidencias son coherentes; M3-T136 y el alcance de WhatsApp/PDF/pagos conservan su estado real sin declarar producción habilitada sin pruebas.

## Referencia de ejecución

Respetar dependencias aunque las tareas se hagan en sesiones distintas. Una tarea no se completa por haber terminado otra del mismo bloque: su criterio y evidencia deben verificarse por separado. Los grupos T01–T11 del plan guían las pruebas; los identificadores M4-T001–M4-T124 y M4-I001–M4-I003 son tareas de implementación y verificación, y no sustituyen M2-I004, M3-I001 ni ALA-I001–ALA-I003.
