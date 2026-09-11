# Plan de autenticación, negocios y licencias anuales

Fuentes: [Constitución](Constitución.md), [spec de autenticación](../spec/spec-auth.md) y [AGENTS.md](../AGENTS.md). Lista de ejecución: [tareas de autenticación](tareas-auth.md).

## 1. Base, alcance y avance existente

Este plan corresponde a la especificación actual, con cobertura **RF-01–RF-38**. Comprende autenticación, negocios, recepcionistas, activación, licencias y auditoría. Mantiene NestJS, TypeScript, TypeORM y MariaDB/MySQL. Excluye pantallas, pagos, envío automático de códigos e implementación de reservas.

### Decisiones confirmadas

- Una base compartida, con aislamiento por `negocio_id`. Conservar datos «en su esquema», como indica la spec, no implica un esquema físico por negocio.
- Licencias exclusivamente anuales, renovables y sin límites de sucursales, servicios o usuarios.
- Una operación autorizada antes del vencimiento de sesión puede terminar de forma atómica; las nuevas solicitudes se rechazan. Esta interpretación confirmada de RF-20 evita escrituras parciales, sin interrumpir una operación admitida solo porque expire su sesión.
- En carreras entre activación y reemisión, prevalece el orden del bloqueo de base de datos y se revalida el estado al obtenerlo. La referencia de la spec a «un milisegundo tarde» se interpreta por ese orden, no por mediciones de llegada HTTP.
- Instalación en una base nueva, sin borrar ni migrar datos existentes.
- El superadministrador inicial ya existe. Su recuperación excepcional, múltiples administradores por negocio, cambio de propietario, registro libre de negocios y cancelación definitiva de licencias quedan fuera de alcance.

### Avance aprovechable

T01–T07 están completadas como infraestructura de pruebas y composición de módulos. Se conservan; los ajustes derivados del nuevo modelo se registran como trabajo pendiente adicional. Evidencia: [T01–T05](results/resultados-t01-t05.md), [T06](results/resultados-t06.md) y [T07](results/resultados-t07.md). Los informes conservan la numeración histórica de la especificación anterior; no acreditan requisitos nuevos por cambiar su número.

Verificación de la revisión del 2026-09-10: **48 pruebas unitarias, 2 de integración, 1 HTTP, lint y comprobación TypeScript aprobados**. La integración actual comprueba conexiones y la HTTP comprueba el arranque; todavía no acreditan los nuevos flujos funcionales.

El backend conserva login/perfil, usuarios y el estado antiguo del negocio. Los módulos de dominio nuevos están declarados, pero todavía requieren operaciones. El SQL de auth preparado también debe adaptarse. Este documento describe implementación pendiente.

## 2. Módulos y contratos

| Módulo | Responsabilidad | RF |
|---|---|---|
| **Auth** | Login, perfil, logout, sesiones persistidas, cambio y recuperación de contraseña; comprobar cuenta y licencia en cada solicitud protegida. | RF-15–27, RF-29–30, RF-33 |
| **Usuarios** | Correos únicos, cuentas pendientes, roles, pertenencia y consulta/desactivación de recepcionistas propios. | RF-03, RF-05–08, RF-13, RF-15–16, RF-19, RF-26–27 |
| **Negocios** | Identidad, identificador público único, contacto y activación; consultas administrativas exclusivas del superadmin. | RF-01–04, RF-06, RF-09, RF-30 |
| **Licencias** | Asignación anual, habilitación, renovación, suspensión, reactivación y política reutilizable de acceso. | RF-02, RF-04, RF-09, RF-14–15, RF-28–38 |
| **Codigos** | Emisión, reemplazo y consumo de códigos vinculados a cuenta y propósito, con vencimiento y uso único. | RF-08–14, RF-22–24 |
| **Altas** | Coordinar transaccionalmente alta del negocio, reserva del administrador, invitaciones y activaciones. | RF-01–14, RF-27–28, RF-35 |
| **Auditoria** | Registrar actor, destino, acción, instante y valores anteriores/nuevos dentro de la misma transacción. | RF-35, RF-38 |

Se conserva la dirección de dependencias preparada en T07: Auth y Altas coordinan servicios de dominio; estos no dependen de los coordinadores. Auditoria permanece independiente. Los servicios reciben contexto del actor y comparten la transacción de la operación cuando corresponde.

### Contratos públicos

- Conservar `POST /auth/login` y `GET /auth/profile`; incorporar operaciones de cierre, activación, contraseñas, negocios, recepcionistas y licencias.
- El alta exige nombre, identificador público y correo del administrador. Asigna automáticamente una licencia anual; no acepta modalidad ni período.
- Activación recibe código, nombre y contraseña. Recuperación recibe código y contraseña. Ninguna permite elegir correo, rol o negocio.
- El contexto autenticado contiene usuario, rol, negocio y sesión, obtenidos del estado actual del servidor. El administrador gestiona recepcionistas dentro de su negocio autenticado. Los IDs del cliente nunca conceden pertenencia.
- Solo el superadmin autoriza recuperación de administradores. La recuperación de recepcionistas desaparece de esta entrega conforme al nuevo RF-22; su cambio de contraseña autenticado permanece.
- Los códigos utilizables se devuelven únicamente al emitirlos o reemplazarlos. Ninguna respuesta expone hashes.
- Sesión inválida, cuenta desactivada o licencia bloqueada producen **401** en solicitudes protegidas; permisos insuficientes, **403**; recursos ajenos, **404**; conflictos de estado, **409**; exceso de intentos, **429**; entradas inválidas, **400**. Los errores de credenciales no revelan si existe el correo.
- Logout permite revocar una sesión reconocida aunque la licencia esté bloqueada. Recuperar contraseña conserva todos los bloqueos existentes y no concede sesión automáticamente.

## 3. Modelo de datos objetivo

| Entidad | Campos y restricciones principales | RF |
|---|---|---|
| **negocios** | Identidad, slug único, contacto y `activado_en`. Retirar el estado independiente activo/suspendido. | RF-01–04, RF-09, RF-30, RF-33–34 |
| **usuarios** | Negocio, correo normalizado único globalmente, rol, activo y activación. Nombre y hash ausentes únicamente mientras esté pendiente. Como máximo un administrador por negocio. | RF-03, RF-05–08, RF-13, RF-15–16, RF-19, RF-21–27 |
| **licencias** | Una por negocio; `habilitada_en`, `vence_en`, `suspendida_en` y fechas de registro. Eliminar modalidad y plan mensual/anual del modelo objetivo. | RF-02, RF-09, RF-14, RF-28–38 |
| **codigos_acceso** | Cuenta destinataria, propósito, hash único, emisor, emisión, vencimiento, consumo e invalidación. Conservar historial de reemplazos. | RF-08–14, RF-22–24 |
| **sesiones** | Identificador único, usuario, creación, vencimiento y revocación. | RF-15, RF-18–20, RF-24–25 |
| **eventos_auditoria** | Actor, negocio/cuenta/licencia afectados, acción, fecha y cambios anteriores/nuevos, sin secretos. | RF-35, RF-38 |
| **limites_intentos** | Clave por IP, ventana, contador y bloqueo hasta; actualización coordinada entre conexiones. | RF-17 |

### Invariantes

- Solo el superadmin tiene `negocio_id` nulo. Las relaciones deben impedir asociaciones entre negocios distintos.
- Los correos se normalizan con recorte de espacios y minúsculas y se reservan desde la creación de la cuenta pendiente. La unicidad global y el administrador único por negocio incluyen cuentas pendientes.
- Antes de activar al administrador, habilitación y vencimiento de licencia permanecen nulos.
- Una licencia habilitada siempre tiene vencimiento. Su estado vencido se calcula; no depende de un proceso periódico. Una licencia suspendida con tiempo conservado no vence por el paso del tiempo.
- Cuenta desactivada, licencia suspendida y negocio pendiente son condiciones distintas. Reactivar una licencia no activa cuentas ni negocios.
- Un código pertenece a una cuenta y a un propósito; activar y recuperar no son intercambiables.
- Las suspensiones conservan cuentas, configuración y citas.

### Coherencia del esquema

El SQL preparado en `db/schema.sql`, dentro de este backend, será la referencia de esta entrega; `../db/schema.sql` queda como antecedente. Será necesario adaptar el primero, sincronizarlo con entidades y migraciones y versionarlo explícitamente, porque actualmente está ignorado por Git. No se mantendrán dos esquemas normativos para auth.

Las migraciones se aplicarán sobre una base nueva. La sincronización automática quedará deshabilitada en producción. Los refuerzos de pertenencia y exclusión de empalmes de reservas se abordarán con ese módulo. Esta actualización documental no modifica ni ejecuta SQL.

## 4. Decisiones justificadas y reglas de operación

| Decisión | Justificación y alternativa descartada | RF |
|---|---|---|
| **Base compartida por negocio** | Conserva el diseño y la elección confirmada. Se descarta una base por negocio por su coste adicional de conexiones y migraciones. | RF-05–07 |
| **Licencia anual única** | Representa directamente el nuevo alcance. Se descartan licencias manuales, mensuales y licencias nuevas por cada renovación. | RF-01–02, RF-28–34 |
| **Cuenta pendiente** | Reserva el correo mediante una única restricción de unicidad. Se descarta un registro independiente de invitaciones que compita con usuarios. | RF-02–03, RF-08–13 |
| **JWT con sesión persistida** | Permite revocación individual y global inmediata. Se descarta JWT sin persistencia y no se incorporan refresh tokens. | RF-15, RF-18–20, RF-24–25 |
| **Validación al autorizar cada solicitud** | Aplica el estado actual; una operación admitida termina atómicamente. Se descarta interrumpirla solo porque expire la sesión durante su ejecución. | RF-19–20 |
| **Transacciones y bloqueos de filas** | Serializan códigos y transiciones de licencia. Se descartan comprobaciones seguidas de escrituras sin coordinación. | RF-03, RF-09–12, RF-23–25, RF-31–38 |
| **Años calendario en Chihuahua** | Respeta aniversarios y reglas locales. Se descartan 365 días fijos y desplazamientos horarios constantes. | RF-28, RF-31 |
| **Congelación mediante fechas** | Conservar vencimiento e inicio de suspensión permite devolver exactamente el tiempo pendiente. Se descartan ajustes diarios y contadores redundantes. | RF-32, RF-36–38 |
| **Suspensión exclusiva de licencia** | Mantiene un único control del bloqueo comercial. Se descartan estados independientes en negocio y licencia. | RF-04, RF-14–15, RF-26, RF-33–34 |
| **Throttler con almacenamiento compartido** | Reutiliza `@nestjs/throttler`, ya instalado, con contador MariaDB y clave conjunta por IP. Se descartan contadores por ruta, solo en memoria y añadir Redis en esta entrega. | RF-17 |
| **Hashes y auditoría transaccional** | Mantener bcrypt, evitar truncamiento silencioso y almacenar códigos aleatorios como hashes. Se descartan secretos legibles y logs como única auditoría. | RF-08, RF-13, RF-21–27, RF-35 |

### Transiciones de licencia

- Activar al administrador consume el código, activa cuenta y negocio y habilita un año calendario, todo en una transacción.
- Suspender antes de activar bloquea el código sin iniciar tiempo. Reactivar solo retira la suspensión; el código sigue venciendo a las 48 horas y debe reemitirse si caducó.
- Suspender una licencia vigente conserva `vence_en` y registra `suspendida_en` una sola vez. El tiempo disponible queda representado por `vence_en - suspendida_en`. Una licencia vencida debe renovarse antes de suspenderla.
- Renovar añade un año desde el vencimiento vigente; si ya venció sin suspensión, desde el momento de renovación.
- Durante la suspensión, renovar añade un año desde el vencimiento conservado, aunque esa fecha haya pasado, sin cambiar el inicio de suspensión ni recuperar acceso.
- Reactivar una licencia habilitada aplica: **nuevo vencimiento = vencimiento conservado, incluidas renovaciones + duración de la suspensión**. Después limpia la suspensión.
- Repetir suspensión o reactivación no altera fechas ni duplica auditoría. Renovaciones distintas sí acumulan años; las concurrentes no pueden sobrescribirse.
- Las licencias pendientes no se renuevan. Reactivar una licencia no suspendida no prolonga su vigencia ni recupera una licencia vencida.
- Suspender, renovar y reactivar concurrentemente deben equivaler a un orden serial sobre la licencia. Estado, fechas y auditoría se confirman juntos.

Los instantes se almacenan en UTC; los años se calculan en `America/Chihuahua`, ajustando al último día cuando el aniversario no exista. Las duraciones de códigos y sesiones son tiempo transcurrido: 48 horas, 30 minutos y una hora, respectivamente. Se rechaza en el instante exacto de expiración, sin período de gracia.

### Códigos, sesiones y auditoría

- Activación, reemplazo y consumo revalidan propósito, vigencia y estado aplicable dentro de la transacción. Si la reemisión gana, el código anterior deja de servir; si la activación gana, la reemisión inicial se rechaza porque la cuenta ya fue activada.
- Cuando login coincida con cambio o recuperación de contraseña, la coordinación por usuario impide que sobreviva una sesión creada con la contraseña anterior.
- La sesión dura una hora desde su inicio, sin extensión deslizante. Una operación ya autorizada puede confirmar su transacción aunque venza la sesión mientras se ejecuta; cualquier error revierte la operación completa.
- El sexto intento conjunto de login o validación de códigos bloquea la IP durante un minuto. Los intentos bloqueados no prolongan indefinidamente esa ventana. La clave se comparte entre las rutas protegidas por tasa.
- Recuperar contraseña no activa cuentas ni levanta suspensión o vencimiento. El superadmin puede autorizar recuperación de un administrador bloqueado.
- Si falla la auditoría, se revierte la operación sensible. Se registran cambios reales, actor y destino correctos, sin contraseñas, códigos utilizables ni sus hashes.

## 5. Estrategia de tests y ejecución posterior

| Grupo | Escenarios de aceptación | RF |
|---|---|---|
| **Altas y aislamiento** | Roles, recursos ajenos, correos normalizados y slugs duplicados, altas concurrentes, administrador único y rollback completo. | RF-01–07 |
| **Códigos y activación** | Correcto, incorrecto, vencido en el límite, usado y reemplazado; doble activación; reemisión contra consumo; suspensión previa y activación de recepcionistas bloqueada. | RF-08–14, RF-27–28 |
| **Sesiones** | Credenciales uniformemente rechazadas; cuenta pendiente/inactiva; logout; revocación; cambios de licencia; vencimiento exacto y operación previamente admitida que termina sin escrituras parciales. | RF-15–20 |
| **Límite por IP** | Cinco intentos conjuntos, sexto bloqueado, desbloqueo exacto, IP distinta y concurrencia entre conexiones. | RF-17 |
| **Contraseñas** | Mínimo de 12 caracteres, contraseña actual, emisor autorizado, recuperación reemplazada/usada, revocación global y login concurrente con cambio de contraseña. | RF-21–27 |
| **Licencias anuales** | Activación, aniversario bisiesto, vencimiento exacto, renovaciones anticipadas/tardías/acumulativas y rechazo de renovación pendiente. | RF-28–31 |
| **Suspensión y concurrencia** | Pausas prolongadas y sucesivas; renovación suspendida; recuperación exacta del tiempo; doble suspensión/reactivación y cruces con renovación. | RF-32–34, RF-36–38 |
| **Auditoría y conservación** | Actor y pertenencia correctos, ausencia de secretos, un evento por transición real, rollback si falla auditoría y conservación de datos bloqueados. | RF-26, RF-30, RF-35, RF-38 |

### Niveles de prueba

- **Unitarias:** reloj controlado, sin esperas reales, para calendario, códigos, sesiones, permisos y política de acceso.
- **Integración:** MariaDB desechable con conexiones independientes para restricciones, rollback y carreras. No sustituirlas por SQLite ni repositorios simulados. Ampliar el ejecutor existente para usar entidades y migraciones de la entrega.
- **HTTP:** los mismos Guards y validaciones de producción; recorrido alta → activación → login → recepcionista → cambio/recuperación de administrador → suspensión/reactivación → renovación. Verificar endpoints protegidos ante bloqueo de cuenta/licencia y las excepciones de logout y administración del superadmin.
- **Instalación:** migraciones sobre base nueva, ejecución repetida sin reaplicarlas y coherencia con el SQL de referencia. Nunca usar la base cotidiana para estas pruebas.

**Reservas:** la política reutilizable de bloqueo se implementará en esta entrega. Los escenarios de confirmación real de RF-29 y RF-33 permanecerán explícitamente pendientes hasta implementar reservas, incluida su comprobación transaccional de licencia. Terminar una operación por vencimiento de sesión no exime a una futura confirmación de reserva de comprobar la licencia.

### Orden y criterios de finalización

1. Actualizar primero el plan y después las tareas de auth, conservando los identificadores y la evidencia histórica de T01–T07.
2. Adaptar modelo, SQL, migraciones y fixtures; implementar servicios, casos de uso y contratos HTTP siguiendo las dependencias de la lista de tareas.
3. Sustituir tareas de modalidades manual/mensual por licencia anual y renovaciones acumulativas; retirar recuperación de recepcionistas y utilizar solo RF de la especificación vigente en los documentos operativos.
4. Verificar instalación nueva mediante migraciones, sin sincronización automática en producción.
5. Ejecutar `npm run build`, `npm run lint`, `npm test -- --runInBand`, `npm run test:integration -- --runInBand --detectOpenHandles` y `npm run test:e2e -- --runInBand --detectOpenHandles`; completar una matriz **RF → prueba → resultado o pendiente**.

La actualización documental no implica que las funciones estén implementadas ni autoriza cambios de código o datos. Su finalización exige coherencia entre plan y tareas, cobertura de RF-01–RF-38, conservación del avance existente y declaración explícita de integraciones pendientes.
