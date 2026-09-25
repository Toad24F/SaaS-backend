# AGENTS.md — SaaS de Citas

## Proyecto
Plataforma de citas multi-negocio y multi-sucursal. Backend con NestJS, TypeScript, TypeORM y MariaDB/MySQL; frontend con HTML, CSS y JavaScript. Incluye disponibilidad, reservas, panel administrativo, WhatsApp y reportes PDF.

## Comandos
Desde `backend/`:
- Desarrollo: `npm run start:dev`
- Compilar: `npm run build`
- Tests: `npm test -- --runInBand`
- Lint: `npm run lint`

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
- El portal de reservas es público por negocio; no hay registro libre de negocios.
- Guardar secretos en variables de entorno y contraseñas como hash; no incluir contraseñas ni códigos utilizables en logs o auditoría.
- No incluir pagos anticipados de citas ni ampliar el alcance sin solicitud.

## Documentación y precedencia
- Los acuerdos de fase 2 recogidos aquí sustituyen las reglas incompatibles de fase 1, en particular sucursales ilimitadas, entrega manual de códigos, creación anticipada de administradores incompletos y bloqueo inmediato por suspensión manual.
- Consultar `docs/fase-1-auth/spec/spec-auth.md` y `docs/fase-1-auth/plan-auth.md` como antecedentes; conservar sus reglas compatibles y las evidencias históricas, sin atribuirles cobertura de funcionalidades nuevas.
- Organizar la documentación nueva del módulo 1 en `docs/fase-2-modulo-1/`. Estas instrucciones describen el comportamiento requerido, no acreditan que ya esté implementado.

## Pruebas
- Cubrir aislamiento entre negocios, permisos por rol, activación con correo y código, consumo único, vencimiento y envío de correos, incluidos fallos de entrega.
- Probar la definición y modificación del límite de sucursales, las altas concurrentes y la gestión del Profesional sobre sus propios servicios y horarios entre sucursales.
- Probar acceso antes de las 48 horas y rechazo en el límite exacto y después, incluidas sesiones abiertas; verificar conservación de datos, aviso previo al vencimiento y consulta de días restantes.
- Probar vencimientos, renovaciones y transiciones concurrentes con reloj controlado, sin pérdida ni duplicación de tiempo ni de eventos de auditoría.

## Al terminar
- Para cambios de código, ejecutar compilación, lint y pruebas relevantes al cambio. Para cambios exclusivamente documentales, verificar coherencia y rutas referenciadas.
- Resumir cambios, verificaciones y cualquier pendiente o fallo.
