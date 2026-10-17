# Plan — Fase 4, Módulo 3: Portal Público de Reservas

## 1. Base normativa y alcance de esta entrega documental

Este plan prepara la implementación de la [constitución](constitucion-modulo-3.md) y la [especificación](spec.md). No acredita código, migraciones ni pruebas ejecutadas. Los RF citados sin prefijo pertenecen a `spec.md`; los identificadores M2 corresponden al módulo 2.

Se conservan la [especificación del motor](../fase-3/spec-modulo-2.md), su [plan](../fase-3/plan.md) y el [contrato de escritores](../fase-3/resultados-tareas/contrato-escritores-t078-t079.md). La palabra «confirmar» de la constitución se interpreta como guardar la reserva y consumir su apartado: el estado inicial será `pendiente`, conforme a RF-34 y RF-38, y la confirmación del cliente por WhatsApp pertenece al módulo 5.

Mantener NestJS, TypeScript, TypeORM y MariaDB/MySQL. El frontend conserva HTML, CSS, JavaScript, Bootstrap y Vite. No incorporar pagos, calendario operativo, reserva manual, cambios posteriores de estado, mensajes, PDF ni consulta pública por teléfono o folio. La recuperación de un envío concreto no será un buscador de citas.

### Situación comprobada

- El negocio ya dispone de `slug` único. El enlace del portal será `/reservas/:slug`; no hace falta otro identificador público del negocio.
- El motor actual recibe un JWT interno y reconstruye sesión, rol y licencia. Su contrato no admite todavía un visitante público: debe ampliarse su frontera de autorización, conservando el cálculo compartido y los permisos privados.
- `PoliticaAccesoLicenciaService.puedeAceptarReserva` ya expresa la habilitación del negocio y el acceso por licencia, incluida la gracia de suspensión. No simular una cuenta de Administrador para usarla.
- Existen `clientes`, `citas` y `bloqueos_temporales`. Las citas guardan extremos UTC, zona, estado, folio y origen; no guardan costo aceptado ni una copia de nombre y teléfono. Los apartados tampoco guardan costo.
- `clientes` tiene unicidad por negocio y teléfono, incompatible con usar ese teléfono como identidad de familiares distintos. El plan elimina esa suposición y conserva datos por reserva.
- El frontend conectado requiere sesión y el portal existente está en la demo. Ni sus datos ficticios ni su contador local acreditan reservas reales.
- El contrato exige revisar la coordinación con mutaciones operativas. Hay rutas que toman perfil antes que usuario; no se presume que todo el orden de bloqueos ya sea compatible.

## 2. Módulos y responsabilidades

| Parte | Responsabilidad y colaboración | RF cubiertos |
| --- | --- | --- |
| M01 — Acceso público | Resolver `slug`, comprobar licencia, proyectar información pública y establecer identidad anónima del navegador para apartados y envíos. No crear cuentas de clientes. | RF-01–RF-04, RF-11, RF-13, RF-29, RF-42–RF-43 |
| M02 — Catálogo y disponibilidad públicos | Listar oferta efectiva siguiendo las selecciones; consultar el motor con modalidad pública, zona de sucursal y lectura coherente. Diferenciar vacío legítimo y fallo técnico. | RF-04–RF-06, RF-14–RF-18 |
| M03 — Apartados | Conceder cinco minutos, guardar costo, liberar, reemplazar entre pestañas y comprobar propiedad y vencimiento. Coordinar todas las ocupaciones del Profesional. | RF-18–RF-30, RF-33, RF-35 |
| M04 — Registro de reserva | Validar contacto, revalidar apartado y condiciones vigentes, registrar cliente y cita pendiente, consumir apartado y producir resumen estable. | RF-08–RF-13, RF-30–RF-38, RF-43 |
| M05 — Intentos y recuperación | Identificar un envío, evitar duplicados y resolver resultados inciertos, incluyendo peticiones retrasadas y recarga. Solo recuperar intentos propios. | RF-28–RF-29, RF-35, RF-39–RF-43 |
| M06 — Portal web | Flujo móvil y por teclado, selecciones dependientes, errores, contador orientativo, coordinación entre pestañas y resultado pendiente. | RF-01, RF-05–RF-11, RF-15–RF-17, RF-19, RF-21–RF-28, RF-30, RF-32, RF-37, RF-39–RF-43 |
| M07 — Integración y persistencia | Migraciones, referencias por negocio, reloj, protocolo común con mutaciones operativas y evidencias de concurrencia real. | RF-02–RF-04, RF-12–RF-15, RF-18–RF-43 |

Componer los servicios de M01–M05 en `ReservasPublicasModule` y exponer controladores mediante `ReservasPublicasHttpModule`. Reutilizar los módulos actuales de disponibilidad, oferta, ocupaciones y licencias. M06 tendrá una entrada pública propia en el frontend, separada de la entrada administrativa y de la demo.

### Frontera con el motor

Separar el contexto común de cálculo —manager, instante, negocio y Profesional— de la autorización de origen. Mantener dos entradas: personal autenticado y visitante público autorizado para el negocio resuelto. La entrada pública solo permite modalidad pública; no admite rol, `negocioId`, `titularHash` ni exclusiones arbitrarias enviados por el navegador. Reutilizar la verificación de apartado propio internamente. Conservar las cinco rutas privadas y su matriz de permisos. **RF-01–RF-04, RF-14–RF-18, RF-29, RF-31–RF-33, RF-42.**

Las consultas capturan un instante y usan una transacción coherente de lectura. La escritura recibe su propio manager y relee con el instante obtenido después de esperar los bloqueos. No ejecutar el cálculo público mediante llamadas HTTP a las rutas privadas ni copiar el motor en JavaScript. **RF-14–RF-18, RF-20–RF-22, RF-31–RF-35.**

## 3. Modelo de datos previsto

Conservar claves compuestas por negocio e ID para referencias operativas. Los nombres de columnas estarán en snake_case; los importes usarán decimal exacto y los instantes UTC precisión de milisegundos. No guardar credenciales utilizables en base de datos ni auditoría.

| Entidad | Cambios previstos e invariantes | RF cubiertos |
| --- | --- | --- |
| `negocios` y `licencias` | Reutilizar `slug`, activación y política existente. Sin estados comerciales paralelos para el portal. | RF-01–RF-04, RF-31 |
| `sesiones_reserva_publica` — nueva | ID, negocio, `titular_hash`, generación creciente de selección, referencia anulable al apartado actual y fechas de creación/actualización. Unicidad por negocio y hash. Sirve como fila de coordinación de un navegador en ese negocio, sin ser cuenta de usuario. | RF-19–RF-29, RF-39–RF-42 |
| `operaciones_apartado` — nueva | ID opaco aportado como clave de operación, negocio, sesión, generación asignada, huella de selección, estado `preparada`, `concedida`, `rechazada` o `sustituida`, apartado resultante y causa pública. Unicidad por negocio/sesión/clave. Repetir la misma operación no reinicia cinco minutos ni libera un apartado más reciente. | RF-18–RF-27, RF-30, RF-33, RF-43 |
| `bloqueos_temporales` | Conservar combinación, intervalo, `titular_hash`, expiración y liberación. Añadir costo aceptado, zona del apartado, sesión, generación y referencia a su operación. Vigente solo si no está liberado y `ahora < expira_en`. Nunca reutilizar una fila vencida. | RF-19–RF-30, RF-31–RF-35 |
| `clientes` | Sustituir el índice único negocio/teléfono por uno no único. Crear una referencia de cliente por nueva reserva; no buscar ni actualizar una persona por coincidencia de teléfono. Mantener nombre, teléfono y FK por negocio. | RF-08–RF-13, RF-36 |
| `citas` | Mantener estado `pendiente`, origen `portal_publico`, UTC y zona originales. Añadir `costo_aceptado`, `nombre_contacto` y `telefono_contacto`; conservar notas en `motivo_consulta`. Guardar nombres de negocio, servicio, sucursal y Profesional del resumen para poder reproducir el resultado aunque cambie el catálogo. | RF-12, RF-30, RF-34–RF-39 |
| `intentos_reserva_publica` — nueva | ID opaco, negocio, sesión, apartado, huella del formulario normalizado y estado `preparado`, `registrado` o `no_registrado`, causa pública, cita y fechas. Unicidad por negocio/sesión/clave y por cita no nula. El vínculo a cita y el resultado se confirman junto a su creación. | RF-34–RF-43 |

No existe un estado persistido «procesando» que dependa de un proceso vivo: la transacción en curso mantiene la exclusión del intento. `no_registrado` es terminal e impide que una petición atrasada con esa clave cree la cita. Los intentos y operaciones terminales no se eliminan durante este módulo; su compactación futura deberá conservar la protección contra repetición. El plazo de cinco minutos solo corresponde al apartado, nunca al resultado de un envío. **RF-21–RF-22, RF-35, RF-38–RF-41.**

Las claves de intento y operación son identificadores, no permisos: siempre se exige la credencial del navegador y pertenencia al negocio. La huella del formulario será un HMAC con secreto de entorno para no persistir un hash fácilmente enumerable del teléfono. El formulario completo solo se guarda como datos de la reserva registrada. **RF-08–RF-13, RF-29, RF-36, RF-42–RF-43.**

### Migración y datos anteriores

Aplicar migraciones incrementales; registrar entidades en la configuración real de TypeORM y mantener `db/schema.sql` equivalente. Probar tanto instalación limpia como actualización desde fase 3. Conservar todos los IDs, estados, intervalos y relaciones previos. **RF-02, RF-12, RF-20, RF-36–RF-38.**

Los nuevos campos históricos podrán ser nulos en filas anteriores: no inventar el costo pasado tomando el catálogo actual ni atribuir a un cliente anterior otro nombre. El nuevo escritor exige todos los campos de su reserva; solo recupera resultados producidos por sus intentos. Apartados anteriores sin contexto público o precio aceptado siguen contando como ocupación mientras sean vigentes, pero no pueden consumirse por el portal nuevo. No borrar ni liberar datos anteriores durante la migración. **RF-20, RF-29–RF-36, RF-39–RF-42.**

## 4. Contratos y recorrido público

### Identidad y protección

Servir portal y API pública bajo el mismo origen mediante proxy de despliegue; no ampliar el CORS administrativo para admitir credenciales desde cualquier origen. Una cookie de sesión anónima, aleatoria, HttpOnly, Secure en producción y SameSite=Strict identifica el navegador; solo se guarda su hash. No vincular identidad a IP, teléfono o rol. Coordinar la inicialización entre pestañas mediante Web Locks antes de habilitar mutaciones; compartir avisos por BroadcastChannel. El bloqueo de base de datos sigue siendo la autoridad. Si no pueden conservarse cookies o coordinarse la inicialización, informar que el flujo no puede iniciarse, sin fingir un apartado local. **RF-01–RF-02, RF-11, RF-25–RF-29, RF-42–RF-43.**

Validar origen y protección CSRF en mutaciones, incluida liberación; respuestas personales y de recuperación con `Cache-Control: no-store`. No incluir cookies, contacto, notas, huellas ni secretos en logs. Los endpoints públicos no exponen correo del administrador, RFC, otros clientes o titulares. **RF-02, RF-13, RF-29, RF-42–RF-43.**

### API propuesta

Todas las rutas siguientes parten de `/publico/negocios/:slug`; los IDs de recursos siempre se validan dentro del negocio resuelto. Los cuerpos desconocidos se rechazan. No se aceptan del navegador precio, fin calculado, estado de cita ni identidad de otro titular.

| Método y ruta | Entrada y resultado | RF cubiertos |
| --- | --- | --- |
| `GET /catalogo` | Filtros progresivos de servicio y sucursal; devuelve identidad pública del negocio y opciones activas compatibles. No incluye datos de clientes. | RF-01–RF-06, RF-13 |
| `POST /sesion` | Inicialización idempotente de la cookie y coordinación por negocio, sin cuenta ni datos de contacto. | RF-01, RF-11, RF-25, RF-29, RF-42 |
| `GET /disponibilidad` | Profesional, sucursal, servicio y fechas locales desde/hasta. Hasta 31 fechas inclusivas por petición; respeta el horizonte configurado sin reducirlo. Devuelve ranuras, zona e instante de cálculo. | RF-14–RF-17 |
| `POST /apartados` | Clave de operación y selección de servicio, sucursal, Profesional, fecha y hora. Devuelve apartado propio, generación, zona, costo aceptado, expiración y hora del servidor; o resultado funcional negativo. | RF-18–RF-23, RF-25–RF-26, RF-30, RF-33 |
| `GET /apartados/:id` | Estado de un apartado propio; permite actualizar contador y detectar sustitución al volver a enfocar la pestaña. | RF-19, RF-22–RF-23, RF-26, RF-29 |
| `POST /apartados/:id/liberar` | ID y generación esperada. Liberación idempotente del apartado exacto; no afecta a un reemplazo posterior. | RF-24, RF-26–RF-29 |
| `POST /intentos` | Clave de intento y apartado propio. Prepara el envío idempotente, sin renovar el apartado ni registrar contacto. | RF-31, RF-39–RF-42 |
| `POST /intentos/:id/reservar` | Nombre, teléfono y notas. Registra cita pendiente o reproduce el mismo resultado para el mismo contenido normalizado. | RF-08–RF-13, RF-30–RF-40, RF-42 |
| `POST /intentos/:id/resolver` | Resuelve un envío incierto bajo exclusión: devuelve reserva existente o cierra el intento como no registrado. Puede cambiar estado; por ello no es un GET. | RF-28, RF-35, RF-39–RF-43 |

Éxitos de lectura y repetición: 200; creación: 201; liberación idempotente: 204. Error de entrada: 400; credencial anónima ausente o inválida: 401 con mensaje de reinicio, sin pantalla de login; origen/CSRF inválido: 403; negocio inaccesible o recurso ajeno/inexistente: 404 uniforme. Conflicto funcional, apartado incompatible o clave reutilizada con otro contenido: 409. Fallo temporal, bloqueo agotado o resultado aún no comprobable: 503; fallo inesperado: 500. Solo una consulta correcta puede devolver 200 con cero ranuras. Todo error lleva código público, mensaje y acción sugerida sin SQL ni trazas. **RF-02–RF-03, RF-10, RF-16–RF-17, RF-22–RF-23, RF-26, RF-29, RF-32–RF-33, RF-39–RF-43.**

La recuperación de una reserva ya registrada y la liberación de un apartado propio siguen disponibles cuando la licencia deja de admitir nuevas reservas. No recalculan disponibilidad ni registran citas nuevas. Un negocio eliminado o una credencial perdida no se sustituyen por búsquedas de teléfono o folio; se comunica que no pudo recuperarse el resultado. **RF-03, RF-27, RF-39–RF-43.**

### Formulario y estados de interfaz

Nombre: recortar extremos, exigir texto no vacío y hasta los 150 caracteres ya admitidos por el modelo; no imponer dos apellidos ni rechazar nombres con acentos. Teléfono: quitar espacios y guiones, aceptar `+52` inicial opcional y exigir después exactamente diez dígitos; rechazar letras y otros prefijos. Notas opcionales: texto plano de hasta 2.000 caracteres, vacío convertido en ausencia y sin interpretación HTML. Aplicar las mismas validaciones en servidor, con límite de cuerpo de 32 KiB; rechazar excesos sin truncar silenciosamente. Estos límites técnicos permiten acotar captura y carga sin añadir campos. **RF-08–RF-13, RF-43.**

El flujo mantendrá estados explícitos de selección, obteniendo apartado, formulario vigente, apartado perdido, enviando, resultado incierto y resultado registrado. Invalidar selecciones dependientes y descartar respuestas de consultas antiguas que lleguen después de cambiar la selección. Conservar contacto y notas solo en memoria durante la navegación interna, también al vencer el apartado. No guardarlos en localStorage, URLs ni sessionStorage. **RF-05–RF-10, RF-16–RF-18, RF-23–RF-28, RF-32, RF-40–RF-41.**

Antes de cualquier petición de preparación o envío, guardar en sessionStorage únicamente la clave del intento, negocio y apartado para poder resolverlo tras recargar. Un reintento de formulario conserva la clave original y el contenido normalizado. Si el resultado queda incierto, suspender nuevas reservas y liberar únicamente cuando el resolutor confirme ausencia de cita. Una recarga ordinaria borra el formulario y reinicia selecciones; una recarga con intento pendiente ejecuta primero el resolutor. **RF-28, RF-35, RF-39–RF-42.**

El contador deriva de expiración y hora del servidor; al volver a la pestaña se comprueba vigencia. No usar temporizadores del navegador como prueba de propiedad o validez. La salida envía una liberación de mejor esfuerzo del apartado y generación exactos; si ya se inició un envío, no emitir un aviso automático que compita con él. Cerrar la pestaña o perder conexión nunca amplía el plazo. Un aviso atrasado no libera un apartado más nuevo ni una cita. **RF-19–RF-29, RF-34–RF-35, RF-40–RF-41.**

El resultado dice «Reserva registrada, pendiente de confirmación» y muestra el resumen guardado. No indica que WhatsApp ya se envió, ni incluye acceso al panel, consulta de otras citas, cancelación o reprogramación. **RF-34, RF-37–RF-38, RF-42–RF-43.**

## 5. Transacciones, carreras y recuperación

### Protocolo compartido

Antes de habilitar escritores, revisar y adaptar las mutaciones de usuarios, licencia, configuración, oferta, horarios, bloqueos y asignaciones que puedan competir con ellos. Mantener el orden común: usuarios, negocio, licencia, sucursales, servicios, perfiles y ocupaciones, con IDs ascendentes dentro de cada clase. Las operaciones públicas toman primero su fila de sesión y su fila de operación/intento; ninguna mutación administrativa deberá pedir esas filas después de bloquear recursos de dominio. No adquirir usuarios después del perfil. **RF-02–RF-04, RF-20, RF-25, RF-29, RF-31–RF-35.**

Para cambios colectivos, usar la fila de negocio como barrera común de descubrimiento de perfiles y nuevas asignaciones, y después bloquear los perfiles afectados. Todas las altas/cambios de asignación deben respetar esa barrera. Si una prelectura para descubrir IDs queda obsoleta, reiniciar la operación completa en el orden correcto. Se acepta serialización conservadora de escrituras del negocio en esta entrega; no sustituye el bloqueo común del Profesional, obligatorio también para futuros escritores manuales. **RF-04, RF-14, RF-20, RF-31–RF-33.**

Escrituras con `READ COMMITTED`, sin instantáneas previas a la espera. Tras obtener los bloqueos, capturar el reloj y releer licencia, oferta, duración, horarios, configuración y ocupaciones. Usar un instante por evaluación y repetir la comprobación temporal final si hubo nuevas esperas antes de insertar. Comparar UTC, permitir extremos contiguos e impedir todo solapamiento incompatible. Los errores técnicos revierten la transacción; los reintentos de deadlock son acotados y conservan las claves originales, nunca los efectos de una transacción abortada. **RF-14–RF-15, RF-18–RF-22, RF-31–RF-35, RF-39–RF-43.**

### Reemplazo de apartado: dos fases durables

1. Autorizar navegador y negocio; bajo la fila de sesión, deduplicar la clave de operación. Una nueva operación incrementa generación, marca el apartado anterior liberado bajo el bloqueo de su Profesional y registra la operación preparada. Confirmar esta primera transacción antes de intentar conceder el nuevo horario.
2. En una segunda transacción, bloquear sesión y operación, comprobar que sigue siendo la generación actual y revalidar la nueva selección bajo el bloqueo de su Profesional. Conceder cinco minutos desde el instante de la concesión, copiar costo y zona y actualizar el puntero de sesión. Un rechazo deja la operación terminal y el anterior liberado.
3. Si otra pestaña inició una generación posterior, la operación antigua no puede conceder ni liberar nada nuevo. Repetir una operación concedida devuelve su expiración original; repetir una rechazada no crea otro apartado. Una falla entre fases se recupera con la misma clave, sin resucitar el anterior.

Esta separación es necesaria para RF-25: un rollback del intento de obtener el nuevo horario no puede restaurar el apartado anterior. Las peticiones malformadas o no autorizadas se rechazan antes de iniciar la operación; una selección válida que fracasa por falta de disponibilidad sí deja liberado el anterior. **RF-18–RF-30, RF-33, RF-43.**

### Registro y resolución del envío

1. Preparar la clave del intento vinculada al apartado propio; preparación y repetición no amplían el plazo. El navegador conserva el marcador antes de enviar cualquier petición que pueda terminar creando una reserva.
2. El escritor bloquea sesión, intento y recursos comunes. Si el intento ya está registrado y el contenido coincide, devuelve su resultado sin volver a exigir vigencia del apartado. Una clave con contenido diferente o un intento terminal no registrado no puede crear cita.
3. Para un intento nuevo, revalidar la combinación y apartado propios. Insertar cliente y cita pendiente, copiar precio y datos históricos, marcar apartado liberado/consumido, quitar el puntero actual y asociar el resultado al intento en la misma transacción. Un fallo conserva el estado previo y no renueva el apartado.
4. El resolutor usa las mismas filas de exclusión. Si el escritor está en curso, espera o devuelve 503 sin dictaminar ausencia. Si obtiene el bloqueo y encuentra una cita, devuelve su resultado. Si no existe, cierra el intento como `no_registrado` y libera el apartado propio correspondiente antes de permitir reiniciar.
5. Si la preparación no llegó al servidor, el resolutor crea el registro terminal para esa clave autorizada. La preparación o escritura atrasada verá ese registro y no podrá crear la cita. Un simple «no encontrado» sin este cierre no demuestra que una petición en vuelo no vaya a terminar después.

No usar un nuevo intento como respuesta automática a timeout. La ausencia de duplicados se garantiza con estado durable, propiedad, claves únicas y bloqueo, no únicamente deshabilitando el botón. No enviar efectos externos dentro de la transacción. **RF-08–RF-13, RF-28–RF-29, RF-31–RF-43.**

## 6. Decisiones justificadas

| Decisión | Elección y motivo | Alternativa descartada | RF cubiertos |
| --- | --- | --- | --- |
| D01 — Motor único | Añadir contexto público autorizado sobre los servicios actuales; conservar permisos privados. | Usuario administrador ficticio o copia del algoritmo en frontend: amplían permisos o divergen las reglas. | RF-01–RF-04, RF-14–RF-18, RF-31–RF-33 |
| D02 — Identidad anónima | Cookie de navegador, hash y fila por negocio permiten propiedad y coordinación entre pestañas sin registro. | Teléfono/IP o token elegido libremente como identidad: no acreditan propiedad ni representan un navegador. | RF-01–RF-02, RF-11–RF-13, RF-25–RF-29, RF-42 |
| D03 — Reloj del servidor | Cinco minutos inmutables desde concesión, con caducidad evaluada al leer/escribir. | Renovar por actividad o depender de borrar filas con un job: cambia el acuerdo o retiene horarios vencidos. | RF-19–RF-23, RF-27, RF-31 |
| D04 — Reemplazo durable | Liberar primero, confirmar esa liberación y conceder después con generación y clave idempotente. | Una sola transacción con rollback integral: al fallar el nuevo apartado recuperaría indebidamente el anterior. | RF-24–RF-27, RF-33 |
| D05 — Exclusión en base de datos | Bloqueo común del Profesional y coordinación con mutaciones operativas, releyendo después de esperar. | Mutex en memoria, bloqueo por sucursal o unicidad de hora inicial: no cubren otras instancias ni solapamientos parciales. | RF-18, RF-20, RF-31–RF-35 |
| D06 — Contacto por reserva | Retirar unicidad del teléfono y crear cliente por reserva con copia inmutable en la cita. | Fusionar o actualizar clientes por teléfono: confunde familiares y modifica antecedentes. | RF-08–RF-13, RF-36 |
| D07 — Precio aceptado | Copiar el precio al conceder apartado y trasladarlo a la cita; un apartado nuevo obtiene el precio entonces vigente. | Usar el precio actual al guardar o al consultar historial: incumple el precio aceptado. | RF-30, RF-36–RF-37 |
| D08 — Pendiente persistente | Guardar `pendiente`; su intervalo sigue ocupado hasta una transición de otro módulo. | Guardar `confirmada` o vencer automáticamente la cita: anticipa confirmación por WhatsApp o ciclo de vida no solicitado. | RF-34, RF-37–RF-38 |
| D09 — Resultado durable | Misma clave y resultado para el mismo envío; resolver ausencia mediante cierre terminal frente a peticiones tardías. | Nuevo envío tras timeout o GET que interprete fila ausente como fracaso: puede duplicar citas o producir confirmaciones tardías. | RF-35, RF-39–RF-42 |
| D10 — Memoria y marcador mínimo | Formulario solo en memoria; persistir únicamente identificadores del envío pendiente para recarga. | Guardar contacto y notas en almacenamiento del navegador: contradice el reinicio y expone información innecesaria. | RF-10, RF-23, RF-28, RF-32, RF-40–RF-43 |
| D11 — Respuesta pública reducida | Proyección explícita, errores seguros y recuperación propia incluso tras bloqueo comercial. | Reutilizar DTO administrativos, buscar por teléfono/folio o negar toda recuperación por licencia: filtra datos o deja un envío sin resolución. | RF-02–RF-03, RF-13, RF-17, RF-29, RF-39–RF-43 |
| D12 — Datos históricos desconocidos | Migración aditiva con nuevos campos nulos solo para filas previas y sin inventar importes pasados. | Rellenar todo con catálogo actual o reinstalar tablas: falsea historia o pierde datos. | RF-12, RF-20, RF-30, RF-36–RF-38 |
| D13 — Captura acotada | Nombre de hasta 150 caracteres, notas de hasta 2.000 y cuerpo de 32 KiB; error explícito ante exceso. | Texto sin límite o truncamiento silencioso: permite cargas innecesarias o pierde información sin avisar. | RF-08–RF-10, RF-43 |

## 7. Estrategia de pruebas y trazabilidad

No crear pruebas que solo reproduzcan la implementación. Usar Jest y Supertest del backend, pruebas Node del frontend y pruebas de navegador reales para cookies, recarga, pestañas y teclado. Incorporar Playwright como herramienta de pruebas del portal durante la implementación; no sustituir sus escenarios por pruebas del HTML como texto. Todas las pruebas de escritura usarán bases desechables identificadas como test, nunca la base cotidiana.

| Grupo | Escenarios y resultado observable | RF cubiertos |
| --- | --- | --- |
| T01 — Acceso y seguridad | Dos negocios, slugs inválidos, IDs cruzados, ausencia de JWT permitida en portal y denegada en rutas privadas; modalidad manual pública rechazada; origen/CSRF, cookie y titular ajenos. | RF-01–RF-04, RF-11, RF-13, RF-29, RF-42–RF-43 |
| T02 — Catálogo y navegación | Desactivar cada nivel de oferta, selecciones dependientes, respuestas HTTP fuera de orden, navegación móvil y teclado, etiquetas y foco de errores. | RF-04–RF-07, RF-16–RF-17 |
| T03 — Contacto | Nombre vacío/acentuado, teléfono exacto/formateado/+52, letras y prefijos inválidos, notas opcionales y texto que parezca HTML; dos nombres con el mismo teléfono conservados sin fuga ni sobrescritura. | RF-08–RF-13, RF-36, RF-43 |
| T04 — Motor público | Duración completa, contigüidad, bloques continuos, descansos, zonas y DST, ambos modos, intervalo, anticipación, horizonte y 31 fechas; cero resultados legítimos frente a 500/503 sin datos parciales. | RF-14–RF-18, RF-20, RF-32–RF-33, RF-43 |
| T05 — Reloj y apartado | Cinco minutos exactos, justo antes/en/después del vencimiento, pestaña suspendida, reloj local alterado, errores de captura y reintentos sin renovación. | RF-18–RF-23, RF-27, RF-31 |
| T06 — Reemplazo y salida | Volver atrás, segunda pestaña, nuevo horario ocupado, fallo entre fases, generación antigua, repetición de operación, aviso de salida atrasado, cierre sin aviso y recarga normal. El anterior permanece liberado si el nuevo falla. | RF-24–RF-29, RF-33, RF-43 |
| T07 — Precio e historia | Cambiar costo durante apartado, conservar el aceptado; nuevo apartado toma nuevo precio; modificar duración/oferta invalida combinación; cambios posteriores no alteran contacto, extremos, zona ni resumen. | RF-12, RF-30–RF-32, RF-36–RF-37 |
| T08 — Registro atómico | Cita pendiente y folio único, consumo del apartado, sin caducidad automática; fallar después de insertar cliente/cita y antes de consumo/resultado: rollback íntegro. | RF-31, RF-34–RF-38 |
| T09 — Idempotencia y recuperación | Doble clic, dos envíos concurrentes, respuesta perdida tras commit, caída antes de commit, recarga incierta, contenido distinto con misma clave, resolutor antes/después del escritor y preparación tardía. Una cita o ausencia terminal, nunca ambas. | RF-28, RF-35, RF-39–RF-43 |
| T10 — Migraciones | Instalación limpia y actualización con filas previas; teléfono repetido permitido, referencias cruzadas rechazadas, campos históricos desconocidos sin inventar y ninguna ocupación anterior perdida. | RF-02, RF-12–RF-13, RF-20, RF-29–RF-30, RF-34–RF-39 |
| T11 — Carreras de dominio | Dos conexiones con barreras: mismos intervalos y solapamientos parciales entre sucursales; reserva contra cambios de licencia, horario, asignación, oferta y configuración. Verificar filas y respuestas finales, no solo promesas resueltas. | RF-03–RF-04, RF-14–RF-15, RF-18–RF-22, RF-25, RF-30–RF-35, RF-39–RF-41 |
| T12 — Recorrido real | Dos contextos de navegador y varias pestañas del mismo contexto; flujo completo, reinicio, recuperación, cookies bloqueadas, red interrumpida y resumen pendiente sin afirmar envío de WhatsApp. | RF-01, RF-05–RF-11, RF-15–RF-17, RF-19, RF-23–RF-28, RF-30, RF-32, RF-37, RF-40–RF-43 |

Usar reloj inyectado en pruebas de dominio y barreras explícitas entre conexiones para carreras. Cubrir vencimiento de licencia y límite exacto de 48 horas de suspensión durante la espera, no únicamente al iniciar la petición. Verificar que una mutación operativa válida posterior a una reserva conserva la cita y que el lector de afectaciones sigue detectando sus causas.

### Integración diferida del módulo 2

Ejecutar M2-I001–M2-I003 y M2-I005–M2-I009 con escritores públicos reales y la coordinación de este módulo; conservar sus identificadores y anexar evidencia por caso. M2-I009 distingue repetición del mismo intento —devuelve el resultado— de un intento distinto de consumir el mismo apartado —409—. M2-I004, apartado público contra escritor manual real, queda pendiente del módulo 4. No declarar RF-35–RF-37 del módulo 2 íntegramente cerrados mientras falten sus escenarios diferidos.

### Comandos y aceptación

Los comandos se ejecutarán desde las raíces reales de los dos repositorios; este checkout no contiene un subdirectorio `backend/`.

- Backend: `npm run build`, `npm run lint`, `npm test -- --runInBand`, integración con `npm run test:integration -- --runInBand` y HTTP con `npm run test:e2e -- --runInBand`, seleccionando las suites nuevas y regresiones afectadas.
- Frontend: `npm run build`, `npm test` y suite de navegador del portal. Actualmente no existe script de lint frontend; documentar esa diferencia y no declarar una ejecución inexistente.
- Conservar una matriz RF → prueba → resultado con evidencia de las 43 reglas y de los ocho criterios de finalización. Un test saltado, una demo o un doble del motor no cuentan como escritura pública probada.

## 8. Orden de entrega y condiciones de habilitación

1. **E1 — Contratos y persistencia:** consolidar contexto público, migraciones y DTO; probar actualización y ausencia de fuga. Aplicar los límites de captura de D13. Cubre M01, M04, M05 y M07; RF-01–RF-04, RF-08–RF-13, RF-29–RF-43.
2. **E2 — Lectura pública:** catálogo, disponibilidad, política de licencia y regresión privada. Depende de E1; cubre M01–M02, RF-01–RF-06, RF-13–RF-18.
3. **E3 — Coordinación y apartados:** corregir orden de bloqueos e integrar mutaciones colectivas antes de habilitar escritores; implementar propiedad, dos fases y reloj. Depende de E1–E2; cubre M03 y M07, RF-18–RF-33.
4. **E4 — Reserva y recuperación:** integrar escritor pendiente, snapshots, intentos terminales, recuperación y carreras. Depende de E3; cubre M04–M05, RF-08–RF-13, RF-28–RF-43.
5. **E5 — Portal conectado:** montar entrada pública y recorrido accesible con pruebas reales de navegador. Depende de E2–E4; cubre M06 y T12.
6. **E6 — Verificación final:** ejecutar las pruebas de la matriz, documentar evidencia y pendientes M2, comprobar compilación/lint y publicar instrucciones de operación. Cubre los ocho criterios de finalización de la especificación.

Desplegar primero migraciones y luego backend compatible; mantener rutas de escritura públicas deshabilitadas mediante configuración de despliegue hasta que E3–E4 pasen. Publicar frontend conectado después de sus contratos. Ante una incidencia, cerrar nuevas concesiones y reservas, manteniendo liberación y recuperación de resultados propios. No revertir migraciones borrando citas o intentos reales. Registrar métricas agregadas de conflictos, fallos técnicos, expiraciones y recuperaciones sin datos de contacto ni credenciales. **RF-17, RF-20–RF-22, RF-27, RF-35, RF-39–RF-43.**

La implementación permanece pendiente: este archivo únicamente fija su organización, decisiones y verificaciones esperadas.
