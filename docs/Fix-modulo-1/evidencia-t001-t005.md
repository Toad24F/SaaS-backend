# Evidencia de FIX-T001–FIX-T005

## Alcance y archivos

- `src/database/migrations/1760000018000-OfertaIndividual.ts`: añade `especialidad` al perfil, `descripcion` y `creador_personal_id` al catálogo, y `activo` a las relaciones existentes. La clave compuesta del autor exige el mismo negocio. Crea `personal_servicios_sucursales` con una clave única por combinación y referencias a la selección general y la asignación de sucursal.
- `test/fix-modulo-1-t002-t005.integration-spec.ts`: prueba la conversión de registros anteriores y las restricciones reales de MariaDB. Parte del esquema anterior, inserta dos negocios y aplica la nueva migración.
- `test/identidad-fase-2.integration-spec.ts`: comprueba que el historial incremental incluye ahora 19 migraciones, conservando el orden anterior.
- `test/envios-correo.integration-spec.ts`: reconoce la migración adicional al probar persistencia de correos.
- `test/instalacion-t61.integration-spec.ts`: espera 19 migraciones al verificar una instalación nueva.
- `test/instalacion-t126-t127.integration-spec.ts`: actualiza el conteo del historial al repetir migraciones; la comparación con `db/schema.sql` permanece pendiente de FIX-T008.
- `test/sucursales-t060.integration-spec.ts`: retira la nueva relación dependiente antes de revertir las tablas anteriores y la restaura después, manteniendo su prueba de instalación incremental.
- `docs/Fix-modulo-1/tareas.md`: marca como hechas únicamente FIX-T001–FIX-T005 y enlaza esta evidencia.

## Flujo de migración

1. La migración agrega campos anulables. Los perfiles y servicios ya guardados mantienen sus valores; el autor queda `NULL` para servicios anteriores.
2. Las selecciones generales y asignaciones existentes reciben `activo = 1` sin cambiar el estado global del servicio ni de la sucursal.
3. Se crea una relación por cada servicio previamente seleccionado y cada sucursal asignada al mismo Profesional. No se filtran estados globales inactivos: la configuración queda disponible para una futura reactivación.
4. Las claves foráneas compuestas impiden guardar una combinación sin selección general, sin asignación o con identificadores de otro negocio. La clave primaria impide duplicados.

Estos datos todavía no se exponen ni se gestionan por HTTP. Las entidades, el esquema SQL de referencia y las operaciones de dominio corresponden a FIX-T006 y posteriores.

## Pruebas y resultados

- **FIX-T001, línea base previa:** cuatro suites e2e históricas de servicios, perfiles, selección y sucursales: 14/14 pruebas aprobadas. Suite de integración histórica de profesionales: 4/4 aprobadas. Estas pruebas acreditan el comportamiento anterior, no el fix.
- **Prueba primero:** la nueva prueba de integración falló inicialmente porque la migración aún no existía. Después de implementarla, pasó en MariaDB. Verifica nulos heredados, estados iniciales, ocho combinaciones entre dos negocios, servicio y sucursal globalmente inactivos, duplicados, cruces de negocio, falta de asignación y falta de selección.
- `npm run build`: aprobado tras los últimos cambios.
- `npm run lint`: aprobado tras los últimos cambios.
- `npm test -- --runInBand`: 56 suites y 298 pruebas aprobadas.
- `npm run test:e2e -- --runInBand`: 22 suites y 131 pruebas aprobadas.
- `npm run test:integration -- --runInBand`: primera ejecución completa con 36 suites aprobadas, 6 fallidas; 202 pruebas aprobadas, 6 fallidas. Cuatro fallos procedían de expectativas de 18 migraciones o de no revertir la nueva tabla antes de una migración histórica. Tras corregir esas pruebas, las cinco suites focalizadas pasaron (11/11 pruebas).
- Las dos suites de comparación con `db/schema.sql` se repitieron y mantienen 2 pruebas fallidas y 3 aprobadas: el archivo SQL de referencia aún no contiene las columnas y la tabla nuevas. Su sincronización es **FIX-T008** y queda pendiente, junto con la actualización de entidades de FIX-T006–T007. La suite completa de integración no se volvió a ejecutar después de ajustar las cuatro pruebas históricas.

Los mensajes de error de auditoría que aparecen durante e2e proceden de fallos inyectados deliberadamente por esas pruebas; la suite e2e terminó aprobada.
