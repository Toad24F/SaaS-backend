# Evidencia M2-T011–M2-T015 — entidad, esquema y continuidad

## Archivos y flujo

`src/disponibilidad/entities/bloqueo-temporal.entity.ts` representa la tabla de apartados instalada en M2-T010. Mapea `inicio_utc`, `fin_utc`, `expira_en` y `liberado_en` con precisión de milisegundo; conserva únicamente `titular_hash` y las relaciones compuestas con negocio, Profesional, sucursal y servicio. El código comenta por qué se conserva la fila tras liberarla y cómo se impide asociar recursos de otro negocio.

`db/schema.sql` ahora instala `configuracion_agenda`, `clientes`, `citas` y `bloqueos_temporales` con las mismas columnas y tipos que las migraciones de fase 3. Para citas y apartados usa intervalos UTC y referencias compuestas por negocio. Los comentarios SQL explican el papel de cada tabla y que un apartado expirado o liberado deja de ocupar sin borrar el registro. Las tablas de WhatsApp y demás secciones ajenas a este tramo conservaron su estructura.

`test/support/ocupaciones-fase-3.ts` aporta `crearDatosOcupaciones`: recibe una base temporal migrada y un reloj explícito, crea dos negocios con dos sucursales y servicios cada uno y guarda citas y apartados asociados. El helper rechaza bases que no tengan el nombre temporal esperado. `conBaseHistorica` recrea, únicamente en una base temporal desechable, el punto anterior a las cuatro migraciones de fase 3 para probar tablas antiguas incompatibles.

El flujo de instalación nueva es **migraciones históricas → configuración → clientes → citas → apartados**. El flujo de prueba de ocupaciones es **reloj fijo → negocios y recursos propios → cliente → cita/apartado por sucursal y servicio → lectura TypeORM**. El flujo de actualización incompatible se detiene cuando el nombre de una tabla antigua ya está ocupado; no supone una zona horaria para sus fechas ni transforma sus filas. Dado que el DDL de MariaDB se confirma por sentencia, los pasos nuevos anteriores al choque pueden quedar instalados y requieren diagnóstico antes de reintentar; los datos antiguos permanecen intactos.

`test/fase-3-t011-t015.integration-spec.ts` comprueba entidad, datos de prueba y rechazo de los dos diseños antiguos. Se modificó `test/instalacion-t126-t127.integration-spec.ts` para volver a comparar también las cuatro tablas nuevas en la instalación SQL, sin omitir las históricas.

## Pruebas escritas primero

La primera ejecución de la prueba nueva falló porque faltaba `ocupaciones-fase-3.ts`. La prueba de instalación SQL falló porque el esquema aún incluía fechas/horas locales y `session_token` en apartados. Tras implementar los archivos, los casos dirigidos aprobaron:

- Entidad y helper: dos negocios aislados, dos sucursales y servicios por negocio, dos citas y dos apartados por negocio; milisegundos de intervalo y expiración, relaciones del mismo negocio y liberación anulable que puede guardarse.
- Instalación SQL: las columnas efectivas de todas las tablas migradas coinciden con el esquema de instalación; una segunda aplicación de migraciones no añade cambios.
- Compatibilidad: tablas antiguas de `citas` y `bloqueos_temporales` provocan un error de migración y conservan sus columnas y filas sin conversión.

La prueba dirigida de fase 3 y la de instalación SQL sumaron **2 suites y 5 pruebas aprobadas**. `npm run build` y `npm run lint` terminaron sin errores.

La verificación global terminó con `npm test -- --runInBand`: **58 suites y 306 pruebas aprobadas**; `npm run test:integration -- --runInBand`: **48 suites y 223 pruebas aprobadas**; y el recorrido HTTP `test/recorrido-t133.e2e-spec.ts`: **1 prueba aprobada**. Las pruebas de instalaciones antiguas esperan el error de tabla existente y verifican que las filas previas se conservan.

## Límite

Estas pruebas acreditan instalación y conservación de datos incompatibles. La comparación detallada de índices, restricciones y precisión entre ambos instaladores corresponde a M2-T016. Las pruebas de pertenencia y extremos inválidos de M2-T017 y el lector de ocupaciones de M2-T039–T040 permanecen pendientes.
