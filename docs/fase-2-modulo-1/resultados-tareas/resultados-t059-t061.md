# Resultado M1-T059–M1-T061 — base de sucursales

Fecha: 2026-09-30. **T059–T061 hechas.** Se preparó la entidad de sucursal, su migración incremental y la validación de entradas. El alta, el cupo y las rutas HTTP corresponden a T062 y posteriores.

## Flujo

1. El contrato recibe nombre, dirección, teléfono y zona horaria obligatorios. Recorta espacios y comprueba longitud, formato telefónico y una zona IANA conocida por el runtime. URL de Google Maps y notas de llegada son opcionales; el enlace exige HTTPS y dominio permitido. Los errores señalan el campo. La ValidationPipe estricta rechaza negocioId y activo enviados por el cliente.
2. La entidad conserva negocioId obligatorio y relación con Negocio. La clave compuesta (negocioId, id) prepara relaciones futuras que validarán pertenencia. El índice (negocioId, activo) prepara el recuento bajo cupo; activo inicia en true y la futura desactivación conservará la fila.
3. La migración crea la tabla después de las anteriores sin alterar negocios ni otras tablas. La FK RESTRICT impide borrar un negocio con sucursales. Los CHECK y NOT NULL impiden datos obligatorios vacíos. El script SQL autónomo refleja estas columnas, índices y restricciones.

## Archivos

| Archivo | Qué hace |
| --- | --- |
| `src/sucursales/entities/sucursal.entity.ts` | Nuevo mapa TypeORM de pertenencia, estado y campos aprobados, con índices y restricciones. |
| `src/database/migrations/1760000010000-Sucursales.ts` | Nueva migración incremental que crea la tabla sin cambiar datos existentes. |
| `src/sucursales/dto/sucursal.dto.ts` | Nuevo DTO: normaliza y valida campos, zona IANA y enlace de Google Maps; informa errores por campo. |
| `src/sucursales/sucursales.module.ts` | Registra la entidad para que Nest cargue sus metadatos; T062 añadirá el servicio de alta. |
| `src/modulos-fase-2.spec.ts` | Compone el módulo sin abrir MariaDB mediante un repositorio de prueba y confirma que está registrado. |
| `db/schema.sql` | Actualiza la definición autónoma de sucursales conforme a la migración. |
| `src/sucursales/sucursal-fase-2.spec.ts` | Nueva prueba de metadatos de entidad y matriz de entradas válidas e inválidas. |
| `test/sucursales-t060.integration-spec.ts` | Nueva prueba MariaDB de índices, pertenencia, restricciones y conservación del negocio existente. |
| `test/instalacion-t61.integration-spec.ts` | Actualiza el número esperado de migraciones al instalar una base nueva. |
| `test/envios-correo.integration-spec.ts` | Actualiza el total de migraciones sin alterar la conducta de correo. |
| `test/identidad-fase-2.integration-spec.ts` | Ajusta historial y reversión de migraciones posteriores a la identidad histórica. |
| `test/migrations.integration-spec.ts` | Incluye la migración de suspensión ya existente al revertir su fixture histórica. |
| `test/codigos-fase-2.integration-spec.ts` | Retrocede también migraciones posteriores al reproducir el esquema previo de códigos. |
| `test/procesador-correo.integration-spec.ts` | Fija el reloj de la fixture después de la creación real para respetar la restricción SQL de activación. |
| `test/concurrencia-t52-t57.integration-spec.ts` | Ajusta una expectativa histórica a la segunda renovación anual acumulada. |
| `test/cuentas-licencias-t38-t44.integration-spec.ts` | Ajusta expectativas históricas a la gracia de 48 horas y al tiempo congelado posterior. |
| `test/licencias-reintentos.integration-spec.ts` | Verifica que el reintento mantiene suspensión solicitada y bloqueo programado. |
| `src/modulos-fase-2.spec.ts` | Simula el repositorio de sucursales en la composición Nest sin conexión y confirma su registro. |
| `docs/fase-2-modulo-1/tareas-modulo-1.md` | Marca T059–T061 y enlaza esta evidencia. |
| `docs/fase-2-modulo-1/resultados-tareas/resultados-t059-t061.md` | Explica flujo, archivos, pruebas y límites de esta entrega. |

Los comentarios añadidos en entidad, DTO, migración y pruebas explican pertenencia, índices, entradas controladas por el servidor, reversión y ensayos SQL.

## Tests primero

Los casos de entidad/validación y migración se escribieron antes del código. Quedaron rojos porque aún no existían DTO, entidad ni migración. Tras implementarlos, la prueba enfocada de validación aprobó **18/18** y la de migración **1/1**. La integración insertó un negocio previo, reaplicó la migración en una base desechable y confirmó su conservación. Comprobó FK, índices, valor inicial de activo y rechazo de obligatorios nulos o vacíos. Los casos de DTO aceptan los opcionales ausentes y rechazan faltantes, zona desconocida, teléfono/enlace inválidos y campos reservados al servidor.

La ejecución completa reveló fixtures antiguas que contaban migraciones por número fijo, usaban una fecha anterior a la creación SQL o esperaban suspensión inmediata pese al contrato de 48 horas ya implementado. Se actualizaron sus expectativas y se ejecutaron las pruebas enfocadas de instalación/códigos/correo/licencias antes de repetir la suite.

## Resultado de suites y pendientes

| Verificación | Resultado |
| --- | --- |
| `npm test -- --runInBand` | **48 suites, 246/246** pruebas aprobadas. |
| `npm run test:integration -- --runInBand` | **29 suites, 160/160** pruebas aprobadas con MariaDB. |
| `npm run test:e2e -- --runInBand` | **12 suites, 105/105** pruebas aprobadas. |
| `npm run build` | Correcto. |
| `npm run lint` | Sin diagnósticos. |
| `git diff --check` | Sin errores. |

**Total: 511 pruebas aprobadas.** Los mensajes `ERROR` visibles en algunas pruebas HTTP son fallos inyectados deliberadamente para verificar rollback. La ruta nueva de sucursales aún no existe porque pertenece a T065. La lista queda con **61 tareas hechas y 79 pendientes**; se detiene en T061.
