# AGENTS.md — SaaS de Citas

## Proyecto
Plataforma de citas multi-negocio y multi-sucursal. Backend con NestJS, TypeScript, TypeORM y MariaDB/MySQL; frontend con HTML, CSS y JavaScript. Incluye disponibilidad, reservas, panel administrativo, WhatsApp y reportes PDF.

## Fase activa
- Trabajar sobre la fase 4, módulo 3: Portal Público de Reservas.
- Implementar el flujo público por negocio, sus apartados temporales, el registro idempotente de citas pendientes, la recuperación de envíos inciertos y el portal web conectado, reutilizando el motor de disponibilidad del módulo 2.
- Usar como fuente normativa `docs/fase-4-modulo-3/constitucion-modulo-3.md`, `docs/fase-4-modulo-3/spec.md`, `docs/fase-4-modulo-3/plan.md` y `docs/fase-4-modulo-3/tareas.md`.
- El estado documental actual acredita M3-T001–M3-T079. Continuar desde M3-T080 respetando dependencias y evidencias; no rehacer ni marcar tareas sin satisfacer su criterio de terminado.
- Mantener M3-I001 y M2-I004 como verificaciones diferidas hasta disponer del escritor manual real del módulo 4.

## Comandos
Desde la raíz de este repositorio backend:
- Desarrollo: `npm run start:dev`
- Compilar: `npm run build`
- Tests: `npm test -- --runInBand`
- Integración: `npm run test:integration -- --runInBand`
- HTTP/e2e: `npm run test:e2e -- --runInBand`
- Lint: `npm run lint`

Desde la raíz separada de `frontend-saas`, cuando una tarea del portal lo requiera:
- Compilar: `npm run build`
- Tests: `npm test`
- Navegador: ejecutar la suite Playwright definida durante la implementación.
- No declarar lint de frontend mientras ese repositorio no tenga un script real para ello.

## Estilo y convenciones
- Organizar funcionalidades en módulos; lógica de negocio en servicios.
- Mantener nombres de dominio y mensajes en español.
- TypeScript con camelCase; columnas SQL en snake_case.
- Seguir el estilo existente y mantener `db/schema.sql`, las entidades y las migraciones coherentes.

## Reglas
- Consultar los requerimientos y el código existente antes de modificar.
- Aislar datos por `negocio_id` y validar pertenencia de los registros; no confiar en IDs enviados por el cliente.
- Solo el superadmin crea negocios y crea, asigna, renueva, suspende y reactiva licencias. Solo él define y modifica la cantidad máxima de sucursales que puede crear cada negocio; validar ese límite en el backend, incluso ante altas simultáneas.
- Registrar nombre del negocio, RFC y correo del administrador, destinatario del código de activación. Al activar, exigir el correo y validar su correspondencia con el código y el negocio; crear la cuenta completa con contraseña en esa operación, sin crear previamente usuarios sin contraseña y pendientes de activación.
- Enviar por correo los códigos generados de un solo uso, con vencimiento; almacenar su hash y validar su propósito, destinatario y consumo único.
- Admitir licencias anuales renovables, sin límites de servicios o usuarios; las sucursales quedan sujetas al límite configurado por el superadmin.
- Gestionar la suspensión exclusivamente en la licencia. Pausar o desactivar una licencia significa suspenderla; no hay cancelación definitiva. Una suspensión manual permite conservar el acceso durante las 48 horas siguientes y, al cumplirse ese plazo, niega el acceso a los usuarios del negocio, incluidas las solicitudes con sesiones abiertas. Conservar cuentas y datos.
- Conservar el tiempo restante de la licencia durante la suspensión y ajustar el vencimiento al reactivar. La primera habilitación depende de activar al administrador. Renovar no levanta una suspensión. Las operaciones repetidas o concurrentes no deben perder ni duplicar tiempo ni alterar la pertenencia de los datos; mantener la auditoría de cambios reales sin secretos.
- Avisar por correo al administrador del negocio dos días antes del vencimiento de su licencia y ofrecer una consulta por API de los días restantes para mostrarlos en el frontend.
- Registrar sucursales con nombre, dirección, teléfono, URL de Google Maps y notas de llegada; registrar servicios con nombre, costo y duración aproximada en minutos.
- Permitir personal con cuenta y rol Profesional. Este puede consultar su horario y gestionar sus propias horas, descansos, bloqueos temporales y la activación o desactivación de los servicios que ofrece, respetando su negocio y permisos.
- Permitir que un profesional trabaje en varias sucursales, incluso durante un mismo día, con asignaciones por día y franja horaria; impedir empalmes de sus horarios y citas entre sucursales, incluso con solicitudes simultáneas.
- Configurar por negocio el modo de agenda, intervalo entre inicios, anticipación mínima y horizonte futuro. Los valores efectivos iniciales son Ventana Libre, 15 minutos de intervalo, 15 minutos de anticipación y 60 días futuros; la escritura de configuración es exclusiva del Administrador y debe reemplazar el conjunto completo de forma atómica.
- Admitir solo intervalos públicos de 5, 10, 15, 20, 30 o 60 minutos; anticipación no negativa en múltiplos de 5 y horizonte en días enteros no negativos. Limitar cada consulta a un rango inclusivo máximo de 31 fechas, sin reducir por ello el horizonte configurable.
- Ofrecer una combinación solo si están activos y pertenecen al negocio la sucursal, la cuenta del Profesional, el servicio, la selección individual, la atención del Profesional en la sucursal y la selección del servicio en esa sucursal.
- Calcular la disponibilidad con la duración completa del servicio, horarios semanales o su sustitución especial, descansos, bloqueos y ocupaciones. Permitir extremos contiguos y cruzar bloques consecutivos únicamente cuando la atención del mismo Profesional y sucursal sea continua.
- Interpretar fechas y recurrencias en la zona horaria IANA de la sucursal, rechazar horas locales ambiguas o inexistentes y comparar ocupaciones entre sucursales mediante intervalos UTC. Conservar en cada cita confirmada su inicio, fin y zona originales; los cambios de duración solo afectan reservas nuevas.
- En Ventana Libre, conservar la secuencia de inicios anclada al comienzo de cada bloque original y mostrar todos los candidatos válidos. En Agenda Compacta, formar grupos independientes por bloque o tramo, ofrecer candidatos válidos próximos antes y después de ocupaciones y permitir otro grupo o día sin exigir llenar el anterior.
- Distinguir la modalidad pública de la manual. La manual omite solo compactación, intervalo público, anticipación y horizonte; mantiene permisos, licencia, oferta activa, duración, horario, bloqueos, ausencia de empalmes y rechazo de inicios pasados.
- Tratar toda cita no cancelada y todo apartado vigente como ocupación del Profesional en cualquiera de sus sucursales y servicios. Un apartado está vigente solo mientras no esté liberado y `ahora < expira_en`; almacenar únicamente `titular_hash`, nunca un token utilizable.
- Capturar un único instante mediante reloj inyectable y efectuar cada cálculo con una lectura transaccional coherente de configuración, oferta, horarios y ocupaciones. No convertir fallos técnicos en una agenda vacía ni devolver resultados parciales.
- La consulta de disponibilidad y la concesión de un apartado no garantizan la reserva. Cada escritor debe revalidar dentro de su propia transacción, serializar por una fila común del Profesional independientemente de la sucursal, releer después de esperar el bloqueo y confirmar la ocupación de forma atómica; un conflicto de reserva será 409.
- Guardar cambios operativos válidos aunque afecten citas existentes e identificar sus causas vigentes sin cancelar, reprogramar ni alterar automáticamente esas citas. La desaparición de una causa no elimina otras causas aplicables.
- Resolver el portal por `/reservas/:slug`; no exigir cuenta ni sesión administrativa al cliente y no permitir registro libre de negocios.
- Resolver el negocio en servidor y filtrar por su `negocio_id` todos los catálogos, horarios, apartados, intentos y citas. Los IDs, precios, fines calculados, estados, roles, `negocioId`, `titularHash` y exclusiones enviados por el navegador no son autoridad.
- Mostrar únicamente combinaciones activas de servicio, sucursal y Profesional que cumplan la oferta efectiva y cuya licencia permita nuevas reservas. La recuperación de un resultado propio ya registrado y la liberación de un apartado propio deben seguir disponibles si la licencia deja de aceptar reservas.
- Mantener separadas la autorización privada y la pública alrededor del mismo motor. La entrada pública solo usa modalidad pública; no simular un Administrador ni llamar por HTTP a rutas privadas ni duplicar el algoritmo en JavaScript. Conservar las cinco rutas privadas y sus permisos.
- Identificar el navegador con una cookie anónima aleatoria, HttpOnly, Secure en producción y SameSite=Strict; persistir solo su hash por negocio. Validar origen y CSRF en mutaciones, usar `Cache-Control: no-store` en respuestas personales y coordinar pestañas con Web Locks y BroadcastChannel sin sustituir los bloqueos de base de datos.
- Exigir nombre no vacío de hasta 150 caracteres, teléfono mexicano normalizable a diez dígitos —espacios, guiones y `+52` opcional— y notas opcionales de hasta 2.000 caracteres. Limitar el cuerpo a 32 KiB, rechazar excesos sin truncar y no usar el teléfono como identidad ni revelar reservas anteriores.
- Conceder el apartado al entrar al formulario por cinco minutos exactos desde el reloj del servidor, sin renovarlo por actividad, errores o reintentos. Guardar costo aceptado, zona, sesión, generación y operación; al vencimiento exacto deja de ser vigente.
- Mantener como máximo un apartado vigente por navegador y negocio. Al intentar otro horario, liberar y confirmar primero el anterior; si la nueva concesión falla, el anterior permanece liberado. Las generaciones y claves idempotentes deben impedir que pestañas o avisos atrasados alteren apartados posteriores.
- Implementar el reemplazo de apartado en dos transacciones durables: preparación/liberación y después revalidación/concesión. Repetir una operación no reinicia el plazo; una operación obsoleta, rechazada o interrumpida no resucita ni duplica apartados.
- Preparar cada envío con una clave opaca vinculada al apartado propio. Registrar cliente nuevo, cita `pendiente`, consumo del apartado y resultado del intento en un único commit; un fallo conserva el vencimiento original y no deja filas parciales.
- Copiar en la cita inicio, fin, zona, costo aceptado, contacto y nombres de negocio, servicio, sucursal y Profesional. Los cambios posteriores del catálogo no alteran ese resumen histórico. El teléfono puede repetirse dentro del negocio y no debe fusionar ni sobrescribir personas.
- Hacer idempotente el mismo envío: igual clave y contenido devuelve la misma cita y folio; contenido distinto o un intento diferente sobre el mismo apartado produce conflicto. Un intento `no_registrado` es terminal y bloquea escrituras tardías.
- Ante respuesta perdida, resolver el intento bajo las mismas filas de exclusión. Esperar al escritor o responder 503 si no puede conocerse el resultado; nunca interpretar una ausencia simple como fracaso. Solo después de cerrar de forma durable `no_registrado` se puede reiniciar el flujo.
- Guardar contacto y notas solo en memoria del portal. En `sessionStorage` persistir únicamente negocio, apartado y clave del intento pendientes de resolución; una recarga ordinaria reinicia, y una recarga incierta resuelve antes de permitir otra reserva.
- La cita pública nace en estado `pendiente` y mantiene ocupado el intervalo sin caducidad automática en este módulo. Mostrar «Reserva registrada, pendiente de confirmación», folio y resumen; no afirmar que WhatsApp ya confirmó o envió mensajes.
- Coordinar escrituras con `READ COMMITTED`, bloqueos en orden común y releída posterior a la espera. Las operaciones públicas bloquean primero sesión e intento/operación; no adquirir usuarios después del perfil. Usar la fila de negocio como barrera para cambios colectivos y la fila común del Profesional para toda ocupación entre sucursales.
- Exponer bajo `/publico/negocios/:slug` las nueve rutas previstas: catálogo, sesión, disponibilidad, crear/consultar/liberar apartado, preparar/reservar/resolver intento. Rechazar campos desconocidos y aplicar 200/201/204, 400/401/403/404/409/500/503 según el contrato, sin SQL, trazas ni datos privados.
- Guardar secretos en variables de entorno y contraseñas como hash; no incluir contraseñas ni códigos utilizables en logs o auditoría.
- No incluir pagos anticipados de citas ni ampliar el alcance sin solicitud.
- En fase 4 no implementar cuentas de clientes, verificación telefónica, ampliación de apartados, búsqueda de citas por teléfono o folio, calendario administrativo, reserva manual, cancelación, reprogramación, cambios posteriores de estado, confirmación por WhatsApp, mensajes, recordatorios, PDF ni pagos.

## Documentación y precedencia
- La constitución y especificación de fase 4 prevalecen para el portal público sobre cualquier regla anterior incompatible. Sus RF-01–RF-43 son locales a `docs/fase-4-modulo-3/spec.md`.
- Seguir `docs/fase-4-modulo-3/plan.md` para arquitectura, persistencia, contratos HTTP, decisiones de concurrencia y estrategia de pruebas; ejecutar `docs/fase-4-modulo-3/tareas.md` respetando dependencias, casillas y criterios de terminado.
- Tratar `docs/fase-4-modulo-3/resultados-tareas/` como evidencia de lotes ya ejecutados, no como sustituto de las fuentes normativas ni como permiso para marcar tareas posteriores.
- Conservar `docs/fase-3/spec-modulo-2.md`, `docs/fase-3/plan.md` y `docs/fase-3/resultados-tareas/contrato-escritores-t078-t079.md` como contratos vigentes del motor y de sus escritores. Los RF de fase 3 siguen siendo locales a esa especificación.
- Los acuerdos de fase 2 recogidos aquí sustituyen las reglas incompatibles de fase 1, en particular sucursales ilimitadas, entrega manual de códigos, creación anticipada de administradores incompletos y bloqueo inmediato por suspensión manual.
- Consultar `docs/fase-1-auth/spec/spec-auth.md` y `docs/fase-1-auth/plan-auth.md` como antecedentes; conservar sus reglas compatibles y las evidencias históricas, sin atribuirles cobertura de funcionalidades nuevas.
- Conservar la documentación original del módulo 1 en `docs/fase-2-modulo-1/` como antecedente de su implementación.
- Consultar `docs/Fix-modulo-1/constitucion.md`, `spec-fix.md`, `plan.md` y `tareas.md` para los ajustes del módulo 1. Su especificación prevalece sobre las reglas incompatibles de fase 2 relativas a creación y edición de servicios por el Profesional, estados individuales y oferta por sucursal; las demás reglas compatibles siguen vigentes. Los RF-01–RF-10 del fix son locales a esa especificación.
- Distinguir requisitos, planes y tareas de funcionalidad implementada: las pruebas y evidencias históricas de fases anteriores no acreditan los ajustes del fix.
- No presentar RF-35–RF-37 del módulo 2 como integración completa hasta acreditar M2-I001–M2-I009 con escritores reales. En fase 4 deben ejecutarse M2-I001–M2-I003 y M2-I005–M2-I009 con el escritor público; M2-I004/M3-I001 queda diferido al escritor manual real del módulo 4.

## Pruebas
- Cubrir aislamiento entre negocios, permisos por rol, activación con correo y código, consumo único, vencimiento y envío de correos, incluidos fallos de entrega.
- Probar la definición y modificación del límite de sucursales, las altas concurrentes y la gestión del Profesional sobre sus propios servicios y horarios entre sucursales.
- Probar acceso antes de las 48 horas y rechazo en el límite exacto y después, incluidas sesiones abiertas; verificar conservación de datos, aviso previo al vencimiento y consulta de días restantes.
- Probar vencimientos, renovaciones y transiciones concurrentes con reloj controlado, sin pérdida ni duplicación de tiempo ni de eventos de auditoría.
- Conservar la regresión del módulo 2: configuración y reemplazo atómico, permisos de Administrador/Recepción/Profesional, aislamiento, oferta efectiva, duración, límites exactos, modalidades, bloques continuos, zonas horarias y cambios de hora con reloj controlado.
- Probar ocupaciones de todas las sucursales y servicios del Profesional: solo Cancelada libera una cita; un apartado libera al vencer exactamente o al marcarse liberado. Cubrir lecturas coherentes ante cambios concurrentes y citas afectadas sin mutarlas.
- Verificar las cinco rutas privadas previstas: `GET/PUT /disponibilidad/configuracion`, `GET /disponibilidad`, `POST /disponibilidad/validar` y `GET /disponibilidad/citas-afectadas`. Mantener 200 para vacío legítimo o validación funcional negativa, 400/401/403/404 según contrato, 503 para fallos temporales y 500 para inesperados, sin filtrar SQL, trazas ni datos privados.
- Para fase 4, cubrir acceso por slug, cookie/origen/CSRF, catálogo progresivo, selecciones dependientes, modalidad pública y aislamiento con dos negocios. Probar móvil y teclado, foco, mensajes, respuestas fuera de orden y contenido con apariencia de HTML.
- Probar validación y normalización de nombre, teléfono y notas, teléfonos compartidos con nombres independientes, límite de cuerpo y ausencia de fuga o caché de datos personales.
- Con reloj inyectado, probar cinco minutos exactos, justo antes/en/después del vencimiento, ausencia de renovación, pestaña suspendida, reloj local alterado, volver atrás, abandono, recarga, reemplazo fallido, generaciones obsoletas y avisos atrasados.
- Probar costo aceptado, snapshots históricos, cita pendiente, folio único, rollback después de cada escritura, doble clic, repetición idempotente, clave con contenido distinto, respuesta perdida, preparación atrasada y resolución en ambos órdenes.
- Ejecutar carreras reales con dos conexiones y barreras: intervalos iguales y parciales entre sucursales; apartado/reserva contra licencia, oferta, costo, duración, configuración, horario, excepciones, bloqueos y asignaciones. Verificar filas finales, no solo promesas resueltas.
- Probar instalación limpia y actualización desde fase 3 en bases desechables identificadas como test; nunca ejecutar pruebas de escritura contra la base cotidiana.
- Verificar las nueve rutas públicas además de las cinco privadas. Solo una consulta correcta puede devolver 200 vacío; un fallo técnico debe ser 500/503 y nunca una agenda vacía ni un resultado parcial.
- Mantener una matriz RF → prueba → resultado para los 43 RF y los ocho criterios de finalización. Tests saltados, demos, dobles del escritor o evidencia histórica no acreditan el flujo público real.

## Al terminar
- Para cambios de backend, ejecutar compilación, lint y las suites unitarias, de integración y HTTP relevantes. Para frontend, ejecutar build, pruebas Node y navegador relevantes. Para cambios exclusivamente documentales, verificar coherencia, precedencias y rutas referenciadas.
- Actualizar `docs/fase-4-modulo-3/tareas.md` solo cuando se cumpla exactamente el criterio de terminado y guardar evidencia en `docs/fase-4-modulo-3/resultados-tareas/` con revisión, comandos y resultados.
- Resumir cambios, verificaciones y cualquier pendiente, fallo o integración diferida; no declarar producción habilitada ni fase cerrada antes de M3-T136.
