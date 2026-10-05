# Resultados M1-T092–M1-T096 — excepciones, API y rollback

Fecha: 2026-10-05.

## Qué se realizó

Las excepciones se crean o sustituyen por fecha y sucursal bajo el mismo bloqueo del perfil que protege la semana. Una cabecera con `franjas: []` cierra explícitamente esa fecha; retirarla vuelve a aplicar la recurrencia solo si el resultado completo no se empalma con otra sucursal. La semana y las excepciones tienen rutas protegidas: el administrador del negocio y el Profesional dueño pueden consultar y guardar; recepción y otros profesionales no editan. Las respuestas conservan IDs de filas y cabeceras, y los rechazos señalan fila/campo.

El servicio corrige la lectura de la columna SQL `DATE`: el driver de esta conexión la devolvía como el día anterior al construir la entidad. La consulta de fecha civil con `DATE_FORMAT` evita desplazar la excepción y permite sustituir o retirar la cabecera correcta.

## Archivos

| Archivo | Qué hace |
| --- | --- |
| `src/horarios/calendario.ts` | Exporta la validación de fecha local, incluso para una excepción vacía. |
| `src/horarios/horarios.service.ts` | Añade consulta, reemplazo y retiro de excepciones; valida el conjunto antes de escribir y conserva la semana en rollback. Corrige la lectura de `DATE`. |
| `src/horarios/horarios-acceso.service.ts` | Deriva negocio y propiedad de actor y perfil persistidos; aplica permisos de horario. |
| `src/horarios/dto/horarios.dto.ts` | Valida rutas, consultas y cuerpos de semanas y excepciones, incluidos IDs opcionales de edición. |
| `src/horarios/horarios.controller.ts` | Publica GET/PUT de semana y GET/PUT/DELETE de excepciones con sesión y roles. |
| `src/horarios/horarios-http.module.ts` | Conecta controlador, autorización y servicio sin introducir dependencia circular. |
| `src/app.module.ts` | Registra las rutas HTTP de horarios. |
| `src/horarios/calendario-t095.spec.ts` | Prueba días locales distintos, medianoche, consecutividad, hueco de comida y excepción vacía. |
| `test/horarios-t092-t096.integration-spec.ts` | Prueba sustitución y retiro, interruptores, borradores, descansos, dos versiones válidas, conflicto y fallo SQL con rollback. |
| `test/horarios-t093-t095.e2e-spec.ts` | Prueba permisos, lectura y escritura por HTTP, errores por fila y excepción vacía con choque entre zonas. |
| `tsconfig.build.tsbuildinfo` | Caché incremental regenerada por la compilación; no contiene lógica de negocio. |
| `docs/fase-2-modulo-1/tareas-modulo-1.md` | Marca T092–T096 y enlaza esta evidencia. |
| `docs/fase-2-modulo-1/resultados-tareas/resultados-t092-t096.md` | Explica el cambio, cada archivo y los resultados. |

Los bloques nuevos de producción y pruebas llevan comentarios sobre bloqueo, pertenencia, cierre explícito, límites horarios, fecha civil y rollback.

## Tests primero

Primero se añadieron las pruebas de integración y HTTP. La integración falló porque no existía `guardarExcepcion`; HTTP devolvió 404 al faltar las rutas. Tras implementar, las pruebas enfocadas quedaron verdes. Una prueba inicial contenía dos franjas que realmente se empalmaban al convertir zonas; se corrigió el dato del test antes de implementar producción.

| Grupo | Qué comprueba | Resultado |
| --- | --- | --- |
| T095 unitarias | Días locales diferentes con coincidencia UTC, fin 24:00, límites consecutivos, descanso que conserva asignación y cierre por fecha. | **3/3 aprobadas** |
| T092–T096 integración | Cabecera normal/vacía, retiro seguro, borradores, interruptores independientes, límites de descanso, dos guardados válidos, rechazo inválido y disparador SQL posterior al borrado que exige rollback completo. | **4/4 aprobadas** |
| T093–T095 HTTP | Admin y dueño consultan/guardan; recepción y otro Profesional no editan; negocio ajeno no accede; respuestas conservan IDs y errores por fila; retiro que produciría empalme devuelve conflicto. | **2/2 aprobadas** |

| Comando | Resultado |
| --- | --- |
| `npm test -- --runInBand` | **52 suites; 281/281 pruebas aprobadas.** |
| `npm run test:integration -- --runInBand` | **28 suites aprobadas, 6 fallidas; 173/179 pruebas aprobadas.** |
| `npm run test:e2e -- --runInBand` | **13 suites aprobadas, 4 fallidas; 102/120 pruebas aprobadas.** |
| `npm run build` | Aprobado. |
| `npm run lint` | Código 0; cuatro advertencias anteriores por importaciones sin uso en `src/auth/dto/acceso-codigo.dto.ts`, archivo no modificado. |

La suite completa se ejecutó sobre MariaDB local con base temporal dedicada. Integración repite seis fallos fuera de horarios: T058, T037–T039, dos reversiones de `CodigosInvitacion1760000007000`, T026 y T017. HTTP repite 18 fallos de rutas anteriores que reciben 400 cuando esperaban 200 o 409. Las pruebas nuevas de horarios pasan; estos fallos quedan pendientes de diagnóstico fuera de T092–T096.
