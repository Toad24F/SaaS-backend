# Plan — Ajustes de licencias, administración y agenda

Estado: propuesta pendiente de aprobación. No acredita implementación ni aprobación de la constitución o la especificación. Alcance exclusivo de backend; no modifica el frontend ni inicia tareas de programación.

## 1. Fuentes, alcance y punto de partida

Fuentes normativas: [constitución](constitucion.md) y [especificación](spec.md). Los RF de este plan pertenecen exclusivamente a esta especificación. Se mantienen los contratos compatibles del [módulo 1](../fase-2-modulo-1/spec-modulo-1.md), su [fix](../Fix-modulo-1/spec-fix.md), el [motor](../fase-3-modulo-2/plan.md) y el [portal público](../fase-4-modulo-3/plan.md).

La constitución usa ahora «inhabilitación recuperable» y alcance exclusivamente backend, en consonancia con la especificación. La propuesta mantiene sin aprobar tanto estos ajustes como sus precedencias futuras; no modifica todavía las normas vigentes. La afirmación de ausencia de negocios operativos procede del responsable del proyecto y nunca autoriza limpiar una base.

Base observada en el repositorio:

- NestJS, TypeScript, TypeORM y MariaDB/MySQL; módulos de licencias, correos, cuentas, catálogos, horarios, disponibilidad y reservas públicas ya separados. Conservar este stack, sin incorporar infraestructura externa.
- La licencia ya conserva solicitud de suspensión, bloqueo programado, remanente congelado y versión de vencimiento. El plazo y el aviso preventivo actuales están fijados en 48 horas.
- La bandeja de correo ya tiene deduplicación, arrendamiento de trabajos, reintentos y descarte; el procesador envía por SMTP fuera de la transacción de dominio.
- El cupo actual de sucursales pertenece al negocio. Profesionales comparten identidad y estado con `usuarios`; `personal` es el perfil, no una segunda cuenta.
- Las bajas actuales pueden borrar físicamente profesionales, servicios y sucursales sin historial. Las relaciones y el lector de citas afectadas ya existen.
- El motor usa `intervaloMinutos`, cuadrícula anclada al bloque y selección compacta por tramos. La revalidación exige pertenecer a los horarios ofrecidos; esta condición debe diferenciar concesión nueva de consumo de apartado propio.
- El escritor público ya usa sesión, intento, bloqueos comunes y una transacción para cliente, cita, consumo y resultado. Su coordinador bloquea la fila de negocio en exclusiva, además del perfil común del Profesional.
- Los intentos distinguen `preparado`, `registrado` y `no_registrado`; el resolutor cierra incertidumbre y normalmente libera el apartado. El rechazo por cupo necesitará una causa terminal distinta que conserve el apartado.
- Existen pruebas unitarias, de integración y HTTP, reloj controlable y utilidades de bases desechables y dos conexiones. No se han ejecutado suites para redactar este plan.

## 2. Módulos y responsabilidades

Las siguientes áreas son unidades de trabajo sobre los módulos existentes, no nuevos servicios desplegables. Controllers y DTO gestionan la frontera; los servicios conservan autorización efectiva, reglas y transacciones.

| Área | Responsabilidad y colaboradores | RF cubiertos |
|---|---|---|
| A01 — Licencias y notificaciones | Plazo configurable, transiciones, vigencia, deduplicación de operaciones y correos; ampliar `licencias`, `correos` y ejecutor periódico. | RF-01–RF-15, RF-64, RF-67, RF-69 |
| A02 — Cupos de cuentas | Configuración superadmin, consulta de consumo, altas y activaciones de profesionales y recepcionistas; integrar también cualquier alta por invitación vigente. | RF-16–RF-21, RF-64–RF-65, RF-69 |
| A03 — Inhabilitación recuperable | Estados, consultas administrativas, restauración inactiva, acceso inmediato, oferta y causas de afectación; usuarios, profesionales, servicios, sucursales y autenticación. | RF-22–RF-31, RF-64–RF-65, RF-68–RF-69 |
| A04 — Publicación de precios | Configuración del negocio y proyección pública común para catálogo, apartados, registro, repetición y resolución. | RF-32–RF-35, RF-64, RF-66, RF-68–RF-69 |
| A05 — Horarios y configuración | Retirada de descansos/excepciones, normalización de franjas, separación global y reemplazo atómico de configuración. | RF-36–RF-42, RF-64–RF-65, RF-69 |
| A06 — Motor y ocupaciones | Espacios libres, separación protegida, redondeo, ambos modos y validación de apartados propios con condiciones preservadas. | RF-43–RF-55, RF-65, RF-67 |
| A07 — Cupo telefónico e intentos | Conteo por sucursal, rechazo durable corregible, sucesión de intentos y recuperación sin duplicar citas. | RF-56–RF-63, RF-65–RF-68 |
| A08 — Persistencia y verificación transversal | Esquema, migraciones, contratos HTTP, aislamiento, auditoría, concurrencia y evidencias. | RF-01–RF-69; integración manual de RF-63 diferida |

## 3. Modelo de datos propuesto

Usar camelCase en TypeScript y snake_case en SQL. Mantener referencias compuestas por negocio y restricciones de pertenencia. Los nombres siguientes son decisiones del plan; se incorporarán conjuntamente a entidades, migraciones y `db/schema.sql` durante la implementación.

| Entidad o conjunto | Cambio y restricciones | RF |
|---|---|---|
| `negocios` | Añadir `limite_profesionales_activos` y `limite_recepcionistas_activos`, enteros positivos, valores iniciales 5 y 3; añadir `mostrar_precios_publicos`, booleano inicialmente verdadero. No guardar contadores de consumo redundantes. | RF-16–RF-21, RF-32–RF-35 |
| `usuarios`, `servicios`, `sucursales` | Añadir `inhabilitado_en` anulable. Conservar `activo`; una fila inhabilitada debe tener `activo=false`. Restaurar limpia la marca y conserva `activo=false`. El profesional toma ambas condiciones de `usuarios`, sin duplicarlas en `personal`. Mantener índices únicos de nombres y correos. | RF-22–RF-31 |
| Relaciones de oferta, horarios, sesiones y auditoría | No borrar relaciones al inhabilitar. Revocar sesiones de cuentas inhabilitadas y comprobar cuenta persistida en solicitudes posteriores. La auditoría conserva actor y transición; no copiar credenciales ni contacto de clientes. | RF-25–RF-31, RF-64, RF-69 |
| `licencias` | Añadir `plazo_suspension_dias` anulable, entero 0–30, y `version_suspension` monotónica para identificar cada ciclo. Conservar los extremos temporales, `remanente_ms` y `version_vencimiento`. Una renovación no cambia el ciclo de suspensión. | RF-03–RF-15 |
| `operaciones_licencia` — nueva | Identidad de negocio, licencia, actor, clave opaca, acción, huella de parámetros no secretos y resultado histórico reducido. Unicidad por negocio, licencia y clave. Referencia compuesta a licencia; permite distinguir un reintento de una renovación anual nueva. No registrar operaciones fallidas como realizadas. | RF-04, RF-09–RF-15, RF-69 |
| `envios_correo` | Ampliar tipos para suspensión programada/efectiva, vencimiento natural, revocación, reactivación y renovación. Mantener aviso preventivo con `umbral_dias` 15 o 7; añadir referencia al ciclo de suspensión o a la operación según el tipo. Ampliar checks para las referencias válidas y conservar clave única de deduplicación. Sin cuerpos de correo ni secretos persistidos. | RF-01–RF-15 |
| `configuracion_agenda` | Añadir `tiempo_entre_citas_minutos`, entero 0–60 divisible entre 5, inicialmente 0. Retirar `intervalo_minutos` del contrato y de la configuración operativa; conservar modo, anticipación y horizonte. No reinterpretar el antiguo valor 15 como separación. | RF-39–RF-42 |
| `horarios_personal` | Mantener franjas semanales normalizadas y borradores incompletos compatibles con las reglas previas. Dejar campos antiguos de descanso sin uso operativo durante esta entrega. Las tablas antiguas de excepciones se conservan sin rutas activas ni lecturas operativas; no se purgan. | RF-36–RF-38 |
| `bloqueos_temporales` | Añadir separación capturada, `fin_ocupacion_utc`, modo capturado y versión de reglas de concesión. Mantener `fin_utc` como fin de atención, costo, zona, sesión, generación y vencimiento original. Añadir `intento_actual_id` anulable para impedir dos envíos activos sobre el mismo apartado. | RF-35, RF-43–RF-55, RF-60, RF-65–RF-66 |
| `citas` | Añadir separación histórica, `fin_ocupacion_utc` y `apartado_origen_id` anulable con unicidad por negocio para reservas procedentes de apartado. Conservar fin de atención, estado, origen, folio y contacto histórico. Añadir índice por negocio, sucursal, teléfono de contacto e inicio UTC para el conteo futuro. | RF-35, RF-43–RF-44, RF-54, RF-56–RF-66 |
| `intentos_reserva_publica` | Conservar estados y claves actuales; añadir `intento_anterior_id` anulable, único por negocio, para sucesión controlada. Usar `causa_publica=cupo_telefono_excedido` en el rechazo terminal específico. Conservar huella del envío rechazado y no guardar formulario en texto. | RF-59–RF-61, RF-65–RF-68 |

### Invariantes de persistencia

- `fin_ocupacion_utc = fin_utc + separación capturada`; la separación no depende de la configuración actual. No incluye minutos añadidos solamente para redondear el siguiente inicio. Capturar y comprobar ambos extremos en el mismo commit. **RF-43–RF-48, RF-54.**
- El apartado vigente requiere no estar liberado y `ahora < expira_en`. Una cita no cancelada ocupa independientemente de la inhabilitación de sus recursos. **RF-28, RF-44, RF-52.**
- El cupo de cuentas se deriva de `usuarios` por negocio, rol, activo y ausencia de inhabilitación; el de teléfono se deriva de citas no canceladas con `inicio_utc > ahora`. No se necesitan trabajos que descuenten contadores. **RF-18–RF-21, RF-56–RF-59.**
- `no_registrado` permanece terminal. Solo su causa específica de cupo habilita preparar un sucesor sobre el apartado todavía vigente; una clave anterior nunca se reabre. El origen único de la cita impide consumir dos veces el mismo apartado. **RF-60, RF-65–RF-66.**
- Los nuevos campos históricos no se aceptan del navegador. Conservar `costo_aceptado` como nombre interno heredado, interpretado como costo fijado; no presentarlo como prueba de aceptación informada. No añadir una marca que afirme que el cliente vio el precio. **RF-35, RF-64.**

## 4. Comportamiento por área

### 4.1 Licencias, reloj y avisos — RF-01–RF-15, RF-64, RF-67, RF-69

El plazo de suspensión usa días transcurridos de 24 horas desde la solicitud, coherentes con el plazo anterior de 48 horas. Una licencia habilitada conserva acceso hasta el primer límite aplicable. La renovación mantiene el cálculo anual de calendario existente. Las licencias aún no habilitadas conservan sus restricciones de activación y no adquieren acceso por configurar un plazo.

Reglas del detector de correos, evaluadas también al preparar cada envío:

| Situación al procesar | Acción |
|---|---|
| Restan más de 15 días | No emitir preventivo. |
| Restan más de 7 y hasta 15 días | Emitir preventivo de 15 si no está confirmado para ese vencimiento. |
| Restan más de 0 y hasta 7 días | Descartar preventivo de 15 aún pendiente y emitir solo el de 7 si corresponde. |
| Se alcanzó el vencimiento natural y la licencia no estaba congelada antes | Emitir vencimiento, retirar preventivos pendientes y omitir posterior correo de suspensión. |
| Se alcanzó suspensión antes del vencimiento | Congelar al instante programado, aunque el procesador llegue tarde; emitir suspensión efectiva, sin tratar la fecha retenida como vencimiento natural mientras permanezca congelada. |
| Suspensión y vencimiento coinciden exactamente | Priorizar vencimiento natural para acceso y aviso, evitando dos mensajes de bloqueo; conservar la condición de suspensión para que renovar no la levante. |

Un preventivo recuperado muestra la fecha de vencimiento y el tiempo restante calculado al prepararlo, no «faltan 15 días» si ya quedan menos. Si el de 15 sí se entregó, el de 7 sigue siendo un aviso posterior distinto.

Identidades lógicas: preventivos y vencimiento se deduplican por licencia, versión de vencimiento y tipo/umbral; suspensión por licencia, ciclo y tipo; renovaciones y reactivaciones por operación registrada. La petición repetida con misma clave y parámetros devuelve su resultado; otra clave para una suspensión ya solicitada produce conflicto. Para renovar otra anualidad se exige una clave nueva.

Registrar transición, auditoría y trabajo de correo en un mismo commit. El envío ocurre después. Comprobar vigencia del evento y destinatario antes de SMTP; descartar pendientes obsoletos. Un mensaje ya aceptado por el proveedor no puede retirarse. Garantizar una identidad lógica por aviso, no entrega física exactamente una vez: una caída entre aceptación SMTP y confirmación local puede causar reentrega. Conservar identificador de mensaje estable, reintentos y evidencia de este límite técnico, sin prometer una garantía que SMTP no proporciona.

### 4.2 Cupos e inhabilitación — RF-16–RF-31, RF-64–RF-65, RF-69

Centralizar la política de cupos para alta directa, alta por invitación si crea la cuenta activa y reactivación; comprobar antes de persistir la cuenta y antes de consumir definitivamente cualquier invitación. La reducción y las altas comparten exclusión del negocio. La suspensión de licencia no modifica `activo` y no libera lugares.

Inhabilitar cambia exclusivamente el estado del recurso solicitado; no propaga marcas a recursos relacionados. En cuentas revoca sesiones y bloquea autenticación y solicitudes ya autenticadas. No elimina reservas de correo, perfiles, horarios, oferta ni citas. Las consultas habituales excluyen inhabilitados; el detalle específico de inhabilitados requiere el mismo permiso exclusivo de administrador que su listado. No permitir editar o activar directamente un registro inhabilitado: primero restaurar.

Restaurar deja inactivo incluso si antes de inhabilitar estaba activo. Repetir restauración de un registro ya restaurado no lo desactiva otra vez. Activar valida cupo y conflictos actuales. La activación de una sucursal restablece solo oferta individual todavía activa, sin tocar estados de profesionales o servicios.

Ampliar las causas del lector de citas afectadas para reflejar inhabilitación; consultar históricos no debe aplicar el filtro de «catálogo habitual». Al desaparecer una causa, conservar las restantes y nunca mutar las citas.

### 4.3 Precio y contratos públicos — RF-32–RF-35, RF-64, RF-66, RF-68

Separar resultado histórico interno de representación pública. Una proyección común recibe el resultado y la configuración vigente del negocio y omite los campos monetarios si están ocultos; no devolver cero ni `null` como sustitución del precio. Aplicarla al catálogo, consultas de apartados, registro, repeticiones y resolución.

La identidad de reserva, folio e historia permanecen idempotentes; su representación puede omitir o incluir el precio según la configuración vigente. No devolver un JSON público antiguo almacenado como resultado. Consultar visibilidad aun cuando la licencia ya no acepte reservas, sin reautorizar nuevas escrituras por ello. Mantener `Cache-Control: no-store` en resultados personales y también en el catálogo configurable para evitar exposición por caché después de ocultar precios.

La configuración es global, inicialmente verdadera; no añadir propiedades a cada servicio. Los campos monetarios públicos pasan a opcionales en los contratos. Mantener acceso monetario administrativo según los permisos existentes, no público por conocer un folio.

### 4.4 Horarios y franjas — RF-36–RF-42, RF-64–RF-65, RF-69

Retirar campos de descanso de los DTO; rechazarlos como desconocidos. Retirar las rutas operativas de excepciones, devolviendo 404. No simular éxito ni ignorar silenciosamente un descanso o excepción solicitado. Mantener bloqueos y sus permisos previos.

Al reemplazar una semana: validar pertenencia, campos, asignaciones y superposiciones; unir transitivamente solo franjas completas, contiguas, del mismo día, sucursal y estado; volver a validar la semana resultante frente a todas las sucursales y zonas. Los borradores incompletos se conservan, no se fusionan por valores nulos. Franjas de distinto estado no se unen.

Para identidad estable, conservar el menor ID existente entre las filas fusionadas, o crear uno si todas son nuevas; reordenar la representación del día de forma determinista y devolver el conjunto canónico completo. La auditoría conserva el antes y después de la normalización. El reemplazo de filas técnicas de horario no equivale al borrado de cuentas, servicios o sucursales prohibido por RF-22.

Reemplazar atómicamente modo, separación, anticipación y horizonte; no hacer obligatorio editar visibilidad de precios en esa misma operación. Conservar modalidades pública y manual y permisos de consulta existentes. La modalidad manual del motor mantiene las excepciones vigentes de anticipación, horizonte y estrategia pública, pero respeta separación, oferta, horarios y no empalmes; no se implementa su escritor.

### 4.5 Motor compartido — RF-43–RF-55, RF-65, RF-67

1. Con una lectura coherente y un solo instante de cálculo, resolver oferta activa, licencia, zona IANA, duración y configuración aplicable.
2. Construir atención continua con franjas canónicas; descontar bloqueos y ocupaciones de todas las sucursales del profesional usando el fin protegido. Las consultas de ocupaciones deben incluir una cita cuya atención acabó antes del rango pero cuya separación todavía lo invade.
3. Para cada espacio libre, limitar por anticipación/horizonte públicos y obtener el primer inicio local válido redondeado hacia arriba a cinco minutos. Resolver cada hora local inequívocamente; no redondear UTC como sustituto del redondeo local.
4. Admitir un candidato solo si atención más separación caben completas. El siguiente candidato parte del inicio anterior ofrecido más duración y separación, redondeado de nuevo hacia arriba. Esto evita inicios repetidos y cubre servicios de duración no múltiplo de cinco.
5. Libre devuelve todos los candidatos. Compacta selecciona el menor inicio UTC válido de cada fecha local de la combinación solicitada entre todos sus tramos; no restringe otros días.

Mantener intervalos semiabiertos: terminar exactamente cuando empieza otra ocupación no es conflicto. Ni consulta ni apartado garantizan el commit final. Un 200 vacío solo representa cálculo correcto sin candidatos; los fallos técnicos permanecen 500/503.

### 4.6 Concesión frente a consumo de apartado — RF-29, RF-35, RF-43–RF-55, RF-65–RF-68

Para un apartado nuevo, validar que el inicio pertenezca a la oferta pública actual y capturar modo, separación, costo, zona y extremos. Mantener reemplazo en dos transacciones: liberar primero y conceder después, sin resucitar el apartado anterior si falla la concesión.

Para consumir un apartado propio vigente, cargar el contexto guardado desde el servidor. Usar su separación y extremos, excluir únicamente su ocupación propia y no exigir pertenencia a la nueva lista de horarios ofrecidos, ni anclaje al comienzo del espacio libre ni condición de primer horario. El modo preservado no convierte el consumo en modalidad manual.

Seguir validando licencia, oferta, horario, bloqueos, pertenencia, inicio no pasado y restricciones públicas no exceptuadas expresamente. Duración o zona incompatibles con los extremos capturados producen conflicto conforme al contrato existente. RF-54 solo preserva modo y separación; no concede inmunidad ante otros cambios. Un lector de afectaciones debe utilizar la separación histórica de cada cita, no la configuración nueva.

### 4.7 Cupo telefónico y corrección segura — RF-56–RF-63, RF-65–RF-68

Normalizar teléfono con la regla mexicana vigente antes de evaluar el cupo. Contar citas del negocio y sucursal con ese contacto normalizado, estado distinto de cancelada e inicio posterior al instante de la transacción. Pendientes cuentan; citas comenzadas, apartados y cualquier otra sucursal no cuentan.

Reutilizar la barrera exclusiva del negocio que ya toma el escritor público: serializa el conteo y la inserción incluso con profesionales diferentes. No añadir en esta versión una tabla de contadores o cerrojos por teléfono. Todos los futuros escritores deberán participar en esa barrera; el servicio de cupo será reutilizable, sin afirmar que existe integración manual.

Flujo del rechazo y corrección:

1. Reconocer resultados registrados antes de comprobar cupo. Una repetición válida devuelve su cita, aunque ahora el cupo esté lleno o la cita haya comenzado.
2. Si una reserva nueva excede el cupo, guardar el intento como `no_registrado`, su huella y la causa específica; conservar apartado, puntero de sesión y vencimiento. Confirmar ese resultado terminal sin insertar cliente ni cita. Traducirlo a 409 después del commit, para no revertir el rechazo durable por lanzar una excepción dentro de la transacción.
3. Preparar un intento sucesor exige una clave nueva y referencia al intento anterior propio, terminal por cupo, todavía señalado como intento actual del apartado. Actualizar el puntero bajo la misma exclusión. Sin esa causa, un intento diferente sobre el mismo apartado sigue en conflicto.
4. Una repetición de la preparación del sucesor devuelve el mismo intento. Dos sucesores concurrentes no pueden ganar. Un envío atrasado del anterior devuelve su rechazo terminal y no escribe, aunque el nuevo teléfono sí tenga cupo.
5. Si se pierde la respuesta al rechazo, resolver devuelve `no_registrado` con causa de cupo y posibilidad de corrección mientras el apartado siga vigente. No ejecuta la liberación genérica usada para incertidumbre cerrada sin registro.
6. Si el escritor aún está en curso, esperar o responder 503 según el contrato; nunca habilitar la corrección por una ausencia simple. La resolución genérica que cierra un envío incierto conserva su comportamiento de liberación y no permite sucesión sobre el mismo apartado.

Esta es una excepción acotada a la regla anterior de un único intento por apartado y debe quedar documentada en el contrato público. No reutilizar una clave con otro formulario ni ofrecer una consulta pública de cupo por teléfono.

## 5. Coordinación transaccional y errores

**RF transversales: RF-09, RF-15, RF-19–RF-21, RF-28–RF-31, RF-42–RF-44, RF-54–RF-60 y RF-64–RF-69.**

- Usar `READ COMMITTED` en escritores. Mantener la precedencia común: en público, sesión y operación/intento; después usuarios, negocio, licencia, sucursales, servicios, perfiles y ocupaciones. Correos reservados, altas y códigos conservan su posición anterior a los recursos posteriores cuando una operación los necesite. IDs ordenados dentro de cada clase; nunca adquirir usuarios nuevos después del perfil.
- La fila de negocio serializa cupos, configuración y cambios colectivos. La fila común del perfil sigue siendo obligatoria para la ocupación del Profesional entre sucursales. No reemplazar exclusión durable por locks del proceso.
- El procesador puede reclamar un correo en una transacción breve que termina antes de adquirir recursos de dominio. Cuando necesite ambos, tomar negocio/licencia antes del envío; no mantener un bloqueo de envío mientras espera usuarios o negocio en orden inverso. Las nuevas consultas deben respetar este orden también en reintentos administrativos.
- Capturar el instante de cálculo tras adquirir los bloqueos necesarios y releer recursos después de la espera. Pasarlo al motor, conteo de cupos y evaluaciones de esa decisión. Si la validación tarda hasta cruzar expiración o inicio, una comprobación final puede abortar; no reutilizar un cálculo vencido ni mezclar instantes para declarar válido el mismo resultado.
- Guardar cliente, cita, separación, consumo de apartado y resultado registrado en un solo commit. El rechazo por cupo es otro resultado durable deliberado, con cero filas de cliente/cita. La creación de trabajo de correo comparte commit con su transición, nunca depende de que SMTP responda.
- Reintentar fallos transitorios con transacción nueva y clave estable; agotamiento produce 503. Usar 400 para entradas inválidas/desconocidas, 401 para autenticación ausente o inválida, 403 para permiso/origen/CSRF, 404 para recurso no accesible, 409 para conflictos de cupo, estado, oferta o reserva, 500 para inesperados. No exponer SQL, trazas o contacto ajeno.

## 6. Contratos HTTP y compatibilidad

Los siguientes cambios son parte de la propuesta de API, no rutas ya implementadas. Mantener las nueve rutas públicas y cinco privadas de disponibilidad, con los ajustes de cuerpo y respuesta indicados. Registrar explícitamente cambios incompatibles para el trabajo frontend posterior.

| Frontera | Contrato propuesto | RF |
|---|---|---|
| `POST /licencias/:id/suspender` | Superadmin; aceptar `plazoDias` opcional, 0–30, predeterminado 2. Responder 200 con vigencia y bloqueo efectivo/programado. Conflicto si ya existe otra solicitud de suspensión. | RF-03–RF-08 |
| Suspender, reactivar y renovar licencia | Añadir cabecera obligatoria `Idempotency-Key` opaca de 16–64 caracteres; misma clave, acción y contenido reproduce resultado; uso incompatible produce 409. Confirmaciones nuevas solo por operaciones nuevas efectivas. | RF-04, RF-09–RF-15 |
| `GET /negocios/:id/cupo-usuarios` y `PATCH /negocios/:id/limites-usuarios` | Superadmin; consulta límites y consumo por rol. PATCH recibe ambos límites positivos y aplica el conjunto atómicamente; devuelve 200 o 409 si alguno queda por debajo del consumo. | RF-16–RF-21 |
| `GET /profesionales/cupo` y `GET /recepcionistas/cupo` | Administrador del negocio propio; respuesta con límite, activos y disponibles del rol, sin facultad para modificar el límite. | RF-18–RF-21, RF-64 |
| Recursos `profesionales`, `recepcionistas`, `servicios`, `sucursales` | Añadir `GET /<recurso>/inhabilitados`, `GET /<recurso>/inhabilitados/:id`, `POST /<recurso>/:id/inhabilitar` y `POST /<recurso>/:id/restaurar`, exclusivos del administrador propio. Mutaciones devuelven 200 con estado actual. Registrar rutas estáticas antes de `:id`. | RF-22–RF-31 |
| Bajas y activaciones anteriores | Retirar rutas DELETE de los recursos indicados: 404 y ninguna escritura. Mantener desactivar/reactivar para registros no inhabilitados; reactivar inhabilitados produce 409. La restauración no es una activación. | RF-22–RF-27 |
| `GET /negocios/publicacion-catalogo` y PATCH existente | Administrador propio. Añadir consulta; ampliar PATCH para actualización parcial de `mostrarPreciosPublicos` sin obligar a reenviar contacto/categoría. Mover escritura a servicio con barrera y auditoría; conservar campos existentes no enviados. | RF-32–RF-35, RF-69 |
| `GET/PUT /disponibilidad/configuracion` | Reemplazar `intervaloMinutos` por `tiempoEntreCitasMinutos`; PUT sigue reemplazando el conjunto completo de configuración. Rechazar el campo retirado, no convertirlo silenciosamente. | RF-39–RF-42 |
| Horarios semanales y excepciones | Semana devuelve franjas canónicas sin descansos; rechazar campos antiguos. Retirar endpoints de excepciones y devolver 404. | RF-36–RF-38 |
| Respuestas públicas existentes | Omitir campos monetarios si corresponde. El resumen mantiene `finUtc` de atención; no exponer información interna del cupo telefónico. Conservar estado pendiente, folio y ausencia de promesas de WhatsApp. | RF-32–RF-35, RF-61, RF-68 |
| Preparar intento público | Conservar clave y apartado; admitir opcionalmente `intentoAnteriorId` para sucesión únicamente tras rechazo terminal de cupo. Nuevo 201, repetición 200, conflicto 409. | RF-60, RF-65–RF-66 |
| Reservar/resolver intento | Rechazo por cupo: 409 con código `cupo_telefono_excedido` y mensaje de RF-61. Resolución 200 terminal puede incluir esa causa y `puedeCorregir` calculado según propiedad, puntero y vigencia. Resultado registrado continúa 201 inicial/200 repetido. | RF-59–RF-61, RF-66–RF-68 |

No cambiar rutas de disponibilidad pública para aceptar modalidad manual, separación, precio o exclusiones aportadas por el cliente. Mantener cookies, origen, CSRF, límite de cuerpo y autorización de las rutas privadas. El backend no puede retirar un precio de una respuesta que el navegador ya recibió; RF-34 se satisface sobre las siguientes respuestas.

## 7. Decisiones justificadas y alternativas descartadas

| Decisión | Motivo | Alternativa descartada | RF |
|---|---|---|---|
| D01 — Extender servicios y bandeja existentes | Mantener un único dominio transaccional y aprovechar reintentos ya disponibles. | Nuevo microservicio o envío SMTP dentro del commit: aumenta fallos parciales y acopla el acceso al correo. | RF-01–RF-15, RF-67 |
| D02 — Identidad separada de vencimiento, suspensión y operación | Renovar durante suspensión no debe borrar su evento ni reiniciar su plazo. | Una sola versión global de correo: invalidaría avisos de suspensión todavía vigentes al renovar. | RF-04–RF-15 |
| D03 — Operaciones de licencia idempotentes por clave | Diferenciar reenvío de una renovación de otra anualidad intencional. | Deducir repetición por hora o contenido: podría duplicar o impedir renovaciones legítimas. | RF-12–RF-15 |
| D04 — Estado activo más marca de inhabilitación | Expresar recuperación inactiva sin duplicar la identidad del profesional. | Reutilizar solo `activo` o borrar filas: no distingue desactivación de retirada recuperable. | RF-22–RF-31 |
| D05 — Conteos bajo barrera de negocio | Protege cupos de cuentas y teléfono con coordinación ya existente, incluso entre profesionales. | Conteo sin bloqueo o contadores almacenados: carreras y deriva al comenzar citas o cambiar estados. | RF-16–RF-21, RF-56–RF-59 |
| D06 — Precio histórico y proyección pública dinámica | Recuperar la misma reserva respetando la visibilidad vigente. | Ocultar solo en frontend o borrar el costo: expone importes o destruye historia. | RF-32–RF-35, RF-66, RF-68 |
| D07 — Fin de atención separado del fin protegido | Mantener resumen clínico correcto y evitar invasión de separación. | Alargar la duración del servicio o recalcular citas con configuración actual: altera historia. | RF-43–RF-48, RF-54 |
| D08 — Un generador, dos selecciones | Libre entrega todos los candidatos; Compacta toma el primero por fecha y combinación. | Algoritmos independientes o compactación por tramo: divergencia y más de una opción al día. | RF-49–RF-52 |
| D09 — Redondeo local hacia arriba, sin ocupación artificial | Cumplir anticipación y presentación de cinco minutos sin bloquear minutos no acordados. | Redondear hacia abajo o ampliar el fin protegido: ofrece horas prematuras o cambia la separación real. | RF-46–RF-49 |
| D10 — Validar apartado propio sin repetir la selección pública | Conserva RF-53/RF-54 sin relajar oferta, licencia ni empalmes. | Exigir que siga apareciendo en resultados o convertirlo en reserva manual: invalida apartados o elude restricciones. | RF-29, RF-53–RF-55 |
| D11 — Sucesor explícito de un rechazo terminal por cupo | Permitir corregir contacto sin revivir escrituras atrasadas ni renovar el apartado. | Cambiar formulario bajo la misma clave, borrar el intento o liberar siempre: rompe idempotencia o RF-60. | RF-59–RF-60, RF-65–RF-68 |
| D12 — Retirada operativa sin purga histórica | Cumplir simplificación de horarios sin borrar evidencia ni reinterpretar datos de prueba. | Eliminar tablas/filas o ignorar datos operativos inesperados: pérdida de información o apertura de horarios. | RF-36–RF-42, RF-69 |

## 8. Migraciones y entrega incremental

**RF: RF-01–RF-69; criterio de finalización 8.** No ejecutar migraciones durante la redacción de este plan.

1. **Preparación documental y de contratos:** alinear constitución con acuerdos posteriores y registrar el cambio de contratos, especialmente intentos corregibles, separación e inhabilitación. No reinterpretar evidencia antigua como cobertura nueva.
2. **Ampliación del esquema:** crear campos, claves e índices nuevos y operaciones de licencia. Actualizar checks de correos y esquema canónico. No editar migraciones históricas; añadir migraciones posteriores a las existentes.
3. **Compatibilidad histórica:** en citas antiguas, separación 0 y fin protegido igual al fin de atención anterior, porque el intervalo antiguo no protegía tiempo extra. No inventar que un precio histórico fue visible. Preservar filas antiguas y auditoría.
4. **Verificación previa al cambio de reglas:** comprobar ausencia de apartados vigentes concedidos con el motor anterior y ausencia de horarios operativos con descansos/excepciones. Si aparecen, detener la activación de las reglas y documentar la discrepancia; no abrir disponibilidad ignorándolos ni limpiar la base. Pueden existir fixtures históricos en bases de prueba, que deben permanecer identificados como tales.
5. **Implementación por dependencias:** A01 y A02/A03 sobre persistencia; A04 sobre publicación; A05 antes de A06; A06 y coordinación antes de A07; cerrar con A08. Este orden no autoriza agentes paralelos ni tareas fuera del alcance.
6. **Comprobación y entrega:** ejecutar suites y documentar resultados. Mantener el interruptor existente de escrituras públicas cerrado durante una actualización incompatible hasta validar esquema y servicios. No habilitar producción ni declarar el portal compatible sin que su consumidor adopte los cambios de contrato.

Las migraciones deben permitir instalación limpia y evolución desde el esquema actual en bases desechables. No imponer cupos a datos operativos inesperados ni eliminar horarios para que una migración pase. Conservar columnas/tablas retiradas como legado sin autoridad operativa durante esta entrega. Un rollback hacia una versión que ignore inhabilitación o separación no es seguro después de crear datos nuevos: restaurar una copia verificada o aplicar corrección hacia adelante con escrituras cerradas; no ofrecer una reversión destructiva automática.

## 9. Estrategia de pruebas y matriz RF → evidencia

### Niveles y entorno

- **Unitarias:** validadores, política temporal, ventanas de correo, estados, normalización, redondeo y selección del motor. Reloj inyectado, sin depender de hora del host ni esperas reales.
- **Integración:** MariaDB/MySQL real en bases desechables, transacciones, restricciones, migraciones, reintentos y filas finales. Usar las utilidades existentes de bases migradas y verificar identidad de base de prueba antes de cualquier escritura o limpieza. `NODE_ENV=test` por sí solo no autoriza usar la base cotidiana.
- **Concurrencia:** dos conexiones independientes y barreras explícitas; ejecutar ambos órdenes relevantes. No acreditar exclusión con promesas paralelas sin garantizar la intercalación. Verificar citas, clientes, apartados, intentos, estado de cuentas y auditoría después del commit.
- **HTTP:** Supertest sobre servicios y escritor reales; permisos, serialización, códigos, entradas desconocidas, seguridad pública y nueve rutas públicas más cinco privadas. Sin requerir navegador o cambios frontend en este alcance.
- **Correo:** transporte controlado con éxito, rechazo, timeout y caída después de aceptación; verificar identidad lógica y declarar el límite de reentrega SMTP. No mandar correos reales para acreditar tests.

| Grupo | Escenarios mínimos y evidencia | RF cubiertos |
|---|---|---|
| T01 — Avisos preventivos | Antes/en/después de 15 y 7 días; ausencia de 2 días; caída de 15 hasta 6 días; aviso entregado frente a pendiente; renovación que invalida preventivo. | RF-01–RF-02, RF-09, RF-14 |
| T02 — Suspensión y reactivación | Plazos 0, 2, 30; negativos/fraccionarios/31; repetición y cambio de plazo prohibido; sesiones abiertas; vencimiento antes, después e igual al bloqueo; revocación y reactivación con remanente exacto. | RF-03–RF-11, RF-14–RF-15 |
| T03 — Renovación y correo durable | Vigente/vencida/suspendida; anualidad y años bisiestos; misma clave frente a operación nueva; renovación contra suspensión/reactivación en ambos órdenes; fallo de bandeja revierte transición; SMTP no altera acceso; obsolescencia y reentrega. | RF-09, RF-12–RF-15, RF-69 |
| T04 — Cupos de cuentas | Iniciales 5/3; mínimo 1; rol incorrecto; cuentas inactivas/inhabilitadas; profesional multisucursal contado una vez; alta/invitación/reactivación por último lugar; reducir contra alta; rollback completo. | RF-16–RF-21, RF-64–RF-65 |
| T05 — Inhabilitar/restaurar | Cuatro recursos; listado habitual y específico; unicidad retenida; acceso de sesiones abiertas; repetición; restaurar inactivo con cupo completo; activar con conflicto; sucursal conserva relaciones y estados individuales. | RF-22–RF-27, RF-30–RF-31, RF-64, RF-69 |
| T06 — Afectaciones y oferta concurrente | Inhabilitar antes/después de reservar; citas conservadas y múltiples causas; apartado previo rechazado; restauración que elimina solo su causa; ocupación histórica de recurso inhabilitado. | RF-28–RF-31, RF-44, RF-55, RF-65 |
| T07 — Precio público | Default visible, cambio global y nuevo servicio; catálogo/apartado/registro/repetición/resolución sin campos monetarios; cambio durante flujo; costo histórico; recuperación con licencia bloqueada. | RF-32–RF-35, RF-64, RF-66, RF-68 |
| T08 — Horarios y configuración | Descanso desconocido; rutas de excepción retiradas; bloqueos vigentes; fusión transitiva y estable, huecos y estados distintos, borradores; conflictos entre zonas; valores 0/5/60 y valores inválidos; reemplazo atómico. | RF-36–RF-42, RF-64–RF-65, RF-69 |
| T09 — Ocupación protegida | Separación invade otra sucursal/servicio; cita que terminó atención fuera del rango pero protege tiempo dentro; cierre exacto y exceso; cambios de separación sin alterar historia; solo cancelada libera cita. | RF-43–RF-45, RF-54 |
| T10 — Redondeo y modos | 09:07 + 15 → 09:25; fin protegido 09:42 → 09:45; duración 32; segundos y límite ya múltiplo; libre desde cada hueco; compacta entre mañana/tarde y días independientes; DST ambiguo/inexistente; legítimo vacío. | RF-46–RF-52, RF-67 |
| T11 — Apartados preservados | Liberar horario anterior; cambio de modo y separación con apartado vigente; rechazo por licencia/oferta/horario; expiración exacta; sustituir apartado en dos transacciones; sin renovación por fallo. | RF-29, RF-35, RF-52–RF-55, RF-65 |
| T12 — Cupo telefónico | Normalización +52/espacios; dos nombres diferentes; tercera rechazada; varias sucursales/negocios/profesionales; antes/en/después del inicio; canceladas y apartados excluidos; carrera por último lugar con profesionales distintos. | RF-56–RF-59, RF-61–RF-62, RF-65 |
| T13 — Corrección e incertidumbre | Rechazo durable, respuesta perdida al rechazo, sucesor válido, dos sucesores, preparación repetida, envío viejo atrasado, vencimiento durante corrección, escritor/resolutor en ambos órdenes, 503 sin cierre ficticio y resultado registrado sin nuevo conteo. | RF-60–RF-61, RF-65–RF-68 |
| T14 — Seguridad, fallos y auditoría | Roles y dos negocios; IDs manipulados; cookie/origen/CSRF; 32 KiB; campos desconocidos; SQL/trazas ocultos; no-store; precios en todas las proyecciones; fallos inyectados tras cada escritura; eventos solo ante cambios reales. | RF-64–RF-69, RF-25, RF-33 |
| T15 — Instalación y regresión | Instalación limpia, actualización, coherencia entidad/esquema/migración, FK por negocio, unicidad y checks; datos inesperados impiden activación; conservar suites compatibles de módulos anteriores y contratos públicos/privados. | RF-01–RF-69; no acredita RF-63 manual |
| T16 — Integración manual diferida | Cuando exista escritor manual real, verificar cupo compartido, separación y carreras pública/manual contra los mismos recursos y reglas. Registrar como pendiente hasta entonces. | RF-63; M3-I001/M2-I004 y contratos compatibles del motor |

### Comandos y evidencia al implementar

Desde la raíz del backend, ejecutar `npm run build`, `npm run lint`, `npm test -- --runInBand`, `npm run test:integration -- --runInBand` y `npm run test:e2e -- --runInBand`, con entorno de pruebas seguro para las suites que escriben. No ejecutar `format` como comprobación: modifica fuentes.

Guardar en `resultados-tareas/` de esta carpeta la revisión evaluada, entorno no secreto, comandos, códigos de salida, cantidades de tests y matriz RF → caso → resultado. Una prueba omitida o infraestructura ausente se informa como pendiente/fallo, nunca como éxito. Mantener evidencia histórica sin reescribirla; actualizar las expectativas antiguas incompatibles con referencia al RF que cambió.

No ejecutar suites del frontend ni declarar su compatibilidad. El cierre del ajuste exige cubrir los ocho criterios de la especificación para backend y registrar explícitamente la integración manual diferida. No marcar tareas de fase 4 ni declarar producción habilitada o fase cerrada como consecuencia de redactar este plan.
