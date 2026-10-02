# Resultados M1-T087–M1-T091 — calendario y semana completa

Fecha: 2026-10-02.

## Qué se realizó

Se convierten intervalos de fecha y hora local con zona IANA a instantes UTC sin elegir automáticamente horas repetidas ni desplazar horas inexistentes. Un intervalo que cruza un cambio de desplazamiento también se rechaza en una excepción fechada; en una ocurrencia semanal se omite solo esa fecha. Los empalmes usan intervalos completos semiabiertos, por lo que el descanso interno no libera una sucursal y dos límites consecutivos son válidos. La comparación revisa 400 días desde la fecha de validación y las fechas de excepciones con sus días vecinos para incluir cambios estacionales, días locales distintos y sustituciones normales o vacías.

El servicio guarda la semana como reemplazo completo en una transacción. Bloquea el perfil, verifica que cada sucursal pertenezca a sus asignaciones, valida el conjunto con las excepciones persistidas y después escribe. Un rechazo conserva la versión previa. La lectura devuelve IDs estables, franjas activas e inactivas, borradores y `[]` cuando la semana está vacía. Los errores de validación indican fila y campo; los empalmes indican ambas filas.

## Archivos

| Archivo | Qué hace |
| --- | --- |
| `src/horarios/calendario.ts` | Resuelve horas locales, detecta ambigüedad o discontinuidades y compara recurrencias, excepciones y sucursales mediante instantes. Sus comentarios explican el muestreo de desplazamientos, el límite 24:00 y los intervalos semiabiertos. |
| `src/horarios/calendario.spec.ts` | Prueba zonas distintas, horario de verano, medianoche, consecutividad, descanso, excepciones vacías/normales y choque estacional. |
| `src/horarios/horarios.service.ts` | Consulta la semana y la reemplaza bajo bloqueo transaccional con validación de pertenencia y conflictos. Los comentarios señalan la conservación de borradores y el orden de validación/escritura. |
| `src/horarios/horarios.module.ts` | Registra y exporta el servicio de horarios junto al modelo persistente. |
| `test/horarios-t090-t091.integration-spec.ts` | Prueba persistencia, recuperación, ID estable, semana vacía, rollback y dos guardados simultáneos en MariaDB migrada. Incluye comentario sobre el fixture de sucursales. |
| `tsconfig.build.tsbuildinfo` | Archivo incremental generado automáticamente al compilar; registra el nuevo grafo de TypeScript y no contiene lógica de negocio. |
| `docs/fase-2-modulo-1/tareas-modulo-1.md` | Marca T087–T091 y enlaza esta evidencia. |
| `docs/fase-2-modulo-1/resultados-tareas/resultados-t087-t091.md` | Explica los cambios, pruebas y resultados. |

## Tests primero

Se añadieron `calendario.spec.ts` y `horarios-t090-t091.integration-spec.ts` antes del código de producción. Las primeras ejecuciones fallaron porque faltaban `calendario.ts` y `horarios.service.ts`. Después pasaron **4/4 pruebas unitarias enfocadas** y **3/3 pruebas de integración enfocadas**.

| Prueba | Qué comprueba |
| --- | --- |
| Conversión local | Zonas IANA, instante UTC correcto, límite consecutivo y salida 24:00. |
| Transición horaria | Hora inexistente, repetida, discontinuidad interior, rechazo fechado y omisión de una sola ocurrencia semanal. |
| Empalme | Días locales diferentes que coinciden realmente y descanso que no libera la asignación. |
| Recurrencia y excepción | Comparación de invierno y verano, sustitución normal/vacía y rechazo de excepción ambigua. |
| Persistencia de semana | Recuperación de borradores, ID estable al editar y semana vacía. |
| Rechazo atómico | Errores con fila/campo, detección de choque y versión anterior intacta. |
| Dos conexiones | Reemplazos concurrentes serializados en un perfil, sin mezcla de conjuntos. |

| Comando | Resultado |
| --- | --- |
| `npm test -- --runInBand` | **51 suites; 278/278 pruebas aprobadas.** |
| `npm run test:integration -- --runInBand` | **27 suites aprobadas, 6 fallidas; 169/175 pruebas aprobadas.** |
| `npm run test:e2e -- --runInBand` | **12 suites aprobadas, 4 fallidas; 100/118 pruebas aprobadas.** |
| `npm run build` | Aprobado. |
| `npm run lint` | Código 0; cuatro advertencias previas de importaciones sin uso en `src/auth/dto/acceso-codigo.dto.ts`. |

La integración completa repite seis fallos fuera de horarios: T058, T037–T039, dos reversiones de `CodigosInvitacion1760000007000`, T026 y T017. La suite HTTP repite 18 fallos de rutas anteriores que reciben 400 cuando esperaban 200 o 409. Las pruebas nuevas de horarios pasan; estos fallos quedan pendientes de diagnóstico fuera de T087–T091.

Los endpoints y permisos de horarios corresponden a T093. La gestión de excepciones como operación de escritura corresponde a T092; aquí se validan las excepciones ya persistidas al reemplazar la semana.
