# Plan de implementación — Fase 2, módulo 1

## 1. Fuentes, alcance y punto de partida

Fuentes vigentes: [Constitución del módulo 1](constitucion-modulo.1.md), [especificación RF-01–RF-88](spec-modulo-1.md) y [AGENTS.md](../../AGENTS.md). Los RF de este documento pertenecen exclusivamente a la especificación de fase 2. La [especificación de autenticación](../fase-1-auth/spec/spec-auth.md) es un antecedente para comportamientos compatibles, no una aceptación de los requisitos nuevos.

Este documento planifica trabajo futuro: no acredita implementación ni pruebas ejecutadas. Mantiene NestJS, TypeScript, TypeORM y MariaDB/MySQL, con servicios de dominio, mensajes en español y aislamiento por negocio. La constitución y las decisiones detalladas de fase 2 prevalecen sobre las reglas sustituidas de fase 1.

**Incluido:** negocios y activación sin cuentas incompletas; correo de códigos; sucursales y límites; catálogo; cuentas de profesionales; selección de servicios; horarios y excepciones; bloqueos; suspensión diferida, avisos y consulta de licencia.

**Excluido:** pantallas, reservas y citas reales, cálculo de ranuras, ventana libre/agenda compacta, traslados automáticos, pagos, WhatsApp y reportes. RF-88 queda cubierto aquí mediante selección y oferta vacías; el rechazo de citas públicas y administrativas se conectará al módulo de reservas.

### Base comprobada en el repositorio

- Existen Auth, Usuarios, Negocios, Altas, Codigos, Licencias y Auditoria; se reutilizan sus servicios de sesión, contraseñas, autorización, reloj y calendario anual.
- El alta actual crea un administrador sin nombre ni contraseña; los códigos exigen usuario destinatario y la activación no pide correo. Estas tres piezas deben cambiar juntas.
- Solo existen los roles superadmin, admin_negocio y recepcionista. La matriz de permisos debe ampliarse expresamente.
- La suspensión actual bloquea y congela inmediatamente. Las 48 horas y la consulta de tiempo restante requieren modificar la política compartida, no únicamente el controlador.
- No hay módulos implementados de sucursales, servicios, profesionales, horarios o correo. El script SQL contiene tablas preliminares de esos dominios, sin sus nuevas restricciones ni correspondencia completa con las migraciones.
- Hay cuatro migraciones iniciales de autenticación, suites Jest unitarias, integración MariaDB y pruebas HTTP. Existen reloj controlable y bases temporales con dos conexiones independientes.

## 2. Módulos y responsabilidades

| Parte | Responsabilidad y colaboración | RF cubiertos |
|---|---|---|
| M01 — Auth y Usuarios, ampliación | Incorporar Profesional; autenticar cuentas completas; permisos cerrados; sesión y licencia vigentes; restricción a negocio y propietario del perfil. Reutilizar el alta completa y la revocación de sesiones de recepción donde corresponda. | RF-01–RF-05, RF-29–RF-30, RF-35–RF-36 |
| M02 — Negocios y Altas, ampliación | RFC y correo destinatario; cupo inicial; alta pendiente sin usuario; reserva global de correo; corrección del destinatario; activación conjunta de cuenta, negocio y licencia. | RF-06–RF-13, RF-20, RF-24 |
| M03 — Codigos, adaptación | Destinatario pendiente independiente de una cuenta; propósito, vigencia, hash, reemplazo y consumo único; recuperación existente por correo. | RF-08–RF-19 |
| M04 — Correos, nuevo | Bandeja durable de envíos, adaptador de transporte, reintentos, estados consultables por el superadmin y descarte de códigos/avisos obsoletos. No decide permisos ni vigencia comercial. | RF-14–RF-19, RF-80–RF-82 |
| M05 — Sucursales, nuevo | Datos de ubicación y zona horaria; conteo de activas; cupo coordinado con Negocios; desactivación, reactivación y borrado permitido. Consulta Horarios antes de reactivar. | RF-20–RF-26, RF-66–RF-68 |
| M06 — Servicios, nuevo | Catálogo único por negocio, costo y duración comunes; estado activo; protección del historial y datos relacionados. | RF-27–RF-28, RF-34, RF-66–RF-68 |
| M07 — Profesionales, nuevo | Perfil ligado a cuenta completa; asignaciones a sucursales; selección múltiple de servicios y oferta efectiva; desactivación de cuenta sin pérdida de datos. | RF-29–RF-36, RF-66–RF-68, RF-86–RF-88 |
| M08 — Horarios, nuevo | Semana completa, franjas activas e inactivas, borradores, descanso por franja, excepciones por fecha, comparación temporal y último guardado válido. | RF-37–RF-54 |
| M09 — Bloqueos, nuevo | Intervalos continuos o días completos, alcance individual/colectivo y por sucursal, permisos de edición y unión de restricciones. | RF-55–RF-65 |
| M10 — Licencias, ampliación | Solicitud de suspensión, plazo, congelación efectiva, renovación y reactivación; vista de vigencia; detección de avisos y coordinación con Correos. | RF-69–RF-85 |
| M11 — Auditoria y soporte transversal | Eventos de cambios reales sin secretos, contexto de actor, errores uniformes, pertenencia en relaciones, migraciones y composición de módulos. | RF-01–RF-05, RF-09–RF-13, RF-19, RF-23–RF-26, RF-35–RF-36, RF-47, RF-51–RF-53, RF-59–RF-65, RF-66–RF-79 |

**Dirección de dependencias:** controladores y coordinadores llaman a servicios de dominio; las políticas de autorización, calendario, intervalos y acceso no dependen de controladores. Auditoria y Correos reciben solicitudes dentro del caso de uso y no importan los módulos que los utilizan. Compartir políticas de validación entre sucursales y horarios, evitando dependencias circulares entre sus módulos HTTP.

## 3. Modelo de datos objetivo

Los nombres siguientes son propuestas de persistencia para la implementación; no son un script SQL. Mantener camelCase en TypeScript y snake_case en SQL.

### Identidad, cuentas y mensajería

| Entidad | Datos, relaciones e invariantes | RF |
|---|---|---|
| negocios | Mantener id, nombre, slug único y activado_en; añadir rfc no único, correo_administrador y limite_sucursales_activas con valor inicial y mínimo 1. El correo inicial es el destinatario pendiente; después de activar, la cuenta administradora es la referencia para enviar avisos. | RF-06–RF-09, RF-12, RF-20–RF-24, RF-80 |
| altas_administrador | Una alta inicial por negocio: negocio_id, correo normalizado, estado pendiente/activada, usuario_creado_id opcional y fechas. Representa una invitación, no un usuario. Conserva el vínculo con los códigos históricos. | RF-08–RF-13 |
| correos_acceso | Registro compartido con correo normalizado único y titular exclusivo: alta pendiente o cuenta. El traspaso de titular se realiza al activar. Todas las altas de cuentas, incluidas recepción y superadmin, deben participar en esta reserva para impedir duplicados entre tablas. | RF-09–RF-13, RF-29–RF-30 |
| usuarios | Mantener identidad, sesión y credenciales actuales; añadir rol profesional. Las nuevas cuentas requieren nombre, hash y activación completos. Conservar como máximo un administrador por negocio y correo de acceso único global. | RF-01–RF-05, RF-09, RF-29–RF-30, RF-35–RF-36 |
| codigos_acceso | Mantener hash, propósito, emisor, emisión, expiración, consumo e invalidación; permitir destino alta_administrador_id para activación o usuario_id para recuperación, exactamente uno según propósito. Vincular cada código a la versión del destinatario de su emisión. Añadir nonce y versión de clave para reintentos sin almacenar el código entregable. | RF-08–RF-19 |
| envios_correo | negocio_id, tipo, destinatario, referencia al código o a la versión de vencimiento, clave de deduplicación, estado, intentos, próximo intento, confirmación y error sanitizado. Arrendamiento temporal del envío para recuperación tras caída del procesador. Sin contraseña, código utilizable ni cuerpo que lo contenga persistidos. | RF-14–RF-19, RF-80–RF-82 |
| eventos_auditoria | Reutilizar actor, negocio, operación, fecha y valores antes/después; ampliar destinos de nuevos dominios y acciones. Para un alta pendiente auditar negocio/alta, sin exigir un usuario administrador inexistente. Registrar identificadores y estados, nunca secretos ni hashes. | RF-09–RF-13, RF-19, RF-35–RF-36, RF-66–RF-79 |

La unicidad entre invitaciones y cuentas no se obtiene mediante dos comprobaciones independientes de correo. El registro compartido es la autoridad de reserva, protegido por unicidad y transacción. El correo de usuarios y el de la invitación deben corresponder con su reserva; no aceptar escrituras que evadan ese contrato.

### Catálogos, perfiles y calendario

| Entidad | Datos, relaciones e invariantes | RF |
|---|---|---|
| sucursales | negocio_id, nombre, dirección y teléfono obligatorios; zona_horaria IANA; url_google_maps y notas_llegada opcionales; activo y fechas. No conservar un contador editable de cupo en cada sucursal. | RF-20–RF-26 |
| servicios | negocio_id, nombre, costo decimal exacto no negativo, duracion_minutos entera positiva y activo. Reutilizar como base el diseño SQL, sin precios por profesional o sucursal. | RF-27–RF-28, RF-34 |
| personal | Reutilizar el nombre de tabla preliminar para el perfil Profesional; negocio_id y usuario_id único obligatorio. Nombre, correo, contraseña y estado de cuenta proceden de usuarios, evitando dos fuentes de identidad. No incorporar especialidad o teléfono como requisitos nuevos. | RF-29–RF-36 |
| personal_sucursales | Relación muchos a muchos con negocio_id, personal_id y sucursal_id; clave única por relación y pertenencia compuesta. Conservación al desactivar sucursales. | RF-25–RF-26, RF-31, RF-37, RF-41 |
| personal_servicios | Relación con negocio_id, personal_id y servicio_id, sin duplicados. La selección guardada puede conservar servicios desactivados globalmente; la oferta efectiva exige servicio y cuenta activos. Selección vacía equivale a cero relaciones, no a desactivar la cuenta. | RF-32–RF-34, RF-86–RF-88 |
| horarios_personal | id, negocio_id, personal_id, día de semana, sucursal_id, inicio/fin locales, descanso_inicio/fin, activo y orden de presentación. Datos incompletos permitidos solo en inactivas. Identificador estable para localizar filas y errores. | RF-37–RF-43, RF-45–RF-54 |
| excepciones_horario | Cabecera única por negocio, Profesional, sucursal y fecha local, con sus franjas hijas. Una cabecera sin franjas representa reemplazar por un día sin atención; ausencia de cabecera conserva el horario semanal. | RF-44, RF-46–RF-47, RF-65 |
| bloqueos_horario | negocio_id, personal_id opcional —nulo: equipo—, sucursal_id opcional —nulo: todas—, motivo obligatorio, tipo, fecha_inicio/fin, horas opcionales y actor creador. Conservar cada bloqueo por separado. | RF-55–RF-65 |

**Invariantes comunes — RF-01–RF-05, RF-23, RF-30–RF-34, RF-41, RF-57, RF-66–RF-68:**

- Incorporar negocio_id en tablas operativas y relaciones. Usar claves foráneas compuestas que impidan relacionar perfiles, sucursales y servicios de negocios diferentes.
- Autorizar actor y recurso con datos actuales; un ID válido no acredita pertenencia. Las selecciones del Profesional solo pueden afectar su perfil.
- Las franjas inactivas aceptan datos faltantes, pero no IDs ajenos, tipos incorrectos u horas fuera del dominio admitido.
- Representar horas locales como minutos de 0 a 1440: 1440 solo representa fin de día. Esto permite 22:00–24:00 y 00:00–02:00 sin intervalos nocturnos implícitos.
- No usar borrado en cascada para eliminar sucursales, servicios o profesionales con relaciones o historial. Eliminar una franja o bloqueo es una operación distinta, permitida y auditada.
- Antes del borrado físico comprobar relaciones e historial operativo y dejar las claves foráneas como última defensa. La auditoría técnica de alta de un registro nunca usado no impide el borrado y se conserva; nunca borrar auditoría para hacer elegible un registro. Si hay uso o relaciones, responder conflicto y ofrecer desactivación.

### Licencia y tiempo — RF-69–RF-85

Conservar una licencia por negocio, habilitada_en y vence_en. Incorporar suspension_solicitada_en, bloqueo_programado_en, suspendida_en como instante efectivo, tiempo_restante_ms y una versión de vencimiento para identificar avisos. Ajustar las restricciones actuales: una suspensión efectiva puede ocurrir después del vencimiento natural, con tiempo restante cero.

- Pendiente de activar: habilitación y vencimiento nulos. Suspender impide activar inmediatamente y no inicia tiempo.
- Vigente con suspensión pendiente: acceso normal hasta el menor instante entre vence_en y bloqueo_programado_en. La cuenta y sesión también deben ser válidas.
- Suspensión efectiva: congelación desde el instante programado, aunque la primera operación o proceso de conciliación llegue después. Tiempo conservado = máximo entre cero y el tiempo que quedaba al comenzar el bloqueo.
- Cancelación antes del bloqueo: retirar la solicitud sin desplazar el vencimiento ni devolver horas consumidas.
- Reactivación posterior: nuevo vencimiento calculado desde el instante de reactivación y el tiempo conservado. Cero tiempo restante no concede vigencia.
- Renovación: mantener el cálculo de años calendario de fase 1, incluida su zona de aniversario America/Chihuahua y casos bisiestos. Las zonas de las sucursales no cambian ese contrato comercial. Una licencia suspendida conserva una fecha base de cálculo para sumar años y actualizar su tiempo congelado; una renovación nunca retira la suspensión.
- La consulta devuelve ahora del servidor, estado de licencia, condición de acceso, vencimiento aplicable, bloqueo programado y tiempo restante en días/horas/minutos. Un tiempo congelado se identifica como tal y no se presenta como una cuenta regresiva de un vencimiento obsoleto.

## 4. Decisiones justificadas y alternativas descartadas

| Decisión | Elección y motivo | Alternativa descartada | RF |
|---|---|---|---|
| D01 — Arquitectura | Extender el monolito modular actual y sus políticas; facilita transacciones y aprovecha pruebas existentes. | Microservicios o cambio de stack: añaden coordinación y operación sin necesidad del alcance. | RF-01–RF-88 |
| D02 — Activación | Alta pendiente independiente y creación completa del usuario al activar; reservar correo en un registro común. | Usuario sin contraseña o comprobar correos en tablas separadas: incumple la spec o deja carreras de duplicidad. | RF-08–RF-13, RF-29–RF-30 |
| D03 — Entrega de correo | Guardar el envío pendiente junto con el cambio de dominio y procesarlo después del commit, mediante adaptador de correo. | Enviar antes de confirmar o dentro de la transacción de negocio: puede entregar un código de un alta revertida o mantener bloqueos durante fallos externos. | RF-14–RF-19, RF-80–RF-82 |
| D04 — Código recuperable para envío | Derivar el valor entregable mediante HMAC-SHA-256 con clave secreta versionada y nonce aleatorio de alta entropía por emisión; persistir hash, nonce, versión y contexto inmutable. Así un reintento puede reconstruir el mismo valor sin guardar código en claro. | Persistir el código en la cola, incluso dentro del cuerpo del correo, o perderlo al reiniciar: contradice el almacenamiento como hash o impide reintentos durables. | RF-14–RF-19 |
| D05 — Cupo | Contar sucursales activas; aceptar solo límites enteros desde 1 y serializar altas, reactivaciones y cambios del límite sobre el negocio. | Validación solo en frontend, o contar sin coordinar escritura: permite exceder el límite bajo concurrencia. | RF-20–RF-26 |
| D06 — Perfil y oferta | Usuario completo más perfil personal; selecciones muchos a muchos y oferta derivada de estados actuales. | Credenciales duplicadas en personal, listas de IDs en texto o marcar inactiva la cuenta al vaciar servicios: pierde integridad o cambia permisos indebidamente. | RF-29–RF-36, RF-86–RF-88 |
| D07 — Calendario local | Persistir recurrencias locales y zona IANA; comparar instantes para fechas concretas y separar intervalos de asignación de intervalos de atención. | Guardar un desplazamiento UTC fijo o descontar descansos antes de detectar empalmes: falla con cambios de zona o permite trabajar en otra sucursal durante un descanso. | RF-37–RF-50, RF-61 |
| D08 — Guardado semanal | Reemplazo transaccional completo, último guardado válido según orden serial de confirmación; identificadores de fila para errores y consulta. | Merge automático, guardado parcial o rechazo por versión anterior: no corresponde a la decisión del usuario sobre el último guardado válido. | RF-51–RF-54 |
| D09 — Bloqueos | Guardar intervalos separados y aplicar la unión de restricciones; alcance individual/colectivo independiente de quién lo creó. | Fusionarlos destructivamente o limitar toda edición al creador: quitar uno perdería restricciones o negaría permisos acordados. | RF-55–RF-65 |
| D10 — Suspensión exacta | Resolver acceso con reloj y fechas en cada solicitud; congelar desde el bloqueo efectivo. Un proceso periódico solo materializa estado y auditoría. | Depender del proceso periódico para negar acceso o congelar desde que ese proceso despierte: prolonga acceso o pierde tiempo. | RF-69–RF-79, RF-83–RF-85 |
| D11 — Borrado | Desactivación conservadora y eliminación física solo cuando no existen relaciones ni historial operativo; la auditoría técnica de alta aislada se conserva y no impide el borrado. | Borrado en cascada o eliminación de evidencias para permitirlo: incumple conservación de datos. | RF-66–RF-68 |
| D12 — Límites del módulo | Entregar oferta y calendario consultables para uso futuro, sin implementar creación de citas ni modos de agenda. | Incorporar reservas para demostrar RF-88 completo: amplía la entrega previamente excluida. | RF-33–RF-34, RF-50, RF-65, RF-88 |

Las decisiones técnicas no añaden nuevas facultades de usuario. El proveedor de correo, sus credenciales y el remitente son configuración de despliegue; ningún test automatizado debe enviar a destinatarios reales.

### Seguridad y limitaciones de correo

Para D04, usar primitivas criptográficas estándar, separar la clave de códigos de JWT y contraseñas y conservar las versiones necesarias hasta agotar códigos/envíos vigentes. Vincular la derivación a propósito, identificador de emisión y destinatario original; comprobar el hash antes de enviar. No ofrecer un endpoint que reconstruya o devuelva códigos. Solo el adaptador emisor utiliza el valor transitorio en memoria.

La bandeja registra aceptación del transporte, no garantiza lectura ni llegada a la bandeja principal. No reenviar registros ya confirmados. Si el proveedor aceptó el correo y el proceso cayó antes de registrar la confirmación, puede existir duplicación; usar su clave de idempotencia cuando el transporte la soporte y no prometer entrega exactamente una vez con SMTP. El código sigue siendo de un solo uso aunque llegue repetido.

Antes de cada intento, revalidar código, destinatario y vencimiento o la versión actual de la licencia. Reemplazar un código o corregir correo invalida también los envíos pendientes anteriores. Un correo ya transmitido no puede retirarse, pero su código invalidado no sirve.

## 5. Flujos, concurrencia y contratos

### 5.0 Orden común de bloqueos — M1-T010

<!-- Esta tabla es el contrato de adquisición para casos de uso futuros; el helper ordena claves, pero aún no bloquea filas ni sustituye las transacciones existentes. -->

Antes de adquirir bloqueos pesimistas, reunir los recursos afectados a partir de una lectura preliminar, normalizar y deduplicar claves y ordenarlos con `ordenarRecursosBloqueo`. Adquirirlos **uno por uno**, nunca con una consulta cuyo orden efectivo dependa del optimizador. Dentro de cada tipo usar **ID ascendente**; para correos usar el valor normalizado en orden lexicográfico ascendente. Si una operación descubre un recurso anterior en el orden después de haber bloqueado uno posterior, abortar y reintentar toda la transacción con el conjunto completo. Un reintento abre transacción nueva y no reutiliza entidades obtenidas antes del rollback.

| Prioridad | Recurso / clave | Uso previsto |
|---|---|---|
| 0 | `correo`: dirección normalizada | Reserva global de identidad; dos correos se toman en orden de clave. Una dirección nueva compite mediante la restricción única, sin suponer que se puede bloquear una fila inexistente. |
| 1 | `alta`: ID de invitación pendiente | Activación, corrección del destinatario y reemisión. |
| 2 | `usuario`: ID de cuenta | Cuenta existente o actor que requiera bloqueo de escritura; una lectura de autorización no sustituye su revalidación. |
| 3 | `codigo`: ID de emisión | Consumo, sustitución e invalidación de código. |
| 4 | `negocio`: ID del tenant | Cupo, altas/reactivaciones de sucursal y cambios de calendario o estado relacionados. |
| 5 | `licencia`: ID de licencia | Activación, suspensión, renovación y reactivación comercial. |
| 6 | `sucursal`: ID de sucursal | Cambios de estado, zona y horarios que la afecten. |
| 7 | `servicio`: ID de servicio | Selecciones y estados del catálogo que afecten perfiles. |
| 8 | `perfil`: ID de Profesional | Semana, excepciones, bloqueos, asignaciones y servicios propios. Varios perfiles se toman por ID ascendente. |

Después de adquirir el último bloqueo se deben **revalidar** rol, pertenencia, correo destinatario, estados, cupo y conflictos con los datos actuales; una lectura preliminar no autoriza la escritura. La auditoría y los envíos pendientes se registran dentro de la misma transacción después de validar, sin abrir una ruta inversa hacia los recursos anteriores. Si la restricción única, una clave foránea o MariaDB detectan un conflicto de vista/deadlock, revertir y repetir de forma acotada desde el comienzo o devolver conflicto sin cambios parciales.

| Cruce futuro | Orden de recursos compartidos | Motivo de ausencia de inversión |
|---|---|---|
| Activación frente a corrección o reemisión | `correo → alta → codigo`; si requieren negocio/licencia, siguen después. | El código no se bloquea antes de la invitación en ninguno de los dos recorridos. |
| Activación frente a suspensión, renovación o reactivación | `negocio → licencia`. | La activación obtiene identidad primero; las transiciones comerciales comienzan en negocio y ninguna vuelve a identidad después de licencia. |
| Alta/reactivación de sucursal frente a cambio de cupo | `negocio → sucursal` cuando hay sucursal. | El cambio de límite termina tras negocio; la reactivación continúa a recursos posteriores. |
| Reactivación de sucursal frente a guardado de horario/excepción | `negocio → sucursal → perfil`, cada conjunto por ID ascendente. | Ambos revalidan los perfiles afectados después de la sucursal, aunque uno reciba primero el ID del perfil. |
| Selección de servicios frente a cambio de estado del servicio | `negocio → servicio → perfil` cuando se requiere el perfil. | Ninguno vuelve al catálogo después de bloquear el perfil. |

Este contrato guía las próximas implementaciones; las operaciones históricas de fase 1 conservan sus pruebas actuales y se adaptarán cuando participen en los flujos nuevos. La función ordena claves, no adquiere bloqueos de base de datos ni acredita por sí sola ausencia de deadlocks en producción.

### 5.1 Alta y activación — RF-06–RF-19

1. Validar superadmin, normalizar correo y reservarlo de manera única.
2. Confirmar en una transacción negocio, licencia pendiente, alta de administrador, código, envío pendiente y auditoría. No crear usuario administrador ni anunciar correo entregado.
3. La activación recibe correo, código, nombre y contraseña; revalida reserva, destinatario, propósito, vigencia, consumo y permiso de la licencia bajo bloqueo.
4. Crear cuenta completa, transferir reserva a esa cuenta, consumir código y activar negocio/licencia dentro de la misma transacción.
5. Corrección de correo, reemisión y activación compiten por el mismo recurso. Si gana la activación, no se permite corregir el destinatario pendiente; si gana el reemplazo, el código anterior se rechaza.
6. Integrar la reserva de correo en altas de profesionales y recepcionistas: una carrera contra una invitación pendiente acepta un solo titular.

### 5.2 Catálogos, cupos y selecciones — RF-20–RF-36, RF-66–RF-68, RF-86–RF-88

- Alta/reactivación de sucursal y cambio de cupo comparten bloqueo de negocio; volver a contar activas dentro de la operación.
- Activar sucursal o cambiar su zona horaria revalida horarios afectados. Su desactivación conserva asignaciones y horarios, sin atención efectiva allí.
- Selección de servicios se guarda como conjunto completo: desmarcar retira la relación seleccionada, no el servicio. Conservar selecciones de servicios posteriormente desactivados permite distinguirlas al editar, sin ofrecerlos.
- Una selección nueva no puede habilitar un servicio inactivo; mantener una selección histórica inactiva no lo rehabilita. Selección vacía es válida.
- Ofrecer un servicio exige relación seleccionada, servicio activo, cuenta activa y asignación del Profesional a la sucursal activa. La futura reserva añadirá horario, bloqueos, licencia y ausencia de cita superpuesta.
- Desactivar un Profesional revoca sesiones junto con el cambio de cuenta. Reactivar no rehabilita tokens anteriores.

### 5.3 Horarios y bloqueos — RF-37–RF-65

- Usar intervalos semiabiertos: inicio incluido, fin excluido. Franjas consecutivas no se empalman; comparar la asignación completa antes de restar el descanso.
- Guardar la semana reemplaza únicamente franjas semanales del Profesional; no borra excepciones ni bloqueos. Validar el resultado con sus excepciones existentes y las demás sucursales.
- Serializar cambios de semana, excepciones, asignaciones y reactivaciones que afecten al mismo Profesional. Cuando haya varios, bloquearlos en orden estable para evitar ciclos.
- Mantener el orden transversal de bloqueos entre servicios y revalidar permisos/estados después de adquirirlos. No reutilizar entidades obtenidas antes de un reintento fallido.
- Comparar recurrencias considerando los diferentes desplazamientos horarios aplicables a sus zonas; no validar únicamente contra la semana actual. Las excepciones se comprueban en sus fechas concretas y también contra los días locales vecinos de otras sucursales.
- Separar configuración semanal de consulta de atención por fechas. La segunda aplica: excepción o semana, sucursal operativa, descanso y unión de bloqueos. No genera ranuras de citas.
- Un bloqueo de varias fechas con horas es continuo; sin horas abarca desde el comienzo del primer día hasta el comienzo del día posterior al último. Resolverlo por separado en cada zona local afectada.
- Para alcance “todas”, aplicar la regla a las sucursales/asignaciones correspondientes al consultar; no convertirlo silenciosamente en una copia fija de destinatarios del día de creación.
- Un Profesional puede editar un bloqueo individual que lo afecta aun si lo creó el administrador, pero no ampliar su alcance a equipo, a otra persona ni a sucursales ajenas a sus asignaciones.

### 5.4 Licencias, consultas y avisos — RF-69–RF-85

- Login y solicitudes protegidas usan la misma política actualizada. El superadmin conserva su gestión de negocios bloqueados; logout conserva el comportamiento compatible de fase 1.
- Repetir una suspensión pendiente no reinicia el plazo. Materializar el bloqueo efectivo una sola vez y auditarlo separado de la solicitud.
- Antes de renovar o reactivar, resolver cualquier transición cuyo instante ya haya ocurrido, usando el instante programado y no la hora tardía de ejecución.
- Si vence antes del plazo, negar acceso desde el vencimiento. Alcanzar posteriormente el bloqueo no genera tiempo negativo ni devuelve horas vencidas.
- Los avisos se detectan al entrar en la ventana de las 48 horas previas, con recuperación si el procesador estuvo caído. Reintentar solo mientras exista vigencia aplicable.
- Deduplicar avisos por licencia y versión de vencimiento. Cambiar vencimiento cancela pendientes obsoletos; no borra historial de envíos confirmados.
- La lectura de vigencia no concede un bypass al bloqueo. Usuarios de negocio la consultan mientras su acceso sea válido; el superadmin puede consultar licencias de negocios bloqueados.

### 5.5 Superficie HTTP prevista — M1-T005

<!-- Contratos para implementación posterior: las rutas nuevas de esta tabla todavía no son endpoints operativos. -->

Mantener las convenciones actuales. Salvo rutas públicas indicadas, el negocio se deriva de la sesión y todo ID de ruta o cuerpo se valida contra esa pertenencia. En las tablas, `admin_negocio` significa el administrador del negocio propio y `Profesional` significa únicamente el titular de su perfil. El superadmin administra negocios, cupos y licencias, no horarios ni catálogos de un negocio. Los campos no enumerados se rechazan.

| Método y ruta | Entrada mínima / respuesta | Permiso y errores específicos | RF |
|---|---|---|---|
| POST /negocios (ampliar) | `nombre`, `slug`, `rfc`, `correoAdministrador`; `limiteSucursales` opcional, entero desde 1. Devuelve negocio, licencia pendiente y estado del envío, sin usuario administrador. | superadmin; 400 campos/cupo, 409 slug o correo reservado. | RF-06–RF-08, RF-13–RF-14, RF-20 |
| POST /auth/activar-administrador (ampliar) | Público: `negocioId`, `correo`, `codigo`, `nombre`, `password`; devuelve cuenta completa y estado de activación, ningún código utilizable. | 400 entrada, 409 código, destinatario, vigencia o estado inválido; nunca crea cuenta parcial. | RF-09–RF-11 |
| POST /negocios/:id/reemitir-codigo (conservar) | Sin cuerpo; devuelve metadatos de nuevo envío y caducidad, no el código. | superadmin; 404 negocio, 409 invitación ya activada. | RF-12, RF-15, RF-18 |
| PATCH /negocios/:id/correo-administrador | `correo` nuevo; devuelve destinatario y estado de nueva emisión, sin código. | superadmin; 404 negocio, 409 activado o correo reservado. | RF-12–RF-13, RF-18 |
| GET /negocios/:id/envios y POST /negocios/:id/reintentar-envio | Consulta estados/intentos; reintento recibe `envioId` y devuelve estado pendiente/confirmado, nunca contenido ni código. | superadmin; 404 negocio/envío, 409 envío obsoleto o confirmado. | RF-17–RF-19 |
| PUT /negocios/:id/limite-sucursales | `limiteSucursales` entero desde 1; devuelve límite y total de activas. | superadmin; 400 dominio, 404 negocio, 409 reducción bajo activas. | RF-20, RF-22–RF-24 |
| GET /sucursales, GET /sucursales/:id y POST /sucursales | Lectura filtrada; alta con `nombre`, `direccion`, `telefono`, `zonaHoraria`; `urlGoogleMaps`, `notasLlegada` opcionales. | admin_negocio; 400 datos/zona, 404 ajeno, 409 cupo. | RF-21–RF-23 |
| PATCH /sucursales/:id, POST /sucursales/:id/desactivar, POST /sucursales/:id/reactivar y DELETE /sucursales/:id | Edición de datos permitidos; transiciones y borrado sin cuerpo; devuelve estado o 204 al borrar. | admin_negocio; 404 ajeno, 409 cupo, conflicto de horario o historial. | RF-25–RF-26, RF-66–RF-68 |
| GET /servicios, GET /servicios/:id y POST /servicios | Lectura filtrada; alta con `nombre`, `costo` decimal no negativo y `duracionMinutos` entero positivo. | admin_negocio; 400 datos, 404 ajeno. | RF-27–RF-28 |
| PATCH /servicios/:id, POST /servicios/:id/desactivar, POST /servicios/:id/reactivar y DELETE /servicios/:id | Edición de campos de catálogo; transiciones/borrado sin cuerpo, 204 al borrar. | admin_negocio; 404 ajeno, 409 historial o relaciones al borrar. | RF-34, RF-66–RF-68 |
| GET /profesionales, GET /profesionales/:id y POST /profesionales | Lectura filtrada; alta con `nombre`, `correo`, `password`; crea cuenta completa y perfil activo. | admin_negocio; 400 datos/contraseña, 404 ajeno, 409 correo reservado. | RF-29–RF-30 |
| PATCH /profesionales/:id, POST /profesionales/:id/desactivar, POST /profesionales/:id/reactivar y DELETE /profesionales/:id | Edición permitida, cambio de estado y borrado sin cuerpo; no devuelve hash, 204 al borrar. | admin_negocio; 404 ajeno, 409 historial o relaciones al borrar. | RF-35–RF-36, RF-66–RF-68 |
| GET /profesionales/:id/sucursales y PUT /profesionales/:id/sucursales | `sucursalIds` como conjunto completo; devuelve asignaciones del mismo negocio. | admin_negocio; 400 IDs, 404 perfil/sucursal ajena, 409 horario incompatible. | RF-25–RF-26, RF-31 |
| GET /profesionales/:id/servicios y PUT /profesionales/:id/servicios | `servicioIds` como conjunto completo, incluido `[]`; devuelve catálogo con selección y estado activo. | admin_negocio o Profesional propio; 400 IDs, 404 perfil/servicio ajeno, 409 selección nueva inactiva. | RF-32–RF-34, RF-86–RF-88 |
| GET /profesionales/:id/horario y PUT /profesionales/:id/horario | PUT recibe `franjas[]` completas con ID/índice, día, sucursal, horas, descanso y activo; devuelve semana guardada. Prevalece el último guardado válido como reemplazo íntegro. | admin_negocio o Profesional propio; 400 campos, 404 sucursal ajena, 409 empalme con índice de franja, campo y motivo. | RF-37–RF-54 |
| GET /profesionales/:id/excepciones y PUT /profesionales/:id/excepciones/:fecha y DELETE /profesionales/:id/excepciones/:fecha | PUT recibe `sucursalId` y `franjas[]` completas para la fecha local; `[]` cierra ese día; DELETE retira el reemplazo. | admin_negocio o Profesional propio; 400 fecha/hora, 404 perfil/sucursal ajena, 409 empalme. | RF-44–RF-47 |
| GET /bloqueos, POST /bloqueos, PATCH /bloqueos/:id y DELETE /bloqueos/:id | Alta/edición con `motivo`, `tipo`, `fechaInicio`, `fechaFin`, alcance personal/equipo y sucursal/todas; horas inicial/final ambas presentes o ambas ausentes. Lectura con filtros autorizados. | admin_negocio para su equipo; Profesional para bloqueos individuales que lo afectan. 400 intervalo, 404 ajeno, 403 alcance colectivo u otra persona. | RF-55–RF-64 |
| GET /profesionales/:id/atencion | `desde`, `hasta` como fechas; devuelve intervalos efectivos y omisiones por huso, sin ranuras ni citas. | admin_negocio o Profesional propio; 400 rango, 404 perfil ajeno. | RF-44–RF-50, RF-61–RF-65 |
| POST /licencias/:id/suspender, POST /licencias/:id/reactivar y POST /licencias/:id/renovar (conservar) | Sin cuerpo; devuelve estado, vencimiento, bloqueo previsto y remanente aplicable. | superadmin; 404 licencia, 409 transición no permitida. | RF-69–RF-79 |
| GET /licencias/mi-vigencia y GET /licencias/:id/vigencia | Sin cuerpo; devuelve estado, `ahora`, vencimiento aplicable, bloqueo programado y tiempo restante en días, horas y minutos. | Primera: usuario de negocio con acceso vigente; segunda: superadmin. 401 acceso vencido/bloqueado, 404 licencia ajena o inexistente. | RF-83–RF-85 |

Errores comunes: 400 datos inválidos, 401 acceso/sesión no disponible, 403 rol insuficiente, 404 recurso ajeno o inexistente, 409 conflicto de estado/cupo/horario, 429 límite de intentos. La respuesta de una semana inválida incluye índice de franja o ID estable, campo y motivo, sin alterar el último guardado válido. Ninguna respuesta, log o evento contiene contraseñas, hashes ni ningún código utilizable. La activación siempre exige correo y código. No modificar la recuperación de recepción ni introducir recuperación por código para profesionales.

## 6. Persistencia, compatibilidad y secuencia

### Migraciones y límites de operación

Añadir migraciones versionadas; no reescribir las cuatro migraciones históricas como si la fase 1 nunca hubiera existido. Mantener sincronizados modelo, restricciones y script SQL de entrega, con synchronize y ejecución automática de migraciones deshabilitados.

La ruta de aceptación será una base nueva desechable: aplicar fase 1 y después las migraciones de fase 2. Comparar las tablas de este módulo con el script SQL; las tablas preliminares de módulos futuros no acreditan funciones implementadas. No dar por hecho que una instalación creada importando todo el script tiene el mismo historial de migraciones: detectar ese origen antes de actualizarla.

Antes de actualizar una base con datos, realizar diagnóstico de cuentas incompletas, códigos dependientes, RFC ausentes, correos duplicados normalizados y licencias suspendidas. No inventar RFC, borrar usuarios históricos ni conceder 48 horas a suspensiones ya efectivas. La conversión de datos existentes requiere un plan específico de conservación y ensayo sobre copia; este documento no autoriza ejecutarla sobre la base cotidiana.

### Orden de implementación

| Entrega | Resultado requerido antes de continuar | RF |
|---|---|---|
| E1 — Base y autorización | Modelo de pertenencia, rol Profesional, registro de correo, infraestructura de pruebas y migraciones estructurales. | RF-01–RF-05, RF-13, RF-29–RF-30 |
| E2 — Negocios y correo | Alta sin usuario, activación y corrección concurrentes, recuperación por correo y bandeja con fallos controlados. | RF-06–RF-19 |
| E3 — Catálogos y personal | Cupo, sucursales, servicios, cuentas, asignaciones, selección de servicios y bajas seguras. | RF-20–RF-36, RF-66–RF-68, RF-86–RF-88 |
| E4 — Calendario | Franjas, borradores, descanso, excepciones, guardado completo, zonas y conflictos. | RF-37–RF-54 |
| E5 — Bloqueos | Alcances, intervalos, superposición, permisos y prioridad sobre horarios. | RF-55–RF-65 |
| E6 — Licencias y avisos | Nueva máquina de estados, límite exacto, consultas y avisos por vencimiento. | RF-69–RF-85 |
| E7 — Integración y cierre | Recorridos conjuntos, regresión compatible, matriz RF → evidencia y límites pendientes de reservas explícitos. | RF-01–RF-88 |

E3 y E6 pueden desarrollarse una vez estén disponibles sus dependencias de E1/E2; antes de cualquier entrega funcional, la política de acceso debe probarse sobre todos sus endpoints nuevos. Cada cambio incompatible de fase 1 incluye la adaptación de sus pruebas, sin reescribir los resultados históricos.

## 7. Estrategia de tests y trazabilidad

### Capas

- **Unitarias:** políticas de permisos, validación, calendario, intervalos, oferta y estados de licencia; reloj inyectable. El correo se sustituye por un adaptador controlado.
- **Integración MariaDB:** restricciones reales, migraciones, reservas únicas, transacciones, rollback y carreras con dos conexiones. Reutilizar las bases temporales seguras existentes; no sustituir esta evidencia por SQLite o mocks.
- **HTTP/e2e:** composición Nest, autenticación, roles, pertenencia, entradas y respuestas; sin requerir frontend.
- **Contrato del transporte:** envío aceptado, rechazo, timeout y caída entre aceptación y confirmación; usar transporte local/falso y captura en memoria, sin destinatarios reales.
- **Regresión:** preservar comportamientos compatibles de sesiones, contraseñas y recepcionistas; sustituir expectativas de usuario incompleto, código en respuesta y suspensión inmediata por las nuevas.

### Matriz de escenarios

| Prueba | Casos verificables | RF |
|---|---|---|
| T01 — Seguridad | Dos negocios; IDs cruzados en ruta y cuerpo; manipular rol, profesional y sucursal; accesos de los cuatro roles; sesiones revocadas y restricciones actuales. | RF-01–RF-05, RF-35–RF-36 |
| T02 — Alta y activación | RFC repetido permitido; negocio pendiente sin usuario; contraseña válida; correo normalizado duplicado entre invitación y cuenta; activación válida y errores sin registros parciales. | RF-06–RF-13 |
| T03 — Carreras de identidad | Doble activación, reemisión frente a consumo, corrección de correo frente a activación y altas de usuarios frente a reserva pendiente; aceptar un titular y auditar una transición real. | RF-09–RF-13 |
| T04 — Códigos y entrega | 48 horas/30 minutos; expiración exacta, propósito y destinatario incorrectos; reintentos tras reinicio; código obsoleto no enviado/aceptado; fallos de transporte y ausencia de secretos persistidos o expuestos. | RF-14–RF-19 |
| T05 — Cupo y sucursales | Cupo inicial 1; datos obligatorios y opcionales; conteo solo de activas; dos altas para un único cupo; reducción cruzada con alta; reactivación sin cupo o con horarios conflictivos. | RF-20–RF-26 |
| T06 — Catálogo | Costo cero válido, negativo inválido, duración entera positiva; costo y duración comunes; servicio desactivado no ofrecido aunque siga seleccionado. | RF-27–RF-28, RF-34 |
| T07 — Cuenta y asignaciones | Alta completa sin código, correo único, varias sucursales propias, rechazo de asignación ajena, desactivación con sesión abierta y nuevo login tras reactivar. | RF-29–RF-31, RF-35–RF-36 |
| T08 — Servicios seleccionados | Administrador y propio Profesional; selección múltiple/vacía; consultar lo guardado; desmarcar sin borrar catálogo; servicio inactivo visible como tal; oferta vacía sin cambiar cuenta, sucursales ni horarios. | RF-32–RF-34, RF-86–RF-88 |
| T09 — Franjas y borradores | Varios intervalos por día; interruptor independiente; quitar última franja; semana vacía; borrador parcial conservado; activar incompleto falla; un descanso o ninguno, ambas horas y límites correctos. | RF-37–RF-43 |
| T10 — Calendario temporal | Excepción reemplaza solo fecha/sucursal; excepción vacía; medianoche; días locales distintos coincidentes; cambios de desplazamiento horario; descanso no libera sucursal; consecutividad y hueco para comer sin traslado exigido. | RF-44–RF-50 |
| T11 — Guardado y concurrencia | Error en una fila conserva toda la semana; errores identifican fila/campo; último guardado válido prevalece; segundo inválido no destruye primero; consulta conserva inactivas; cruce con excepción, asignación y reactivación de sucursal. | RF-47, RF-51–RF-54 |
| T12 — Bloqueos | Motivo/tipo requeridos; individuo/equipo y sucursal/todas; fechas con horas continuas y sin horas inclusivas; una sola hora e intervalo nulo rechazados; hora local por sucursal; superposición y prioridad sobre excepción. | RF-55–RF-62, RF-65 |
| T13 — Permisos de bloqueos | Profesional modifica bloqueo individual creado por administrador; no modifica colectivo ni de otro; administrador gestiona todos los propios; quitar uno conserva el otro; cambiar alcance no evade permisos. | RF-57, RF-62–RF-65 |
| T14 — Bajas | Desactivar conserva datos; eliminar únicamente registro elegible; relaciones/historial impiden borrado; carrera entre eliminar y crear relación no produce huérfanos; rollback conserva auditoría coherente. | RF-66–RF-68 |
| T15 — Suspensión | Antes, exactamente y después de 48 horas; vencimiento anterior; pendiente de activar; repetición no reinicia plazo; reactivación anticipada sin devolución; transición tardía usa hora programada; cuentas y datos conservados. | RF-69–RF-78 |
| T16 — Tiempo y carreras | Renovaciones concurrentes y cruces con suspensión/reactivación; congelación exacta, cero tiempo restante, aniversario bisiesto; fallos provocados revierten estado y auditoría; reinicio no duplica transición. | RF-72–RF-79 |
| T17 — Avisos y vigencia | Ventana de aviso y envío tardío permitido; dos procesadores; aviso confirmado no repetido; renovación invalida aviso pendiente; estados/fechas/tiempo congelado y pendiente; consulta sin bypass de acceso. | RF-80–RF-85 |
| T18 — Instalación y recorrido | Aplicar migraciones sobre base temporal, reaplicación sin cambios, coherencia de esquema, alta → activación → catálogos → horario → bloqueo → suspensión → reactivación; no incluir creación real de citas. | RF-01–RF-88 |

Para RF-88, T08 acredita solamente selección vacía y oferta vacía. La prueba de que una cita real pública o administrativa se rechaza pertenece a la integración futura; no marcarla como aprobada por comprobar una política aislada.

### Condiciones de ejecución y cierre

En la implementación ejecutar: npm run build; npm run lint; npm test -- --runInBand; npm run test:integration -- --runInBand; npm run test:e2e -- --runInBand. Son comandos previstos, no ejecutados por crear este plan.

Mantener reloj fijo, barreras explícitas para carreras y conexión real a la base temporal. No depender de esperas de 48 horas ni de pausas arbitrarias para producir concurrencia. Verificar resultados y ausencia de efectos secundarios, no solo códigos de respuesta.

El cierre requiere una matriz RF → caso → resultado/evidencia, cobertura de los 27 criterios de finalización de la spec y declaración expresa del alcance futuro. Una prueba deshabilitada, un servicio simulado o un requisito no ejercitado no cuentan como aceptación de su integración.

## 8. Decisiones confirmadas para M1-T001–M1-T004

<!-- Estas reglas son criterios de diseño futuros; documentarlas no acredita que el backend ya las implemente. -->

| Tarea | Decisión confirmada y ejemplos verificables | RF afectados |
|---|---|---|
| M1-T001 | Cupo mínimo: 1 sucursal activa autorizada. El valor predeterminado es 1; 1 y 2 válidos, 0 inválido, -1 inválido y 1.5 inválido. El límite no exige tener una sucursal activa: con cupo 1 puede haber 0 activas. Una reducción por debajo de las activas sigue rechazada. | RF-20–RF-24 |
| M1-T002 | Rechazar horas locales inexistentes y repetidas, sin desambiguación automática. En `America/New_York`, `2026-03-08 02:30` no existe y `2026-11-01 01:30` ocurre dos veces: una excepción o bloqueo con esas horas se rechaza completo. Si una franja semanal ya guardada cae en el cambio de huso, se omite únicamente la ocurrencia recurrente afectada, sin desplazarla; las demás fechas conservan la franja. También se omite si el intervalo cruza la discontinuidad, aunque sus extremos existan. Un bloqueo de días completos usa límites de fecha y no contiene horas locales explícitas. La consulta debe identificar la omisión para no aparentar atención disponible. | RF-44–RF-47, RF-58–RF-61 |
| M1-T003 | La auditoría técnica de alta de un registro sin uso ni relaciones operativas no impide el borrado físico y se conserva. Por ejemplo, un servicio recién creado y nunca seleccionado puede borrarse conservando su evento de alta; un servicio seleccionado o con cambios operativos se desactiva en vez de borrarse. No se eliminan evidencias para habilitar el borrado. | RF-66–RF-68 |
| M1-T004 | El destino de instalación de fase 2 es una base nueva. Se aplican migraciones históricas y después las nuevas sobre base desechable de aceptación; no se actualiza ni borra la base cotidiana. La conversión de datos existentes, si se necesitara más adelante, es un trabajo separado que requiere diagnóstico, plan aprobado y ensayo sobre copia antes de desplegarse. | RF-06–RF-19, RF-69–RF-79 |

El transporte y remitente de correo, las credenciales y el entorno de entrega se proporcionarán como configuración antes de validar envíos fuera de pruebas. No se incorporan valores secretos ni se contrata un servicio desde este plan.
