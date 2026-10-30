# Resultado — ALA-T075–ALA-T077

Revisión: cambios locales sin commit, 30 de octubre de 2026. Se escribieron primero las pruebas HTTP y unitaria. La primera ejecución falló porque `GET /negocios/publicacion-catalogo` no existía y faltaba la función de proyección; después de implementar, la prueba HTTP detectó y ayudó a corregir la precedencia de rutas y el rechazo de un PATCH vacío. La prueba HTTP usa una base MariaDB migrada y desechable, no la base cotidiana.

## Flujo

El administrador autenticado consulta `GET /negocios/publicacion-catalogo`. El servicio obtiene su negocio desde la cuenta persistida y devuelve únicamente categoría, teléfono y las dos opciones públicas. Para `PATCH`, el DTO acepta cualquiera de esos campos de forma parcial, rechaza valores nulos, tipos incorrectos y campos desconocidos; el servicio exige al menos un valor enviado. Dentro de una transacción `READ COMMITTED`, vuelve a comprobar cuenta y pertenencia, bloquea la fila del negocio como barrera compartida con las escrituras de catálogo, conserva los campos omitidos, guarda el cambio y su evento de auditoría en el mismo commit. Una repetición sin cambio devuelve el estado vigente sin otro evento. `mostrarPreciosPublicos` pertenece al negocio, con valor inicial verdadero: un servicio nuevo usa la misma opción global, sin guardar una copia por servicio.

La proyección pura recibe un resultado público y la opción vigente. Si los precios están ocultos, recorre objetos y arreglos, crea una copia y **omite** claves monetarias, incluidas las anidadas. No escribe cero ni `null` ni modifica el resultado histórico de entrada. Si se muestran, conserva los importes. La conexión de esta proyección con las respuestas reales de catálogo, apartados, registro y recuperación corresponde a T078–T079 y aún no se acredita aquí.

## Archivos

- `src/negocios/publicacion-catalogo.service.ts` (nuevo): lectura y actualización del valor global, validación del administrador propio, barrera del negocio, transacción y auditoría de cambios reales.
- `src/negocios/publicacion-catalogo.controller.ts` (modificado): agrega GET; PATCH admite `mostrarPreciosPublicos` como campo parcial y delega la escritura en el servicio.
- `src/negocios/negocios-http.module.ts` (modificado): registra el servicio y la auditoría; sitúa la ruta literal antes de `/negocios/:id` para que la consulta alcance su controlador.
- `src/reservas-publicas/proyeccion-precios-publicos.ts` (nuevo): copia recursiva y omisión de claves monetarias, sin alterar la historia interna.
- `test/ala-t075-t076.e2e-spec.ts` (nuevo): ejercita GET/PATCH HTTP con dos negocios, rol Recepción, entradas inválidas, conservación de contacto, auditoría idempotente y servicios nuevos.
- `src/reservas-publicas/proyeccion-precios-publicos.spec.ts` (nuevo): comprueba omisión en objetos y arreglos anidados, ausencia de sustitutos y conservación del origen congelado.
- `tareas.md` (modificado): marca T075–T077 y enlaza esta evidencia.

Los bloques de código nuevos llevan comentarios junto a la transacción, la barrera, la lista permitida de respuesta, el registro del cambio, el orden de rutas y la copia de la proyección.

## Pruebas y resultados

| Comando | Resultado |
| --- | --- |
| `npm run test:e2e -- --runInBand test/ala-t075-t076.e2e-spec.ts` | 1 suite, 1/1 caso aprobado. Primero falló por la ruta ausente; después señaló la precedencia de rutas y el PATCH vacío, ya corregidos. |
| `npm run test:integration -- --runInBand test/fase-4-t041-t044.integration-spec.ts` | 1 suite, 5/5 casos aprobados; regresión del catálogo público y contacto. |
| `npm test -- --runInBand src/negocios src/reservas-publicas src/modulos.spec.ts` | 15 suites, 62/62 casos aprobados. La primera pasada tuvo 3 fallos `EACCES` por sockets HTTP locales del sandbox; la repetición con acceso a esos sockets pasó. |
| `npm run build` y `npm run lint` | Correctos. |
| `git diff --check` | Correcto. |

T075–T077 cumplen sus criterios. T078 y posteriores permanecen pendientes; esto no habilita producción ni cierra la fase. M3-I001/M2-I004 siguen diferidas al escritor manual real.
