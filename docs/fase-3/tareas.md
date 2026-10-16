# Tareas — Fase 3, módulo 2: Motor Inteligente de Disponibilidad y Reglas de Agenda

Desglose del [plan](plan.md), conforme a la [constitución](constitucion-fase-3.md) y la [especificación](spec-modulo-2.md). Todos los RF citados son locales a esta especificación. Los identificadores M01–M08 y T01–T18 remiten a los módulos y grupos de pruebas del plan.

Hay **91 tareas de fase 3** y **9 tareas de verificación diferida**. M2-T001–M2-T038 están hechas; las demás siguen pendientes. Están estimadas entre 15 y 25 minutos y ordenadas de modo que sus dependencias aparecen antes. Las dependencias enumeradas son acumulativas; un rango incluye ambos extremos. El orden no convierte tareas independientes en dependencias adicionales.

Marcar una casilla únicamente después de comprobar su línea **Hecho cuando:** y conservar evidencia con RF, comando o revisión, resultado y limitaciones. Las tareas de tests incluyen preparar el caso y ejecutarlo; las de cierre pueden aprovechar resultados de la misma revisión sin repetir comprobaciones innecesarias. Si una tarea supera su alcance estimado, dividir el trabajo restante antes de marcarla. Las pruebas omitidas por falta de MariaDB u otro impedimento quedan pendientes.

Esta lista organiza trabajo futuro: su creación no implementa funcionalidad. No incluye pantallas, consulta anónima, escritores públicos de citas/apartados, ciclo de vida de citas, WhatsApp ni PDF. La fase 3 prepara y prueba el contrato interno de RF-35–RF-36; la confirmación real y RF-37 requieren la integración posterior.

## 1. Base y preparación

Base para M01–M08; pruebas T02, T16 y T17 del plan.

Evidencia, explicación de archivos, flujo y resultados: [M2-T001–M2-T004](evidencia-base-t001-t004.md).

- [x] **M2-T001 — Fijar la matriz de evidencias y límites** · 15 min · Depende de: ninguna · RF-01–RF-45
  Hecho cuando: la matriz enumera RF-01 a RF-45, identifica qué evidencia exige cada uno y deja RF-35–RF-37 con integración real pendiente en módulos 3/4.

- [x] **M2-T002 — Registrar la regresión unitaria del módulo 1** · 20 min · Depende de: M2-T001 · RF-11–RF-19, RF-38–RF-41
  Hecho cuando: se ejecutan las suites existentes de oferta, calendario y bloqueos y se registra su resultado como antecedente, sin atribuirles cobertura del motor.

- [x] **M2-T003 — Registrar contratos actuales de consulta** · 25 min · Depende de: M2-T001 · RF-08–RF-12, RF-19, RF-40, RF-45
  Hecho cuando: se verifican las respuestas y permisos actuales de oferta, atención y bloqueos, incluyendo recepción denegada en gestión, y quedan identificados los contratos que deben conservarse.

- [x] **M2-T004 — Declarar los módulos y contratos internos** · 20 min · Depende de: M2-T002, M2-T003 · RF-01, RF-08, RF-13, RF-31, RF-42
  Hecho cuando: DisponibilidadModule, DisponibilidadHttpModule y lectura de ocupaciones quedan compuestos sin procesos ni escritores públicos nuevos; las proyecciones de bloque, tramo, ocupación y resultado tienen responsabilidades documentadas.

## 2. Persistencia mínima y continuidad

M01 y M04; modelos y migraciones del plan; pruebas T16.

Evidencia, flujo, archivos y pruebas de M2-T005–M2-T010: [persistencia mínima](evidencia-t005-t010.md).

Evidencia, flujo, archivos y pruebas de M2-T011–M2-T015: [entidad, esquema y continuidad](evidencia-t011-t015.md).

Evidencia, flujo, archivos y pruebas de M2-T016–M2-T019: [integridad y conservación](evidencia-t016-t019.md).

- [x] **M2-T005 — Migrar configuración de agenda** · 20 min · Depende de: M2-T004 · RF-01–RF-07
  Hecho cuando: una migración posterior al fix crea una única configuración por negocio con los valores iniciales, tipos y restricciones del plan; no modifica migraciones históricas.

- [x] **M2-T006 — Representar configuración en TypeORM** · 15 min · Depende de: M2-T005 · RF-01–RF-07
  Hecho cuando: la entidad refleja los campos, claves y restricciones de la migración y puede leerse/escribirse en una base temporal.

- [x] **M2-T007 — Instalar la base referencial de clientes** · 25 min · Depende de: M2-T004 · RF-09, RF-31, RF-38–RF-40
  Hecho cuando: migración y entidad conservan los datos previstos de cliente y sus claves por negocio, sin añadir rutas de gestión o consulta de clientes.

- [x] **M2-T008 — Migrar citas con intervalos canónicos** · 25 min · Depende de: M2-T007 · RF-09, RF-15–RF-20, RF-31–RF-32, RF-38–RF-41
  Hecho cuando: la migración instala citas con inicio/fin UTC de precisión milisegundo, zona de reserva, estados, folio, origen, referencias compuestas e índices; rechaza fin no posterior al inicio.

- [x] **M2-T009 — Representar citas y su duración conservada** · 20 min · Depende de: M2-T008 · RF-18, RF-20, RF-31–RF-32
  Hecho cuando: la entidad permite leer y guardar citas de prueba sin perder precisión ni recalcular su fin desde el servicio; mantiene las relaciones del mismo negocio.

- [x] **M2-T010 — Migrar apartados con vigencia y titular hash** · 25 min · Depende de: M2-T008 · RF-09, RF-15, RF-18, RF-33–RF-36
  Hecho cuando: la tabla bloqueos_temporales incluye combinación completa, intervalo UTC, expiración, liberación y hash; no contiene session_token utilizable y sus claves impiden asociaciones ajenas.

- [x] **M2-T011 — Representar apartados en TypeORM** · 20 min · Depende de: M2-T010 · RF-18, RF-33–RF-36
  Hecho cuando: la entidad conserva la precisión de intervalo/expiración, admite liberación anulable y coincide con las claves y restricciones de la migración.

- [x] **M2-T012 — Sincronizar el esquema de configuración y clientes** · 15 min · Depende de: M2-T006, M2-T007 · RF-01–RF-07, RF-09
  Hecho cuando: las secciones de configuración y clientes en db/schema.sql coinciden con entidades y migraciones; no se ejecuta el instalador sobre una base cotidiana.

- [x] **M2-T013 — Sincronizar el esquema de citas y apartados** · 20 min · Depende de: M2-T009, M2-T011, M2-T012 · RF-09, RF-18, RF-20, RF-31–RF-36
  Hecho cuando: db/schema.sql usa el modelo UTC, referencias y hash nuevos, sin duplicar tablas ni alterar los diseños todavía ajenos a esta entrega.

- [x] **M2-T014 — Preparar datos de prueba de ocupaciones** · 20 min · Depende de: M2-T009, M2-T011 · RF-09, RF-18, RF-31–RF-34, RF-38–RF-40
  Hecho cuando: los helpers crean citas y apartados en dos negocios, varias sucursales y servicios, con reloj explícito, usando únicamente bases temporales y sin endpoints de reserva.

- [x] **M2-T015 — Verificar instalación y rechazo de esquemas antiguos** · 25 min · Depende de: M2-T013, M2-T014 · RF-01–RF-07, RF-09, RF-18, RF-31–RF-36
  Hecho cuando: una base temporal desde migraciones llega a la fase 3; una instalación con tablas antiguas incompatibles se detiene sin convertir ni sobrescribir sus datos; se conserva el resultado.

- [x] **M2-T016 — Comparar esquema SQL y migraciones** · 25 min · Depende de: M2-T015 · RF-01–RF-07, RF-09, RF-18, RF-31–RF-36
  Hecho cuando: la comparación de las tablas de esta fase verifica columnas, precisión temporal, índices y restricciones, y confirma synchronize y migrationsRun desactivados.

- [x] **M2-T017 — Probar pertenencia e intervalos en base de datos** · 25 min · Depende de: M2-T014 · RF-09, RF-15, RF-18, RF-20, RF-31–RF-36
  Hecho cuando: MariaDB rechaza referencias entre negocios e intervalos nulos/invertidos; acepta intervalos válidos y preserva identidad y oferta previa del fix.

- [x] **M2-T018 — Incorporar ocupaciones a la política de eliminación** · 20 min · Depende de: M2-T009, M2-T011 · RF-12, RF-20, RF-31–RF-34, RF-38–RF-41
  Hecho cuando: las bajas de sucursales, servicios o profesionales con citas/apartados relacionados se rechazan con el mensaje previsto; las desactivaciones siguen disponibles.

- [x] **M2-T019 — Probar conservación del historial ante bajas** · 20 min · Depende de: M2-T018, M2-T014 · RF-12, RF-20, RF-31–RF-34, RF-38–RF-41
  Hecho cuando: pruebas demuestran que una baja rechazada deja citas y apartados intactos y que una desactivación conserva sus intervalos y relaciones.

## 3. Configuración de agenda

M01; decisión D01; pruebas T01.

Evidencia, flujo, archivos y pruebas de M2-T020–M2-T025: [configuración de agenda](evidencia-t020-t025.md).

- [x] **M2-T020 — Validar los cuatro parámetros de agenda** · 20 min · Depende de: M2-T006 · RF-02–RF-06
  Hecho cuando: el validador acepta los seis intervalos, anticipación no negativa múltiplo de 5 y días enteros no negativos, y rechaza conjuntos incompletos, valores desconocidos o no representables.

- [x] **M2-T021 — Consultar valores efectivos sin escribir** · 15 min · Depende de: M2-T020 · RF-02–RF-05
  Hecho cuando: un negocio sin fila obtiene Ventana Libre/15/15/60 y una consulta no crea configuración ni auditoría; una fila existente devuelve sus valores.

- [x] **M2-T022 — Guardar configuración de forma íntegra** · 25 min · Depende de: M2-T021 · RF-01, RF-06–RF-07
  Hecho cuando: el administrador actual del negocio puede reemplazar el conjunto bajo bloqueo de negocio; todo fallo conserva la configuración anterior y no se acepta un negocio proporcionado por el cliente.

- [x] **M2-T023 — Auditar cambios reales de configuración** · 20 min · Depende de: M2-T022 · RF-01, RF-06–RF-07
  Hecho cuando: dato y evento anterior/nuevo se confirman juntos; repetir valores no crea otro evento y un fallo de auditoría revierte la modificación.

- [x] **M2-T024 — Probar valores iniciales, validación y rollback** · 20 min · Depende de: M2-T023 · RF-01–RF-07
  Hecho cuando: pasan los casos 0/5/15 y 7/negativos/fracciones para anticipación, horizonte 0/60, los seis intervalos y reemplazo inválido sin cambios ni eventos.

- [x] **M2-T025 — Probar primeras escrituras concurrentes** · 25 min · Depende de: M2-T023, M2-T014 · RF-01, RF-06–RF-07
  Hecho cuando: dos conexiones independientes producen una sola fila de configuración, sin conjuntos parciales; solo las transiciones reales confirmadas generan auditoría.

## 4. Permisos y oferta efectiva

M02; decisiones D02–D03; pruebas T02–T04.

Evidencia, flujo, archivos y pruebas de M2-T026–M2-T030: [permisos y oferta efectiva](evidencia-t026-t030.md).

- [x] **M2-T026 — Añadir permisos específicos de disponibilidad** · 20 min · Depende de: M2-T004 · RF-01, RF-08–RF-09, RF-29–RF-30, RF-40
  Hecho cuando: administrador y recepción pueden consultar al negocio, Profesional solo a sí mismo y solo administrador configura; no se añaden permisos de gestión a recepción ni acceso operativo al superadmin.

- [x] **M2-T027 — Resolver actor, pertenencia y acceso actual** · 25 min · Depende de: M2-T026 · RF-08–RF-10, RF-30, RF-40, RF-45
  Hecho cuando: el contexto usa cuenta, negocio, sesión y política de licencia actuales; distingue 401, 403 y 404 conforme al plan y no confía en IDs de negocio o permisos antiguos del token.

- [x] **M2-T028 — Extraer la lectura interna de oferta** · 25 min · Depende de: M2-T027 · RF-09, RF-11–RF-12
  Hecho cuando: el colaborador acepta el contexto de lectura autorizado y devuelve asignación y seis estados fuente sin abrir otra transacción ni elevar los permisos de recepción.

- [x] **M2-T029 — Aplicar oferta efectiva a las nuevas consultas** · 20 min · Depende de: M2-T028 · RF-11–RF-12, RF-30
  Hecho cuando: cada estado inactivo o selección ausente excluye nuevas ranuras públicas y manuales, conserva preferencias e identifica el motivo solo para actores autorizados.

- [x] **M2-T030 — Probar estados, permisos y continuidad de oferta** · 25 min · Depende de: M2-T029, M2-T003 · RF-08–RF-12, RF-30, RF-40
  Hecho cuando: se prueba cada estado por separado, perfil propio/ajeno, selección vacía, reactivación y dos negocios; el contrato anterior de oferta sigue cumpliéndose.

## 5. Proyección de atención con anclajes

M03; decisiones D04–D05; pruebas T05, T06 y T08.

Evidencia, flujo, archivos, pruebas y fallos históricos ajenos al tramo: [M2-T031–M2-T038](evidencia-t031-t038.md).

- [x] **M2-T031 — Conservar origen e inicio de los bloques** · 25 min · Depende de: M2-T004 · RF-13, RF-18–RF-19, RF-21, RF-23
  Hecho cuando: la proyección interna conserva identidad, origen semanal/excepción, fecha, zona y extremos originales; la respuesta pública anterior de atención no añade cambios incompatibles.

- [x] **M2-T032 — Compartir resolución de semana y excepción** · 20 min · Depende de: M2-T031 · RF-13, RF-18–RF-19
  Hecho cuando: una excepción reemplaza solo el día y sucursal correspondientes, incluida la excepción vacía; las demás franjas conservan su origen y anclaje.

- [x] **M2-T033 — Extraer lectura interna de bloqueos aplicables** · 25 min · Depende de: M2-T027, M2-T031 · RF-09, RF-13–RF-14, RF-40
  Hecho cuando: la lectura autorizada usa el contexto recibido y resuelve bloqueos personales/colectivos y de una/todas las sucursales; las rutas existentes de gestión mantienen sus permisos.

- [x] **M2-T034 — Descontar descansos y unión de bloqueos** · 20 min · Depende de: M2-T032, M2-T033 · RF-13–RF-14, RF-21, RF-23
  Hecho cuando: cada tramo resultante conserva su bloque original y ninguna excepción anula descansos o bloqueos; quitar una restricción deja las restantes.

- [x] **M2-T035 — Comprobar cabida en atención continua** · 20 min · Depende de: M2-T034 · RF-15–RF-17, RF-21
  Hecho cuando: los intervalos de inicio incluido/fin excluido permiten límites exactos y citas entre bloques consecutivos de la misma sucursal, sin fusionar sus anclajes.

- [x] **M2-T036 — Conservar reglas de horas locales y omisiones** · 20 min · Depende de: M2-T032 · RF-18–RF-19, RF-42
  Hecho cuando: las horas explícitas inexistentes o repetidas se rechazan y las recurrencias afectadas se omiten con motivo, reutilizando las reglas vigentes del calendario.

- [x] **M2-T037 — Probar atención, cortes y continuidad** · 25 min · Depende de: M2-T035, M2-T036 · RF-13–RF-19, RF-21, RF-23
  Hecho cuando: pasan excepción vacía, bloqueos superpuestos, fin exacto, un minuto de empalme y cita 10:30–11:30 entre bloques 09:00–11:00 y 11:00–13:00.

- [x] **M2-T038 — Probar que las restricciones no reanclan** · 20 min · Depende de: M2-T037 · RF-16–RF-17, RF-21–RF-23
  Hecho cuando: con anclaje 09:00 y paso 15, un descanso hasta 10:07 conserva 10:15; se preservan bloques independientes, sus límites y las omisiones del contrato anterior.

## 6. Lectura de ocupaciones

M04; decisiones D05–D08; pruebas T06, T07 y T12.

- [x] **M2-T039 — Consultar citas ocupantes de todas las sucursales** · 25 min · Depende de: M2-T009, M2-T027 · RF-09, RF-15, RF-18, RF-20, RF-31–RF-32
  Hecho cuando: la consulta por negocio y Profesional lee el intervalo guardado de toda cita no cancelada que cruce el rango, aunque comience fuera, tenga otro servicio o distinta fecha local.

- [x] **M2-T040 — Consultar apartados vigentes con reloj** · 20 min · Depende de: M2-T011, M2-T027 · RF-09, RF-15, RF-18, RF-33–RF-34
  Hecho cuando: solo ocupan los apartados no liberados con ahora menor que expira_en; se usa el reloj recibido y no se requiere limpieza física.

- [x] **M2-T041 — Unificar ocupaciones para el motor** · 20 min · Depende de: M2-T039, M2-T040 · RF-15, RF-18, RF-25, RF-31–RF-34
  Hecho cuando: la proyección común conserva tipo y extremos reales, excluye canceladas/expirados y no expone clientes ni titulares en resultados de disponibilidad.

- [x] **M2-T042 — Probar estados y vencimiento exacto en BD** · 25 min · Depende de: M2-T041, M2-T014 · RF-15, RF-18, RF-31–RF-34
  Hecho cuando: cada estado no cancelado ocupa; cancelar libera solo esa ocupación; apartados vigentes, liberados y vencidos en el instante exacto se distinguen aun conservando las filas.

- [x] **M2-T043 — Probar colisiones entre zonas y servicios** · 20 min · Depende de: M2-T042, M2-T036 · RF-15, RF-18–RF-20, RF-31–RF-34
  Hecho cuando: ocupaciones de otra sucursal/servicio y distinto día local impiden el empalme real; cambiar duración de 30 a 45 no modifica el intervalo de la cita existente.

## 7. Cálculo de disponibilidad

M05; decisiones D04–D06 y D09–D11; pruebas T05–T12.

- [x] **M2-T044 — Unificar reloj y contexto de lectura del motor** · 25 min · Depende de: M2-T021, M2-T029, M2-T034, M2-T036, M2-T041 · RF-07, RF-10–RF-15, RF-31–RF-34, RF-42–RF-44
  Hecho cuando: configuración, oferta, atención y ocupaciones se leen con el mismo contexto transaccional e instante del reloj, sin consultas escapadas a repositorios o relojes independientes.

- [x] **M2-T045 — Generar inicios desde anclajes originales** · 20 min · Depende de: M2-T044, M2-T035 · RF-16–RF-17, RF-21–RF-22
  Hecho cuando: cada bloque genera su secuencia con el paso configurado; los límites compartidos no duplican candidatos y los cortes por restricciones no cambian el anclaje.

- [x] **M2-T046 — Filtrar candidatos por duración y ocupaciones** · 20 min · Depende de: M2-T045 · RF-11–RF-12, RF-15–RF-20, RF-31–RF-34
  Hecho cuando: solo sobreviven intervalos con servicio completo, oferta vigente, atención continua y ausencia de empalmes en cualquier sucursal; se admiten extremos exactamente contiguos.

- [x] **M2-T047 — Aplicar anticipación y horizonte local** · 20 min · Depende de: M2-T046 · RF-04–RF-05, RF-24, RF-27–RF-28, RF-43
  Hecho cuando: se aceptan los límites exactos de anticipación y último día local, incluidos ceros; un horizonte sin candidatos devuelve vacío sin cambiar la configuración.

- [x] **M2-T048 — Completar Ventana Libre y su resultado** · 20 min · Depende de: M2-T047 · RF-19, RF-21–RF-22, RF-42–RF-43
  Hecho cuando: se devuelven todos los candidatos válidos ordenados y únicos, con combinación, zona, reglas, instante de cálculo y omisiones, sin datos privados de las ocupaciones.

- [x] **M2-T049 — Iniciar grupos independientes en Agenda Compacta** · 20 min · Depende de: M2-T047 · RF-23–RF-24, RF-27
  Hecho cuando: cada bloque/tramo vacío ofrece su primer candidato válido sin esperar otro tramo o día; 10:07 más 30 minutos con paso 15 ofrece 10:45 si cabe el servicio.

- [x] **M2-T050 — Buscar candidatos antes y después de ocupaciones** · 25 min · Depende de: M2-T049, M2-T041 · RF-15–RF-17, RF-21, RF-25, RF-31, RF-33
  Hecho cuando: se seleccionan los inicios más próximos en ambos lados, ajustados a la secuencia; se respetan los extremos reales de citas que cruzan bloques y las demás ocupaciones.

- [x] **M2-T051 — Resolver huecos sin candidatos contiguos** · 20 min · Depende de: M2-T050 · RF-23–RF-27, RF-34
  Hecho cuando: si no queda candidato próximo válido se ofrece el primer inicio restante del tramo; al expirar una referencia se recalcula la oferta y otro día sigue siendo elegible.

- [x] **M2-T052 — Calcular inicios válidos por minuto en manual** · 20 min · Depende de: M2-T046 · RF-08–RF-12, RF-29–RF-30
  Hecho cuando: la modalidad manual ofrece cualquier minuto válido desde ahora, omite únicamente las cuatro restricciones comerciales y mantiene permisos, licencia, oferta y condiciones físicas.

- [x] **M2-T053 — Validar un inicio puntual con el mismo motor** · 20 min · Depende de: M2-T048, M2-T051, M2-T052 · RF-15–RF-30, RF-31–RF-35, RF-42–RF-45
  Hecho cuando: un inicio público debe pertenecer a la oferta actual de su estrategia; el manual cumple cabida y acceso; el resultado indica fin y causas sin crear cita ni apartado.

- [x] **M2-T054 — Probar selección y ajuste de Agenda Compacta** · 25 min · Depende de: M2-T053, M2-T038 · RF-16–RF-17, RF-21–RF-27, RF-31, RF-33–RF-34
  Hecho cuando: pasan grupos independientes, ambos lados, duración no múltiplo del paso, referencia de otro servicio, apartado vigente/expirado y apertura de otro grupo sin llenar otro día.

- [x] **M2-T055 — Probar límites públicos con reloj controlado** · 20 min · Depende de: M2-T048, M2-T049 · RF-02–RF-05, RF-24, RF-27–RF-28, RF-43
  Hecho cuando: pasan 10:45 en el ejemplo acordado, anticipación exacta/0, horizonte 0/60, último día incluido, medianoche local y anticipación superior al horizonte.

- [x] **M2-T056 — Probar excepciones comerciales y límites manuales** · 20 min · Depende de: M2-T052, M2-T030, M2-T043 · RF-08–RF-12, RF-15–RF-19, RF-29–RF-31
  Hecho cuando: 10:07 es válido pese a paso público 15 cuando está libre; pasado, descanso, cierre, oferta inactiva y cita en otra sucursal siguen rechazándose.

## 8. Superficie HTTP privada y errores

M07; decisiones D02, D10, D14 y D15; pruebas T01–T04 y T15.

- [x] **M2-T057 — Definir entradas de configuración y sus errores** · 15 min · Depende de: M2-T020 · RF-01–RF-06, RF-45
  Hecho cuando: el contrato exige los cuatro campos camelCase y rechaza valores ausentes/extra no admitidos sin coerciones que conviertan fracciones o valores desconocidos en válidos.

- [x] **M2-T058 — Validar consultas por fechas y modalidad** · 20 min · Depende de: M2-T027 · RF-08–RF-09, RF-28–RF-30, RF-42–RF-45
  Hecho cuando: se validan IDs, fechas, rangos inclusivos de hasta 31 días y modalidad pública por defecto; 32 días y rangos invertidos se rechazan sin limitar el horizonte configurable.

- [x] **M2-T059 — Validar fecha y hora de una consulta puntual** · 15 min · Depende de: M2-T058, M2-T036 · RF-18–RF-19, RF-29–RF-30, RF-45
  Hecho cuando: la entrada puntual acepta minutos válidos y rechaza horas imposibles/ambiguas, IDs inválidos y cualquier identidad de apartado aportada para excluir ocupaciones.

- [x] **M2-T060 — Exponer lectura y reemplazo de configuración** · 20 min · Depende de: M2-T057, M2-T023, M2-T027 · RF-01–RF-07, RF-09–RF-10
  Hecho cuando: GET/PUT de configuración se registran como privados y exclusivos del administrador; devuelven valores efectivos y preservan el reemplazo íntegro.

- [x] **M2-T061 — Exponer consulta privada de ranuras** · 20 min · Depende de: M2-T058, M2-T048, M2-T051, M2-T052 · RF-08–RF-34, RF-42–RF-45
  Hecho cuando: GET /disponibilidad aplica permisos y modalidad, devuelve el contrato del plan y no habilita consulta anónima por indicar modalidad pública.

- [x] **M2-T062 — Exponer validación puntual sin reservar** · 20 min · Depende de: M2-T059, M2-T053 · RF-08–RF-30, RF-31–RF-35, RF-42–RF-45
  Hecho cuando: POST /disponibilidad/validar devuelve válido o causas funcionales con el fin calculado; repetirlo no inserta ni altera citas o apartados.

- [x] **M2-T063 — Distinguir vacío legítimo y fallo técnico** · 20 min · Depende de: M2-T061, M2-T062, M2-T060 · RF-06, RF-09, RF-12, RF-19, RF-42–RF-45
  Hecho cuando: se mantienen 400/401/403/404, vacío legítimo con 200 y validación negativa con 200; fallos temporales 503 e inesperados 500 no devuelven ranuras parciales ni SQL o trazas.

- [x] **M2-T064 — Probar acceso y aislamiento de las rutas nuevas** · 25 min · Depende de: M2-T063, M2-T014 · RF-01, RF-08–RF-12, RF-29–RF-30, RF-45
  Hecho cuando: HTTP prueba administrador, recepción, Profesional propio/ajeno, superadmin, dos negocios y ausencia de sesión; recepción no adquiere gestión ni configuración.

- [x] **M2-T065 — Probar acceso con sesión abierta y licencia** · 20 min · Depende de: M2-T064 · RF-10, RF-30
  Hecho cuando: con reloj controlado una sesión abierta accede antes de 48 horas y falla exactamente en el límite/después; también falla al vencer antes y con cuenta o sesión inactiva.

- [x] **M2-T066 — Probar entradas, errores y reintentos** · 25 min · Depende de: M2-T063, M2-T024 · RF-06, RF-09, RF-12, RF-19, RF-42–RF-45
  Hecho cuando: HTTP distingue día lleno, oferta inactiva, rango inválido, hora ambigua, caída de BD y fallo del motor; un reintento recuperado no duplica escrituras ni muestra datos privados.

## 9. Identificación de citas afectadas

M06; decisiones D03 y D13; pruebas T14 y T15.

- [x] **M2-T067 — Consultar candidatas sin descartar estados inactivos** · 20 min · Depende de: M2-T039, M2-T027 · RF-09, RF-20, RF-38–RF-40
  Hecho cuando: la lectura por fechas/sucursal/perfil incluye citas no canceladas de recursos desactivados, conserva su intervalo guardado y limita al Profesional a sí mismo.
3
- [x] **M2-T068 — Calcular causas de horario, descanso y bloqueo** · 25 min · Depende de: M2-T067, M2-T034, M2-T035 · RF-20, RF-38, RF-40–RF-41
  Hecho cuando: cada cita identifica falta de atención, descanso y todos los bloqueos que la afecten, con referencias verificables; la duración se obtiene de la cita.

- [x] **M2-T069 — Calcular causas por desactivación o retiro** · 20 min · Depende de: M2-T067, M2-T028 · RF-11–RF-12, RF-39–RF-41
  Hecho cuando: las citas futuras identifican cada estado de oferta inactivo o asignación/selección retirada, incluso cuando el recurso ya no produce ranuras.

- [x] **M2-T070 — Componer causas vigentes sin cambiar citas** · 20 min · Depende de: M2-T068, M2-T069 · RF-07, RF-20, RF-31–RF-32, RF-38–RF-41
  Hecho cuando: la consulta reúne causas sin duplicados, elimina las que desaparecen, conserva las demás y no cambia estado/intervalo, libera ocupaciones ni envía mensajes.

- [x] **M2-T071 — Exponer consulta privada de afectaciones** · 20 min · Depende de: M2-T070, M2-T058, M2-T063 · RF-09, RF-20, RF-38–RF-45
  Hecho cuando: GET /disponibilidad/citas-afectadas filtra por negocio y perfil permitido, interpreta fechas por sucursal y devuelve solo IDs operativos, intervalo y causas.

- [x] **M2-T072 — Probar cambios de horario y bloqueos con citas** · 25 min · Depende de: M2-T071, M2-T014 · RF-20, RF-31–RF-32, RF-38, RF-40–RF-41
  Hecho cuando: guardar un cambio válido identifica sus citas afectadas sin cancelarlas; retirar uno de dos bloqueos mantiene la otra causa y cancelar una cita la retira del listado.

- [x] **M2-T073 — Probar estados de oferta y causas excluidas** · 25 min · Depende de: M2-T071, M2-T030 · RF-07, RF-20, RF-39–RF-41
  Hecho cuando: se identifica cada desactivación futura y su reactivación; cambiar modo, paso, anticipación, horizonte o duración del catálogo no marca por sí solo una cita; HTTP deniega perfiles/negocios ajenos.

## 10. Contrato interno para reservas posteriores

M08; decisiones D08, D11 y D12; pruebas T13. Implementa preparación y colaboración del motor, no el flujo de reservas.

- [x] **M2-T074 — Definir validación en transacción del escritor** · 20 min · Depende de: M2-T053, M2-T044 · RF-10–RF-12, RF-15, RF-30, RF-35
  Hecho cuando: el contrato interno admite contexto autorizado y transacción recibida, reevalúa el estado vigente y no crea reservas ni ofrece al HTTP un comprobante de disponibilidad garantizada.

- [x] **M2-T075 — Validar propiedad y combinación del apartado** · 25 min · Depende de: M2-T074, M2-T040 · RF-09, RF-20, RF-33–RF-36
  Hecho cuando: el motor solo admite excluir un apartado cuyo titular hash, negocio, Profesional, sucursal, servicio, intervalo y vigencia se comprueban; expiración o incompatibilidad obliga a obtener disponibilidad vigente.

- [x] **M2-T076 — Excluir únicamente el apartado propio comprobado** · 20 min · Depende de: M2-T075 · RF-15, RF-31–RF-36
  Hecho cuando: la exclusión interna conserva las demás ocupaciones, incluso de la misma sucursal o servicio, y nunca queda accesible mediante un ID arbitrario en HTTP.

- [x] **M2-T077 — Probar revalidación y apartado propio** · 25 min · Depende de: M2-T076, M2-T014, M2-T062 · RF-09–RF-12, RF-15, RF-20, RF-30, RF-35–RF-36
  Hecho cuando: pruebas de colaboración rechazan cambios de oferta/horario/duración, apartado expirado, titular o combinación distintos y otra ocupación; quedan rotuladas como no equivalentes a una reserva real.

- [x] **M2-T078 — Documentar coordinación de futuros escritores** · 20 min · Depende de: M2-T077 · RF-07, RF-10–RF-15, RF-30–RF-39
  Hecho cuando: el contrato identifica fila común por Profesional, orden de bloqueos, relectura y reloj después de esperar, consumo atómico, rollback y coordinación con cambios colectivos; RF-37 queda pendiente de evidencia con escritores reales.

- [x] **M2-T079 — Preparar aceptación de integración T18** · 15 min · Depende de: M2-T078 · RF-10–RF-12, RF-15, RF-18, RF-30–RF-37
  Hecho cuando: cada caso diferido al final de este documento tiene precondición de módulo 3/4, dos conexiones y resultado esperado, sin añadir escritores ficticios ni marcarlo aprobado.

## 11. Integración, regresión y cierre de fase 3

Pruebas T07, T15–T17 y gates del plan. T18 no condiciona el cierre documental de la fase 3 y sigue pendiente de integración real.

- [x] **M2-T080 — Verificar duración conservada de extremo a extremo** · 20 min · Depende de: M2-T061, M2-T077, M2-T071 · RF-07, RF-15, RF-20, RF-31, RF-35–RF-36, RF-38–RF-41
  Hecho cuando: editar un servicio de 30 a 45 cambia nuevas ranuras, preserva la cita de prueba y rechaza un apartado incompatible sin alterar compromisos previos.

- [x] **M2-T081 — Probar lectura coherente con cambios concurrentes** · 25 min · Depende de: M2-T044, M2-T061, M2-T025 · RF-07, RF-10–RF-14, RF-31–RF-34, RF-42–RF-44
  Hecho cuando: dos conexiones coordinadas cambian configuración/oferta durante una consulta y el resultado corresponde a una lectura coherente, sin mezclar estados ni convertir un fallo en vacío.

- [x] **M2-T082 — Verificar compatibilidad de los contratos anteriores** · 25 min · Depende de: M2-T073, M2-T064, M2-T003, M2-T038 · RF-08–RF-14, RF-18–RF-19, RF-38–RF-45
  Hecho cuando: las suites relevantes del módulo 1 y fix conservan respuestas de oferta/atención, omisiones y permisos; recepción sigue sin modificar horarios, bloqueos o catálogo.

- [x] **M2-T083 — Revisar omisiones de datos sensibles** · 15 min · Depende de: M2-T066, M2-T071, M2-T076, M2-T023 · RF-01, RF-09, RF-33–RF-36, RF-40, RF-42–RF-45
  Hecho cuando: respuestas y auditoría nuevas no contienen clientes, titular_hash, tokens utilizables, SQL ni trazas internas; se mantiene el error uniforme para referencias ajenas.

- [x] **M2-T084 — Verificar compilación del backend** · 20 min · Depende de: M2-T001–M2-T083 · RF-01–RF-45
  Hecho cuando: npm run build termina correctamente desde la raíz y se registra la revisión comprobada; cualquier fallo permanece como impedimento explícito para cerrar.

- [x] **M2-T085 — Verificar lint sin errores** · 15 min · Depende de: M2-T084 · RF-01–RF-45
  Hecho cuando: npm run lint termina correctamente sobre la entrega y queda registrada la evidencia; no se marca aprobado si hubo errores.

- [ ] **M2-T086 — Verificar la suite unitaria final** · 20 min · Depende de: M2-T085 · RF-01–RF-45
  Hecho cuando: npm test -- --runInBand pasa en la revisión final, con resultados de las reglas del motor identificados y sin presentar RF-37 como prueba de reservas reales.

- [ ] **M2-T087 — Verificar integración de modelo y configuración** · 25 min · Depende de: M2-T086 · RF-01–RF-12, RF-18, RF-20, RF-31–RF-41
  Hecho cuando: las suites relevantes de test:integration sobre bases temporales pasan para migración, paridad, pertenencia, configuración, bajas e historial y su evidencia identifica los RF cubiertos.

- [ ] **M2-T088 — Verificar integración temporal y concurrencia de lecturas** · 25 min · Depende de: M2-T087 · RF-07–RF-34, RF-38–RF-45
  Hecho cuando: las suites relevantes de test:integration pasan para lectura coherente, carreras de configuración, ocupaciones, expiración y afectaciones; las pruebas T18 siguen identificadas como futuras.

- [ ] **M2-T089 — Verificar recorridos HTTP de fase 3** · 25 min · Depende de: M2-T088 · RF-01–RF-45
  Hecho cuando: las suites relevantes de test:e2e pasan para las cinco rutas, roles, límites de licencia, validación y errores; no se atribuye a esos recorridos confirmación real de citas.

- [ ] **M2-T090 — Documentar el contrato entregado y sus límites** · 20 min · Depende de: M2-T089 · RF-01–RF-45
  Hecho cuando: la referencia de la entrega recoge rutas, permisos, valores iniciales, errores, rango técnico de 31 días y distinción entre validación y reserva; sus enlaces son válidos y los pendientes RF-35–RF-37 quedan visibles.

- [ ] **M2-T091 — Cerrar trazabilidad de la fase 3** · 20 min · Depende de: M2-T090, M2-T001 · RF-01–RF-45
  Hecho cuando: los 12 criterios de la spec se vinculan con evidencias de esta revisión o con obligaciones futuras explícitas; todas las tareas aplicables tienen evidencia y ninguna prueba omitida aparece como aprobada.

## 12. Verificación diferida a módulos 3 y 4

Estas casillas corresponden a T18 del plan y **no son tareas de implementación ni gates de cierre de fase 3**. Además de sus dependencias, requieren que los módulos 3/4 hayan implementado y conectado sus escritores reales y el protocolo documentado. No se completan con dobles de prueba ni ejecutando solo el motor. No autorizan adelantar esos flujos a este módulo.

- [ ] **M2-I001 — Preparar carreras sobre escritores reales** · 20 min · Depende de: M2-T091 · RF-35–RF-37
  Hecho cuando: con módulos 3/4 disponibles, el ejecutor usa dos conexiones independientes y barreras reproducibles sobre sus escritores reales, con rollback y limpieza limitados a bases temporales.

- [ ] **M2-I002 — Probar doble reserva del mismo intervalo** · 20 min · Depende de: M2-I001 · RF-15, RF-31, RF-35–RF-37
  Hecho cuando: dos confirmaciones incompatibles del mismo Profesional aceptan exactamente una; la otra informa conflicto y no deja efectos parciales.

- [ ] **M2-I003 — Probar solapamiento parcial entre sucursales** · 20 min · Depende de: M2-I001 · RF-15, RF-18, RF-31, RF-35–RF-37
  Hecho cuando: reservas con inicios distintos e intervalos superpuestos en sucursales diferentes aceptan una sola, comparando UTC incluso entre fechas locales distintas.

- [ ] **M2-I004 — Probar apartado público contra reserva manual** · 25 min · Depende de: M2-I001 · RF-29–RF-30, RF-33, RF-35–RF-37
  Hecho cuando: la carrera entre apartado público y cita manual respeta el mismo bloqueo de Profesional; omitir restricciones comerciales no permite dos ocupaciones incompatibles.

- [ ] **M2-I005 — Probar expiración durante espera de bloqueo** · 20 min · Depende de: M2-I001 · RF-33–RF-37
  Hecho cuando: al avanzar el reloj hasta la expiración mientras espera el escritor, la confirmación relee la vigencia y rechaza el apartado; no lo revive ni consume como válido.

- [ ] **M2-I006 — Probar confirmación contra cambios comerciales y de oferta** · 25 min · Depende de: M2-I001 · RF-07, RF-11–RF-12, RF-20, RF-35–RF-37
  Hecho cuando: cambios concurrentes de configuración, oferta o duración producen una confirmación consistente con el orden transaccional; ninguna condición previa del cliente evita la revalidación.

- [ ] **M2-I007 — Probar confirmación contra horario y bloqueos colectivos** · 25 min · Depende de: M2-I001 · RF-13–RF-15, RF-35–RF-39
  Hecho cuando: las carreras cubren horario, bloqueo colectivo y cambio de asignación; si la reserva se confirma primero, el cambio válido identifica su afectación, y si la restricción se confirma primero, la reserva incompatible se rechaza.

- [ ] **M2-I008 — Probar vigencia de licencia tras esperar** · 20 min · Depende de: M2-I001 · RF-10, RF-30, RF-35–RF-37
  Hecho cuando: vencimiento natural o límite de 48 horas alcanzado antes de revalidar tras el bloqueo impide confirmar, incluso con sesión previamente abierta.

- [ ] **M2-I009 — Probar consumo único, rollback y reintentos** · 25 min · Depende de: M2-I002, M2-I003, M2-I004, M2-I005, M2-I006, M2-I007, M2-I008 · RF-31–RF-37
  Hecho cuando: doble confirmación de un apartado, fallo transaccional y reintento no duplican citas ni consumo; la cita y el consumo se confirman juntos y el rollback conserva el estado anterior.

## Correspondencia con los grupos de tests del plan

| Grupo del plan | Tareas con evidencia prevista |
| --- | --- |
| T01 | M2-T024, M2-T025, M2-T060, M2-T066 |
| T02 | M2-T026, M2-T030, M2-T064, M2-T073 |
| T03 | M2-T065 |
| T04 | M2-T030, M2-T056 |
| T05 | M2-T037, M2-T046 |
| T06 | M2-T036, M2-T043, M2-T055 |
| T07 | M2-T043, M2-T077, M2-T080 |
| T08 | M2-T038, M2-T045, M2-T054 |
| T09 | M2-T054 |
| T10 | M2-T055 |
| T11 | M2-T056, M2-T064 |
| T12 | M2-T042 |
| T13 | M2-T077 |
| T14 | M2-T072, M2-T073 |
| T15 | M2-T066, M2-T071, M2-T083 |
| T16 | M2-T015, M2-T016, M2-T017, M2-T019 |
| T17 | M2-T081, M2-T082 |
| T18 — diferido | M2-I001, M2-I002, M2-I003, M2-I004, M2-I005, M2-I006, M2-I007, M2-I008, M2-I009 |
