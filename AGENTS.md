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
- Seguir el estilo existente y mantener `db/schema.sql` y las entidades coherentes.

## Reglas
- Consultar los requerimientos y el código existente antes de modificar.
- Aislar datos por `negocio_id` y validar pertenencia de los registros; no confiar en IDs enviados por el cliente.
- Solo el superadmin crea negocios y crea, asigna, renueva, suspende y reactiva licencias. El cliente crea su administrador mediante un código de activación de un solo uso y con vencimiento.
- Admitir licencias manuales sin vencimiento y por período mensual/anual, sin límites de sucursales, servicios o usuarios. La modalidad se elige al crear y no cambia; solo las licencias por período se renuevan.
- Gestionar la suspensión exclusivamente en la licencia. Pausar o desactivar una licencia significa suspenderla; no hay cancelación definitiva. Conservar cuentas y datos; en licencias por período, congelar el tiempo restante y ajustar el vencimiento al reactivar.
- La primera habilitación depende de activar al administrador. Renovar no levanta una suspensión. Probar modalidades, vencimientos y transiciones concurrentes sin pérdida ni duplicación de tiempo ni alteración de pertenencia; mantener la auditoría de cambios reales. Los detalles se definen en `spec/spec-auth.md` y `plan.md`.
- El portal de reservas es público por negocio; no hay registro libre de negocios.
- Evitar empalmes de citas, incluso con solicitudes simultáneas.
- Guardar secretos en variables de entorno y contraseñas como hash.
- No incluir pagos anticipados de citas ni ampliar el alcance sin solicitud.

## Al terminar
- Ejecutar compilación, lint y pruebas relevantes al cambio.
- Resumir cambios, verificaciones y cualquier pendiente o fallo.
