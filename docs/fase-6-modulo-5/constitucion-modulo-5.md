# Constitución aprobada — Fase 6, Módulo 5

1. Usar NestJS, TypeScript, TypeORM y MariaDB/MySQL, conservando el stack del frontend existente.
2. Mantener lógica de negocio en servicios y nombres de dominio y mensajes en español.
3. Respetar la precedencia documental definida en [docs/reglas.md](../reglas.md).
4. Validar en el servidor permisos, pertenencia al negocio y alcance por sucursal y profesional.
5. Impedir que el Profesional gestione citas ajenas o consulte el directorio completo del negocio.
6. Mantener coherencia entre esquema SQL, entidades, migraciones y contratos de API.
7. Preservar relaciones y datos históricos; no borrar ni fusionar registros automáticamente.
8. Proteger disponibilidad y transiciones de citas frente a concurrencia y operaciones duplicadas.
9. Separar confirmación de asistencia, entrega de mensajes y recordatorios mediante reglas verificables.
10. Guardar por cita los plazos aplicados y calcular reportes con su costo histórico.
11. El backend entrega métricas, indicadores y datos filtrados; el frontend prepara la página de reportes para imprimir y guardar como PDF desde el navegador, con tablas completas y sin controles; la paginación no altera contadores ni disponibilidad.
12. Mantener secretos y datos sensibles fuera del repositorio, logs y auditoría.
13. Verificar cambios con build, lint disponible y pruebas pertinentes; usar bases desechables para escrituras de prueba.
14. Exigir evidencia para cerrar tareas; excluir indicadores aplazados y la generación de PDF en el backend.
