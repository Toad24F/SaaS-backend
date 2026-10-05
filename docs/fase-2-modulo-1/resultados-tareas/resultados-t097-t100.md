# Resultados M1-T097–M1-T100 — sucursales y horarios coordinados

Fecha: 2026-10-05.

## Qué se realizó

Reactivar una sucursal vuelve a contar las activas bajo bloqueo del negocio. Después bloquea en orden de ID los perfiles asignados y revalida sus horarios conservados con la sucursal candidata activa. Un empalme o falta de cupo rechaza toda la operación: la sede sigue inactiva y el error identifica las franjas. El cambio de zona de una sede activa usa la misma revalidación antes de confirmar. Retirar una asignación se rechaza si el Profesional conserva cualquier franja, borrador con sucursal o excepción en ella. El guardado semanal y de excepciones ya bloqueaba el perfil, de modo que estas operaciones se serializan sobre el mismo recurso.

## Archivos

| Archivo | Qué hace |
| --- | --- |
| `src/horarios/coordinacion-horarios.ts` | Busca perfiles afectados, los bloquea en orden estable y compara semanas y excepciones en las zonas de sucursales activas. Lee la fecha civil de excepciones directamente de SQL. Sus comentarios explican el orden y esa lectura. |
| `src/sucursales/sucursales.service.ts` | Añade reactivación transaccional con cupo y horarios; revalida cambios de zona antes de escribir y audita solo la reactivación confirmada. |
| `src/sucursales/sucursales.controller.ts` | Conecta `POST /sucursales/:id/reactivar` con sesión y rol administrador, y pasa una fecha del reloj a la validación. |
| `src/profesionales/profesionales.service.ts` | Impide quitar una asignación todavía referenciada por franjas o excepciones, bajo el bloqueo del perfil. |
| `test/horarios-t097-t100.integration-spec.ts` | Prueba conflictos, zona, asignaciones, carreras entre operaciones y competencia por el último cupo usando dos conexiones MariaDB. Sus comentarios explican el fixture y los datos históricos. |
| `test/sucursales-t065.e2e-spec.ts` | Actualiza el recorrido HTTP: reactivación autorizada, rechazo a recepción y liberación posterior de cupo. |
| `tsconfig.build.tsbuildinfo` | Caché incremental regenerada por la compilación; no contiene lógica de negocio. |
| `docs/fase-2-modulo-1/tareas-modulo-1.md` | Marca T097–T100 y enlaza esta evidencia. |
| `docs/fase-2-modulo-1/resultados-tareas/resultados-t097-t100.md` | Explica cambios, archivos y pruebas. |

## Tests primero

Primero se añadieron las pruebas de integración y se actualizó la expectativa de la ruta HTTP. Fallaron porque faltaba `reactivar`, la ruta respondía 404 y editar una zona aceptaba un empalme. Se corrigió además una aserción del propio test para convertir a número el `COUNT(*)` que MariaDB devuelve como cadena.

| Prueba | Qué comprueba | Resultado |
| --- | --- | --- |
| Reactivación con horario conservado | Identifica el choque, deja inactiva la sucursal y registra un único evento cuando una reactivación válida confirma. | Aprobada |
| Zona y asignación | Rechaza una zona que crea empalme, conserva la anterior y no retira asignaciones con franja o excepción. | Aprobada |
| Semana/excepción y semana/asignación | Dos conexiones compiten por el perfil; confirma solo el conjunto permitido sin filas mezcladas. | Aprobada |
| Semana/reactivación | La reactivación espera al guardado o rechaza el horario heredado; el resultado no deja empalme ni sobrecupo. | Aprobada |
| Último cupo | Dos reactivaciones y luego alta/reactivación compiten por un solo lugar; se conserva el horario de la solicitud rechazada. | Aprobada |
| HTTP sucursales | El administrador reactiva y recepción recibe 403; se puede desactivar después para liberar el cupo. | Aprobada |

| Comando | Resultado |
| --- | --- |
| `npm test -- --runInBand` | **52 suites; 281/281 pruebas aprobadas.** |
| `npm run test:integration -- --runInBand` | **29 suites aprobadas, 6 fallidas; 178/184 pruebas aprobadas.** |
| `npm run test:e2e -- --runInBand` | **13 suites aprobadas, 4 fallidas; 102/120 pruebas aprobadas.** |
| `npm run build` | Aprobado. |
| `npm run lint` | Código 0; cuatro advertencias previas por importaciones sin uso en `src/auth/dto/acceso-codigo.dto.ts`, archivo no modificado. |

Las suites completas se ejecutaron sobre MariaDB local con una base temporal dedicada. Integración repite seis fallos de módulos anteriores: T058, T037–T039, dos reversiones de `CodigosInvitacion1760000007000`, T026 y T017. HTTP repite 18 fallos de rutas anteriores que reciben 400 cuando esperaban 200 o 409. Las pruebas nuevas de horarios pasan; esos fallos quedan pendientes de diagnóstico fuera de T097–T100.
