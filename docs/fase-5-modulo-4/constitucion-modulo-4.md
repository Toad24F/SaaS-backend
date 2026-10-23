# Constitución — Fase 5, Módulo 4: Panel de Control y Gestión Operativa
1. Mantener NestJS, TypeScript, TypeORM y MariaDB/MySQL; usar HTML, CSS, JavaScript, Bootstrap y Vite en el frontend.
2. Organizar por módulos y servicios; mantener entidades, migraciones y `db/schema.sql` coherentes.
3. Comprobar en servidor sesión, rol, licencia y `negocio_id` en toda lectura y escritura; no confiar en IDs del navegador.
4. Permitir a Administración y Recepción gestionar citas y clientes propios; el Profesional solo consulta sus citas con contacto y notas.
5. Reutilizar el motor de disponibilidad en modalidad manual; no duplicar sus reglas en el navegador.
6. Serializar toda ocupación por la fila común del Profesional, releer tras el bloqueo y rechazar empalmes entre sucursales.
7. Registrar la cita manual una sola vez y recuperar un envío incierto antes de permitir repetirlo o iniciar otro.
8. Conservar folio, costo, contacto, inicio, fin, zona y resumen histórico sin reconstruirlos desde catálogos posteriores.
9. Auditar cambios de estado; solo Cancelada libera el intervalo y una reactivación exige disponibilidad vigente.
10. Mover solo fecha y hora de citas futuras, conservando folio y combinación; un fallo no altera el horario anterior.
11. Buscar y corregir clientes sin fusionarlos por teléfono ni reescribir citas históricas.
12. Distinguir entrada inválida, acceso denegado, conflicto y fallo técnico; no exponer datos ajenos, SQL ni secretos.
13. Probar roles, aislamiento, reloj, estados, historial y carreras reales; exigir build, lint y suites relevantes antes de cerrar tareas.
14. Acreditar M2-I004/M3-I001 con el escritor manual real; dejar WhatsApp, plazo automático, reportes PDF y pagos al módulo 5.
