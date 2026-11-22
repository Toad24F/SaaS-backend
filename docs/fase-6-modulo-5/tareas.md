# Tareas — Fase 6, Módulo 5

## Reglas de ejecución

Desglose del [plan](plan.md), conforme a la [constitución](constitucion-modulo-5.md) y la [especificación](spec.md). Todas las casillas comienzan pendientes. Los RF son locales a este módulo; una tarea de soporte asociada a un RF no acredita por sí sola todo el requisito.

- Estimaciones de trabajo activo de 15–25 minutos por tarea, incluyendo su comprobación focalizada y evidencia. No son garantía de duración. Si una tarea no cabe en menos de 30 minutos, dividirla antes de ejecutarla en subtareas con IDs derivados, dependencias y criterios propios; conservar la tarea padre pendiente hasta completar todas.
- Las dependencias indicadas son obligatorias; las transitivas se heredan. El orden listado es válido. Las ramas sin dependencia mutua pueden avanzar de forma independiente, sin que esto autorice delegación ni ejecución automática.
- Cada tarea exige, además de su línea «Hecho cuando:», evidencia en `resultados-tareas/<id>.md` (o sección identificada de un lote), con revisión, archivos, comando/verificación y resultado real. No marcar por una intención, demo, test saltado o evidencia anterior.
- Las tareas de persistencia mantienen coherentes migraciones nuevas, entidades y `db/schema.sql` según el alcance de cada paso. No ejecutar migraciones ni pruebas con escritura en la base cotidiana: usar únicamente bases desechables test.
- Una dependencia externa no resuelta deja la casilla pendiente; separar la solicitud/configuración de la espera del proveedor. Para la prueba real de recordatorio usar una cita test que ya cumpla la anticipación: no esperar 12–48 horas ni cambiar las reglas para hacer pasar la prueba.
- En suites largas, dividir previamente por archivos/grupos hasta obtener ejecuciones de menos de 30 minutos, conservar la suma de evidencias y no declarar completa la suite por un lanzamiento o una fracción aprobada. Las tareas de cierre validan resultados; corregir fallos requiere subtareas adicionales, no ocultarlos dentro de la estimación.
- No modificar producto al completar este documento. No marcar una fase cerrada ni habilitar producción sin sus criterios y evidencias. Los cambios del frontend pertenecen al repositorio hermano y deben seguir sus instrucciones.

## 1. Preparación y contratos

Evidencia del lote [M5-T001–M5-T007](resultados-tareas/m5-t001-t007.md).

- [x] **M5-T001 — Revisar dependencias normativas y evidencias previas** (15 min).
  - **RF:** RF-01–RF-62. **Depende de:** ninguna.
  - **Hecho cuando:** Existe una nota que identifica contratos vigentes, tareas previas pendientes y restricciones aplicables.

- [x] **M5-T002 — Preparar matriz de aceptación** (20 min).
  - **RF:** RF-01–RF-62. **Depende de:** M5-T001.
  - **Hecho cuando:** La matriz contiene los 62 RF y los 15 criterios de spec, sin atribuir resultados todavía.

- [x] **M5-T003 — Preparar datos reutilizables de prueba** (25 min).
  - **RF:** RF-02, RF-15, RF-61. **Depende de:** M5-T001.
  - **Hecho cuando:** Una base desechable identificada como test admite dos negocios, cuatro roles y dos profesionales sin utilizar datos reales.

- [x] **M5-T004 — Preparar reloj y barreras reutilizables** (25 min).
  - **RF:** RF-07, RF-45, RF-62. **Depende de:** M5-T003.
  - **Hecho cuando:** Un caso de prueba demuestra avance controlado del reloj y sincronización de dos conexiones.

- [x] **M5-T005 — Registrar contratos HTTP y errores del módulo** (25 min).
  - **RF:** RF-01–RF-62. **Depende de:** M5-T001.
  - **Hecho cuando:** La nota enumera entradas, salidas, permisos y errores de las rutas previstas sin presentarlas como implementadas.

- [x] **M5-T006 — Verificar contrato vigente del proveedor** (25 min).
  - **RF:** RF-31–RF-38, RF-61. **Depende de:** M5-T005.
  - **Hecho cuando:** Se registran versión Graph elegida, fuentes oficiales, payload del botón, firma y requisitos de consentimiento; faltantes externos quedan explícitos.

- [x] **M5-T007 — Seleccionar dependencia de saneado raster** (25 min).
  - **RF:** RF-28, RF-30. **Depende de:** M5-T005.
  - **Hecho cuando:** Se documentan compatibilidad con Node, formatos admitidos y alternativa descartada, sin cambiar el stack del frontend.

## 2. Clientes: persistencia y resolución

Evidencia del lote [M5-T008–M5-T013](resultados-tareas/m5-t008-t013.md).

- [x] **M5-T008 — Implementar normalización compartida de identidad** (25 min).
  - **RF:** RF-15–RF-16, RF-19. **Depende de:** M5-T003.
  - **Hecho cuando:** Casos focalizados demuestran NFC, espacios y mayúsculas equivalentes, y distinción de acentos, ñ y signos.

- [x] **M5-T009 — Preparar migración aditiva de clientes** (25 min).
  - **RF:** RF-15, RF-23–RF-24, RF-59. **Depende de:** M5-T008.
  - **Hecho cuando:** La migración añade normalización y referencia de fusión sin índice único prematuro, sin borrar filas.

- [x] **M5-T010 — Alinear entidad y esquema de clientes** (25 min).
  - **RF:** RF-15, RF-23–RF-24, RF-59. **Depende de:** M5-T009.
  - **Hecho cuando:** Entidad y schema.sql reflejan los mismos campos, tipos binarios, versiones y referencias.

- [x] **M5-T011 — Preparar persistencia de operaciones de unión** (25 min).
  - **RF:** RF-20–RF-22, RF-60–RF-62. **Depende de:** M5-T010.
  - **Hecho cuando:** Migración, entidad y esquema contienen origen, destino, versiones, actor y unicidad de operación.

- [x] **M5-T012 — Preparar relleno normalizado y detección de duplicados** (25 min).
  - **RF:** RF-15–RF-16, RF-24, RF-59. **Depende de:** M5-T010.
  - **Hecho cuando:** El ensayo en test normaliza sin fusionar y devuelve grupos duplicados sin alterar snapshots.

- [x] **M5-T013 — Crear resolución transaccional de ficha** (25 min).
  - **RF:** RF-15–RF-19, RF-24. **Depende de:** M5-T012.
  - **Hecho cuando:** La resolución devuelve ficha única, crea cuando no existe y rechaza ambigüedad sin selección arbitraria.

Evidencia del lote [M5-T014–M5-T017](resultados-tareas/m5-t014-t017.md).

- [x] **M5-T014 — Integrar resolución en registro manual** (25 min).
  - **RF:** RF-17–RF-19, RF-23, RF-62. **Depende de:** M5-T013.
  - **Hecho cuando:** El escritor manual reutiliza o crea dentro de su transacción y conserva selección explícita autorizada.

- [x] **M5-T015 — Integrar resolución en registro público** (25 min).
  - **RF:** RF-17–RF-19, RF-23, RF-25, RF-62. **Depende de:** M5-T013.
  - **Hecho cuando:** La reserva pública reutiliza la ficha sin revelar antecedentes y revierte cliente/cita ante fallo.

- [x] **M5-T016 — Integrar alta independiente y fichas fusionadas** (25 min).
  - **RF:** RF-15, RF-17, RF-19, RF-25. **Depende de:** M5-T013, M5-T011.
  - **Hecho cuando:** El alta coincidente devuelve ficha existente; una ficha fusionada no aparece como seleccionable.

- [x] **M5-T017 — Probar carrera de identidad público/manual** (25 min).
  - **RF:** RF-15–RF-18, RF-62. **Depende de:** M5-T014, M5-T015, M5-T004.
  - **Hecho cuando:** Dos escritores reales simultáneos dejan una única ficha activa y resultados de cita coherentes.

## 3. Clientes: edición, unión y unicidad final

Evidencia del lote [M5-T018–M5-T023](resultados-tareas/m5-t018-t023.md).
Evidencia del lote [M5-T024–M5-T029](resultados-tareas/m5-t024-t029.md), con implementación de interfaz en el repositorio hermano.

- [x] **M5-T018 — Detectar colisión al editar cliente** (25 min).
  - **RF:** RF-20, RF-22, RF-61. **Depende de:** M5-T016, M5-T005.
  - **Hecho cuando:** Una edición coincidente devuelve 409 y destino mínimo solo a Administración/Recepción, sin guardar cambios.

- [x] **M5-T019 — Validar solicitud de unión** (25 min).
  - **RF:** RF-20–RF-22, RF-61. **Depende de:** M5-T018, M5-T011.
  - **Hecho cuando:** Pruebas rechazan auto-unión, otro negocio, versiones obsoletas, destino fusionado y ausencia de coincidencia.

- [x] **M5-T020 — Implementar traslado atómico de relaciones** (25 min).
  - **RF:** RF-21–RF-23, RF-59. **Depende de:** M5-T019.
  - **Hecho cuando:** Una unión conserva destino, referencia histórica del origen y snapshots de todas las citas.

- [x] **M5-T021 — Añadir idempotencia y auditoría de unión** (25 min).
  - **RF:** RF-21–RF-22, RF-60–RF-62. **Depende de:** M5-T020.
  - **Hecho cuando:** La misma clave recupera un resultado único; otra carga con igual clave produce conflicto sin repetir efectos.

- [x] **M5-T022 — Exponer operación autorizada de unión** (25 min).
  - **RF:** RF-20–RF-22, RF-61. **Depende de:** M5-T021.
  - **Hecho cuando:** El endpoint admite Administrador/Recepción y rechaza Profesional y recursos ajenos.

- [x] **M5-T023 — Probar rollback y carreras de unión** (25 min).
  - **RF:** RF-22–RF-23, RF-62. **Depende de:** M5-T022, M5-T004.
  - **Hecho cuando:** Un fallo intermedio y una edición simultánea dejan relaciones íntegras y ninguna unión parcial.

- [x] **M5-T024 — Añadir advertencia de coincidencia al editor** (25 min).
  - **RF:** RF-20, RF-22. **Depende de:** M5-T022.
  - **Hecho cuando:** La vista conectada muestra el destino y permite volver a editar sin modificar registros.

- [x] **M5-T025 — Conectar aceptación y recuperación de unión** (25 min).
  - **RF:** RF-21–RF-23, RF-62. **Depende de:** M5-T024.
  - **Hecho cuando:** Aceptar actualiza el historial; doble clic o respuesta perdida recupera la misma operación.

- [x] **M5-T026 — Permitir conciliación de grupos heredados** (25 min).
  - **RF:** RF-20–RF-24, RF-61. **Depende de:** M5-T025, M5-T012.
  - **Hecho cuando:** Un grupo duplicado de test puede revisarse y resolverse expresamente sin elegir destino automáticamente.

- [x] **M5-T027 — Preparar migración de unicidad activa** (25 min).
  - **RF:** RF-15, RF-24, RF-59. **Depende de:** M5-T026, M5-T017.
  - **Hecho cuando:** La migración rechaza grupos pendientes y crea el índice solo después de conciliarlos en test.

- [x] **M5-T028 — Probar índice, collation y fichas absorbidas** (25 min).
  - **RF:** RF-15–RF-19, RF-23–RF-24. **Depende de:** M5-T027.
  - **Hecho cuando:** SQL de prueba rechaza duplicados activos, admite nombres distintos y mantiene filas históricas fusionadas.

- [x] **M5-T029 — Verificar unión desde navegador** (25 min).
  - **RF:** RF-20–RF-25, RF-61–RF-62. **Depende de:** M5-T025, M5-T028.
  - **Hecho cuando:** Administrador y Recepción aceptan/rechazan con teclado; Profesional no accede y snapshots permanecen iguales.

## 4. Profesional y consultas administrativas

- [x] **M5-T030 — Ampliar permisos explícitos del Profesional** (25 min).
  - **RF:** RF-01–RF-03, RF-61. **Depende de:** M5-T014, M5-T005.
  - **Hecho cuando:** La matriz permite escrituras propias sin otorgar permisos de directorio.

- [x] **M5-T031 — Imponer alcance propio en escritores** (25 min).
  - **RF:** RF-01–RF-04, RF-61. **Depende de:** M5-T030.
  - **Hecho cuando:** Crear, mover y cambiar estado resuelven el perfil servidor y rechazan citas/perfiles ajenos.

- [x] **M5-T032 — Verificar restricciones de estado y disponibilidad** (25 min).
  - **RF:** RF-04–RF-07. **Depende de:** M5-T031, M5-T004.
  - **Hecho cuando:** Casos focalizados rechazan falta de licencia, empalme y resultado antes de fin; no dejan cambios parciales.

- [x] **M5-T033 — Mostrar acciones propias en agenda conectada** (25 min).
  - **RF:** RF-01–RF-03. **Depende de:** M5-T031.
  - **Hecho cuando:** El Profesional dispone de acciones para sus citas y formulario de contacto sin directorio.

- [x] **M5-T034 — Probar permisos del Profesional por HTTP** (25 min).
  - **RF:** RF-01–RF-05, RF-61. **Depende de:** M5-T032.
  - **Hecho cuando:** Casos de dos negocios y dos profesionales rechazan IDs manipulados, cliente arbitrario y sesión revocada.

- [x] **M5-T035 — Validar filtros y páginas de correos** (25 min).
  - **RF:** RF-08, RF-14. **Depende de:** M5-T005.
  - **Hecho cuando:** Se aceptan filtros combinados y límites previstos y se rechazan tipos/fechas/rangos inválidos.

- [x] **M5-T036 — Implementar consulta y totales de correos** (25 min).
  - **RF:** RF-08–RF-09. **Depende de:** M5-T035.
  - **Hecho cuando:** Filas, total y contadores aplican los mismos filtros en una lectura consistente.

- [x] **M5-T037 — Verificar paginación y contadores de correos** (25 min).
  - **RF:** RF-08–RF-09, RF-14, RF-61. **Depende de:** M5-T036, M5-T003.
  - **Hecho cuando:** Más de una página, estado filtrado y página vacía mantienen contadores correctos y aislamiento.

- [x] **M5-T038 — Conectar filtros y paginador de correos** (25 min).
  - **RF:** RF-08–RF-09, RF-14. **Depende de:** M5-T037.
  - **Hecho cuando:** La pantalla reinicia página al filtrar y muestra total/error sin contar solo filas visibles.

- [x] **M5-T039 — Implementar clasificación temporal de bloqueos** (25 min).
  - **RF:** RF-10–RF-12. **Depende de:** M5-T004, M5-T005.
  - **Hecho cuando:** Pruebas cubren fin exclusivo, día completo y bloqueos colectivos con zonas distintas.

- [x] **M5-T040 — Paginar bloqueos con filtros y totales** (25 min).
  - **RF:** RF-10–RF-12, RF-14. **Depende de:** M5-T039.
  - **Hecho cuando:** El endpoint devuelve por defecto vigentes/próximos y conserva filtros por solapamiento y alcance.

- [x] **M5-T041 — Separar listado paginado de cálculo del motor** (25 min).
  - **RF:** RF-13. **Depende de:** M5-T040.
  - **Hecho cuando:** El motor obtiene todos los bloqueos aplicables sin invocar el listado paginado.

- [x] **M5-T042 — Verificar bloqueos y regresión de disponibilidad** (25 min).
  - **RF:** RF-10–RF-14, RF-61. **Depende de:** M5-T041, M5-T003.
  - **Hecho cuando:** Cambiar páginas no cambia disponibilidad y bloques colectivos se cuentan una sola vez.

- [x] **M5-T043 — Adaptar consumidores del listado de bloqueos** (25 min).
  - **RF:** RF-10–RF-14. **Depende de:** M5-T042.
  - **Hecho cuando:** Administrador filtra anteriores/todos y el Profesional conserva su alcance con el nuevo sobre.

## 5. Personalización del portal

- [ ] **M5-T044 — Crear persistencia de personalización** (25 min).
  - **RF:** RF-26–RF-27, RF-30, RF-61. **Depende de:** M5-T007.
  - **Hecho cuando:** Migración, entidades y esquema definen configuración versionada y recursos separados por negocio.

- [ ] **M5-T045 — Validar contenido y límites de imágenes** (25 min).
  - **RF:** RF-28. **Depende de:** M5-T044.
  - **Hecho cuando:** Casos focalizados rechazan MIME falso, SVG, animación, tamaño/dimensiones excesivos y archivo truncado.

- [ ] **M5-T046 — Sanear y guardar logo provisional** (25 min).
  - **RF:** RF-28, RF-30. **Depende de:** M5-T045.
  - **Hecho cuando:** La recodificación elimina metadatos y respeta límite de salida sin sustituir el logo publicado.

- [ ] **M5-T047 — Implementar validación de colores y contraste** (25 min).
  - **RF:** RF-29–RF-30. **Depende de:** M5-T044.
  - **Hecho cuando:** Pruebas de límites 4.5:1 y 3:1 cubren texto, controles, enlaces y foco sin alterar colores semánticos.

- [ ] **M5-T048 — Publicar configuración atómicamente** (25 min).
  - **RF:** RF-26, RF-28–RF-30, RF-62. **Depende de:** M5-T046, M5-T047.
  - **Hecho cuando:** Logo y colores se publican juntos con versión; error o versión obsoleta conserva configuración anterior.

- [ ] **M5-T049 — Implementar restauración y limpieza provisional** (25 min).
  - **RF:** RF-27–RF-28, RF-30. **Depende de:** M5-T048.
  - **Hecho cuando:** Restaurar afecta un solo negocio y limpiar provisionales vencidos no elimina recursos vigentes.

- [ ] **M5-T050 — Exponer marca publicada por slug** (25 min).
  - **RF:** RF-26, RF-30, RF-61. **Depende de:** M5-T048.
  - **Hecho cuando:** El catálogo y recurso público solo permiten el logo publicado del negocio resuelto.

- [ ] **M5-T051 — Construir vista previa y edición conectada** (25 min).
  - **RF:** RF-26–RF-29. **Depende de:** M5-T050.
  - **Hecho cuando:** El Administrador previsualiza, descarta y guarda usando validaciones equivalentes al servidor.

- [ ] **M5-T052 — Conectar restauración en vista previa** (25 min).
  - **RF:** RF-27. **Depende de:** M5-T051, M5-T049.
  - **Hecho cuando:** Restaurar puede previsualizarse y cancelarse sin cambios persistidos.

- [ ] **M5-T053 — Probar marca en móvil y teclado** (25 min).
  - **RF:** RF-26–RF-30, RF-61–RF-62. **Depende de:** M5-T052.
  - **Hecho cuando:** Dos negocios conservan marcas separadas; errores, foco, contraste y publicación pasan el recorrido.

## 6. Persistencia de automatizaciones

- [ ] **M5-T054 — Crear configuración de automatizaciones** (25 min).
  - **RF:** RF-39, RF-43, RF-47. **Depende de:** M5-T005.
  - **Hecho cuando:** Migración, entidad y esquema imponen rangos enteros y valores 12/24 sin modificar citas previas.

- [ ] **M5-T055 — Crear generaciones de condiciones por cita** (25 min).
  - **RF:** RF-40–RF-46, RF-59. **Depende de:** M5-T054.
  - **Hecho cuando:** La persistencia admite vencimiento nulo, generación histórica y motivo de seguimiento con FKs de negocio.

- [ ] **M5-T056 — Añadir generación y causa vigente a cita** (25 min).
  - **RF:** RF-43–RF-46, RF-49, RF-59. **Depende de:** M5-T055.
  - **Hecho cuando:** Entidad, esquema y migración conservan snapshots y referencian condiciones dentro del mismo negocio.

- [ ] **M5-T057 — Ampliar actores de eventos de cita** (25 min).
  - **RF:** RF-33, RF-44, RF-60–RF-61. **Depende de:** M5-T056.
  - **Hecho cuando:** Restricciones admiten usuario/sesión/WhatsApp/sistema de forma excluyente sin usuarios ficticios.

- [ ] **M5-T058 — Probar invariantes de eventos ampliados** (25 min).
  - **RF:** RF-33, RF-44, RF-60–RF-62. **Depende de:** M5-T057.
  - **Hecho cuando:** Se rechazan actores incompatibles y cambios a eventos; sigue habiendo una versión única por cita.

- [ ] **M5-T059 — Crear configuración de canales** (25 min).
  - **RF:** RF-31–RF-38, RF-61. **Depende de:** M5-T006.
  - **Hecho cuando:** Persistencia admite un canal por negocio y referencia a secreto sin almacenar credenciales utilizables.

- [ ] **M5-T060 — Crear bandeja durable de envíos** (25 min).
  - **RF:** RF-31, RF-36, RF-47–RF-48, RF-62. **Depende de:** M5-T055, M5-T059.
  - **Hecho cuando:** Migración, entidad y esquema definen efecto único, generación, programación, lease e índices de trabajo.

- [ ] **M5-T061 — Crear bandeja de eventos entrantes** (25 min).
  - **RF:** RF-33–RF-38, RF-62. **Depende de:** M5-T059.
  - **Hecho cuando:** Duplicar el mismo evento no crea otra entrada y se conservan horas de recepción/proveedor separadas.

- [ ] **M5-T062 — Crear persistencia de acciones de confirmación** (25 min).
  - **RF:** RF-32–RF-35, RF-61–RF-62. **Depende de:** M5-T060.
  - **Hecho cuando:** Hash, consumo, vencimiento y pertenencia a generación quedan definidos sin token utilizable persistido.

- [ ] **M5-T063 — Exponer lectura/escritura de configuración** (25 min).
  - **RF:** RF-39, RF-43, RF-47. **Depende de:** M5-T054.
  - **Hecho cuando:** Solo Administrador modifica con versión y rango válido; trabajos anteriores permanecen iguales.

- [ ] **M5-T064 — Conectar formulario de plazos y recordatorios** (25 min).
  - **RF:** RF-39, RF-43, RF-47. **Depende de:** M5-T063.
  - **Hecho cuando:** La pantalla muestra valores vigentes y errores de rango/conflicto sin cambios retroactivos.

## 7. Política temporal y creación de trabajos

- [ ] **M5-T065 — Implementar cálculo puro de vencimiento** (25 min).
  - **RF:** RF-39–RF-43. **Depende de:** M5-T004, M5-T055.
  - **Hecho cuando:** Pruebas cubren seis horas ±1 ms, plazo normal y corte de una hora, y 15 minutos que terminan al inicio.

- [ ] **M5-T066 — Implementar elegibilidad del recordatorio** (25 min).
  - **RF:** RF-47–RF-48. **Depende de:** M5-T065.
  - **Hecho cuando:** Pruebas omiten próximas y momento igual/pasado y admiten límites 12/24/48.

- [ ] **M5-T067 — Preparar efecto inicial transaccional** (25 min).
  - **RF:** RF-31–RF-32, RF-36, RF-62. **Depende de:** M5-T060, M5-T062, M5-T065.
  - **Hecho cuando:** El servicio crea condiciones y envío único con el manager recibido, sin HTTP externo.

- [ ] **M5-T068 — Integrar condiciones y efecto en reserva pública** (25 min).
  - **RF:** RF-31–RF-32, RF-40–RF-43, RF-62. **Depende de:** M5-T067, M5-T015, M5-T058.
  - **Hecho cuando:** Cita Pendiente, plazo y trabajo comparten commit y resultado recuperable.

- [ ] **M5-T069 — Integrar efecto en cita manual** (25 min).
  - **RF:** RF-31, RF-47, RF-62. **Depende de:** M5-T067, M5-T014, M5-T066.
  - **Hecho cuando:** Cita Confirmada crea mensaje correcto y recordatorio elegible sin plazo de cancelación.

- [ ] **M5-T070 — Integrar autorización de contacto WhatsApp** (25 min).
  - **RF:** RF-31, RF-37–RF-38. **Depende de:** M5-T068, M5-T069.
  - **Hecho cuando:** Ambos canales guardan autorización sin impedir cita si falta; ausencia deriva a seguimiento.

- [ ] **M5-T071 — Probar fallo durante creación de efectos** (25 min).
  - **RF:** RF-18, RF-31, RF-36, RF-62. **Depende de:** M5-T070, M5-T004.
  - **Hecho cuando:** Fallo tras cada escritura crítica revierte cita/cliente/efectos y repetir intento no los duplica.

- [ ] **M5-T072 — Preparar condiciones manuales heredadas** (25 min).
  - **RF:** RF-42–RF-43, RF-59. **Depende de:** M5-T055.
  - **Hecho cuando:** La migración de test no asigna plazos ni envíos retroactivos a citas existentes.

- [ ] **M5-T073 — Mostrar condiciones en resultado público** (25 min).
  - **RF:** RF-32, RF-42–RF-43. **Depende de:** M5-T068.
  - **Hecho cuando:** El resultado muestra hora exacta con zona o seguimiento manual sin fecha inventada.

## 8. Transporte, reintentos y recepción WhatsApp

- [ ] **M5-T074 — Definir adaptador y transporte controlado** (25 min).
  - **RF:** RF-31, RF-36. **Depende de:** M5-T006, M5-T059.
  - **Hecho cuando:** El contrato distingue aceptación, rechazo e incertidumbre y permite pruebas sin envíos reales.

- [ ] **M5-T075 — Preparar parámetros de las tres plantillas** (25 min).
  - **RF:** RF-31–RF-32, RF-47. **Depende de:** M5-T074, M5-T067.
  - **Hecho cuando:** Pendiente, Confirmada y recordatorio usan resumen histórico, sin folio ni notas sensibles.

- [ ] **M5-T076 — Implementar envío mediante adaptador Meta** (25 min).
  - **RF:** RF-31, RF-36, RF-61. **Depende de:** M5-T075.
  - **Hecho cuando:** Pruebas del adaptador verifican remitente, versión, secreto externo y clasificación de respuestas.

- [ ] **M5-T077 — Implementar toma y renovación de trabajo** (25 min).
  - **RF:** RF-36, RF-62. **Depende de:** M5-T060, M5-T004.
  - **Hecho cuando:** Dos trabajadores no poseen simultáneamente el mismo lease válido y su token protege finalización.

- [ ] **M5-T078 — Conectar procesador de envíos** (25 min).
  - **RF:** RF-31, RF-36, RF-47–RF-48. **Depende de:** M5-T076, M5-T077, M5-T070.
  - **Hecho cuando:** Antes del envío se revalida generación/utilidad y HTTP no mantiene la transacción del registro.

- [ ] **M5-T079 — Implementar política de reintentos conocidos** (25 min).
  - **RF:** RF-36–RF-38. **Depende de:** M5-T078.
  - **Hecho cuando:** Tres intentos máximos y esperas 1/5 minutos respetan utilidad y espera del proveedor; permanentes no se repiten.

- [ ] **M5-T080 — Gestionar timeout y lease vencido tras HTTP** (25 min).
  - **RF:** RF-36–RF-38, RF-62. **Depende de:** M5-T079.
  - **Hecho cuando:** El posible envío queda incierto sin reenvío automático; un acuse posterior puede conciliarlo.

- [ ] **M5-T081 — Implementar verificación y firma de webhook** (25 min).
  - **RF:** RF-33–RF-38, RF-61. **Depende de:** M5-T006, M5-T061.
  - **Hecho cuando:** Firma inválida se rechaza antes de procesar; canal se resuelve desde datos autenticados.

- [ ] **M5-T082 — Persistir eventos antes del acuse** (25 min).
  - **RF:** RF-34–RF-36, RF-62. **Depende de:** M5-T081.
  - **Hecho cuando:** Duplicados se reconocen sin repetir entrada y fallo de persistencia no devuelve éxito.

- [ ] **M5-T083 — Procesar estados de entrega** (25 min).
  - **RF:** RF-34, RF-36–RF-38. **Depende de:** M5-T082, M5-T060.
  - **Hecho cuando:** Entregado/leído actualiza comunicación sin confirmar asistencia ni degradarse por evento atrasado.

- [ ] **M5-T084 — Generar y verificar payload de confirmación** (25 min).
  - **RF:** RF-32–RF-35, RF-61. **Depende de:** M5-T062, M5-T075.
  - **Hecho cuando:** Payload alterado, destinatario/canal ajeno o generación incorrecta se rechaza; secretos no se persisten.

- [ ] **M5-T085 — Aplicar confirmación transaccional** (25 min).
  - **RF:** RF-33, RF-35, RF-45, RF-62. **Depende de:** M5-T084, M5-T083, M5-T058, M5-T066.
  - **Hecho cuando:** Bajo bloqueo, acción válida futura confirma una vez y guarda evento con actor correcto.

- [ ] **M5-T086 — Conectar respuesta rápida con confirmación** (25 min).
  - **RF:** RF-32–RF-35, RF-61–RF-62. **Depende de:** M5-T085, M5-T082.
  - **Hecho cuando:** Evento autenticado llega al servicio; texto libre y acuses no cambian la cita.

- [ ] **M5-T087 — Probar límites y repetición de confirmación** (25 min).
  - **RF:** RF-33–RF-35, RF-42, RF-45. **Depende de:** M5-T086, M5-T004.
  - **Hecho cuando:** Acción al vencimiento, antigua o repetida no reactiva ni duplica; manual sin plazo solo confirma antes del inicio.

## 9. Cancelador, cambios y recordatorios

- [ ] **M5-T088 — Seleccionar condiciones vencidas** (25 min).
  - **RF:** RF-39–RF-44. **Depende de:** M5-T055, M5-T077.
  - **Hecho cuando:** Trabajos candidatos se toman por lotes y tiempo del servidor sin tratar consulta previa como autorización.

- [ ] **M5-T089 — Aplicar cancelación automática segura** (25 min).
  - **RF:** RF-37–RF-38, RF-44–RF-45, RF-60. **Depende de:** M5-T088, M5-T083, M5-T058.
  - **Hecho cuando:** Solo Pendiente futura con entrega válida se cancela una vez, con causa y liberación de su ocupación.

- [ ] **M5-T090 — Derivar excepciones a seguimiento manual** (25 min).
  - **RF:** RF-37–RF-38, RF-42, RF-44. **Depende de:** M5-T089.
  - **Hecho cuando:** Sin entrega, entrega tardía o inicio alcanzado queda seguimiento terminal para esa generación.

- [ ] **M5-T091 — Invalidar generación al reprogramar** (25 min).
  - **RF:** RF-06–RF-07, RF-35, RF-43, RF-48. **Depende de:** M5-T085, M5-T066, M5-T031.
  - **Hecho cuando:** Mover deja Confirmada, invalida acción anterior y calcula nueva programación preservando origen/snapshots.

- [ ] **M5-T092 — Integrar reactivación y limpieza de causa** (25 min).
  - **RF:** RF-06–RF-07, RF-44, RF-48, RF-49. **Depende de:** M5-T091, M5-T089.
  - **Hecho cuando:** Reactivar revalida disponibilidad, deja Confirmada y limpia causa vigente sin borrar historial.

- [ ] **M5-T093 — Tratar vuelta de Confirmada a Pendiente** (25 min).
  - **RF:** RF-46, RF-48. **Depende de:** M5-T092.
  - **Hecho cuando:** La transición anula recordatorio y genera seguimiento manual sin reutilizar vencimiento.

- [ ] **M5-T094 — Programar recordatorio al confirmar** (25 min).
  - **RF:** RF-47–RF-48, RF-62. **Depende de:** M5-T085, M5-T069.
  - **Hecho cuando:** Confirmación elegible crea un único trabajo por generación; configuración posterior no lo mueve.

- [ ] **M5-T095 — Descartar recordatorios obsoletos** (25 min).
  - **RF:** RF-47–RF-48. **Depende de:** M5-T094, M5-T093, M5-T078.
  - **Hecho cuando:** Cancelar, mover, inicio alcanzado y retraso mayor a cinco minutos descartan; silencio no altera estado.

- [ ] **M5-T096 — Registrar ciclos de procesadores** (25 min).
  - **RF:** RF-36–RF-38, RF-44, RF-47–RF-48. **Depende de:** M5-T090, M5-T095.
  - **Hecho cuando:** Inicio/parada y ciclo de 15 segundos con lotes de 50 usan trabajo durable y no duplican ejecuciones.

- [ ] **M5-T097 — Mostrar seguimiento y estado de comunicación** (25 min).
  - **RF:** RF-34, RF-37–RF-38, RF-43. **Depende de:** M5-T090, M5-T083.
  - **Hecho cuando:** Personal autorizado distingue plazo activo, seguimiento y fallo sin confundir entrega con asistencia.

- [ ] **M5-T098 — Probar confirmación contra cancelador** (25 min).
  - **RF:** RF-33, RF-35, RF-44–RF-45, RF-62. **Depende de:** M5-T096, M5-T087, M5-T004.
  - **Hecho cuando:** Ambos órdenes con dos conexiones dejan un único resultado y ninguna Confirmada cancelada por silencio.

- [ ] **M5-T099 — Probar reprogramación contra cancelador** (25 min).
  - **RF:** RF-06–RF-07, RF-35, RF-45, RF-48. **Depende de:** M5-T098, M5-T091.
  - **Hecho cuando:** El horario nuevo no recibe efectos de la generación antigua y no queda una ocupación parcial.

- [ ] **M5-T100 — Probar reactivación y liberación contra reservas** (25 min).
  - **RF:** RF-04, RF-07, RF-44–RF-45, RF-62. **Depende de:** M5-T092, M5-T098.
  - **Hecho cuando:** Dos escritores reales conservan como máximo una ocupación incompatible entre sucursales.

- [ ] **M5-T101 — Probar reinicio e incertidumbre del procesador** (25 min).
  - **RF:** RF-36–RF-38, RF-62. **Depende de:** M5-T096, M5-T080.
  - **Hecho cuando:** Reiniciar antes/después de aceptación o commit no pierde trabajo ni reenvía ciegamente.

- [ ] **M5-T102 — Verificar licencia, canal inhabilitado y acuses** (25 min).
  - **RF:** RF-04, RF-33–RF-38, RF-61. **Depende de:** M5-T101, M5-T086.
  - **Hecho cuando:** Nuevos envíos respetan acceso y fallos; recepción/recuperación no concede permisos administrativos.

## 10. Reportes: persistencia, consultas y cálculos

- [ ] **M5-T103 — Crear cabecera de corte y filas inmutables** (25 min).
  - **RF:** RF-49–RF-57, RF-61. **Depende de:** M5-T056, M5-T005.
  - **Hecho cuando:** Migración, entidades y esquema contienen actor/negocio, filtros, expiración y datos mínimos sin contacto/notas.

- [ ] **M5-T104 — Validar filtros y acceso a reportes** (25 min).
  - **RF:** RF-49–RF-50, RF-54, RF-61. **Depende de:** M5-T103.
  - **Hecho cuando:** Solo Administrador consulta recursos propios; rangos inválidos y filtros ajenos se rechazan.

- [ ] **M5-T105 — Materializar corte consistente** (25 min).
  - **RF:** RF-49–RF-53. **Depende de:** M5-T104.
  - **Hecho cuando:** Cabecera/filas se publican completas desde una sola fotografía; fallo intermedio deja cero cortes utilizables.

- [ ] **M5-T106 — Resolver fechas civiles y agrupaciones** (25 min).
  - **RF:** RF-49–RF-50. **Depende de:** M5-T105, M5-T004.
  - **Hecho cuando:** Pruebas cubren zona histórica, DST, límites inclusivos, lunes y cambio de mes.

- [ ] **M5-T107 — Calcular conteos, origen y evolución** (25 min).
  - **RF:** RF-49, RF-51, RF-53. **Depende de:** M5-T106.
  - **Hecho cuando:** Dataset conocido concilia estados, origen, servicios solicitados y evolución sin duplicar citas.

- [ ] **M5-T108 — Calcular tasas y citas sin resultado** (25 min).
  - **RF:** RF-49, RF-51. **Depende de:** M5-T107.
  - **Hecho cuando:** Denominador cero produce Sin datos; tasas y pasadas sin resultado coinciden con fórmulas de spec.

- [ ] **M5-T109 — Calcular estimación con costo histórico** (25 min).
  - **RF:** RF-49, RF-52–RF-53. **Depende de:** M5-T105.
  - **Hecho cuando:** Decimales se suman exactamente; null se reporta faltante y precio actual no participa.

- [ ] **M5-T110 — Contar cancelaciones automáticas vigentes** (25 min).
  - **RF:** RF-49, RF-51, RF-53. **Depende de:** M5-T107, M5-T092.
  - **Hecho cuando:** Canceladas por falta de confirmación forman subconjunto y una reactivada deja de contarse.

- [ ] **M5-T111 — Exponer resumen y páginas del corte** (25 min).
  - **RF:** RF-49–RF-54, RF-61. **Depende de:** M5-T108, M5-T109, M5-T110.
  - **Hecho cuando:** Páginas estables y resumen usan el mismo corte y revalidan actor/negocio en cada petición.

- [ ] **M5-T112 — Gestionar caducidad y limpieza de cortes** (25 min).
  - **RF:** RF-54, RF-57, RF-61. **Depende de:** M5-T111.
  - **Hecho cuando:** Un corte a 24 horas ya no es accesible y su limpieza no afecta cortes vigentes.

- [ ] **M5-T113 — Probar fallos, volumen y límites de consulta** (25 min).
  - **RF:** RF-54, RF-57. **Depende de:** M5-T111, M5-T003.
  - **Hecho cuando:** Un conjunto representativo deja tiempos registrados; fallo no devuelve ceros ni tablas truncadas como completas.

- [ ] **M5-T114 — Probar corte ante cambios concurrentes** (25 min).
  - **RF:** RF-51–RF-53, RF-57. **Depende de:** M5-T111, M5-T004.
  - **Hecho cuando:** Editar citas, precios o nombres entre páginas no altera el corte existente.

## 11. Pantalla de reportes e impresión

- [ ] **M5-T115 — Conectar filtros y carga de reporte** (25 min).
  - **RF:** RF-49–RF-50, RF-54. **Depende de:** M5-T111.
  - **Hecho cuando:** La vista crea un corte y distingue carga, vacío y error sin recurrir a demo.

- [ ] **M5-T116 — Mostrar indicadores y estimaciones** (25 min).
  - **RF:** RF-49–RF-53. **Depende de:** M5-T115.
  - **Hecho cuando:** Los nueve resultados de RF-49 muestran cifras/denominadores y advertencia de costo faltante.

- [ ] **M5-T117 — Conectar tablas paginadas del corte** (25 min).
  - **RF:** RF-49, RF-53–RF-54. **Depende de:** M5-T116.
  - **Hecho cuando:** Cambiar página conserva corte y filtros; caducidad exige regenerar sin mezclar filas.

- [ ] **M5-T118 — Preparar colección completa para impresión** (25 min).
  - **RF:** RF-55, RF-57. **Depende de:** M5-T117, M5-T112.
  - **Hecho cuando:** Se obtienen todas las páginas del mismo corte y se valida cantidad antes de habilitar impresión.

- [ ] **M5-T119 — Aplicar presentación de impresión** (25 min).
  - **RF:** RF-55–RF-56. **Depende de:** M5-T118.
  - **Hecho cuando:** Vista de impresión incluye negocio, periodo, filtros y corte, sin navegación, controles ni folio.

- [ ] **M5-T120 — Manejar impresión incompleta y menú nativo** (25 min).
  - **RF:** RF-54, RF-57. **Depende de:** M5-T119.
  - **Hecho cuando:** Fallo de una página impide reporte parcial y menú nativo sin preparación muestra advertencia.

- [ ] **M5-T121 — Verificar PDF guardado desde navegador** (25 min).
  - **RF:** RF-55–RF-57. **Depende de:** M5-T120.
  - **Hecho cuando:** Un reporte de varias páginas conserva filas, totales y encabezados sin recortes de contenido.

## 12. Retirada coordinada del folio

- [ ] **M5-T122 — Inventariar dependencias activas del folio** (20 min).
  - **RF:** RF-58–RF-59, RF-62. **Depende de:** M5-T001.
  - **Hecho cuando:** Existe listado de campos, JSON, consumidores y recuperación afectados, separado de antecedentes históricos.

- [ ] **M5-T123 — Retirar folio de proyecciones backend** (25 min).
  - **RF:** RF-58, RF-62. **Depende de:** M5-T122, M5-T111.
  - **Hecho cuando:** Respuestas públicas/privadas y recuperación dejan de exponer folio sin alterar IDs ni claves.

- [ ] **M5-T124 — Retirar folio de vistas y estado frontend** (25 min).
  - **RF:** RF-58. **Depende de:** M5-T123, M5-T121, M5-T033.
  - **Hecho cuando:** Portal, agenda, clientes, reportes y demo no dependen ni muestran folio.

- [ ] **M5-T125 — Retirar folio de nuevos eventos y mensajes** (25 min).
  - **RF:** RF-58, RF-60. **Depende de:** M5-T123, M5-T075, M5-T058.
  - **Hecho cuando:** Los nuevos JSON de eventos y parámetros de mensajes no incluyen folio.

- [ ] **M5-T126 — Preparar limpieza acotada de JSON histórico** (25 min).
  - **RF:** RF-58–RF-60. **Depende de:** M5-T125.
  - **Hecho cuando:** Migración de test elimina solo propiedad folio y restablece triggers conservando demás valores y filas.

- [ ] **M5-T127 — Retirar generación, columna e índice exclusivo** (25 min).
  - **RF:** RF-58–RF-59. **Depende de:** M5-T126, M5-T124.
  - **Hecho cuando:** Migración, entidades y esquema coinciden y ambos escritores funcionan sin campo folio.

- [ ] **M5-T128 — Probar recuperación después de retirar folio** (25 min).
  - **RF:** RF-58–RF-59, RF-62. **Depende de:** M5-T127, M5-T071.
  - **Hecho cuando:** Intentos previos y actuales recuperan la misma cita y conservan IDs, relaciones y huellas.

- [ ] **M5-T129 — Verificar ausencia del folio en producto vigente** (20 min).
  - **RF:** RF-58. **Depende de:** M5-T128.
  - **Hecho cuando:** Búsqueda en ambos repositorios solo deja referencias históricas justificadas o verificaciones de ausencia.

## 13. Observabilidad, migraciones y aceptación real

- [ ] **M5-T130 — Añadir métricas operativas mínimas** (25 min).
  - **RF:** RF-14, RF-36–RF-38, RF-44, RF-54, RF-60. **Depende de:** M5-T096, M5-T111.
  - **Hecho cuando:** Se observan edad de trabajos, inciertos, seguimiento y cortes sin exponer datos sensibles.

- [ ] **M5-T131 — Revisar logs, auditoría y errores** (25 min).
  - **RF:** RF-25, RF-36, RF-54, RF-60–RF-61. **Depende de:** M5-T130, M5-T021.
  - **Hecho cuando:** Casos de error no imprimen contacto, notas, tokens ni cuerpos completos de mensajes.

- [ ] **M5-T132 — Ensayar instalación limpia en test** (25 min).
  - **RF:** RF-15, RF-24, RF-58–RF-59. **Depende de:** M5-T129, M5-T027.
  - **Hecho cuando:** Todas las migraciones ejecutan en base vacía test y coinciden con el esquema final.

- [ ] **M5-T133 — Ensayar actualización con datos previos** (25 min).
  - **RF:** RF-23–RF-24, RF-58–RF-59. **Depende de:** M5-T132, M5-T072.
  - **Hecho cuando:** Datos de fase 5 conservan IDs/snapshots/relaciones; duplicados exigen conciliación y no se envían mensajes retroactivos.

- [ ] **M5-T134 — Examinar planes de consultas principales** (25 min).
  - **RF:** RF-08–RF-13, RF-49–RF-54. **Depende de:** M5-T133, M5-T113.
  - **Hecho cuando:** Se registran planes de correos, bloqueos, cortes y trabajos con sus índices y volumen utilizado.

- [ ] **M5-T135 — Comprobar prerrequisitos externos de prueba** (15 min).
  - **RF:** RF-31–RF-38, RF-61. **Depende de:** M5-T006, M5-T076.
  - **Hecho cuando:** Se documentan remitente, plantillas aprobadas, webhook HTTPS y destinatario autorizado, o se deja la tarea pendiente por faltantes.

- [ ] **M5-T136 — Verificar mensaje inicial real de ambos canales** (25 min).
  - **RF:** RF-31–RF-32, RF-34. **Depende de:** M5-T135, M5-T070, M5-T086.
  - **Hecho cuando:** En entorno de prueba llegan los dos mensajes diferenciados; entrega no cambia Pendiente a Confirmada.

- [ ] **M5-T137 — Verificar acción real de confirmación** (25 min).
  - **RF:** RF-33–RF-35, RF-61–RF-62. **Depende de:** M5-T136.
  - **Hecho cuando:** El botón confirma una sola cita correcta y la repetición no añade otra transición.

- [ ] **M5-T138 — Verificar recordatorio real programado** (25 min).
  - **RF:** RF-47–RF-48. **Depende de:** M5-T137, M5-T095.
  - **Hecho cuando:** Una cita de prueba elegible recibe un único recordatorio y no responder conserva Confirmada.

- [ ] **M5-T139 — Verificar recorrido del Profesional** (25 min).
  - **RF:** RF-01–RF-07, RF-61. **Depende de:** M5-T034, M5-T033, M5-T093, M5-T128.
  - **Hecho cuando:** En navegador crea, mueve, cancela y reactiva propias y no logra acceder a citas ajenas.

- [ ] **M5-T140 — Verificar listados con teclado y móvil** (25 min).
  - **RF:** RF-08–RF-14. **Depende de:** M5-T038, M5-T043.
  - **Hecho cuando:** Filtros/páginas de correos y bloqueos funcionan en tamaños objetivo con vacío/error distinguibles.

- [ ] **M5-T141 — Documentar contingencia y habilitación por negocio** (20 min).
  - **RF:** RF-36–RF-38, RF-44, RF-59, RF-62. **Depende de:** M5-T131, M5-T133.
  - **Hecho cuando:** El procedimiento permite detener envíos/cancelador conservando consultas e intentos, sin rollback destructivo.

## 14. Verificación final y cierre documental

- [ ] **M5-T142 — Ejecutar build de backend** (15 min).
  - **RF:** RF-01–RF-62. **Depende de:** M5-T133, M5-T134, M5-T131.
  - **Hecho cuando:** npm run build finaliza sin errores y queda registrada revisión y salida.

- [ ] **M5-T143 — Ejecutar lint de backend** (15 min).
  - **RF:** RF-01–RF-62. **Depende de:** M5-T142.
  - **Hecho cuando:** npm run lint finaliza sin errores sobre el alcance final y se adjunta resultado.

- [ ] **M5-T144 — Ejecutar suite unitaria backend** (25 min).
  - **RF:** RF-01–RF-62. **Depende de:** M5-T143.
  - **Hecho cuando:** npm test -- --runInBand finaliza; resultado y pruebas omitidas quedan registrados.

- [ ] **M5-T145 — Ejecutar suite de integración backend** (25 min).
  - **RF:** RF-01–RF-62. **Depende de:** M5-T144.
  - **Hecho cuando:** La suite de integración finaliza en base test y deja evidencia de resultados reales.

- [ ] **M5-T146 — Ejecutar suite HTTP/e2e backend** (25 min).
  - **RF:** RF-01–RF-62. **Depende de:** M5-T145.
  - **Hecho cuando:** La suite HTTP/e2e finaliza y acredita rechazos, recuperaciones y aislamiento.

- [ ] **M5-T147 — Ejecutar build y tests Node frontend** (25 min).
  - **RF:** RF-01–RF-03, RF-08–RF-14, RF-20–RF-30, RF-38, RF-43, RF-49–RF-58. **Depende de:** M5-T124, M5-T053, M5-T029, M5-T140.
  - **Hecho cuando:** Build y npm test finalizan; se registran resultados sin afirmar lint inexistente.

- [ ] **M5-T148 — Ejecutar Playwright del módulo** (25 min).
  - **RF:** RF-01–RF-62. **Depende de:** M5-T147, M5-T139, M5-T121.
  - **Hecho cuando:** Las suites pertinentes pasan en modo conectado y las diferencias de demo quedan explícitas.

- [ ] **M5-T149 — Verificar evidencia de regresión compartida** (20 min).
  - **RF:** RF-04, RF-07, RF-13, RF-23, RF-45, RF-59, RF-62. **Depende de:** M5-T146, M5-T148.
  - **Hecho cuando:** Se identifican casos ejecutados de licencias, cupo, apartados, separación y recuperación; cualquier hueco queda pendiente.

- [ ] **M5-T150 — Completar matriz RF y criterios de spec** (25 min).
  - **RF:** RF-01–RF-62. **Depende de:** M5-T149, M5-T138, M5-T137, M5-T141, M5-T002, M5-T023, M5-T064, M5-T073, M5-T097, M5-T099, M5-T100, M5-T102, M5-T114.
  - **Hecho cuando:** Cada RF y criterio tiene caso, comando, resultado y evidencia; ningún test saltado cuenta como aprobado.

- [ ] **M5-T151 — Registrar revisión de cierre del módulo** (20 min).
  - **RF:** RF-01–RF-62. **Depende de:** M5-T150.
  - **Hecho cuando:** La revisión registra todos los criterios cumplidos o pendientes explícitos; solo declara cierre si ninguno falta.

## Comandos de referencia y alcance del cierre

Backend: `npm run build`, `npm run lint`, `npm test -- --runInBand`, `npm run test:integration -- --runInBand` y `npm run test:e2e -- --runInBand`. Frontend: `npm run build`, `npm test` y `npm run test:browser`; no hay lint de frontend declarado.

La matriz de aceptación enlazará los grupos T01–T13 del plan con casos concretos y las tareas M5 de este documento. Los 62 RF y los 15 criterios de finalización de spec deben tener evidencia propia. Las tareas con RF-01–RF-62 representan comprobaciones transversales y no sustituyen las verificaciones particulares de cada bloque.
