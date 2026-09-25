# Resultados T48 — recepcionistas y reemisión inicial

Fecha: 2026-09-13.

## Trabajo por archivo

| Archivo | Cambio y finalidad |
|---|---|
| `src/usuarios/recepcionistas.controller.ts` (nuevo) | Expone invitación, listado, detalle y desactivación, exclusivamente para administradores. Usa el negocio de la sesión validada y los servicios existentes; proyecta campos públicos sin serializar hashes. |
| `src/usuarios/dto/recepcionistas.dto.ts` (nuevo) | Valida y normaliza el correo de invitación, limita su longitud a 150 caracteres y valida los IDs positivos dentro de INT UNSIGNED. |
| `src/comun/dto/sin-campos.dto.ts` (nuevo) | Declara un cuerpo sin propiedades admitidas para desactivación y reemisión. ValidationPipe rechaza cualquier campo adicional. |
| `src/usuarios/usuarios-http.module.ts` (nuevo) | Compone Auth, Altas y Usuarios con los Guards y reloj, sin introducir dependencias HTTP en el dominio. |
| `src/app.module.ts` (modificado) | Registra UsuariosHttpModule y sus rutas. |
| `src/negocios/negocios.controller.ts` (modificado) | Agrega la reemisión del código inicial por negocio, heredando la protección exclusiva de superadmin. El actor y la hora provienen del servidor. |
| `src/altas/altas.service.ts` (modificado) | Agrega reemitirCodigoInicial: consulta el rol del emisor y bloquea al administrador del negocio antes de reemplazar su código, sin modificar cuenta ni licencia. |
| `src/codigos/codigos.service.ts` (modificado) | Extrae reemplazarConManager para compartir la transacción de autorización, bloqueo, invalidación, nueva emisión y auditoría. El método reemplazar existente conserva su contrato y delega en esa implementación. |
| `test/recepcionistas-t48.e2e-spec.ts` (nuevo) | Agrega 14 casos HTTP con Guards, sesiones persistidas, JWT firmados y MariaDB reales. Prepara dos negocios activos y uno pendiente en una base migrada exclusiva por caso; cierra y limpia al terminar. |
| `tsconfig.build.tsbuildinfo` (generado) | La compilación actualiza la caché incremental de TypeScript. |
| `docs/tareas-auth.md` (actualizado al cerrar) | Marca T48 y enlaza esta evidencia. |

Los bloques nuevos incluyen comentarios sobre pertenencia, protección por rol, validaciones, serialización sin hashes, orden de bloqueos, transacción compartida y fixtures. No se modificaron entidades, migraciones ni SQL. Invitación, consulta y desactivación reutilizan T29, T32 y T38.

## Contrato HTTP

| Método y ruta | Rol | Entrada / resultado |
|---|---|---|
| `POST /recepcionistas` | Administrador del negocio | Solo `emailRecepcionista`; 201 con IDs, código de activación y expiración de 48 horas. |
| `GET /recepcionistas` | Administrador del negocio | 200 con recepción propia, incluida la pendiente o desactivada, ordenada por ID. |
| `GET /recepcionistas/:id` | Administrador del negocio | 200 con campos públicos; 404 para cuenta ajena, rol incorrecto o inexistente. |
| `POST /recepcionistas/:id/desactivar` | Administrador del negocio | Cuerpo vacío; 204, conserva la cuenta y bloquea su siguiente solicitud autenticada. |
| `POST /negocios/:id/reemitir-codigo` | Superadmin | Cuerpo vacío; 201 con nuevo código inicial y expiración. Rechaza administrador ya activado con 409 y destinatario inexistente con 404. |

Los IDs no conceden pertenencia. JwtAuthGuard consulta el estado actual y RolesGuard exige el rol correspondiente. Las entradas inválidas o propiedades extra reciben 400; sesión no disponible o licencia bloqueada, 401; rol no autorizado, 403; correo duplicado, 409. El superadmin no usa las rutas de recepción propias de un administrador.

Reemitir invalida el código inicial anterior y concede otras 48 horas. Mantiene destinatario, correo, rol, negocio y fechas de licencia, incluso con una licencia pendiente suspendida. No habilita la licencia ni crea sesiones. Código y hash no aparecen en consultas; el valor utilizable solo se entrega al emitir o reemplazar.

## Tests primero

Antes de modificar producción se ejecutó:

```text
npm run test:e2e -- --runInBand --testPathPatterns=recepcionistas-t48
Test Suites: 1 failed, 1 total
Tests:       13 failed, 1 passed, 14 total
```

Los 13 fallos fueron respuestas 404 de las rutas todavía inexistentes. El caso que solo esperaba 404 ya pasaba; la suite también exige accesos propios exitosos para acreditar la implementación real. La preparación de bases, cuentas y sesiones funcionó.

## Pruebas realizadas

- Invitación con correo normalizado y pertenencia fija; listado/detalle propios con campos exactos sin hashes ni códigos; duplicado sin escrituras adicionales.
- Desactivación sin borrado, rechazo inmediato de la sesión afectada, conservación de acceso del otro negocio e idempotencia.
- Consulta y desactivación ajenas o dirigidas a administradores/inexistentes: 404 y estado conservado.
- Superadmin y recepcionista: 403 en las cuatro rutas de administración de recepción.
- Sesión ausente, revocada o vencida exactamente a la hora y licencia suspendida: 401 en las cuatro rutas de recepción.
- Correo, longitudes e IDs inválidos; rechazo de campos de negocio, rol, usuario, actor, contraseña, propósito u hora donde no están admitidos.
- Reemisión con y sin suspensión previa: nuevo código, nuevas 48 horas, invalidación del anterior y ninguna modificación de cuenta, negocio o licencia.
- Reemisión: rechazo por rol, sesión ausente/revocada, negocio inexistente o administrador ya activado.
- Fallo de auditoría provocado durante reemisión: 500 esperado y rollback completo del reemplazo. Los Guards y repositorios permanecen reales; únicamente se simula ese fallo del registrador.

Se usa la configuración global de ValidationPipe de producción. Cada petición Supertest se construye al ejecutarse para no reutilizar puertos temporales cerrados. Los rechazos y el rollback comparan cuentas, negocios, licencias, códigos y auditoría antes y después.

## Verificación final

```text
npm run build
Resultado: correcto (salida 0)

npm run lint
Resultado: correcto (salida 0)

npm test -- --runInBand
Test Suites: 25 passed, 25 total
Tests:       116 passed, 116 total

npm run test:e2e -- --runInBand --testPathPatterns=recepcionistas-t48 --detectOpenHandles
Test Suites: 1 passed, 1 total
Tests:       14 passed, 14 total

npm run test:integration -- --runInBand --detectOpenHandles
Test Suites: 9 passed, 9 total
Tests:       35 passed, 35 total

npm run test:e2e -- --runInBand --detectOpenHandles
Test Suites: 5 passed, 5 total
Tests:       56 passed, 56 total
```

**Total final: 39 suites y 207 pruebas distintas aprobadas**, sin sumar nuevamente la ejecución focalizada de T48. No hubo pruebas omitidas ni fallos finales; integración y HTTP terminaron sin reportar recursos abiertos.

El log `Error: Fallo de prueba T48` corresponde al fallo de auditoría inyectado deliberadamente: el test espera 500 y verifica rollback. No representa un fallo de la suite. Node también mostró el aviso existente de VM Modules experimental.

**T48 completada.** No se inició T49 ni otra tarea posterior. Se usaron exclusivamente bases de prueba; las carreras completas entre reemplazo y consumo de códigos continúan asignadas a T53.
