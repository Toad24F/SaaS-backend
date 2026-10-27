# Corrección del arranque de las rutas privadas de disponibilidad

Fecha: 17 de octubre de 2026.

## Problema y causa

En la versión conectada, `GET /disponibilidad/configuracion`, `GET /disponibilidad` y `GET /disponibilidad/citas-afectadas` devolvían 500 aun con entradas válidas. Las migraciones estaban aplicadas y la tabla `configuracion_agenda` existía. La aplicación usa `autoLoadEntities: true`, pero los módulos de disponibilidad no habían registrado sus entidades mediante `TypeOrmModule.forFeature`. Las pruebas HTTP previas inyectaban un `DataSource` creado con entidades explícitas; por eso no reprodujeron el fallo del arranque habitual de Nest.

## Cambio

- `DisponibilidadModule` registra `ConfiguracionAgenda`.
- `OcupacionesModule` registra `Cliente`, `Cita` y `BloqueoTemporal`. `Cliente` es necesaria para resolver la relación de `Cita`, aunque no se exponga una ruta de clientes.
- Se añadió una prueba de regresión de composición de módulos y otra que arranca el `DataSource` de Nest con `autoLoadEntities`, sin sustituirlo por una conexión de prueba.

Archivos afectados: `src/disponibilidad/disponibilidad.module.ts`, `src/disponibilidad/ocupaciones.module.ts`, `src/disponibilidad/base-fase-3.spec.ts` y `test/fase-3-arranque-entidades.integration-spec.ts`. Los comentarios del código explican por qué se registran las entidades y qué omisión evitó cubrir la prueba anterior. No cambian rutas, permisos, respuesta HTTP, entidades, esquema, migraciones ni datos de producción.

## Pruebas y resultado

- Antes de la corrección, la nueva prueba de composición falló porque no encontró `ConfiguracionAgendaRepository` entre los repositorios registrados.
- Después, la prueba de composición: 3/3 casos aprobados.
- Arranque con conexión Nest y base temporal migrada: 1/1 aprobado; `DataSource.hasMetadata` confirma las cuatro entidades.
- Pruebas HTTP de configuración, consulta, validación puntual y citas afectadas: 7/7 casos aprobados en tres suites.
- `npm run build` y `npm run lint`: correctos.
- `git diff --check`: sin errores.

## Límite de verificación

El puerto local 3000 no tenía un servidor activo al cerrar esta revisión; las pantallas conectadas requieren iniciar o reiniciar el backend con este código. Las pruebas HTTP usan bases temporales aisladas y no sustituyen una nueva comprobación manual del entorno de desarrollo. No se ejecutó ninguna migración ni cambio de datos en la base habitual.
