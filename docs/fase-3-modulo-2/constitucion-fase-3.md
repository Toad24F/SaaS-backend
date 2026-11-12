# Constitución — Fase 3: Módulo 2, Motor Inteligente de Disponibilidad y Reglas de Agenda

1. Mantener NestJS, TypeScript, TypeORM, MariaDB/MySQL y el frontend en HTML, CSS y JavaScript.
2. Organizar el motor en servicios de dominio; mantener entidades, migraciones, `db/schema.sql` y contratos API coherentes.
3. Filtrar cada consulta por `negocio_id` y validar rol, licencia y pertenencia sin confiar en IDs del cliente.
4. Ofrecer ranuras solo si están activos la sucursal, el Profesional y el servicio, incluida su oferta individual por sucursal.
5. Calcular cada ranura con la duración completa del servicio, dentro de la jornada y fuera de descansos, bloqueos y citas.
6. Aplicar horarios semanales y especiales según la zona horaria de cada sucursal; rechazar horas locales ambiguas o inexistentes.
7. Permitir al administrador configurar Ventana Libre o Agenda Compacta; documentar qué ranuras muestra cada modo.
8. Impedir empalmes de citas de un Profesional entre sucursales, también ante solicitudes simultáneas.
9. Revalidar disponibilidad al confirmar reservas públicas o manuales; una ranura consultada no garantiza su reserva.
10. Definir cómo afectan las citas existentes a cambios de horario, bloqueos y desactivaciones antes de habilitar esas operaciones.
11. Probar límites de jornada, duración, zonas horarias, modos, aislamiento, permisos y carreras con reloj controlado.
12. Entregar con compilación, lint y pruebas relevantes; dejar portal, ciclo de citas, WhatsApp, PDF y pagos fuera de esta implementación salvo sus contratos necesarios.
