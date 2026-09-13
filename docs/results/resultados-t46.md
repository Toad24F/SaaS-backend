# Resultados T46 — activación y recuperación por HTTP

Fecha: 2026-09-12.

## Trabajo realizado

| Archivo | Cambio y finalidad |
|---|---|
| `src/auth/acceso-codigo.controller.ts` (nuevo) | Expone las tres operaciones públicas por código y delega en ActivacionesService y CredencialesService. Aplica LimiteIntentosGuard a todo el controlador, toma la hora del servidor y devuelve 204 sin cuerpo. |
| `src/auth/dto/acceso-codigo.dto.ts` (nuevo) | Define código y contraseña como cadenas obligatorias; la activación también exige nombre, recorta sus espacios y limita su longitud a los 150 caracteres admitidos por la entidad. La política existente valida el mínimo de 12 caracteres y el máximo de 72 bytes de contraseña. |
| `src/auth/auth.module.ts` (modificado) | Registra el controlador e importa AltasModule para reutilizar las activaciones transaccionales. Las pruebas de composición comprueban que los módulos siguen sin ciclos y que el dominio permanece independiente de los coordinadores. |
| `test/auth-t46.e2e-spec.ts` (nuevo) | Añade 19 casos HTTP con AppModule, Guards, servicios y MariaDB reales. Cada caso utiliza una base migrada desechable, cuentas separadas por propósito y un reloj controlado; cierra la aplicación y limpia las conexiones al finalizar. |
| `tsconfig.build.tsbuildinfo` (generado) | La compilación actualiza la caché incremental de TypeScript; no contiene lógica de negocio. |
| `docs/tareas-auth.md` (actualizado al cerrar) | Marca T46 y enlaza esta evidencia; conserva las tareas posteriores pendientes. |

Los archivos de código nuevos y el bloque incorporado al módulo contienen comentarios que explican la autorización por código, la cuota común por IP, la hora del servidor, las validaciones y la preparación de los tests. No se modificaron servicios de dominio, entidades, migraciones ni SQL.

## Contrato HTTP

| Método y ruta | Únicos campos admitidos | Éxito |
|---|---|---|
| `POST /auth/activar-administrador` | `codigo`, `password`, `nombre` | 204 |
| `POST /auth/activar-recepcionista` | `codigo`, `password`, `nombre` | 204 |
| `POST /auth/recuperar-contrasena` | `codigo`, `password` | 204 |

Estas operaciones no requieren JWT: el código emitido previamente autoriza únicamente su propósito y destinatario. El consumo ocurre en la transacción existente. No se devuelven hashes, códigos utilizables ni sesiones; recuperar conserva los bloqueos de cuenta y licencia y revoca las sesiones anteriores.

Las validaciones globales de producción (`whitelist`, `forbidNonWhitelisted`, `transform`) rechazan campos adicionales con 400. Las rutas comparten con login el contador MariaDB por IP: después de cinco intentos, el sexto recibe 429 durante un minuto. Las entradas y códigos no válidos reciben 400.

## Tests primero

Se creó y ejecutó la suite HTTP antes de modificar producción:

```text
npm run test:e2e -- --runInBand --testPathPatterns=auth-t46
Test Suites: 1 failed, 1 total
Tests:       19 failed, 19 total
```

Los 19 fallos fueron respuestas 404 de las rutas aún inexistentes; la preparación de las bases y cuentas funcionó. Después se implementaron el controlador, los DTOs y su registro en AuthModule.

## Qué verifican las pruebas

- **2 casos de activación:** establecen nombre y hash, consumen el código, mantienen correo/rol/negocio y rechazan reutilización. La activación administrativa inicia el año calendario y activa el negocio; la de recepción conserva la licencia. No se crean sesiones ni se alteran las otras cuentas.
- **2 casos de recuperación:** cambian la contraseña y revocan dos sesiones anteriores, sin conceder una nueva. Cubren cuenta disponible y cuenta desactivada con licencia suspendida; conservan activación, negocio y licencia y rechazan reutilización.
- **3 matrices de entrada, una por ruta:** rechazan campos obligatorios ausentes, tipos incorrectos, contraseñas cortas o que superan 72 bytes y nombres inválidos. Cada campo de correo, rol, negocio, cuenta, destinatario, propósito u hora enviado adicionalmente se rechaza de forma explícita; recuperación también rechaza nombre.
- **3 casos de códigos rechazados:** prueban código inexistente, de otro propósito y reemplazado, comparando el estado persistido antes y después.
- **3 casos de expiración:** el código se rechaza exactamente al cumplir sus 48 horas de activación o 30 minutos de recuperación, sin consumirlo ni modificar la cuenta.
- **3 casos de licencia:** suspensión antes de activar administrador, suspensión al activar recepción y vencimiento al activar recepción; mantienen disponible el código y no dejan cambios parciales.
- **3 casos de límite compartido:** combinan login y las tres rutas para consumir cinco intentos; comprueban el sexto bloqueado en cada ruta nueva, ausencia de mutaciones, bloqueo a los 59.999 segundos y éxito al minuto exacto sin prolongación.

Las pruebas HTTP usan las mismas opciones de ValidationPipe que `main.ts`, sin sustituir Guards ni simular repositorios. Las matrices de entrada avanzan explícitamente la ventana del reloj para evaluar validaciones sin confundirlas con el bloqueo por tasa.

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
Test Suites: 3 passed, 3 total
Tests:       30 passed, 30 total
```

**Total: 37 suites y 181 pruebas aprobadas**, incluidas las 19 nuevas de T46. No hubo pruebas omitidas ni fallos finales; integración y HTTP terminaron sin reportar recursos abiertos. Node mostró el aviso existente de VM Modules experimental, sin impedir las verificaciones.

**T46 completada.** Se utilizaron exclusivamente bases de prueba y no se inició T47 ni otra tarea posterior. Las pruebas secuenciales del límite compartido de esta tarea no sustituyen las carreras de T73.
