# Resultado — ALA-T071–ALA-T074

Revisión: cambios locales sin commit, 30 de octubre de 2026. Se escribió primero `test/ala-t071-t074.e2e-spec.ts` y se ejecutó en una base MariaDB migrada y desechable. Falló inicialmente porque la validación devolvía `sucursal_inactiva` para una sucursal inhabilitada. Después de incorporar la marca a la oferta y al lector de afectaciones, pasó. No se usó la base cotidiana.

## Flujo

La baja pública de Profesional, Recepción, servicio y sucursal es la inhabilitación recuperable de T061–T070. Las cuatro rutas `DELETE` anteriores devuelven 404. Una búsqueda del código de esos módulos no encontró rutas `@Delete`, métodos `eliminar` ni escrituras de borrado físico sobre `usuarios`, `personal`, `servicios` o `sucursales` usadas por esas bajas. Las bajas conservan filas, relaciones, citas y ocupaciones; las eliminaciones técnicas de relaciones de otros flujos no sustituyen este contrato.

El catálogo público exige que cuenta, servicio y sucursal estén activos **y** sin `inhabilitado_en`. El motor común recibe ambas condiciones de la misma lectura transaccional. Si hay marca, devuelve `cuenta_inhabilitada`, `servicio_inhabilitado` o `sucursal_inhabilitada`; si solo está inactivo, conserva el motivo anterior `*_inactiva` o `servicio_inactivo`. Esto impide que una relación activa vuelva a ofrecer un recurso retirado. La consulta administrativa de oferta usa la misma distinción y la lista habitual de servicios del Profesional omite retirados.

Para cada cita futura, el lector de citas afectadas consulta la oferta vigente sin aplicar el filtro de catálogo habitual a la cita histórica. Refiere cada causa a su Profesional, servicio o sucursal, y agrega las demás causas vigentes, como horario insuficiente. No modifica estado, inicio ni fin. Restaurar limpia la causa específica de inhabilitación, pero deja una causa de inactividad hasta reactivar y no oculta problemas de horario. La reactivación de una sucursal exige cupo; al activarla, solo reaparece la oferta cuya selección individual siga activa. Los índices únicos siguen reservando nombres y correos de registros inhabilitados.

## Archivos

- `src/disponibilidad/estado-oferta.ts`: añade las tres marcas como fuentes independientes y motivos específicos. Las fuentes opcionales conservan compatibilidad con lectores anteriores que solo aportan estados activos.
- `src/disponibilidad/oferta-efectiva.service.ts`: lee las marcas persistidas de cuenta, servicio y sucursal en la misma transacción usada para validar oferta pública y manual.
- `src/disponibilidad/citas-afectadas.service.ts`: asigna referencias tipadas a las nuevas causas y conserva la recomposición de todas las causas sin alterar citas.
- `src/reservas-publicas/catalogo-publico.service.ts`: exige `inhabilitado_en IS NULL` en los tres recursos de la consulta SQL del catálogo progresivo.
- `src/profesionales/profesionales.service.ts`: excluye servicios retirados de la lista habitual del Profesional y de la oferta por sucursal; la proyección administrativa de oferta distingue marca e inactividad.
- `test/ala-t071-t074.e2e-spec.ts`: comprueba 404 sin borrado en las cuatro rutas anteriores, catálogo y validación excluidos, cita futura intacta con causas simultáneas, cambio de causas al restaurar, unicidad retenida de nombre y correo, cupo de sucursal y selección individual preservada.
- `tareas.md`: marca T071–T074 y enlaza esta evidencia.

Los bloques escritos incluyen comentarios que explican la lectura de marcas, la diferencia con inactividad, el filtrado de oferta y la conservación de citas y relaciones.

## Pruebas y resultados

| Comando | Resultado |
| --- | --- |
| `npm run test:e2e -- --runInBand test/ala-t071-t074.e2e-spec.ts` | 1 suite, 1/1 caso aprobado; la primera pasada falló con el motivo genérico anterior. |
| `npm run test:e2e -- --runInBand test/ala-t071-t074.e2e-spec.ts test/ala-t066-t070.e2e-spec.ts test/ala-t061-t065.e2e-spec.ts test/fase-3-t067-t073.e2e-spec.ts test/fix-modulo-1-t030-t034.e2e-spec.ts` | 5 suites, 6/6 casos aprobados. |
| `npm run test:integration -- --runInBand test/fase-3-t026-t030.integration-spec.ts test/fase-3-t050-t056.integration-spec.ts test/fase-4-t086-t091.integration-spec.ts test/bajas-t111-t115.integration-spec.ts test/ala-t051-t056.integration-spec.ts` | 5 suites, 26/26 casos aprobados. |
| `npm test -- --runInBand src/disponibilidad src/profesionales src/servicios src/sucursales src/usuarios src/reservas-publicas` | 21 suites, 92/92 casos aprobados. La primera ejecución tuvo tres fallos `EACCES` al abrir sockets locales del parser HTTP en el sandbox; al repetir con acceso a esos sockets, pasaron. |
| `npm run build`, `npm run lint` y `git diff --check` | Correctos. |
| Búsqueda estática de `@Delete`, `eliminar()` y borrado de las cuatro tablas principales en los módulos de recursos | Sin coincidencias. |

T071–T074 cumplen sus criterios. T075 y posteriores siguen pendientes; este lote no cierra la fase ni habilita producción. M3-I001/M2-I004 continúan diferidas al escritor manual real.
