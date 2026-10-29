# Constitución — Ajustes de licencias, administración y agenda

Estado: propuesta pendiente de aprobación; no autoriza implementación ni sustituye todavía las normas vigentes. Su alcance exclusivamente backend deja el panel administrativo y el portal visual para un trabajo posterior.

1. Conservar NestJS, TypeScript, TypeORM y MariaDB/MySQL; lógica de negocio en servicios.
2. Validar permisos y pertenencia por negocio en servidor; proteger secretos y no revelar datos personales ni errores internos.
3. Incorporar avisos de renovación a 15 y 7 días, suspensión con plazo configurable por superadmin y aviso por correo, con reintentos sin duplicados y conservación de vigencia.
4. Establecer cupos iniciales por negocio de 5 profesionales y 3 recepcionistas, modificables solo por superadmin y verificados también al reactivar o restaurar, incluso concurrentemente.
5. Sustituir el borrado físico de profesionales, recepcionistas, servicios y sucursales por inhabilitación recuperable; conservar relaciones, citas y auditoría, e impedir su uso operativo mientras estén inhabilitados.
6. Retirar el descanso opcional y las excepciones por fecha mediante una transición explícita que preserve datos y no abra disponibilidad inadvertidamente; conservar franjas separadas y bloqueos.
7. Permitir configurar la visibilidad pública del precio de forma coherente en catálogo, apartado y resultado; conservar el costo histórico interno sin atribuir aceptación de un precio oculto.
8. Sustituir el intervalo entre inicios por tiempo entre citas, inicialmente 0; proteger esa separación entre servicios y sucursales del Profesional y conservar su valor por ocupación.
9. Agenda Libre ofrecerá todas las opciones válidas por duración del servicio más separación desde cada espacio libre; Compacta solo el primer inicio válido por día, servicio, sucursal y Profesional, considerando todos sus tramos.
10. Mantener un único motor para consulta y escritura, con reloj inyectable, zonas IANA, duración completa, anticipación, horizonte, apartados e idempotencia; revalidar con transacciones y bloqueos comunes.
11. Mantener esquema, entidades y migraciones coherentes; exigir build, lint y pruebas relevantes de backend con evidencia trazable.
12. Probar límites exactos, aislamiento, concurrencia real, recuperación, inhabilitación/restauración y migraciones en bases desechables; no acreditar requisitos con pruebas omitidas ni alterar citas existentes automáticamente.
13. Antes de implementar, aprobar cupos computables, transición de datos, avisos sustituidos, alcance del precio y significado de «2 citas por teléfono»; no añadir pagos, WhatsApp, cuentas de clientes ni gestión manual de citas.
