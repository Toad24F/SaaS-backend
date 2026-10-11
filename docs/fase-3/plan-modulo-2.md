# Plan de implementación — Fase 3, módulo 2

## 1. Fuentes, alcance y estado comprobado

Fuentes: [constitución](constitucion.md), [especificación del módulo 2](spec-modulo-2.md), [AGENTS.md](../../AGENTS.md) y las reglas compatibles de la [especificación del módulo 1](../fase-2-modulo-1/spec-modulo-1.md). Su [plan](../fase-2-modulo-1/plan-modulo-1.md) sirve para coordinar dependencias, no para acreditar funcionalidades existentes. Todos los RF citados a continuación pertenecen a la especificación del módulo 2.

Este documento organiza una implementación futura. Su creación no implementa el motor ni acredita pruebas funcionales. Se mantiene NestJS, TypeScript, TypeORM y MariaDB/MySQL, con nombres de dominio en español.

**Entrega:** configuración por negocio, consulta autenticada de disponibilidad, motor común para uso público futuro y manual, validación interna reutilizable y detección de citas afectadas por bloqueos. **Exclusiones:** pantallas, consulta anónima, creación o gestión de citas, creación/renovación/liberación de apartados, cancelaciones automáticas, WhatsApp y reportes.

Las precisiones de la spec aprobada gobiernan las referencias generales de la constitución: zona horaria por sucursal, elección de otra fecha sin llenar la anterior, pequeños huecos por ajuste al intervalo y excepciones comerciales para uso manual. No se modificarán esos acuerdos al implementar.

### Punto de partida

- Existen autenticación, sesiones, autorización centralizada, política de acceso por licencia, reloj inyectable, auditoría y migraciones versionadas. Se reutilizarán.
- La política de licencia ya distingue suspensión pendiente y efectiva; se conservará el acceso durante la gracia mientras no venza antes la licencia.
- En este checkout, Sucursales, Servicios, Profesionales, Horarios y Bloqueos están declarados como módulos vacíos. La disponibilidad no puede presentarse como integrada hasta que existan sus capacidades del módulo 1.
- El script SQL contiene diseños preliminares de clientes, citas y bloqueos temporales, con fechas y horas locales; no existen todavía sus entidades y migraciones operativas ni un motor de disponibilidad. La existencia del script no acredita persistencia instalada.
- Las migraciones actuales llegan a `1760000009000-SuspensionProgramadaLicencias`. La numeración de las nuevas deberá seguir la última migración existente al implementarlas, incluidas las del módulo 1 que se incorporen antes.
- Hay Jest, pruebas HTTP y utilidades para bases MariaDB desechables, reloj controlado y dos conexiones con barreras. No se necesita introducir otro ejecutor de pruebas.

### Dependencias de entrada

| Dependencia | Condición necesaria | RF dependientes |
|---|---|---|
| Catálogos y perfiles del módulo 1 | Sucursal y zona IANA, servicio y duración, perfil vinculado a usuario, estados, asignaciones y selección de servicios, con pertenencia por negocio. | RF-13–RF-14, RF-17, RF-19, RF-37, RF-44 |
| Atención efectiva del módulo 1 | Franjas y excepciones por fecha; descansos y bloqueos; omisiones por cambios de huso. Debe conservar el origen de cada bloque para alinear los inicios. | RF-15–RF-21, RF-25–RF-34, RF-51–RF-52 |
| Identidad y licencias | Cuenta y sesión actuales, propietario del perfil, negocio y licencia operativos; permisos explícitos de consulta y configuración. | RF-06, RF-08–RF-12, RF-40, RF-43–RF-49 |
| Persistencia de ocupación | Lectura real de intervalos de citas y apartados según el modelo de la sección 3. Los datos de aceptación se preparan en una base temporal; no se incorporan altas de reservas al producto. | RF-19–RF-20, RF-35–RF-42, RF-45–RF-47, RF-51–RF-52 |

Se puede avanzar con el cálculo puro y contratos mientras termina el módulo 1. Sus sustitutos de prueba no permiten cerrar la integración ni los criterios de finalización dependientes. La implementación de los catálogos y del calendario base seguirá perteneciendo al módulo 1.

## 2. Módulos, responsabilidades y cobertura

| Parte | Responsabilidad | RF cubiertos |
|---|---|---|
| M01 — ConfiguracionAgenda | Consultar valores efectivos, guardar la configuración completa por negocio, validar límites y conservar el estado previo ante errores. Auditar cambios reales. | RF-01–RF-07, RF-41 |
| M02 — AccesoDisponibilidad | Ampliar la autorización existente con configurar agenda y consultar disponibilidad; resolver negocio y propiedad del perfil con datos actuales. Aplicar cuentas, sesiones y licencias. | RF-06, RF-08–RF-14, RF-40, RF-43–RF-44, RF-48 |
| M03 — ContextoAgenda | Adaptar las consultas del módulo 1 a bloques de atención, restricciones y zonas; leer ocupación de todas las sucursales del profesional sin datos de clientes. | RF-13–RF-21, RF-24–RF-26, RF-35–RF-39, RF-49 |
| M04 — MotorDisponibilidad | Calcular inicios alineados, aplicar límites temporales y seleccionar ventana libre, compacta o posibilidades manuales. Componente puro: entradas explícitas y reloj recibido. | RF-17–RF-34, RF-38–RF-39, RF-43–RF-44, RF-50 |
| M05 — ValidacionDisponibilidad | Revalidar un inicio concreto con el contexto vigente; reconocer un apartado propio verificado, respetar su compromiso original y devolver causas de rechazo. Ofrecer una operación dentro de la transacción del futuro consumidor. | RF-12–RF-20, RF-35–RF-49 |
| M06 — AfectacionesAgenda | Identificar las citas no canceladas superpuestas con un bloqueo vigente, aplicando sus ámbitos y zonas. Entregar referencias internas sin alterar citas ni enviar avisos. | RF-10–RF-11, RF-19–RF-20, RF-35–RF-36, RF-51–RF-52 |
| M07 — DisponibilidadHttp | Exponer configuración y consulta autenticada, validar entradas, limitar el tamaño de cada consulta y traducir resultados y errores sin datos personales. | RF-01–RF-14, RF-22–RF-34, RF-42–RF-44, RF-48–RF-50 |

Estos son límites de responsabilidad; M03–M06 podrán vivir como servicios dentro de un mismo módulo Nest de disponibilidad. No convertir cada regla o estrategia en un microservicio ni crear duplicados de Horarios o Bloqueos.

**Dependencias:** HTTP llama a los casos de uso; estos componen autorización, configuración, consultas del módulo 1 y lectura de ocupación; el motor recibe datos ya normalizados. Los módulos 3 y 4 futuros llamarán a los mismos casos de uso. El calendario base no importará el módulo HTTP de disponibilidad. La detección de afectaciones recibe un bloqueo resuelto y sus destinatarios; no se conecta como una cancelación dentro del guardado de Bloqueos.

## 3. Modelo de datos y persistencia

### Datos propietarios de esta fase

| Modelo | Campos y restricciones objetivo | RF |
|---|---|---|
| `configuracion_agenda` | Una fila como máximo por `negocio_id`, clave primaria y foránea a negocios. `modo`: ventana_libre/compacta; `intervalo_minutos`: 5/10/15/20/30/60; `anticipacion_minutos`: entero 0–10080; `horizonte_dias`: entero 1–365; `version` entera creciente; fechas de creación/actualización. Valores iniciales: ventana_libre, 15, 30 y 60. | RF-01–RF-07, RF-22–RF-34, RF-41, RF-43–RF-44 |
| Auditoría de configuración | Reutilizar eventos de auditoría asociados al negocio y actor. Registrar valores anteriores/nuevos y versión únicamente cuando cambie la configuración; no guardar datos de clientes ni credenciales. | RF-06–RF-07, RF-11; calidad de la constitución |

La ausencia de fila equivale a los valores iniciales, con versión efectiva 0. Un GET no crea registros. El primer guardado válido crea la fila; los siguientes reemplazan los cuatro valores como conjunto. Serializar por negocio y hacer prevalecer el último guardado válido confirmado, sin mezclar campos de solicitudes distintas. Repetir los mismos valores no incrementa la versión ni genera otro evento de cambio.

### Datos reutilizados y contrato de ocupación

| Modelo | Datos consumidos o preparación requerida | RF |
|---|---|---|
| Negocio, licencia y usuarios | Identidad, pertenencia, rol, estado de cuenta/sesión y condiciones actuales de licencia. El usuario del perfil y el ID de perfil son identificadores distintos: se resuelven mediante su relación. | RF-06, RF-08–RF-14, RF-40, RF-43–RF-49 |
| Sucursales, servicios, personal y asignaciones | Zona IANA, estados, duración vigente del servicio y relaciones autorizadas. No duplicar costo, duración ni selección por sucursal. | RF-13–RF-21, RF-24, RF-37, RF-44 |
| Horarios, excepciones y bloqueos | Identidad del bloque original, inicio local que origina la secuencia, fecha/sucursal, intervalos de atención efectivos y omisiones. Descontar restricciones no debe perder el origen de la secuencia. | RF-15–RF-21, RF-25–RF-34, RF-51–RF-52 |
| `citas` | Conservar la tabla canónica prevista por el proyecto y sus referencias a negocio, sucursal, personal, servicio y cliente. Preparar inicio/fin como instantes UTC, duración original en minutos y zona de la sucursal al registrar la cita; conservar estado, origen y folio. El lector del motor solo proyecta ID, pertenencia, intervalo y estado. | RF-11, RF-19–RF-20, RF-31–RF-32, RF-35–RF-37, RF-45–RF-47, RF-51–RF-52 |
| `bloqueos_temporales` | Conservar el nombre preliminar para apartados y distinguirlo de bloqueos de vacaciones/emergencias. Preparar negocio, personal, sucursal y servicio, inicio/fin UTC, duración del intervalo, expiración UTC e identidad del titular mediante hash de un comprobante no adivinable. Conservar el intervalo originalmente apartado; ninguna consulta prolonga su expiración. | RF-19–RF-20, RF-31–RF-32, RF-38–RF-42, RF-45–RF-47 |
| `clientes` | Relación necesaria del modelo canónico de citas ya previsto en el SQL. Su esquema base se incorpora solo si todavía no está migrado; no se agrega gestión de clientes ni se utiliza su información en cálculos o respuestas de disponibilidad. | RF-11 y soporte de RF-35–RF-37 |

**Propiedad y alcance:** el contrato físico de citas/apartados se prepara para lectura e integridad, con entidades y migraciones mínimas donde aún falten. Las escrituras de prueba son fixtures de una base desechable. La aplicación no ofrecerá comandos de creación, consumo, renovación, cancelación ni cambio de estado en esta fase. Los módulos 3 y 4 serán propietarios futuros de esos casos de uso; adoptarán las tablas canónicas, sin mantener una segunda tabla de ocupación que pueda desincronizarse.

No se almacena una lista de horarios disponibles ni una tabla de ranuras: se derivan del calendario y la ocupación actuales. Tampoco se requiere guardar toda la configuración antigua dentro del apartado: su intervalo válido originalmente y su vigencia son el compromiso reconocido por RF-41. El consumidor futuro deberá acreditar su origen y titularidad; un cliente no podrá inventar un apartado enviando su ID.

### Invariantes y consultas

- Usar `negocio_id` en todas las tablas operativas y claves compuestas de pertenencia en relaciones. Las asignaciones actuales se verifican en los servicios; las referencias históricas de una cita no se eliminan al desactivar un recurso. **RF-10, RF-13–RF-14, RF-35–RF-37.**
- Guardar instantes de ocupación y expiración en UTC con precisión consistente; conservar zonas IANA y el calendario local del módulo 1. Configurar también el acceso a la base fuera de tests para interpretar estos instantes en UTC: actualmente solo el entorno de pruebas explicita `timezone: 'Z'`. **RF-19–RF-26, RF-37–RF-39.**
- Intervalos semiabiertos: incluyen el inicio y excluyen el fin. Hay cruce cuando cada inicio precede al fin del otro intervalo. Esto permite consecutividad exacta y evita bloquear dos veces una frontera. **RF-17–RF-20, RF-51.**
- Leer ocupación por negocio y perfil, con inicio anterior al final consultado y fin posterior al comienzo consultado. No filtrar por el servicio o la sucursal elegidos: una cita en otra ubicación también ocupa al profesional. **RF-19, RF-35–RF-39.**
- Índices de lectura por negocio, personal e inicio UTC, y de apartados por negocio, personal y expiración; comprobar el fin como filtro residual. La detección colectiva usa índices por negocio y periodo y filtra destinatarios. No afirmar que estos índices impiden empalmes por sí solos. **RF-19, RF-35–RF-39, RF-47, RF-51.**
- Una cita usa su intervalo original, aunque cambie el catálogo. Un apartado reconocido usa su intervalo guardado y solo valida ese mismo servicio, profesional, sucursal e intervalo; no permite transferir el beneficio a otro candidato. **RF-37, RF-40–RF-41.**
- Apartados vigentes: expiración estrictamente posterior al instante de evaluación. Al vencer se ignoran sin depender de un proceso de limpieza. No borrar registros como efecto de consultar. **RF-38–RF-42.**
- Las columnas locales preliminares de citas no serán otra autoridad temporal: al preparar la instalación nueva, las fechas locales se derivan de UTC y de la zona conservada. Mantener alineados entidades, migraciones y `db/schema.sql`. **RF-18–RF-21, RF-37.**

La preparación se acepta sobre una base nueva con las migraciones previas y las nuevas. No se ejecuta una conversión de instalaciones con citas existentes ni se reescriben migraciones históricas. Una conversión futura exigiría diagnosticar las zonas y horas locales almacenadas antes de transformarlas; no asignarles UTC suponiendo que ya lo eran.

## 4. Decisiones justificadas y alternativas descartadas

| Decisión | Elección y justificación | Alternativa descartada y motivo | RF |
|---|---|---|---|
| D01 — Organización | Ampliar el monolito modular existente y separar cálculo puro, consultas y autorización; facilita reutilización y pruebas sin duplicar reglas. | Microservicios o motores distintos para portal/panel: aumentan coordinación y riesgo de resultados divergentes. | RF-01–RF-52 |
| D02 — Configuración | Una configuración por negocio, valores iniciales explícitos y guardado completo serializado. | Preferencias por profesional/sucursal o valores guardados solo en navegador: contradicen el alcance y la autoridad del servidor. | RF-01–RF-07 |
| D03 — Calendario | Reutilizar atención efectiva del módulo 1, conservando origen del bloque y zona de sucursal. | Recalcular por separado recurrencias y descansos o usar la zona del servidor: introduce diferencias con el calendario aprobado. | RF-13–RF-26 |
| D04 — Ocupación | Leer citas/apartados canónicos y proyectar únicamente sus intervalos, estados y referencias necesarias. | Copiar citas a una agenda paralela o derivar la duración histórica del catálogo actual: causa desfases y altera citas existentes. | RF-11, RF-19, RF-35–RF-42 |
| D05 — Secuencia | Alinear siempre desde el inicio del bloque original, incluso después de un descanso u ocupación. | Reiniciar a las 10:10 si una cita termina allí: incumple el inicio 10:15 acordado para una secuencia de 15 minutos. | RF-25–RF-32, RF-44 |
| D06 — Compactación | Un inicio por tramo vacío; en tramos ocupados, las posiciones alineadas inmediatamente anteriores/posteriores, con hueco menor al intervalo. | Exigir contacto exacto o llenar cualquier hueco remoto: la primera opción contradice el ajuste aprobado y la segunda convierte compacta en ventana libre. | RF-28–RF-34 |
| D07 — Uso manual | Contexto manual explícito y autorizado; conserva secuencia y restricciones físicas, omite estrategia y límites comerciales. | Bypass general para personal o aplicación obligatoria de reglas públicas: respectivamente permite conflictos o niega la excepción acordada. | RF-43–RF-44 |
| D08 — Apartado propio | Reconocer titularidad e intervalo exactos desde información verificada; excluir solo ese apartado al comprobar su ocupación. | Parámetro libre de «ignorar apartado» o ID suficiente: permitiría ignorar bloqueos de otros clientes. | RF-10, RF-38–RF-42 |
| D09 — Coherencia | Consulta orientativa sobre una lectura consistente y validación final reutilizable dentro de la transacción del consumidor. | Considerar reservado un GET o validar fuera de la transacción y escribir después: deja una ventana de carreras. | RF-42, RF-45–RF-47 |
| D10 — Coordinación inicial | Reutilizar el orden de bloqueos existente y el negocio como punto común para escrituras que afecten disponibilidad. Es simple y comprobable para esta fase. | Candados solo en memoria, o bloquear exclusivamente filas de citas existentes: no cubren varios procesos ni un intervalo todavía vacío. | RF-06–RF-07, RF-45–RF-47 |
| D11 — Errores y frescura | Distinguir vacío, rechazo de negocio, entrada inválida y fallo temporal; no usar disponibilidad antigua como respuesta válida. | Convertir cualquier excepción en lista vacía o servir caché obsoleta como confirmación: oculta fallos o ofrece horarios sin comprobar. | RF-14, RF-34, RF-46, RF-48–RF-50 |
| D12 — Integración futura | Devolver afectaciones de bloqueos sin ejecutar cambios de estado o envíos. | Agregar cancelaciones y WhatsApp para demostrar el recorrido completo: amplía esta fase más allá de lo aprobado. | RF-51–RF-52 |
| D13 — Consulta acotada | Admitir hasta 31 fechas locales inclusivas por petición; consultar periodos mayores mediante varias peticiones. El horizonte comercial sigue siendo independiente. | Cargar todo el horizonte de todos los profesionales en una petición: eleva costo y dificulta delimitar fallos sin aportar una capacidad necesaria. | RF-05, RF-13, RF-24, RF-33, RF-43, RF-48–RF-49 |
| D14 — Evidencia | Probar cálculo con datos deterministas y persistencia/concurrencia con MariaDB real desechable. | Usar solo mocks o SQLite para acreditar bloqueos e integridad de MariaDB: no verifica las garantías de la base elegida. | RF-01–RF-52 |

Las decisiones D09–D10 preparan el uso futuro seguro, pero la garantía de dos reservas reales sin empalme requerirá que ambos flujos de escritura adopten el contrato. Esta fase no puede acreditarla únicamente con un cálculo sin escritores.

## 5. Flujo de cálculo y casos límite

### 5.1 Contexto y tiempo — RF-08–RF-26, RF-35–RF-39, RF-48–RF-50

1. Autorizar actor y negocio, resolver el perfil y comprobar la combinación de sucursal/servicio/profesional. No inferir permisos del `uso` solicitado ni aceptar `negocio_id` como autoridad del cliente.
2. Leer configuración, atención efectiva y ocupaciones con una vista consistente. Tomar un único instante del reloj para toda la evaluación. En una validación final, tomarlo después de adquirir los bloqueos necesarios para no validar con un tiempo anterior a la espera.
3. Conservar las franjas originales como bloques y sus inicios como origen de secuencia. Dentro de cada bloque, quitar descansos y la unión de bloqueos para formar tramos de atención. No dividir todavía por citas o apartados: hacerlo produciría falsos tramos vacíos en agenda compacta.
4. Convertir las fechas solicitadas según la zona IANA de la sucursal y leer ocupación real del profesional en todas sus sucursales. Aplicar omisiones de horas inexistentes/repetidas del módulo 1 sin moverlas ni escoger una ocurrencia.
5. Generar inicios por minutos enteros de la secuencia del bloque. El servicio completo debe caber en el tramo; no unir franjas para fabricar candidatos que las atraviesen. Una cita puede terminar exactamente a las 24:00, pero no prolongarse más allá del fin de su día local.
6. Exigir inicio estrictamente futuro, también cuando la anticipación sea cero. Para uso público, admitir igualdad en el límite de anticipación y fechas hasta hoy local más horizonte, inclusive. Evaluar la licencia con el instante de operación; no añadir una restricción de fecha de cita basada en un posible vencimiento futuro no exigida por la spec.
7. Eliminar candidatos que crucen cualquier ocupación vigente. Ordenar y deduplicar por instante de inicio y devolver la fecha solicitada sin avanzar automáticamente a otro día.

### 5.2 Estrategias — RF-27–RF-34, RF-43–RF-44

**Ventana libre:** devolver todos los candidatos válidos alineados. Si el bloque comienza a las 09:05 y el intervalo es 15, su secuencia es 09:05, 09:20, 09:35; no se alinea a los cuartos de la hora del reloj.

**Compacta:** evaluar cada tramo separado por restricciones de atención. Si no contiene ocupación, devolver solamente el primer candidato elegible; por ello pueden aparecer tanto 09:00 como 16:00, o 09:00 y 14:00 tras un descanso. Si contiene ocupación, considerar los extremos de los grupos de intervalos ocupados contiguos o superpuestos, evitando candidatos dentro de otra cita. Para cada grupo, tomar el inicio alineado inmediatamente posterior a su fin y el inicio alineado inmediatamente anterior que permita terminar antes de su comienzo. Exigir que el hueco entre candidato y ocupación sea menor al intervalo configurado.

Si una de esas posiciones falla por anticipación, cierre u otra ocupación, no buscar una posición más alejada que deje un hueco mayor. Un tramo ocupado puede, por tanto, no ofrecer opciones compactas aunque conserve espacio físico. Una cita cancelada y un apartado vencido dejan de ser anclas; recalcular las opciones sin alterar citas o apartados restantes.

**Manual:** producir las opciones de ventana libre con la misma secuencia y condiciones físicas; omitir modo compacto, anticipación mínima y horizonte público. Mantener el límite técnico de 31 fechas por petición, sin convertirlo en una anticipación máxima para citas manuales.

### 5.3 Validación de apartados — RF-35–RF-47

La validación recibe el candidato exacto y, opcionalmente, una acreditación verificada del apartado propio. Comprueba su negocio, titular, sucursal, profesional, servicio, intervalo y vigencia. Si se valida el compromiso original vigente, no vuelve a exigir la estrategia, secuencia o límites comerciales modificados desde que se apartó, ni lo hace entrar en conflicto consigo mismo. Sí aplica recursos y asignaciones actuales, acceso, atención física y las demás ocupaciones.

La excepción de apartado propio no habilita el traslado de ese apartado a otro servicio u horario y no prolonga su vigencia. Si el servicio cambió de duración, los nuevos candidatos usan la duración actual; la comprobación del compromiso existente usa su intervalo registrado. El motor no confirma ni transforma el apartado en cita. Ante un apartado vencido o ajeno devuelve rechazo; no confirma silenciosamente como si no se hubiera presentado.

### 5.4 Lectura consistente y validación final — RF-06–RF-07, RF-12, RF-42, RF-45–RF-49

- La consulta abre una transacción de lectura consistente para cargar configuración, calendario y ocupación con el mismo gestor. Los adaptadores no deben abrir conexiones independientes a mitad de esa lectura. Su resultado incluye el instante evaluado y no constituye una reserva.
- La operación de validación final recibe la transacción del consumidor y usa lecturas actuales después de bloquear. No debe usar una instantánea antigua iniciada antes de esperar. No hace commit, no abre otra transacción y no escribe citas o apartados.
- Conservar la precedencia existente: usuarios necesarios, negocio, licencia, sucursales, servicios y perfiles, con IDs ordenados dentro de cada grupo. La configuración se protege con el negocio. Las filas de ocupación que hagan falta se leen/bloquean después del perfil, sin regresar a un recurso anterior.
- Todos los escritores que cambien condiciones de agenda deberán participar en el contrato común. Verificarlo en las operaciones del módulo 1 antes de acreditar la integración. La coordinación inicial por negocio también protege bloqueos de equipo y agenda vacía; no depender de que ya exista una cita para disponer de una fila que bloquear.
- Revalidar rol, pertenencia, estado de recursos, licencia, configuración, vigencia del apartado y ocupación después de esperar. El módulo 3/4 futuro deberá mantener la validación y su escritura dentro de esa misma transacción hasta confirmar.
- No mantener una transacción ni candados de base de datos durante el contador del formulario. Ese periodo se representa con la vigencia persistida del apartado.
- Ante deadlock o espera agotada, abortar la operación completa y devolver fallo temporal reintentable. No ejecutar un reintento aislado de la última consulta ni anunciar un horario como reservado.

### 5.5 Citas afectadas — RF-10–RF-11, RF-19–RF-20, RF-51–RF-52

Resolver el alcance del bloqueo en la zona local de cada sucursal destinataria; comparar con los instantes de las citas y su ámbito de sucursal/profesional. Devolver una vez cada cita no cancelada que se superponga, aunque varios intervalos del bloqueo la alcancen. No usar las reglas de agenda compacta ni la habilitación actual del catálogo para ocultar citas históricas afectadas.

El resultado interno contiene referencias de bloqueo, cita, negocio, sucursal y profesional e intervalo afectado; no incorpora teléfono ni motivo de consulta. Las integraciones futuras obtendrán los datos de contacto bajo sus propios permisos. Consultar afectaciones no cambia estados, no publica eventos de cancelación y no encola mensajes. No se conecta un rechazo al guardado de bloqueos en esta fase.

## 6. Interfaces previstas y tratamiento de errores

### Superficie HTTP de esta fase

| Operación | Entradas y salida | Acceso | RF |
|---|---|---|---|
| GET `/configuracion-agenda` | Configuración efectiva y versión; devuelve valores iniciales si no existe fila. Sin escrituras. | Administrador del negocio. | RF-01–RF-07 |
| PUT `/configuracion-agenda` | Los cuatro valores completos: modo, intervaloMinutos, anticipacionMinutos y horizonteDias. Devuelve el conjunto persistido y versión. Rechaza campos desconocidos. | Administrador del negocio. | RF-01–RF-07, RF-48 |
| GET `/disponibilidad` | sucursalId, profesionalId, servicioId, desde y hasta como fechas locales inclusivas; uso publica/manual, inicialmente publica. Máximo 31 fechas por petición. Devuelve contexto solicitado, zona, instante evaluado, versión de configuración, horarios y omisiones temporales aplicables. | Administrador y recepcionista del negocio; Profesional solo sobre su perfil. | RF-08–RF-34, RF-42–RF-44, RF-48–RF-50 |

`profesionalId` identifica el perfil `personal`; la propiedad se resuelve por su `usuario_id`. El contexto publica representa las reglas del futuro portal, no acceso anónimo. No se permite a superadmin consultar agendas clínicas por el solo hecho de ser superadmin. La excepción manual requiere permiso de consulta sobre el perfil, tanto en HTTP como en servicios internos.

Los horarios contienen inicio y fin como instantes inequívocos y su presentación local con zona. Una respuesta válida sin horarios distingue falta de espacios de restricciones comerciales por fecha/anticipación. Una combinación de recursos inactivos o no habilitados se rechaza; no se disfraza como agenda llena.

Las consultas parciales de un rango devuelven las fechas válidas y los motivos de exclusión de las demás. Un fallo al obtener información de cualquier fecha hace fallar la consulta completa; no se mezclan resultados comprobados con intervalos inventados. El límite de 31 fechas es de tamaño de consulta, no cambia el horizonte de 365 días ni impide consultas manuales más lejanas.

### Contratos internos preparados

| Contrato | Entrada/salida y garantías | RF |
|---|---|---|
| Consulta de atención | Recibe contexto autorizado, perfil/sucursal y rango; devuelve bloques con origen de secuencia, atención efectiva y omisiones, usando la conexión recibida. | RF-13–RF-21, RF-25–RF-34 |
| Lectura de ocupación | Recibe negocio, perfil, rango de instantes y ahora; devuelve ocupación mínima de citas y apartados vigentes de todas sus sucursales. | RF-11, RF-19, RF-35–RF-39 |
| Validación final | Recibe actor/contexto confiable, uso, candidato exacto, posible apartado acreditado y transacción del consumidor. Devuelve válido o causa tipificada de rechazo; no persiste reserva. | RF-12–RF-20, RF-35–RF-49 |
| Consulta de afectaciones | Recibe bloqueo y ámbito autorizado; devuelve referencias de citas afectadas para futura gestión. | RF-10–RF-11, RF-51–RF-52 |

En esta fase no se agregan endpoints de validación/confirmación de reservas ni de gestión de afectaciones. Sus contratos internos se ejercitan en integración. Ningún contrato HTTP acepta un campo para omitir arbitrariamente una ocupación o cambiar el negocio efectivo.

### Errores

| Resultado | Tratamiento | RF |
|---|---|---|
| Entrada incompleta, fecha inexistente, rango invertido o mayor al máximo técnico, configuración inválida | 400 con campos afectados; sin resultados ni guardados parciales. | RF-06, RF-48 |
| Sesión ausente, inválida o acceso actual rechazado por los guards existentes | Conservar 401 y los mensajes sanitizados actuales; nunca devolver agenda vacía como sustituto. | RF-08–RF-12 |
| Rol o ámbito personal sin permiso | 403, sin datos ajenos. La configuración solo admite administrador. | RF-06, RF-08–RF-10, RF-43–RF-44 |
| ID inexistente o no perteneciente al negocio | 404 indistinguible para ambos casos, tras autorizar al actor. | RF-10, RF-13–RF-14, RF-48 |
| Recursos propios inactivos, servicio no ofrecido o combinación sin asignación | 409 con causa de combinación no habilitada, sin horarios. | RF-14, RF-48 |
| Horario antes válido que dejó de serlo | Rechazo interno tipificado, con causa como ocupado, fuera de atención, apartado vencido o regla comercial; nunca elegir otro inicio silenciosamente. | RF-40–RF-41, RF-45–RF-46 |
| Consulta válida sin opciones | 200 con lista vacía y causa de ausencia de opciones; conservar selección y fecha. | RF-22, RF-34, RF-50 |
| Dependencia temporalmente indisponible, timeout o conflicto transaccional no completado | 503 reintentable y mensaje sanitizado; no reutilizar un resultado antiguo como vigente. | RF-47, RF-49–RF-50 |

Registrar fallos técnicos con identificación de la operación y causa interna sanitizada. No incluir datos del cliente, comprobantes de apartados ni consultas que contengan secretos. Diferenciar métricas de consultas vacías, rechazos y fallos; un listado vacío no es un error del servicio.

## 7. Secuencia de implementación prevista

| Etapa | Resultado verificable | RF principales |
|---|---|---|
| E01 — Contratos y dependencias | Confirmar las capacidades reales del módulo 1, su representación temporal y participación en el orden de bloqueos. Definir proyecciones y los casos de prueba de esta fase. | RF-08–RF-21, RF-35–RF-49, RF-51–RF-52 |
| E02 — Datos y configuración | Incorporar migraciones y entidades mínimas, lectura de configuración por defecto, guardado autorizado y auditoría. Verificar UTC y relaciones compuestas. | RF-01–RF-14, RF-19–RF-21, RF-35–RF-42 |
| E03 — Lectores y motor | Integrar atención efectiva y ocupación; implementar ventana libre, compacta, anticipación, horizonte y uso manual; distinguir resultados y fallos. | RF-13–RF-39, RF-43–RF-44, RF-48–RF-50 |
| E04 — Validación y afectaciones | Implementar validación dentro de una transacción recibida, apartado propio y detección de citas afectadas. Verificar carreras en MariaDB con escritores de prueba. | RF-10–RF-12, RF-35–RF-49, RF-51–RF-52 |
| E05 — Consulta autenticada | Registrar configuración y disponibilidad HTTP, sin rutas anónimas ni de creación/gestión de citas. | RF-01–RF-14, RF-22–RF-34, RF-42–RF-44, RF-48–RF-50 |
| E06 — Aceptación | Ejecutar matriz de RF, regresión, instalación desde migraciones y verificación de los 15 criterios de la spec. Documentar evidencias y dependencias sin cerrar. | RF-01–RF-52 |

Aplicar las migraciones explícitamente, conservando `synchronize`, `dropSchema` y ejecución automática de migraciones deshabilitados. Una dependencia no implementada o una tabla ausente es un pendiente real: no activar un adaptador que devuelva ocupación vacía para simular integración. La reversión de pruebas se limita a bases desechables; no borrar ocupación de una instalación con datos como estrategia de recuperación.

## 8. Estrategia de tests y trazabilidad

### Capas y medios

- **Unitarias:** calendario recibido, secuencia, filtros, estrategias, estados, vigencia y selección de candidatos; reloj inyectable y casos tabulados. Probar resultados observables, no llamadas privadas del algoritmo.
- **Contratos:** verificar forma y semántica de las proyecciones de atención, ocupación y titularidad. Los dobles permiten avanzar con el motor, pero no cuentan como pruebas de persistencia ni de integración final del módulo 1.
- **Integración MariaDB:** migraciones, restricciones compuestas, UTC, lectores reales, transacciones y carreras con dos conexiones independientes en una base nueva desechable. Reutilizar las utilidades de `test/support` y barreras explícitas, sin pausas arbitrarias.
- **HTTP/e2e:** composición Nest, autenticación, permisos, validación y respuestas; sin interfaz gráfica ni servidor de WhatsApp.
- **Regresión:** sesiones, licencia en gracia/vencida/suspendida, permisos previos, calendario del módulo 1 y convenciones de auditoría. No cambiar expectativas ajenas al alcance para hacer pasar la suite.

### Matriz de pruebas

| Prueba | Escenarios y evidencia requerida | RF cubiertos |
|---|---|---|
| T01 — Configuración | Ausencia de fila devuelve ventana libre/15/30/60 sin insertar; todos los valores de intervalo; extremos 0/10080 y 1/365; fracciones y valores fuera de lista rechazados; solo administrador; guardado completo e idéntico sin efectos extra. | RF-01–RF-07 |
| T02 — Seguridad | Dos negocios, IDs cruzados y ausentes, administrador, recepción, Profesional propio/ajeno y superadmin; usuario y perfil con IDs distintos; ni uso manual ni manipular negocio conceden permisos. | RF-06, RF-08–RF-10, RF-13, RF-40, RF-43–RF-44, RF-48 |
| T03 — Acceso vigente | Cuenta inactiva, sesión revocada, negocio pendiente, licencia vencida y suspensión antes/exactamente/después de 48 horas; vencimiento anterior a la gracia. Rechazo diferente de lista vacía. | RF-12, RF-45–RF-46, RF-50 |
| T04 — Oferta | Sucursal, servicio y profesional inactivos; perfil no asignado; selección vacía; servicio no seleccionado; combinación válida. Ninguna combinación inválida genera horarios. | RF-13–RF-14, RF-48 |
| T05 — Atención efectiva | Semana, excepción y excepción vacía; descanso, bloqueos colectivos/individuales y por sucursal; bloqueos superpuestos y retiro de uno; el horario especial no anula bloqueo. | RF-15–RF-17, RF-29 |
| T06 — Límites físicos | Duración exacta hasta cierre, servicio demasiado largo, cruce de descanso, dos franjas independientes; 23:30–24:00 válido y 23:30–00:30 inválido; dos citas consecutivas permitidas. | RF-17–RF-20 |
| T07 — Zonas | Misma hora local en zonas distintas sin coincidencia y fechas locales distintas con cruce real; no exigir traslado. Hora inexistente y repetida según los casos del módulo 1; informar omisiones. Comparar ejecución con zona de proceso distinta. | RF-19–RF-21, RF-24 |
| T08 — Tiempo y fechas | Antes/exactamente/después del límite de anticipación; anticipación cero sin aceptar inicio pasado o exactamente ahora; horizonte inclusivo 1/60/365; cambio de fecha local; licencia evaluada ahora sin límite nuevo sobre fecha futura de cita. | RF-04–RF-05, RF-12, RF-22–RF-24 |
| T09 — Secuencia libre | Bloque 09:00 e intervalo 15; bloque 09:05; cita terminada 10:10 ofrece 10:15; descanso terminado entre posiciones conserva origen; todos los candidatos caben y están libres. | RF-25–RF-27 |
| T10 — Compacta vacía | 09:00–13:00 y 16:00–19:00 ofrecen ambos inicios; descanso 13:00–14:00 permite inicio independiente; anticipación permite desde 10:37 y se ofrece 10:45; otros servicios/sucursales usan su atención efectiva. | RF-13, RF-28–RF-30 |
| T11 — Compacta ocupada | Cita 10:00–10:30 y duración 30 ofrecen 09:30 y 10:30; final 10:10 ofrece 10:15; inicio 10:10 permite 09:30–10:00; múltiples ocupaciones y candidatos duplicados; no ofrecer huecos remotos ni posiciones que crucen otra ocupación. | RF-25–RF-26, RF-31–RF-32, RF-35–RF-39 |
| T12 — Fechas y vacío | Elegir mañana aunque hoy tenga opciones; no cambiar la fecha cuando el servicio no cabe; ausencia válida diferente de error y combinación inválida; dividir consultas largas conserva resultados por fecha. | RF-14, RF-24, RF-33–RF-34, RF-48–RF-50 |
| T13 — Citas | Los cinco estados; solo cancelada libera; cambiar duración 30 a 45 no modifica ocupación de cita previa; una cita de otro servicio/sucursal ocupa al mismo profesional. | RF-19, RF-35–RF-37 |
| T14 — Apartados | Vigente ocupa y permite opción compacta cercana; expiración exacta libera sin limpieza; propio no se autoempalma; ID ajeno, comprobante inválido o cambio de candidato no habilitan excepción; cambio comercial conserva compromiso y vencimiento; bloqueo o conflicto nuevo lo rechaza. | RF-10, RF-38–RF-42, RF-45–RF-46 |
| T15 — Manual | Fuera del horizonte y sin anticipación, con modo compacto configurado; mantiene futuro, secuencia, servicio activo, asignación, duración, cierre, descanso, bloqueo y ocupación. | RF-17–RF-20, RF-25, RF-43–RF-44 |
| T16 — Lectura sin efectos | GET y validación no crean citas/apartados ni prolongan expiración; lista de campos de salida sin cliente, teléfono, motivo, hash o token. Consulta consistente sin mezclar configuración nueva con ocupación de otra instantánea. | RF-07, RF-11, RF-39–RF-42, RF-47 |
| T17 — Carrera de validación | Dos conexiones: la primera consulta ve libre; otra confirma una ocupación de fixture; la validación final la detecta. Bajo la coordinación compartida, un escritor de prueba mantiene bloqueo hasta commit y el segundo revalida con datos nuevos. Rollback, cambio de bloqueo/configuración y expiración durante espera. | RF-06–RF-07, RF-12, RF-39, RF-41, RF-45–RF-47 |
| T18 — Fallos | Entradas malformadas, rango invertido/mayor a 31, campos desconocidos, conexión caída, fallo de un lector o timeout. Nunca devolver parcial, caché vigente ni lista vacía ante fallo; reintento posterior puede completar. | RF-06, RF-46, RF-48–RF-50 |
| T19 — Afectaciones | Bloqueos por perfil/equipo y una/todas las sucursales; zonas distintas; frontera exacta sin cruce; citas canceladas excluidas; varias coincidencias devuelven una referencia por cita; sin estados nuevos ni mensajes. | RF-10–RF-11, RF-19–RF-20, RF-35–RF-36, RF-51–RF-52 |
| T20 — Instalación y persistencia | Aplicar migraciones previas y nuevas en base vacía, reejecutar sin cambios; restricciones de configuración, intervalos y pertenencia; índices y selección UTC; modelo/esquema coherentes; sin escritura de producción ni creación de citas por HTTP. | RF-01–RF-07, RF-10–RF-11, RF-19–RF-21, RF-35–RF-42, RF-47–RF-52 |

T17 acredita el contrato transaccional del motor mediante escritores exclusivamente de prueba. La creación real de reservas, el consumo único del apartado al confirmar y la concurrencia completa entre portal y recepción se aceptarán en los módulos 3 y 4, cuando sus escritores existan. No llamar «flujo de reservas terminado» a esta evidencia.

### Correspondencia con criterios de finalización de la spec

| Criterios de la spec | Evidencia prevista |
|---|---|
| 1 | Matriz RF → T01–T20 → resultado y evidencia; ningún RF ausente o duplicado por confusión con el módulo 1. |
| 2–3 | T01–T04, T14 y T16: configuración, permisos, pertenencia y privacidad. |
| 4–6 | T05–T08: calendario, zonas, límites físicos y tiempo. |
| 7–9 | T09–T12: secuencia, ejemplos compactos y fecha elegida. |
| 10–11 | T13–T16: estados, apartados y excepciones manuales. |
| 12–13 | T17–T19: carreras, fallos y afectaciones. |
| 14–15 | T20, regresión y verificaciones de calidad; dependencias e integraciones pendientes declaradas. |

En la futura implementación ejecutar `npm run build`, `npm run lint`, `npm test -- --runInBand`, `npm run test:integration -- --runInBand` y `npm run test:e2e -- --runInBand`. Verificar que el entorno de integración está confirmado y separado de la base cotidiana antes de ejecutarlo. Estos comandos son previstos; no se ejecutan por redactar el plan.

El cierre requiere evidencias reales de cada RF y de los 15 criterios de la spec. Pruebas omitidas, infraestructura no disponible o adaptadores sustituidos se registran como pendientes; no como aprobados. La entrega deberá indicar qué dependencias del módulo 1 quedaron conectadas y qué contratos seguirán esperando a los módulos 3, 4 y 5.
