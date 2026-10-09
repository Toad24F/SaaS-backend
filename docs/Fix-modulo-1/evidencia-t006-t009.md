# Evidencia de FIX-T006–FIX-T009

## Archivos y función

- `src/profesionales/entities/personal.entity.ts`: representa `especialidad` anulable en el perfil; nombre, correo y credenciales siguen en `usuarios`.
- `src/servicios/entities/servicio.entity.ts`: representa `descripcion` y `creador_personal_id` anulables, con referencia compuesta que exige autor del mismo negocio.
- `src/profesionales/entities/personal-servicio.entity.ts`: representa el estado individual de la selección general y sus ofertas por sucursal.
- `src/profesionales/entities/personal-sucursal.entity.ts`: representa el estado individual de atención en la sucursal y sus servicios configurados.
- `src/profesionales/entities/personal-servicio-sucursal.entity.ts`: representa la combinación única Profesional–servicio–sucursal, su `activo` propio y las dos referencias compuestas a selección y asignación.
- `src/profesionales/profesionales.module.ts`: registra la nueva entidad para que TypeORM la cargue con el módulo.
- `src/profesionales/profesionales.service.ts`: incorpora especialidad, descripción y autoría en las proyecciones de perfil y selección de servicios. Todavía no cambia las reglas de alta y edición; corresponden a tareas posteriores.
- `db/schema.sql`: replica campos, valores iniciales, índices, checks y claves foráneas de la migración 19 en una instalación nueva. La FK del autor se declara después de crear `personal`.
- `src/profesionales/modelo-oferta-fix.spec.ts`: comprueba la metadata de las entidades, incluida la identidad separada y las referencias compuestas.
- `test/fix-modulo-1-t009.integration-spec.ts`: crea una base migrada desde cero y prueba escritura y lectura ORM, estados independientes y rechazo de cruces de negocio.
- `test/esquema-t124-t125.integration-spec.ts`: incluye la nueva tabla en la comparación de columnas, índices, claves foráneas y checks entre migraciones y SQL de referencia.
- `test/instalacion-t126-t127.integration-spec.ts`: exige que la instalación autónoma incluya la nueva tabla y compara todas las columnas con las migraciones.
- `src/modulos-fase-2.spec.ts`: sustituye también el repositorio nuevo en la prueba de composición de Nest, que no abre MariaDB.
- `docs/Fix-modulo-1/tareas.md`: marca las tareas 6–9 al concluir su verificación y enlaza esta evidencia.

## Flujo de datos

En una base anterior, la migración añade campos anulables, inicializa las dos relaciones existentes como activas y crea una combinación por cada selección general y cada sucursal asignada del mismo Profesional. La combinación se conserva aunque el servicio o la sucursal estén globalmente inactivos. En una base nueva, `db/schema.sql` construye directamente la misma estructura: primero servicio y perfil; después la FK de autor, las relaciones fuente y la combinación. TypeORM lee los campos por sus nombres camelCase y persiste las columnas snake_case. Los estados individual y global permanecen separados. La oferta efectiva, los permisos nuevos y las operaciones de edición pertenecen a tareas posteriores.

## Pruebas

Se escribieron primero la prueba de metadata y la de instalación nueva; ambas fallaron porque faltaba la entidad `PersonalServicioSucursal`. Después de añadirla pasaron. La prueba anterior `test/fix-modulo-1-t002-t005.integration-spec.ts` cubre la conversión desde el esquema previo, valores heredados, ocho combinaciones entre dos negocios y rechazos de duplicados, selecciones o asignaciones ausentes y cruces de negocio. Las pruebas de esquema comparan una base autónoma con una base migrada; los casos e2e históricos comprueban que perfiles y catálogo existentes siguen operando.

## Resultados

- `npm run build`: aprobado.
- `npm run lint`: aprobado.
- `npm test -- --runInBand`: 57 suites y 300 pruebas aprobadas.
- `npm run test:integration -- --runInBand`: 43 suites y 209 pruebas aprobadas. Incluye conversión histórica, instalación nueva, rechazo de cruces y equivalencia completa entre SQL y migraciones.
- `npm run test:e2e -- --runInBand`: 22 suites y 131 pruebas aprobadas. Conserva los contratos actuales de perfiles, servicios y demás módulos.

El primer recorrido unitario detectó que la prueba de composición de Nest aún no sustituía el repositorio nuevo; se actualizó ese fixture y la suite completa pasó. Los errores inyectados que aparecen en algunas salidas e2e son casos deliberados de rollback, sin fallos de Jest.
