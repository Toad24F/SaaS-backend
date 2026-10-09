# Tareas — Fix del módulo 1

Desglose del [plan](plan.md) y la [especificación](spec-fix.md). Los RF citados son locales a `spec-fix.md`. Todas las tareas están pendientes, duran **menos de 30 minutos de trabajo activo** y aparecen en orden de dependencia. Si una supera su estimación al ejecutarla, se divide antes de continuar. Marcar una casilla solo después de comprobar su línea **Hecho cuando:** y conservar la evidencia. Esta lista no acredita implementación ni pruebas.

## 1. Base y persistencia

- [ ] **FIX-T001 — Fijar regresión del comportamiento actual** · 20 min · Depende de: ninguna · RF-03, RF-05–RF-10  
  Hecho cuando: pruebas existentes de selección general, asignaciones, oferta y reactivación global se ejecutan y se registran sus resultados como línea base, sin atribuirles cobertura del fix.

- [ ] **FIX-T002 — Migrar campos del perfil y catálogo** · 25 min · Depende de: FIX-T001 · RF-01–RF-04  
  Hecho cuando: una migración añade especialidad, descripción y autor anulables sin cambiar valores de perfiles o servicios existentes; la autoría queda restringida al mismo negocio.

- [ ] **FIX-T003 — Migrar estados individuales** · 20 min · Depende de: FIX-T002 · RF-05–RF-06, RF-08  
  Hecho cuando: las relaciones actuales de Profesional–servicio y Profesional–sucursal tienen un estado individual activo inicial sin alterar los estados globales.

- [ ] **FIX-T004 — Migrar la relación de oferta por sucursal** · 25 min · Depende de: FIX-T003 · RF-07–RF-08, RF-10  
  Hecho cuando: la nueva relación única por Profesional, servicio y sucursal impide duplicados y referencias entre negocios o sin asignaciones válidas.

- [ ] **FIX-T005 — Poblar la oferta existente** · 20 min · Depende de: FIX-T004 · RF-07–RF-08  
  Hecho cuando: cada selección general previa aparece en todas las sucursales asignadas del mismo Profesional, incluso si un estado global la deja temporalmente sin oferta efectiva.

- [ ] **FIX-T006 — Actualizar entidades y proyecciones de perfil/catálogo** · 20 min · Depende de: FIX-T002 · RF-01–RF-04  
  Hecho cuando: las entidades representan especialidad, descripción y autor, sin duplicar identidad del Profesional en su perfil.

- [ ] **FIX-T007 — Actualizar entidades de relaciones individuales** · 25 min · Depende de: FIX-T003–FIX-T004 · RF-05–RF-08  
  Hecho cuando: las entidades expresan los dos estados individuales y la combinación por sucursal con pertenencia compuesta.

- [ ] **FIX-T008 — Sincronizar el esquema SQL de referencia** · 20 min · Depende de: FIX-T005–FIX-T007 · RF-01–RF-08  
  Hecho cuando: `db/schema.sql`, entidades y migración describen los mismos campos, claves, estados y restricciones.

- [ ] **FIX-T009 — Probar instalación y conversión de datos** · 25 min · Depende de: FIX-T008 · RF-01–RF-03, RF-07–RF-08  
  Hecho cuando: pruebas con MariaDB verifican migración desde el esquema anterior, base nueva, valores heredados, cruces prohibidos y oferta inicial sin pérdida de datos.

## 2. Perfil y catálogo compartido

- [ ] **FIX-T010 — Exigir especialidad en altas y ediciones** · 25 min · Depende de: FIX-T006, FIX-T009 · RF-01  
  Hecho cuando: el alta rechaza especialidad ausente o vacía, la próxima edición de un perfil heredado la exige y las consultas la devuelven.

- [ ] **FIX-T011 — Probar especialidad heredada y nueva** · 20 min · Depende de: FIX-T010 · RF-01  
  Hecho cuando: pruebas HTTP cubren alta válida/inválida, perfil antiguo consultable y edición antigua aceptada solo con especialidad.

- [ ] **FIX-T012 — Admitir descripción del servicio** · 20 min · Depende de: FIX-T006, FIX-T009 · RF-02  
  Hecho cuando: alta, edición y consulta aceptan descripción opcional y conservan `null` para los servicios anteriores.

- [ ] **FIX-T013 — Probar descripción en el catálogo** · 20 min · Depende de: FIX-T012 · RF-02  
  Hecho cuando: pruebas HTTP verifican descripción ausente, informada y editada sin modificar costo o duración.

- [ ] **FIX-T014 — Autorizar creación y edición por autor** · 25 min · Depende de: FIX-T006, FIX-T009 · RF-03–RF-04  
  Hecho cuando: la política distingue administrador, Profesional autor, Profesional ajeno y recepcionista; el Profesional no obtiene activación o eliminación global.

- [ ] **FIX-T015 — Crear servicio profesional de forma atómica** · 25 min · Depende de: FIX-T007, FIX-T014 · RF-03, RF-07  
  Hecho cuando: servicio, autor, selección individual, combinaciones de sucursales asignadas y auditoría se confirman juntos o se revierten juntos.

- [ ] **FIX-T016 — Probar alta compartida y su aislamiento** · 25 min · Depende de: FIX-T015 · RF-03, RF-07  
  Hecho cuando: una prueba verifica que el servicio aparece en el catálogo del negocio y solo se asigna automáticamente a su creador, con rechazo de otro negocio.

- [ ] **FIX-T017 — Permitir editar datos globales al autor** · 20 min · Depende de: FIX-T012, FIX-T014 · RF-04  
  Hecho cuando: administrador y autor pueden editar nombre, costo, duración y descripción; otro Profesional no puede, sin cambios parciales.

- [ ] **FIX-T018 — Probar permisos y autoría estable** · 25 min · Depende de: FIX-T017 · RF-04  
  Hecho cuando: pruebas cubren servicio creado por administrador, por Profesional, autor distinto, negocio ajeno y autoría que no cambia al editar.

## 3. Preferencias generales y asignaciones

- [ ] **FIX-T019 — Conservar selección general al desmarcar** · 25 min · Depende de: FIX-T007, FIX-T009 · RF-05, RF-08  
  Hecho cuando: `PUT /profesionales/:id/servicios` marca inactiva la selección retirada, preserva sus combinaciones y `GET` la muestra desmarcada; volver a marcar recupera sus ajustes.

- [ ] **FIX-T020 — Crear combinaciones al seleccionar servicio nuevo** · 20 min · Depende de: FIX-T015, FIX-T019 · RF-05, RF-07–RF-08  
  Hecho cuando: una selección nueva crea oferta inicial en las sucursales asignadas y ninguna selección habilita por sí sola un servicio globalmente inactivo.

- [ ] **FIX-T021 — Probar selección general y reintentos** · 25 min · Depende de: FIX-T020 · RF-05, RF-08  
  Hecho cuando: pruebas cubren selección vacía, desmarcado, recuperación de preferencias por sucursal, repetición sin auditoría duplicada y otro Profesional intacto.

- [ ] **FIX-T022 — Mantener combinaciones al cambiar asignaciones** · 25 min · Depende de: FIX-T020 · RF-06–RF-08  
  Hecho cuando: una sucursal asignada nueva recibe los servicios generales activos y una retirada permitida quita solo sus combinaciones; las restricciones actuales de horarios y excepciones siguen vigentes.

- [ ] **FIX-T023 — Probar alta y retiro de asignación** · 20 min · Depende de: FIX-T022 · RF-06–RF-08  
  Hecho cuando: pruebas comprueban oferta inicial en una asignación nueva, retiro válido, rechazo de retiro con horario y ausencia de cruces entre negocios.

## 4. Atención y servicios por sucursal

- [ ] **FIX-T024 — Desactivar atención individual** · 20 min · Depende de: FIX-T007, FIX-T009 · RF-06, RF-08  
  Hecho cuando: administrador o Profesional propio dejan de ofrecer atención en una sucursal asignada sin cambiar asignación, sucursal global, cupo u horarios.

- [ ] **FIX-T025 — Reactivar con validación de horarios** · 25 min · Depende de: FIX-T024 · RF-06, RF-08–RF-09  
  Hecho cuando: la reactivación recupera preferencias guardadas si horarios y excepciones son válidos; un empalme rechaza toda la operación y deja el estado anterior.

- [ ] **FIX-T026 — Exponer y probar el interruptor individual** · 25 min · Depende de: FIX-T025 · RF-06, RF-09  
  Hecho cuando: la ruta de atención acepta solo `activo` booleano, distingue actor autorizado, rechaza sucursal no asignada y no permite al Profesional cambiar el estado global.

- [ ] **FIX-T027 — Probar concurrencia de atención y horarios** · 25 min · Depende de: FIX-T026 · RF-06, RF-09  
  Hecho cuando: dos conexiones coordinadas prueban reactivación frente a edición semanal o excepción, sin empalmes confirmados ni auditoría de operación rechazada.

- [ ] **FIX-T028 — Guardar oferta individual por sucursal** · 25 min · Depende de: FIX-T020, FIX-T022, FIX-T024 · RF-07–RF-08  
  Hecho cuando: el reemplazo de `servicioIds` acepta `[]`, solo permite servicios seleccionados en general y propios del negocio, y conserva ajustes de otras sucursales.

- [ ] **FIX-T029 — Exponer y probar selección por sucursal** · 25 min · Depende de: FIX-T028 · RF-07–RF-08  
  Hecho cuando: administrador y Profesional propio pueden guardar y consultar la selección; se rechazan IDs duplicados, no seleccionados, ajenos o de sucursal no asignada sin guardado parcial.

## 5. Consulta, seguridad y cierre

- [ ] **FIX-T030 — Derivar oferta efectiva y motivos de exclusión** · 25 min · Depende de: FIX-T025, FIX-T028 · RF-05–RF-08, RF-10  
  Hecho cuando: la consulta combina cuenta, estados globales, selección general, atención individual y selección por sucursal sin duplicar el estado final persistido.

- [ ] **FIX-T031 — Exponer consulta autorizada de oferta** · 20 min · Depende de: FIX-T030 · RF-10  
  Hecho cuando: administrador y Profesional propio reciben asignaciones, estados y oferta por sucursal; un perfil ajeno no revela datos.

- [ ] **FIX-T032 — Probar matriz de estados y consulta** · 25 min · Depende de: FIX-T031 · RF-05–RF-08, RF-10  
  Hecho cuando: pruebas cubren apagado y recuperación de cada nivel, servicio por una sucursal pero no otra, oferta vacía y estados conservados al consultar.

- [ ] **FIX-T033 — Probar permisos y aislamiento transversal** · 25 min · Depende de: FIX-T018, FIX-T026, FIX-T029, FIX-T031 · RF-03–RF-10  
  Hecho cuando: la matriz de roles y dos negocios cubre todas las rutas nuevas y confirma que IDs ajenos no permiten leer o modificar datos.

- [ ] **FIX-T034 — Verificar auditoría, eliminación y carreras restantes** · 25 min · Depende de: FIX-T021, FIX-T023, FIX-T027, FIX-T033 · RF-03–RF-09  
  Hecho cuando: reintentos y operaciones opuestas producen un evento por cambio real; creación profesional y cambios globales concurrentes conservan pertenencia, y el historial impide bajas físicas indebidas.

- [ ] **FIX-T035 — Actualizar documentación de contrato y estado actual** · 20 min · Depende de: FIX-T032–FIX-T034 · RF-01–RF-10  
  Hecho cuando: las rutas y respuestas implementadas quedan documentadas sin presentar disponibilidad ni reservas como operativas; las evidencias del fix se distinguen de las históricas.

- [ ] **FIX-T036 — Ejecutar puertas de calidad y cerrar trazabilidad** · 25 min de trabajo activo · Depende de: FIX-T011, FIX-T013, FIX-T016, FIX-T018, FIX-T021, FIX-T023, FIX-T027, FIX-T029, FIX-T032–FIX-T035 · RF-01–RF-10  
  Hecho cuando: `npm run build`, `npm run lint` y las pruebas relevantes pasan; cada RF tiene evidencia nueva y todo fallo o pendiente queda registrado.
