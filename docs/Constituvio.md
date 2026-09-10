# Constitución del proyecto

1. Usar NestJS, TypeScript, TypeORM y MariaDB/MySQL en el backend; HTML, CSS y JavaScript en el frontend.
2. Organizar el backend por módulos y mantener la lógica de negocio en servicios.
3. Mantener el esquema SQL y las entidades sincronizados; usar migraciones antes de producción.
4. Validar entradas, roles y pertenencia al negocio en cada operación; probar accesos entre negocios.
5. Reservar al superadmin la creación de negocios y la creación, asignación, renovación, suspensión y reactivación de licencias; activar administradores con códigos caducables de un solo uso.
6. Guardar secretos en variables de entorno y contraseñas y códigos de activación como hashes.
7. Impedir reservas simultáneas que empalmen al mismo profesional, incluso entre sucursales; verificarlo con pruebas.
8. Cubrir con pruebas los cambios en autenticación, activación, licencias y disponibilidad, incluidos sus fallos, ambas modalidades de licencia, vencimientos y transiciones concurrentes sin pérdida ni duplicación de tiempo.
9. Entregar cambios con compilación, lint y pruebas relevantes aprobados; declarar cualquier verificación pendiente.
10. No añadir pagos anticipados de citas, cambiar el stack ni ampliar el alcance sin aprobación.
11. Admitir licencias manuales sin vencimiento y por período mensual/anual, sin límites de sucursales, servicios o usuarios. La modalidad se elige al crear y no cambia; solo las licencias por período se renuevan.
12. Gestionar la suspensión exclusivamente en la licencia, conservando cuentas y datos. Pausar o desactivar una licencia significa suspenderla; no hay cancelación definitiva. En licencias por período, la suspensión congela el tiempo restante y la reactivación ajusta el vencimiento.
13. Habilitar inicialmente la licencia al activar al administrador; suspender o reactivar antes de esa activación no inicia tiempo. Renovar no levanta una suspensión. Reactivar y renovar deben conservar la pertenencia de los datos y no duplicar tiempo ni transiciones auditadas.
