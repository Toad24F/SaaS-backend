# Resultados T26–T30

Fecha: 2026-09-11.

## Trabajo realizado

- **T26 — reemplazo de códigos:** se amplió `CodigosService` con una operación transaccional que bloquea primero la cuenta y después el código, invalida el valor anterior y emite el reemplazo para el mismo destinatario y propósito. El consumo adoptó el mismo orden de bloqueos. La reemisión inicial se rechaza si la cuenta ya está activada y no modifica cuenta ni licencia.
- **T27 — límite compartido:** se agregó `LimiteIntentosStorage`, adaptador de `@nestjs/throttler` respaldado por MariaDB. Conserva una fila por IP, permite cinco intentos conjuntos, bloquea el sexto durante un minuto y no extiende el bloqueo al recibir más solicitudes. `LimiteIntentosGuard` genera la clave solo con la IP, por lo que login y las rutas de validación que lo utilicen comparten cuota. `AuthModule` registra el almacenamiento y el controlador de login usa el guard nuevo.
- **T28 — sesiones:** se agregó `SesionesService` para crear sesiones con vencimiento exacto de una hora, comprobarlas sin alterar su fecha y revocar una sesión o todas las sesiones vigentes de una cuenta. No se incorporó refresh token.
- **T29 — usuarios por tenant:** se amplió `UsuariosService` para listar y localizar únicamente recepcionistas del `negocioId` validado. Una combinación de ID y tenant que no existe devuelve el mismo recurso no disponible, sin revelar cuentas ajenas.
- **T30 — permisos:** se agregó `AutorizacionService` con una matriz cerrada: el superadmin crea negocios, gestiona licencias y autoriza recuperación de administradores; el administrador gestiona recepcionistas solo en su propio negocio; recepción no obtiene operaciones administrativas.
- **Reloj común:** se agregó `comun/reloj.ts`, contrato pequeño e implementación del reloj del sistema que permite verificar límites temporales con un reloj controlado en pruebas.

Los servicios y bloques de coordinación nuevos incluyen comentarios breves sobre sus invariantes: orden de bloqueos, ausencia de extensión de sesiones, cuota común por IP, aislamiento por tenant y denegación predeterminada de permisos.

## Tests primero

Antes de implementar se agregaron las pruebas de aceptación y se ejecutaron en rojo: Jest informó módulos inexistentes para autorización, almacenamiento de intentos y sesiones. Después de implementar se verificó:

- reemplazo del código anterior, conservación de destinatario y licencia pendiente, y rechazo de reemisión tras activar la cuenta;
- cinco intentos permitidos, bloqueo del sexto, bloqueo sin extensión, desbloqueo exacto y separación entre IP distintas sobre MariaDB;
- vencimiento exacto a una hora, lectura no deslizante, revocación individual y global;
- consulta y listado de recepcionistas propios con rechazo uniforme del tenant ajeno;
- matriz de nueve combinaciones rol/permiso, pertenencia del administrador y recuperación exclusiva de cuentas administradoras por superadmin;
- clave común del guard para login y validación de códigos.

## Resultado de la suite completa

```text
npm run build
Resultado: correcto

npm run lint
Resultado: correcto, 0 errores

npm test -- --runInBand
Test Suites: 24 passed, 24 total
Tests:       111 passed, 111 total

npm run test:integration -- --runInBand --detectOpenHandles
Test Suites: 5 passed, 5 total
Tests:       15 passed, 15 total

npm run test:e2e -- --runInBand --detectOpenHandles
Test Suites: 1 passed, 1 total
Tests:       1 passed, 1 total
```

No quedaron fallos ni pendientes dentro del alcance T26–T30.
