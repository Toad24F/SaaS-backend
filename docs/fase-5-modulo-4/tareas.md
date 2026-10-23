# Tareas — Fase 5, Módulo 4: Panel de Control y Gestión Operativa

Ejecutar la [constitución](constitucion-modulo-4.md), la [especificación](spec.md) y el [plan](plan.md) en ese orden de precedencia, conservando los contratos compatibles de los módulos 2 y 3. Los RF citados son locales a `spec.md`. Todas las estimaciones son menores de 30 minutos y todas las casillas comienzan sin marcar. Cada tarea se marca solo al cumplir su propia línea «Hecho cuando:» y registrar revisión, comando y resultado en `resultados-tareas/`. M3-T136 continúa independiente; M2-I004/M3-I001 solo se acreditan con el escritor manual real.

## 1. Base y pruebas reproducibles

- [ ] **M4-T001 — Crear matriz RF y criterios** · 20 min · Depende de: ninguna · RF-01–RF-47
      Hecho cuando: la matriz enumera los 47 RF y diez criterios, los vincula a tareas y pruebas previstas y separa evidencia nueva de antecedentes.
- [ ] **M4-T002 — Inventariar contratos conservados** · 20 min · Depende de: M4-T001 · RF-01–RF-05, RF-21–RF-23, RF-28, RF-33–RF-35
      Hecho cuando: quedan identificados roles, licencia, cinco rutas privadas, escritor público, motor manual y orden de bloqueos sin atribuirles cobertura del módulo 4.
- [ ] **M4-T003 — Preparar base desechable de integración** · 20 min · Depende de: M4-T002 · RF-03, RF-26, RF-28, RF-44
      Hecho cuando: el ejecutor crea y elimina una base identificada como test y rechaza conectarse a la base cotidiana.
- [ ] **M4-T004 — Sembrar dos negocios y varios perfiles** · 25 min · Depende de: M4-T003 · RF-02–RF-04, RF-17, RF-23, RF-40
      Hecho cuando: los fixtures generan dos negocios, sucursales con zonas distintas, Profesional compartido, cinco estados y teléfonos repetidos con limpieza comprobada.
- [ ] **M4-T005 — Preparar reloj y fallos controlados** · 20 min · Depende de: M4-T004 · RF-26–RF-27, RF-31, RF-34–RF-35, RF-42
      Hecho cuando: las pruebas fijan instantes antes, en y después de los límites y pueden forzar rollback sin cambiar el reloj del sistema.
- [ ] **M4-T006 — Preparar dos conexiones y barreras** · 25 min · Depende de: M4-T003, M4-T005 · RF-23, RF-28, RF-33–RF-35, RF-40, RF-44
      Hecho cuando: un caso de control demuestra espera y liberación reproducible entre conexiones independientes y cierra ambas aun si falla.

## 2. Persistencia aditiva y modelo

- [ ] **M4-T007 — Migrar versión de citas** · 20 min · Depende de: M4-T003, M4-T002 · RF-29–RF-30, RF-38, RF-43
      Hecho cuando: citas existentes reciben versión 1 sin alterar estado, folio, intervalos, costo ni contacto.
- [ ] **M4-T008 — Migrar versión de clientes** · 15 min · Depende de: M4-T003, M4-T002 · RF-18–RF-19, RF-43
      Hecho cuando: cada ficha recibe versión 1 y el teléfono conserva su índice no único.
- [ ] **M4-T009 — Migrar intentos manuales** · 25 min · Depende de: M4-T003, M4-T002 · RF-20, RF-24, RF-26–RF-28
      Hecho cuando: la tabla representa clave única por negocio y actor, huella, tres estados y resultado opcional sin guardar contacto ni notas.
- [ ] **M4-T010 — Migrar eventos de cita** · 25 min · Depende de: M4-T003, M4-T002 · RF-24, RF-29–RF-36, RF-41, RF-45
      Hecho cuando: el historial admite actor de personal o sesión pública, valores anterior/nuevo y motivo opcional sin sobrescribir eventos.
- [ ] **M4-T011 — Extender auditoría de clientes** · 15 min · Depende de: M4-T003, M4-T002 · RF-15, RF-18, RF-45
      Hecho cuando: la restricción de auditoría admite recurso `cliente` y sigue rechazando tipos no previstos.
- [ ] **M4-T012 — Añadir referencias e índices del nuevo modelo** · 25 min · Depende de: M4-T007–M4-T011 · RF-03, RF-17, RF-27, RF-43, RF-45
      Hecho cuando: intentos y eventos no pueden enlazar actor, cita o sesión de otro negocio y sus consultas tienen índices acotados.
- [ ] **M4-T013 — Representar versiones en entidades** · 15 min · Depende de: M4-T007–M4-T008 · RF-18, RF-30, RF-38, RF-43
      Hecho cuando: las entidades de cita y cliente reflejan las columnas de versión sin alterar snapshots existentes.
- [ ] **M4-T014 — Representar intentos y eventos en entidades** · 25 min · Depende de: M4-T009–M4-T012 · RF-24, RF-27, RF-30, RF-36, RF-41, RF-45
      Hecho cuando: las entidades reflejan estados, índices, referencias y nulabilidad de las migraciones.
- [ ] **M4-T015 — Sincronizar esquema de referencia** · 20 min · Depende de: M4-T012–M4-T014 · RF-03, RF-18, RF-24, RF-43, RF-45
      Hecho cuando: `db/schema.sql`, entidades y migraciones describen las mismas columnas y restricciones nuevas.
- [ ] **M4-T016 — Probar instalación limpia** · 25 min · Depende de: M4-T015 · RF-03, RF-15–RF-19, RF-24, RF-45
      Hecho cuando: todas las migraciones aplican en una base vacía desechable y sus FKs y versiones se consultan correctamente.
- [ ] **M4-T017 — Probar actualización desde fase 4** · 25 min · Depende de: M4-T015 · RF-18, RF-24–RF-25, RF-41, RF-45
      Hecho cuando: una base de fase 4 conserva clientes, citas, apartados, intentos, folios y snapshots sin inventar datos faltantes.
- [ ] **M4-T018 — Probar restricciones cruzadas y rollback** · 25 min · Depende de: M4-T016–M4-T017 · RF-03, RF-19, RF-26, RF-45
      Hecho cuando: referencias de otro negocio y eventos parciales fallan sin dejar filas nuevas.
- [ ] **M4-T019 — Auditar alta pública en su commit** · 25 min · Depende de: M4-T010, M4-T014 · RF-24, RF-37, RF-45
      Hecho cuando: cada cita pública nueva crea un solo evento de alta con identidad pública comprobada en el mismo commit y la regresión pública sigue aprobada.

## 3. Autorización y respuestas privadas

- [ ] **M4-T020 — Definir permisos operativos cerrados** · 20 min · Depende de: M4-T002 · RF-01–RF-05, RF-13–RF-14, RF-20, RF-29, RF-38
      Hecho cuando: Administración y Recepción tienen permisos de gestión, Profesional solo lectura propia y Superadmin no hereda acceso a citas.
- [ ] **M4-T021 — Revalidar identidad y negocio por operación** · 25 min · Depende de: M4-T020 · RF-01–RF-04, RF-13, RF-20, RF-29
      Hecho cuando: cada caso de uso reconstruye sesión, rol, negocio y licencia actuales sin usar `negocioId` del cuerpo o JWT como autorización suficiente.
- [ ] **M4-T022 — Probar alcance por rol** · 25 min · Depende de: M4-T021, M4-T004 · RF-01–RF-05, RF-13–RF-14, RF-29
      Hecho cuando: dos negocios y los tres roles prueban lectura propia, denegación de escritura Profesional y ausencia de datos cruzados.
- [ ] **M4-T023 — Probar licencia y sesión abierta** · 25 min · Depende de: M4-T021, M4-T005 · RF-04–RF-05, RF-20, RF-34
      Hecho cuando: vencimiento y suspensión en su límite exacto niegan operaciones nuevas incluso con sesión anterior.
- [ ] **M4-T024 — Normalizar errores operativos seguros** · 20 min · Depende de: M4-T021 · RF-05, RF-19, RF-23, RF-26–RF-27, RF-43, RF-46–RF-47
      Hecho cuando: inválido, ajeno, conflicto, temporal e inesperado producen mensajes distintos sin SQL, trazas ni contacto ajeno.

## 4. Consulta de agenda e historial

- [ ] **M4-T025 — Validar rango y filtros de agenda** · 20 min · Depende de: M4-T021 · RF-06–RF-08, RF-46–RF-47
      Hecho cuando: se admiten hasta 31 fechas inclusivas y se rechazan fechas, filtros o campos desconocidos sin consultar datos.
- [ ] **M4-T026 — Listar citas por negocio y periodo** · 25 min · Depende de: M4-T025, M4-T013 · RF-01, RF-03, RF-06, RF-09
      Hecho cuando: la consulta devuelve todos los estados del negocio dentro del periodo y nunca citas ajenas.
- [ ] **M4-T027 — Acotar consulta del Profesional** · 20 min · Depende de: M4-T026, M4-T020 · RF-02–RF-03, RF-07, RF-09
      Hecho cuando: un Profesional solo recibe sus citas y su contacto/notas aunque manipule el filtro de personal.
- [ ] **M4-T028 — Proyectar fecha y zona de sucursal** · 25 min · Depende de: M4-T026 · RF-06–RF-07, RF-09
      Hecho cuando: una cita aparece en su fecha local correcta aun cuando sucursales distintas compartan instante UTC.
- [ ] **M4-T029 — Aplicar filtros de sucursal, personal y estado** · 20 min · Depende de: M4-T027–M4-T028 · RF-08–RF-09, RF-46
      Hecho cuando: cada filtro y su combinación limitan resultados sin excluir canceladas salvo petición expresa.
- [ ] **M4-T030 — Buscar por paciente y paginar** · 25 min · Depende de: M4-T029 · RF-03, RF-08, RF-46–RF-47
      Hecho cuando: búsqueda y páginas permanecen dentro del negocio y tienen orden estable sin devolver listados ilimitados.
- [ ] **M4-T031 — Incorporar causas de citas afectadas** · 20 min · Depende de: M4-T026, M4-T002 · RF-09, RF-11, RF-46
      Hecho cuando: causas actuales se muestran para citas afectadas sin cambiar horario ni estado y desaparecen al cesar la causa.
- [ ] **M4-T032 — Consultar detalle autorizado** · 20 min · Depende de: M4-T027 · RF-02–RF-03, RF-07, RF-29
      Hecho cuando: el detalle muestra origen, estado y snapshot propio, y un ID ajeno equivale a uno inexistente.
- [ ] **M4-T033 — Consultar historial de una cita** · 20 min · Depende de: M4-T010, M4-T014, M4-T032 · RF-30, RF-32, RF-36, RF-41, RF-45
      Hecho cuando: eventos se ordenan por momento y versión y solo se muestran a personal autorizado de ese negocio.
- [ ] **M4-T034 — Exponer rutas de agenda y detalle** · 25 min · Depende de: M4-T025–M4-T033, M4-T024 · RF-01–RF-09, RF-11, RF-29, RF-45–RF-47
      Hecho cuando: lista, detalle e historial responden bajo guardas privadas y `no-store`, sin rutas públicas nuevas.
- [ ] **M4-T035 — Probar filtros, estados y zonas** · 25 min · Depende de: M4-T034, M4-T004 · RF-02–RF-03, RF-06–RF-09, RF-29
      Hecho cuando: día, semana y mes se reconstruyen desde consultas acotadas y cinco estados y zonas aparecen en la fecha correcta.
- [ ] **M4-T036 — Probar vacío frente a fallo de agenda** · 20 min · Depende de: M4-T034, M4-T024 · RF-05, RF-46–RF-47
      Hecho cuando: una consulta válida sin citas devuelve vacío, mientras un fallo técnico informa error sin resultado parcial.

## 5. Directorio de clientes

- [ ] **M4-T037 — Validar datos de cliente** · 20 min · Depende de: M4-T021 · RF-15, RF-17, RF-19, RF-47
      Hecho cuando: nombre y teléfono siguen límites y normalización acordados, rechazan campos desconocidos y nunca fusionan por teléfono.
- [ ] **M4-T038 — Buscar fichas por negocio** · 20 min · Depende de: M4-T037, M4-T013 · RF-03, RF-13, RF-17
      Hecho cuando: nombre y teléfono devuelven fichas paginadas del negocio, incluso varias con el mismo número.
- [ ] **M4-T039 — Consultar ficha e historial** · 20 min · Depende de: M4-T038, M4-T026 · RF-13–RF-14, RF-18
      Hecho cuando: el historial usa el ID propio de cliente y muestra solo citas del mismo negocio.
- [ ] **M4-T040 — Dar de alta ficha independiente** · 20 min · Depende de: M4-T037, M4-T021 · RF-15, RF-17, RF-19, RF-45
      Hecho cuando: se crea una ficha sin cita con teléfono compartible y un fallo no deja ficha parcial.
- [ ] **M4-T041 — Corregir ficha con versión observada** · 25 min · Depende de: M4-T040, M4-T013 · RF-18–RF-19, RF-43, RF-45
      Hecho cuando: una versión anterior recibe conflicto y una corrección válida no modifica snapshots de citas.
- [ ] **M4-T042 — Auditar alta y corrección de cliente** · 20 min · Depende de: M4-T011, M4-T041 · RF-15, RF-18, RF-45
      Hecho cuando: alta y cambio efectivos crean un evento con actor y valores permitidos dentro del mismo commit, sin secretos.
- [ ] **M4-T043 — Resolver elección de cliente existente** · 20 min · Depende de: M4-T039, M4-T021 · RF-03, RF-16–RF-17, RF-20
      Hecho cuando: un ID propio identifica exactamente una ficha y un ID ajeno no se sustituye por una coincidencia telefónica.
- [ ] **M4-T044 — Exponer rutas privadas de clientes** · 25 min · Depende de: M4-T038–M4-T043, M4-T024 · RF-13–RF-19, RF-43, RF-45–RF-47
      Hecho cuando: lista, ficha, historial, alta y corrección aplican permisos, versiones y `no-store`.
- [ ] **M4-T045 — Probar teléfonos compartidos** · 20 min · Depende de: M4-T044, M4-T004 · RF-15–RF-17, RF-19
      Hecho cuando: dos fichas con el mismo teléfono conservan IDs y nombres distintos y la selección exige ID explícito.
- [ ] **M4-T046 — Probar snapshots ante corrección** · 20 min · Depende de: M4-T044, M4-T004 · RF-14, RF-18, RF-43, RF-45
      Hecho cuando: editar la ficha no altera contacto de citas previas y una segunda edición con versión vieja recibe 409.
- [ ] **M4-T047 — Probar aislamiento del directorio** · 20 min · Depende de: M4-T044, M4-T022 · RF-03, RF-13–RF-14, RF-19
      Hecho cuando: negocio ajeno y Profesional no leen ni corrigen fichas y la respuesta no revela su existencia.

## 6. Escritor manual e intentos

- [ ] **M4-T048 — Validar selección y contacto manual** · 25 min · Depende de: M4-T037, M4-T043, M4-T002 · RF-16–RF-17, RF-20–RF-21, RF-47
      Hecho cuando: se admite cliente propio o nuevo, fecha/hora y notas; se rechazan precio, fin, zona y IDs ajenos enviados como autoridad.
- [ ] **M4-T049 — Preparar intento bajo actor y negocio** · 25 min · Depende de: M4-T009, M4-T014, M4-T048, M4-T021 · RF-03, RF-20, RF-27, RF-43
      Hecho cuando: una clave opaca crea una sola fila preparada con huella y sin contacto persistido.
- [ ] **M4-T050 — Deduplicar clave y contenido** · 20 min · Depende de: M4-T049 · RF-24, RF-27, RF-43
      Hecho cuando: misma clave y contenido reutilizan intento; contenido diferente recibe 409 sin cambiar su fila.
- [ ] **M4-T051 — Integrar bloqueo común del escritor** · 25 min · Depende de: M4-T006, M4-T049, M4-T002 · RF-21–RF-23, RF-28, RF-44
      Hecho cuando: intento precede recursos de dominio y la fila del Profesional serializa sucursales y servicios con `READ COMMITTED`.
- [ ] **M4-T052 — Revalidar selección tras la espera** · 25 min · Depende de: M4-T051, M4-T048 · RF-21–RF-23, RF-28, RF-44
      Hecho cuando: el mismo manager relee licencia, oferta, duración, horario, bloqueos y ocupaciones antes de escribir.
- [ ] **M4-T053 — Copiar costo y nombres actuales** · 20 min · Depende de: M4-T052 · RF-24–RF-25, RF-44
      Hecho cuando: la copia toma costo y nombres vigentes al registro y no admite valores autoritativos del navegador.
- [ ] **M4-T054 — Vincular cliente propio o crear uno nuevo** · 25 min · Depende de: M4-T052, M4-T043 · RF-16–RF-17, RF-24, RF-26
      Hecho cuando: un cliente existente se relee por negocio y uno nuevo se crea dentro de la transacción de la cita.
- [ ] **M4-T055 — Crear cita manual con folio único** · 25 min · Depende de: M4-T053–M4-T054, M4-T013 · RF-23–RF-25, RF-28
      Hecho cuando: la cita queda Confirmada con inicio, fin, zona, costo y contacto históricos y un folio no duplicado.
- [ ] **M4-T056 — Registrar evento inicial manual** · 20 min · Depende de: M4-T055, M4-T010, M4-T014 · RF-24, RF-45
      Hecho cuando: el alta manual tiene un evento con actor real y versión inicial en la misma transacción.
- [ ] **M4-T057 — Confirmar resultado e intento juntos** · 20 min · Depende de: M4-T055–M4-T056 · RF-24, RF-26–RF-27
      Hecho cuando: cliente nuevo, cita, evento e intento registrado aparecen juntos o ninguno aparece tras fallo.
- [ ] **M4-T058 — Repetir resultado ya registrado** · 20 min · Depende de: M4-T057, M4-T050 · RF-24, RF-27, RF-43
      Hecho cuando: repetir la misma clave y contenido devuelve el mismo folio sin crear cliente, cita o evento adicionales.
- [ ] **M4-T059 — Resolver intento frente al escritor** · 25 min · Depende de: M4-T057, M4-T051 · RF-26–RF-27, RF-44, RF-46
      Hecho cuando: el resolutor espera al escritor o responde 503 y nunca declara fracaso por ausencia sin exclusión.
- [ ] **M4-T060 — Cerrar ausencia terminal y petición tardía** · 25 min · Depende de: M4-T059, M4-T050 · RF-27, RF-43–RF-44
      Hecho cuando: `no_registrado` queda durable y una preparación o escritura tardía de la misma clave no crea cita.
- [ ] **M4-T061 — Probar rollback entre escrituras** · 25 min · Depende de: M4-T057, M4-T005 · RF-24, RF-26–RF-27, RF-45
      Hecho cuando: fallos tras cada inserción revierten cliente nuevo, cita, evento y resultado, permitiendo reintentar la misma clave preparada.
- [ ] **M4-T062 — Exponer preparación, registro y resolución** · 25 min · Depende de: M4-T058–M4-T060, M4-T024 · RF-20, RF-22–RF-28, RF-43–RF-47
      Hecho cuando: tres rutas privadas aplican rol, origen del actor, `no-store` y respuestas de creación, repetición, conflicto e incertidumbre.
- [ ] **M4-T063 — Probar reserva manual válida** · 25 min · Depende de: M4-T062, M4-T004 · RF-16–RF-17, RF-20–RF-25
      Hecho cuando: servicio dentro de horario crea exactamente una cita Confirmada con cliente elegido o nuevo y snapshot correcto.
- [ ] **M4-T064 — Probar ocupaciones de otras sucursales** · 25 min · Depende de: M4-T063, M4-T006 · RF-21–RF-23, RF-28
      Hecho cuando: intervalos iguales y parciales del mismo Profesional se rechazan entre sucursales y extremos contiguos se aceptan.
- [ ] **M4-T065 — Probar cambios durante la espera** · 25 min · Depende de: M4-T063, M4-T006 · RF-21–RF-26, RF-44
      Hecho cuando: cambios de licencia, oferta, costo, duración y horario confirmados primero se observan antes del registro y no dejan filas parciales.
- [ ] **M4-T066 — Probar recuperación HTTP incierta** · 25 min · Depende de: M4-T062, M4-T005 · RF-26–RF-27, RF-43–RF-47
      Hecho cuando: pérdida antes y después del commit devuelve ausencia terminal o el mismo folio, nunca otra cita.

## 7. Ciclo de vida e historial

- [ ] **M4-T067 — Validar entrada de cambio de estado** · 20 min · Depende de: M4-T013, M4-T021 · RF-29–RF-32, RF-43, RF-47
      Hecho cuando: solo se admiten cinco estados, versión y motivo opcional válido; se rechazan campos desconocidos.
- [ ] **M4-T068 — Comprobar versión antes de modificar** · 20 min · Depende de: M4-T067 · RF-30, RF-36, RF-43
      Hecho cuando: una versión vieja devuelve 409 y deja estado, versión e historial sin cambios.
- [ ] **M4-T069 — Cambiar Pendiente y Confirmada** · 20 min · Depende de: M4-T068, M4-T010 · RF-29–RF-30, RF-36–RF-37, RF-45
      Hecho cuando: un cambio efectivo guarda nuevo estado y evento; repetir el mismo estado con versión vigente no duplica evento.
- [ ] **M4-T070 — Restringir Completada y No asistió** · 20 min · Depende de: M4-T069, M4-T005 · RF-30–RF-33, RF-36
      Hecho cuando: antes de `fin_utc` se rechazan ambos estados y desde el límite exacto se admiten sin liberar ocupación.
- [ ] **M4-T071 — Cancelar bajo el bloqueo del Profesional** · 25 min · Depende de: M4-T068, M4-T051 · RF-30, RF-32–RF-33, RF-43–RF-45
      Hecho cuando: cancelar conserva la cita y libera solo su ocupación tras confirmar versión y evento en la misma transacción.
- [ ] **M4-T072 — Reactivar cita futura** · 25 min · Depende de: M4-T071, M4-T052 · RF-30, RF-33–RF-35, RF-44
      Hecho cuando: solo un inicio futuro con licencia, oferta y horario vigentes y sin solapamiento puede volver a ocupar.
- [ ] **M4-T073 — Conservar motivo opcional y correcciones** · 20 min · Depende de: M4-T070–M4-T072 · RF-32, RF-36, RF-45
      Hecho cuando: el historial muestra motivo solo si se proporcionó y conserva estado anterior, nuevo, actor e instante.
- [ ] **M4-T074 — Exponer cambio de estado** · 20 min · Depende de: M4-T067–M4-T073, M4-T024 · RF-29–RF-37, RF-43–RF-47
      Hecho cuando: la ruta privada aplica versión, permisos y errores seguros y devuelve el nuevo estado confirmado.
- [ ] **M4-T075 — Probar cinco estados y límite temporal** · 25 min · Depende de: M4-T074, M4-T005 · RF-29–RF-33, RF-36–RF-37
      Hecho cuando: antes/en/después del fin se observan transiciones permitidas y solo Cancelada libera el intervalo.
- [ ] **M4-T076 — Probar cancelación y reactivación concurrentes** · 25 min · Depende de: M4-T074, M4-T006 · RF-33–RF-35, RF-43–RF-45
      Hecho cuando: una reserva rival y una reactivación del mismo horario dejan una sola ocupación incompatible y eventos reales únicos.

## 8. Cambio de horario

- [ ] **M4-T077 — Autorizar exclusión de cita propia en el motor** · 25 min · Depende de: M4-T052, M4-T068 · RF-03, RF-38–RF-40, RF-44
      Hecho cuando: solo una cita comprobada del negocio y Profesional puede excluir su intervalo al evaluar el destino.
- [ ] **M4-T078 — Validar con duración original** · 25 min · Depende de: M4-T077 · RF-38–RF-40
      Hecho cuando: mover una cita usa su duración guardada aunque el servicio haya cambiado y no modifica su costo histórico.
- [ ] **M4-T079 — Validar entrada de fecha y hora nuevas** · 20 min · Depende de: M4-T078 · RF-38–RF-39, RF-42, RF-47
      Hecho cuando: se rechazan fecha pasada, hora ambigua o inexistente y cambios de servicio, sucursal, Profesional, precio o fin enviados por cliente.
- [ ] **M4-T080 — Bloquear cita y comprobar versión** · 20 min · Depende de: M4-T079, M4-T051 · RF-38, RF-40, RF-43–RF-44
      Hecho cuando: una versión vieja o cita ajena no modifica el horario y el bloqueo sigue el orden compartido.
- [ ] **M4-T081 — Revalidar destino completo** · 25 min · Depende de: M4-T080, M4-T078 · RF-39–RF-40, RF-44
      Hecho cuando: oferta, licencia, horario, bloqueos y ocupaciones de cualquier sucursal se releen antes de aceptar el destino.
- [ ] **M4-T082 — Guardar movimiento e historial atómicos** · 25 min · Depende de: M4-T081, M4-T010 · RF-38, RF-41–RF-43, RF-45
      Hecho cuando: extremos, zona y versión cambian junto con un evento anterior/nuevo bajo el mismo folio, o ninguno cambia.
- [ ] **M4-T083 — Exponer cambio privado de horario** · 20 min · Depende de: M4-T082, M4-T024 · RF-38–RF-43, RF-47
      Hecho cuando: la ruta acepta solo fecha, hora y versión y responde conflicto o resultado autorizado sin datos internos.
- [ ] **M4-T084 — Probar zona y horario inválido** · 25 min · Depende de: M4-T083, M4-T005 · RF-38–RF-39, RF-42
      Hecho cuando: cambios de hora, inicio pasado y cierre de atención se rechazan sin alterar cita o historial.
- [ ] **M4-T085 — Probar conflicto y extremos contiguos** · 25 min · Depende de: M4-T083, M4-T004 · RF-39–RF-42, RF-44
      Hecho cuando: solapamiento parcial en otra sucursal se rechaza y un extremo contiguo válido conserva un solo folio.
- [ ] **M4-T086 — Probar rollback y versión obsoleta** · 25 min · Depende de: M4-T083, M4-T005 · RF-41–RF-43, RF-45
      Hecho cuando: fallo entre actualización y evento revierte horario, versión e historial, y edición vieja recibe 409.
- [ ] **M4-T087 — Probar movimiento contra apartado público** · 25 min · Depende de: M4-T083, M4-T006 · RF-40, RF-43–RF-44
      Hecho cuando: dos conexiones dejan el apartado o el nuevo horario, nunca ambas ocupaciones incompatibles.

## 9. Frontend conectado

- [ ] **M4-T088 — Habilitar navegación por rol** · 20 min · Depende de: M4-T034, M4-T044 · RF-01–RF-03, RF-06, RF-13
      Hecho cuando: Agenda y Clientes aparecen en conectado solo para roles autorizados, y Profesional no recibe el directorio.
- [ ] **M4-T089 — Crear cliente HTTP de agenda y clientes** · 25 min · Depende de: M4-T034, M4-T044, M4-T088 · RF-03, RF-06–RF-09, RF-13–RF-14, RF-46–RF-47
      Hecho cuando: las vistas usan respuestas reales y no reemplazan fallos con datos de demo.
- [ ] **M4-T090 — Conectar vistas día, semana y mes** · 25 min · Depende de: M4-T089 · RF-06–RF-07, RF-09, RF-12
      Hecho cuando: las tres vistas muestran citas reales y dividen consultas que excedan 31 fechas.
- [ ] **M4-T091 — Conectar filtros y búsqueda de agenda** · 20 min · Depende de: M4-T090 · RF-08–RF-09, RF-46
      Hecho cuando: sucursal, Profesional, estado y nombre actualizan la vista sin mezclar resultados de solicitudes fuera de orden.
- [ ] **M4-T092 — Conectar detalle e historial de cita** · 20 min · Depende de: M4-T090, M4-T033 · RF-02, RF-07, RF-29, RF-32, RF-36, RF-41
      Hecho cuando: detalle muestra origen, estado, contacto autorizado, notas e historial real bajo la zona correspondiente.
- [ ] **M4-T093 — Construir formulario manual conectado** · 25 min · Depende de: M4-T089, M4-T062 · RF-16, RF-20–RF-21, RF-24
      Hecho cuando: el formulario permite cliente existente o nuevo y no calcula precio, fin ni disponibilidad como autoridad local.
- [ ] **M4-T094 — Conectar selección de disponibilidad manual** · 25 min · Depende de: M4-T093, M4-T002 · RF-20–RF-23, RF-46
      Hecho cuando: solo horarios devueltos por el motor privado pueden seleccionarse y un fallo no aparece como agenda llena.
- [ ] **M4-T095 — Conectar preparación y recuperación manual** · 25 min · Depende de: M4-T093–M4-T094, M4-T062 · RF-24, RF-26–RF-27, RF-43
      Hecho cuando: doble envío o recarga incierta resuelven la misma clave antes de permitir otra cita y no duplican folio.
- [ ] **M4-T096 — Conectar cambio de estado** · 20 min · Depende de: M4-T092, M4-T074 · RF-29–RF-37, RF-43
      Hecho cuando: solo Administración y Recepción ven controles, muestran motivo opcional y manejan versión obsoleta sin sobrescribir.
- [ ] **M4-T097 — Conectar cambio de horario** · 25 min · Depende de: M4-T092, M4-T083 · RF-38–RF-43
      Hecho cuando: se editan solo fecha y hora, se conserva folio y un rechazo mantiene el horario anterior visible.
- [ ] **M4-T098 — Conectar listado e historial de clientes** · 20 min · Depende de: M4-T089, M4-T044 · RF-13–RF-14, RF-17
      Hecho cuando: búsqueda y detalle muestran datos reales del negocio, incluidos teléfonos compartidos sin fusionarlos.
- [ ] **M4-T099 — Conectar alta y corrección de ficha** · 25 min · Depende de: M4-T098 · RF-15, RF-18–RF-19, RF-43
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
      Hecho cuando: solapamientos UTC parciales entre sucursales producen una sola ocupación y los extremos contiguos siguen válidos.
- [ ] **M4-T112 — Consolidar M2-I004 y M3-I001** · 20 min · Depende de: M4-T110–M4-T111 · RF-21–RF-23, RF-28, RF-33–RF-35, RF-40, RF-44
      Hecho cuando: se anexan revisión, comandos, barreras y filas finales a ambos identificadores sin usar dobles ni marcar otros casos ajenos.
- [ ] **M4-T113 — Repetir regresión pública y privada** · 25 min · Depende de: M4-T019, M4-T074, M4-T083, M4-T112 · RF-03–RF-04, RF-21–RF-28, RF-33–RF-44
      Hecho cuando: el portal conserva reserva pendiente, apartados e idempotencia y las cinco rutas privadas del motor mantienen permisos y respuestas.
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
      Hecho cuando: cada RF y criterio enlaza pruebas aprobadas de la revisión actual o un pendiente explícito; la demo y evidencia histórica no se cuentan como entrega real.
- [ ] **M4-T124 — Revisar entrega y pendientes externos** · 20 min · Depende de: M4-T123 · RF-01–RF-47
      Hecho cuando: constitución, especificación, plan, tareas y evidencias son coherentes; M3-T136 y el alcance de WhatsApp/PDF/pagos conservan su estado real sin declarar producción habilitada sin pruebas.

## Referencia de ejecución

Respetar dependencias aunque las tareas se hagan en sesiones distintas. Una tarea no se completa por haber terminado otra del mismo bloque: su criterio y evidencia deben verificarse por separado. Los grupos T01–T11 del plan guían las pruebas; los identificadores M4-T001–M4-T124 son tareas de implementación y no sustituyen M2-I004 ni M3-I001.
