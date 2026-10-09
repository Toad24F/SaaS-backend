# Constitución — Fix módulo 1
1. Mantener NestJS, TypeScript, TypeORM y MariaDB/MySQL; frontend con HTML, CSS y JavaScript.
2. Organizar por módulos y sincronizar entidades, migraciones, `db/schema.sql` y contratos HTTP.
3. Validar roles y pertenencia por `negocio_id` en cada operación.
4. Añadir especialidad al Profesional y descripción al servicio, con validación y persistencia.
5. Permitir al Profesional crear servicios en su negocio y asignarlos automáticamente a su perfil.
6. Permitirle activar o desactivar los servicios que ofrece sin cambiar su estado global.
7. Permitirle activar o desactivar su atención en sucursales asignadas sin cambiar el estado global de la sucursal.
8. Permitirle definir qué servicios ofrece en cada sucursal donde atiende.
9. Mantener separadas las decisiones globales del administrador y las preferencias propias del Profesional.
10. Conservar asignaciones, horarios e historial al desactivar una oferta; la disponibilidad futura respetará esos estados.
11. Probar permisos, aislamiento, estados y combinaciones servicio–sucursal; entregar con compilación, lint y pruebas relevantes.
