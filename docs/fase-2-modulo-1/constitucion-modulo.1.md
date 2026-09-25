# Constitución del proyecto

1. Mantener NestJS, TypeScript, TypeORM y MariaDB/MySQL; frontend con HTML, CSS y JavaScript.
2. Organizar por módulos, mantener lógica en servicios y sincronizar entidades, migraciones y esquema SQL.
3. Validar entradas, roles y pertenencia por negocio_id en cada operación; impedir accesos entre negocios.
4. Registrar nombre del negocio, RFC y correo del administrador; crear su cuenta completa únicamente al activar con correo y código válido.
5. Enviar códigos por correo, con vencimiento y uso único; guardar contraseñas y códigos como hashes y secretos en variables de entorno.
6. Reservar al superadministrador el alta de negocios, la gestión de licencias y la definición y modificación del límite de sucursales.
7. Aplicar la suspensión manual con 48 horas de acceso previo al bloqueo; conservar cuentas y datos.
8. Mantener licencias anuales renovables, avisar por correo dos días antes de vencer y exponer por API los días restantes.
9. Registrar sucursales con nombre, dirección, teléfono, URL de Google Maps y notas de llegada; servicios con nombre, costo y duración en minutos.
10. Incorporar el rol Profesional con acceso a su horario y gestión de sus horas, descansos, bloqueos y servicios habilitados.
11. Permitir profesionales en varias sucursales y evitar empalmes de horarios y citas, incluso entre sucursales y solicitudes simultáneas.
12. Probar aislamiento, permisos, activación, correos, límites de sucursales y transiciones de licencia, incluido el límite exacto de 48 horas.
13. Entregar con compilación, lint y pruebas relevantes aprobados, auditoría sin secretos y documentación vigente; excluir pagos anticipados y ampliaciones no autorizadas.