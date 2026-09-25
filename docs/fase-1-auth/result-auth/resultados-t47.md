# Resultados T47 — alta y consulta administrativa de negocios

Fecha: 2026-09-12.

## Archivos y trabajo realizado

| Archivo | Cambio y finalidad |
|---|---|
| `src/negocios/negocios.controller.ts` (nuevo) | Expone alta, listado global y detalle. Ejecuta JwtAuthGuard antes de RolesGuard y exige superadmin en las tres operaciones. El alta toma actor y hora del servidor y reutiliza AltasService. |
| `src/negocios/dto/negocios-http.dto.ts` (nuevo) | Valida nombre, identificador público y correo del administrador; normaliza espacios y minúsculas y aplica los límites de las columnas. También valida IDs positivos dentro del rango INT UNSIGNED. |
| `src/negocios/negocios-consulta.service.ts` (nuevo) | Consulta negocio, licencia y administrador mediante relaciones por negocio_id, sin excluir licencias suspendidas o vencidas. Selecciona únicamente columnas administrativas y construye explícitamente la respuesta, sin hashes, códigos ni sesiones. Devuelve 404 cuando el negocio no existe. |
| `src/negocios/negocios-http.module.ts` (nuevo) | Compone controlador, Guards y reloj con AuthModule, AltasModule y NegociosModule. Mantiene las dependencias HTTP fuera del módulo de dominio para evitar ciclos. |
| `src/negocios/negocios.module.ts` (modificado) | Registra y exporta el servicio de consulta con el repositorio existente. Las pruebas unitarias de composición siguen verificando el dominio sin dependencias de los coordinadores. |
| `src/app.module.ts` (modificado) | Incorpora NegociosHttpModule para registrar las rutas al arrancar la aplicación real. |
| `test/negocios-t47.e2e-spec.ts` (nuevo) | Añade 12 casos HTTP con AppModule, Guards, autenticación y MariaDB reales; cada caso crea una base migrada desechable y la limpia al terminar, incluso ante fallos. |
| `tsconfig.build.tsbuildinfo` (generado) | La compilación actualiza la caché incremental de TypeScript; no agrega lógica de negocio. |
| `docs/tareas-auth.md` (actualizado al cerrar) | Registra T47 completada y enlaza este informe. |

Los bloques añadidos contienen comentarios sobre autorización actual, origen del actor, validaciones, aislamiento del módulo HTTP, exclusión de secretos y preparación de las pruebas. Se reutilizó el alta transaccional de T31 sin modificar sus reglas ni cambiar entidades, migraciones o SQL. Se conservaron los cambios previos de T46.

## Contrato HTTP

| Método y ruta | Entrada | Respuesta |
|---|---|---|
| `POST /negocios` | `nombre`, `identificadorPublico`, `emailAdministrador` | 201: IDs de negocio, administrador y licencia, código inicial y su expiración. |
| `GET /negocios` | Sin parámetros obligatorios | 200: lista global ordenada por ID con datos administrativos seguros. |
| `GET /negocios/:id` | ID válido | 200: detalle administrativo; 404 si no existe. |

Las tres rutas exigen sesión vigente y rol actual de superadmin. Las sesiones ausentes, revocadas o vencidas reciben 401; administrador y recepcionista autenticados reciben 403. El superadmin puede consultar licencias suspendidas o vencidas. Ninguna consulta altera cuentas, licencias o auditoría.

El alta crea negocio y administrador pendientes con una licencia anual aún sin habilitar. Solo la respuesta del alta entrega el código inicial de 48 horas. Las consultas incluyen identidad y contacto del negocio, fechas de licencia e identidad/estado del administrador; no vuelven a mostrar el código ni consultan hashes. Modalidad, período, plan e identificadores de actor enviados en el cuerpo se rechazan con 400 mediante ValidationPipe.

## Tests primero

Se escribió y ejecutó la suite nueva antes de modificar producción:

```text
npm run test:e2e -- --runInBand --testPathPatterns=negocios-t47
Test Suites: 1 failed, 1 total
Tests:       12 failed, 12 total
```

Los 12 fallos fueron respuestas 404 de las rutas todavía inexistentes. La preparación de usuarios, negocios, licencias y sesiones funcionó. Después se implementaron las rutas, DTOs, consulta y composición de módulos.

La primera suite HTTP completa terminó con 6 fallos y 36 pruebas aprobadas. Se detectó un error del helper de pruebas: construía varias peticiones Supertest antes de ejecutarlas y reutilizaba un puerto temporal ya cerrado. Se cambió para crear cada petición justo antes de enviarla, conservando todas las comprobaciones de seguridad. No fue necesario modificar producción por este fallo.

## Cobertura de las 12 pruebas HTTP

1. Alta correcta con normalización, administrador pendiente, licencia sin habilitar y código de 48 horas; listado de dos negocios y detalle sin volver a revelar el código.
2. Consulta por superadmin de licencia suspendida, contrato exacto sin hash y conservación de datos; el administrador bloqueado recibe 401.
3. La misma comprobación para licencia vencida.
4. Administrador: 403 en alta, listado y detalle, incluso para su propio negocio.
5. Recepcionista: 403 en las tres operaciones.
6. Sin autenticación: 401 en las tres operaciones, sin modificaciones.
7. Sesión de superadmin revocada: 401 en las tres operaciones.
8. Sesión de superadmin vencida exactamente a la hora: 401 en las tres operaciones.
9. Cambio del rol persistido de superadmin a recepcionista: el token antiguo no conserva sus privilegios y las tres operaciones reciben 403.
10. Matriz de entradas ausentes, tipos incorrectos, espacios, longitudes y correo inválido; rechazo explícito de `modalidad`, `periodo`, `plan`, `rol`, `actorUsuarioId`, `negocioId` y `ahora`, sin escrituras.
11. Slug y correo duplicados con variaciones de mayúsculas/espacios: 409, sin altas parciales ni eventos adicionales de auditoría.
12. IDs no numéricos, cero, negativos, fraccionarios o fuera de rango: 400; ID válido inexistente: 404.

La suite usa las mismas opciones de ValidationPipe que `main.ts`. No sustituye Guards ni repositorios; los usuarios se autentican por HTTP y los rechazos comparan el estado persistido antes y después.

## Verificación final

```text
npm run build
Resultado: correcto (salida 0)

npm run lint
Resultado: correcto (salida 0)

npm test -- --runInBand
Test Suites: 25 passed, 25 total
Tests:       116 passed, 116 total

npm run test:integration -- --runInBand --detectOpenHandles
Test Suites: 9 passed, 9 total
Tests:       35 passed, 35 total

npm run test:e2e -- --runInBand --detectOpenHandles
Test Suites: 4 passed, 4 total
Tests:       42 passed, 42 total
```

**Total final: 38 suites y 193 pruebas aprobadas**, incluidas las 12 nuevas de T47. No hubo pruebas omitidas ni fallos finales. Integración y HTTP terminaron sin reportar recursos abiertos. Node mostró el aviso existente de VM Modules experimental, sin impedir las verificaciones.

**T47 completada.** Se utilizaron exclusivamente bases de prueba y no se inició T48 ni otra tarea posterior. Las carreras de altas duplicadas de T74 continúan pendientes; esta tarea acredita los conflictos secuenciales por HTTP.
