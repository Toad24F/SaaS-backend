# Resultados T83

Fecha: 2026-09-15

## Resultado

`POST /recepcionistas` acepta `emailRecepcionista`, `nombre` y `password` y devuelve 201 con la vista pública de la cuenta. El negocio, rol, estado activo y activación se asignan en el servicio desde el administrador persistido; no se genera código. `POST /recepcionistas/:id/restablecer-contrasena` acepta solo `nuevaPassword`, responde 204 y usa el caso transaccional T82 para revocar sesiones sin cambiar identidad, pertenencia, estado ni licencia. La ruta pública `/auth/activar-recepcionista` ya estaba retirada desde T80 y se verificó que continúa devolviendo 404.

## Archivos

- `src/usuarios/dto/recepcionistas.dto.ts`: agrega los DTO de alta y restablecimiento; recorta nombre y correo antes de validar tipos, formato y longitud, y deja la política bcrypt al servicio común. Sus comentarios describen los campos autorizados y los límites.
- `src/usuarios/recepcionistas.controller.ts`: agrega las dos rutas protegidas y usa el reloj compartido; presenta la cuenta creada mediante una lista explícita de campos públicos. Los comentarios explican la exclusión del hash y la transacción de restablecimiento.
- `src/usuarios/usuarios-http.module.ts`: actualiza el comentario del módulo para reflejar las operaciones de gestión y credenciales que ahora expone.
- `test/recepcionistas-t48.e2e-spec.ts`: añade tres escenarios de aceptación y extiende las pruebas de Guards; adapta la prueba histórica de invitación a 400 por cuerpo incompleto. Sus comentarios explican por qué las nuevas rutas comparten los Guards reales.
- `docs/results/resultados-t83.md`: registra cambios, pruebas y el resultado de la suite completa.
- `docs/tareas-auth.md` y `docs/plan.md`: registran T83 completada, enlazan la evidencia y mantienen pendientes las pruebas posteriores T84–T85.

## Pruebas

1. El alta HTTP normaliza nombre y correo, deriva negocio y rol del administrador, guarda hash, activa la cuenta, responde solo con campos públicos, audita sin secretos y no genera códigos. Confirma también 404 en la activación antigua.
2. El restablecimiento HTTP de cuentas activas y desactivadas guarda el nuevo hash, revoca la sesión previa, conserva identidad, estado y licencia, responde sin contenido y audita sin secretos.
3. Entradas incompletas, nombre o correo inválido, contraseña corta o superior a 72 bytes, campos de negocio/rol/código y correo global duplicado se rechazan sin mutaciones. Restablecimientos de otro negocio, otro rol o ID inválido también se rechazan.
4. Las pruebas HTTP compartidas comprueban 403 para superadmin o recepcionista y 401 para falta de token, sesión revocada o vencida y licencia suspendida, usando Guards y `ValidationPipe` de producción.

Se escribieron los tests antes del código. La primera ejecución focalizada fue roja: el alta esperaba 201 y recibió 404 porque la ruta aún no existía. Tras implementarla, el archivo HTTP pasó 18/18 pruebas.

## Verificación

- `npm run build`: correcto.
- `npm run lint`: correcto, sin diagnósticos.
- `npm test -- --runInBand`: 26 suites, 118 pruebas aprobadas.
- `npm run test:integration -- --runInBand`: 10 suites, 41 pruebas aprobadas.
- `npm run test:e2e -- --runInBand`: 6 suites aprobadas y 1 fallida; 82 pruebas aprobadas y 1 fallida, en dos ejecuciones completas. El fallo es la carrera preexistente de T50 `serializa dobles suspensiones, renovaciones y reactivaciones`: MariaDB devolvió `ER_CHECKREAD` al bloquear una licencia y HTTP respondió 500 en lugar de 204. Falló también aislada con `npm run test:e2e -- --runInBand licencias-t50 -t "serializa dobles"`. Las 18 pruebas del archivo HTTP de recepcionistas pasaron.

T83 queda completada por sus criterios HTTP. La carrera T50 permanece pendiente de corrección; se detiene el trabajo aquí sin modificar licencias ni iniciar T84–T85.
