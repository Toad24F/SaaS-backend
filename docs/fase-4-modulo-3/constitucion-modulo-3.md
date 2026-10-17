# Constitución propuesta — Módulo 3: Portal Público de Reservas
1. Mantener NestJS, TypeScript, TypeORM y MariaDB/MySQL; construir el portal con HTML, CSS y JavaScript.
2. Separar interfaz, contratos HTTP y servicios de dominio; mantener entidades, migraciones y `db/schema.sql` coherentes.
3. Resolver el negocio por una ruta pública única y filtrar toda lectura y escritura por `negocio_id` comprobado en servidor.
4. Mostrar solo servicios, sucursales, Profesionales y horarios de oferta activa con licencia vigente y acceso permitido.
5. Guiar en móvil la selección de servicio, sucursal, Profesional, fecha y hora, seguida de formulario y confirmación.
6. Exigir nombre completo y teléfono de 10 dígitos (validar formato); admitir notas opcionales y validar los datos también en backend.
7. Crear el apartado al entrar al formulario final; definir vencimiento y liberación, guardar solo `titular_hash` y evaluar vigencia con reloj inyectable.
8. Reutilizar el motor del módulo 2 para consultar y revalidar; una ranura mostrada o apartada no garantiza la cita.
9. Serializar apartados y confirmaciones por la fila común del Profesional; releer tras el bloqueo y resolver empalmes con 409.
10. Confirmar cita y consumir apartado propio en una transacción; conservar inicio, fin y zona originales, con folio único.
11. No exponer datos entre negocios, secretos, SQL ni trazas; distinguir ausencia real de horarios, entrada inválida y fallo técnico.
12. Probar flujo público, aislamiento, licencia, validaciones, vencimiento exacto y carreras reales con dos conexiones y reloj controlado.
13. Exigir compilación, lint y pruebas relevantes; dejar gestión operativa y cita manual al módulo 4, y WhatsApp, PDF y pagos fuera del módulo 3.
