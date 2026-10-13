# Evidencia M2-T016–M2-T019 — integridad y conservación

## Archivos y flujo

`test/instalacion-t126-t127.integration-spec.ts` compara, entre una instalación por migraciones y otra por `db/schema.sql`, las columnas de todas las tablas y, para las cuatro de fase 3, precisión `DATETIME`, índices, claves, expresiones `CHECK`, referencias compuestas y reglas de actualización/eliminación. Comprueba además que TypeORM no sincronice ni ejecute migraciones automáticamente. No cambia las tablas de producción.

`test/fase-3-t016-t019.integration-spec.ts` ejercita contra MariaDB real las referencias entre negocios, intervalos válidos e inválidos, baja física y desactivación. Usa los servicios de aplicación existentes para que la política comprobada sea la de las rutas HTTP. `test/support/ocupaciones-fase-3.ts` crea, solo en bases temporales, las asignaciones y ofertas individuales del fix además de citas y apartados; esto permite comprobar que la fase 3 no sustituye la identidad ni la oferta previa.

`src/comun/politica-eliminacion.ts` consulta primero citas y apartados por negocio y recurso, antes de las demás relaciones e historial; si existen, rechaza la baja con 409 y propone desactivar. `docs/fase-2-modulo-1/politica-eliminacion.md` actualiza la tabla de relaciones y explica esta precedencia y la conservación del historial.

Flujo: **alta de recurso y ocupaciones → solicitud de baja → bloqueo del padre → lectura de citas/apartados → rechazo 409 sin borrar filas**. La desactivación recorre el servicio correspondiente, modifica solo el estado del recurso y deja intactos intervalos, claves y oferta. Las FKs siguen protegiendo las carreras concurrentes tras la lectura de relaciones. Las citas y apartados válidos se insertan con `inicio_utc < fin_utc`; las restricciones SQL rechazan extremos nulos, invertidos o iguales y referencias de otro negocio.

## Pruebas y resultado

Se escribieron primero las pruebas nuevas. La primera ejecución falló en la oferta del fixture (0 en vez de 2 filas) y en el mensaje de rechazo de baja (conflicto genérico por FK). Tras completar el fixture y la política, pasaron los casos dirigidos. La comparación de esquema se amplió para revisar precisión, `CHECK` y reglas de FK; las pruebas de conservación se reforzaron comparando filas completas antes y después de desactivar.

- M2-T016: instalador SQL y migraciones coinciden en columnas, precisión, índices y restricciones; `synchronize` y `migrationsRun` están desactivados.
- M2-T017: MariaDB acepta las ocupaciones válidas del fixture, rechaza sucursal, servicio, profesional o cliente de otro negocio, y rechaza fechas nulas, iguales o invertidas. Las ofertas existentes siguen presentes.
- M2-T018: sucursal, servicio y Profesional con cita o solo apartado rechazan la baja con mensaje específico; pueden desactivarse.
- M2-T019: tras bajas rechazadas se conservan citas y apartados; después de desactivar permanecen las mismas filas, intervalos, referencias y oferta. No se registra auditoría de eliminación inexistente.

Verificación final: `npm run build` y `npm run lint` sin errores; `npm test -- --runInBand`: **58 suites, 306 pruebas aprobadas**; `npm run test:integration -- --runInBand`: **49 suites, 226 pruebas aprobadas**; `npm run test:e2e -- --runInBand test/bajas-t111-t115.e2e-spec.ts`: **1 suite, 1 prueba aprobada**. Los casos dirigidos de fase 3 y comparación de instalación aprobaron **2 suites y 5 pruebas**.

## Límite

No se añade escritura pública de citas o apartados ni se implementa todavía el lector de ocupaciones del motor. La prueba de «solo apartados» retira citas exclusivamente en la base temporal desechable para aislar esa causa de rechazo; no cambia la política de producción.
