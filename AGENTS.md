# AGENTS.md — SaaS de Citas

## Proyecto
Plataforma de citas multi-negocio y multi-sucursal. El backend usa NestJS, TypeScript, TypeORM y MariaDB/MySQL; el frontend está en el repositorio hermano `frontend-saas`.

## Antes de trabajar
- Consultar los requisitos, el código existente y [`docs/reglas.md`](docs/reglas.md) antes de modificar.
- Identificar el módulo afectado y leer su constitución, especificación, plan y tareas. Consultar las casillas y evidencias del propio módulo para conocer el estado actual; no asumir una fase activa a partir de este archivo.
- Aplicar las reglas transversales y los contratos específicos que correspondan al cambio. Ante documentos incompatibles, seguir la precedencia indicada en `docs/reglas.md` y en las fuentes normativas del módulo.
- Respetar dependencias y criterios de terminado. No marcar tareas ni atribuir cobertura sin pruebas y evidencia propias.

## Implementación
- Organizar funcionalidades en módulos y mantener la lógica de negocio en servicios.
- Conservar los nombres de dominio y mensajes en español. Usar camelCase en TypeScript y snake_case en columnas SQL.
- Seguir el estilo existente y mantener coherentes `db/schema.sql`, entidades y migraciones.
- Aislar los datos por negocio, validar pertenencia y permisos en el servidor y no confiar en identificadores ni estados enviados por el cliente.
- Mantener secretos fuera del repositorio y evitar datos sensibles en logs y auditoría.

## Comandos
Desde la raíz de este repositorio backend:
- Desarrollo: `npm run start:dev`
- Compilar: `npm run build`
- Tests unitarios: `npm test -- --runInBand`
- Integración: `npm run test:integration -- --runInBand`
- HTTP/e2e: `npm run test:e2e -- --runInBand`
- Lint: `npm run lint`

Desde `frontend-saas`, cuando el cambio afecte al frontend:
- Compilar: `npm run build`
- Tests Node: `npm test`
- Navegador: ejecutar la suite Playwright pertinente, si está definida.
- No declarar lint de frontend mientras no exista un script real.

## Verificación y entrega
- Ejecutar build, lint y las suites relevantes para el alcance modificado. Para cambios solo documentales, verificar coherencia, precedencia y enlaces.
- Usar bases desechables identificadas como test para pruebas con escritura; nunca escribir sobre la base cotidiana.
- Actualizar las tareas del módulo únicamente al cumplir sus criterios y registrar revisión, comandos y resultados en su directorio de evidencias.
- Resumir cambios, verificaciones y pendientes sin declarar terminada una fase o habilitada producción antes de su cierre documentado.
