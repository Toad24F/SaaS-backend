# Resultados T49 — cambio de contraseña y autorización de recuperación

Fecha: 2026-09-13–14 (America/Chihuahua).

## Trabajo por archivo

| Archivo | Cambio y finalidad |
|---|---|
| `src/auth/credenciales.controller.ts` (nuevo) | Expone cambio propio y autorización de recuperación. Usa sesión y reloj del servidor, exige superadmin para autorizar y delega las transacciones en los servicios existentes. |
| `src/auth/dto/credenciales.dto.ts` (nuevo) | Valida las dos contraseñas como texto no vacío y el ID del administrador como entero positivo dentro de INT UNSIGNED. La política compartida exige al menos 12 caracteres y como máximo 72 bytes para la nueva clave. |
| `src/auth/auth.module.ts` (modificado) | Registra el controlador protegido de credenciales, separado del consumo público de códigos. |
| `src/usuarios/usuarios.service.ts` (modificado) | Añade la consulta de administrador por ID y rol; devuelve 404 si el destino no corresponde a ese recurso. El servicio de credenciales revalida el permiso y destinatario dentro de la transacción. |
| `test/credenciales-t49.e2e-spec.ts` (nuevo) | Añade 14 pruebas HTTP con MariaDB migrada desechable, dos negocios, JWT firmados, sesiones persistidas, reloj controlado y Guards reales. Compara también hashes y sesiones para detectar mutaciones indebidas. |
| `docs/tareas-auth.md` | Registro de finalización y enlace a esta evidencia, actualizado tras verificar la suite. |
| `tsconfig.build.tsbuildinfo` (generado) | Caché incremental actualizada por la compilación TypeScript. |

Se agregaron comentarios sobre identidad del actor, permisos, validación, revocación, revalidación transaccional y finalidad de los bloques de pruebas. No se requieren cambios de entidades ni SQL.

## Contrato HTTP

| Ruta | Entrada y resultado |
|---|---|
| `POST /auth/cambiar-contrasena` | Cualquier usuario autenticado envía `passwordActual` y `nuevaPassword`; 204 sin cuerpo. Revoca todas sus sesiones, incluida la actual, y exige nuevo login. |
| `POST /auth/administradores/:id/autorizar-recuperacion` | Solo superadmin, cuerpo vacío; 201 con `codigo` y `expiraEn`. Reemplaza códigos anteriores y otorga 30 minutos de vigencia. |

Entradas inválidas y contraseña actual incorrecta producen 400; sesión inválida, cuenta inactiva o licencia bloqueada, 401; rol emisor insuficiente, 403; destino inexistente, recepcionista o superadmin, 404. No se expone recuperación de recepcionistas. El código utilizable se entrega únicamente al emitir; no se devuelven hashes ni una sesión automática.

## Tests primero

La primera tentativa de creación usó `python`, que no está disponible en el entorno; esa invocación no creó el archivo y Jest informó que no encontró pruebas. Se creó después con PowerShell y se ejecutó antes de modificar producción:

```text
npm run test:e2e -- --runInBand --testPathPatterns=credenciales-t49
Test Suites: 1 failed, 1 total
Tests:       14 failed, 14 total
```

Los 14 fallos fueron respuestas 404 de las rutas todavía inexistentes; las fixtures y la conexión MariaDB funcionaron.

La primera ejecución con implementación obtuvo 13 aprobadas y 1 fallo de preparación: la fixture de licencia vencida igualaba vencimiento y habilitación, violando `chk_licencias_vigencia`. Se corrigió avanzando el reloj un segundo antes de fijar el vencimiento exacto; no se relajó la restricción ni se cambió producción para aceptar datos inválidos.

## Escenarios verificados

- Cambio propio para superadmin, administrador y recepcionista; revocación de al menos dos sesiones, rechazo del JWT anterior y de la clave vieja, login con la nueva y acceso conservado del otro negocio.
- Contraseña actual incorrecta, tipos inválidos, nueva clave corta o superior a 72 bytes; rechazo de IDs de usuario/negocio, rol, actor y hora inyectados en el cuerpo, sin cambios persistidos.
- Cambio denegado con sesión ausente, revocada o vencida exactamente a la hora; cuenta inactiva y licencia suspendida o vencida.
- Autorización y reemplazo con 30 minutos exactos; actor y destinatario de auditoría; rechazo del código anterior y del ya consumido.
- Recuperación de administrador inactivo con licencia suspendida: revoca sesiones y conserva ambos bloqueos y las fechas de licencia.
- Autorización exclusiva del superadmin con sesión vigente; rechazo de administradores y recepcionistas como emisores y de destinos no administradores o inexistentes.
- Validación de IDs y rechazo de propiedades extra en autorización.
- Fallo deliberado de auditoría durante reemplazo: 500 esperado y rollback de códigos, usuarios, sesiones, licencias y eventos.

## Verificación final

```text
npm run build
Resultado: correcto (salida 0)

npm run lint
Resultado: correcto (salida 0), también tras corregir la fixture

npm test -- --runInBand
Test Suites: 25 passed, 25 total
Tests:       116 passed, 116 total

npm run test:integration -- --runInBand --detectOpenHandles
Test Suites: 9 passed, 9 total
Tests:       35 passed, 35 total
```

```text
npm run test:e2e -- --runInBand --detectOpenHandles
Test Suites: 6 passed, 6 total
Tests:       70 passed, 70 total
Time:        666.29 s
```

**Total final: 40 suites y 221 pruebas distintas aprobadas**, incluidas las 14 nuevas de T49. No se suman de nuevo las ejecuciones focalizadas. Sin pruebas omitidas ni fallos finales; integración y HTTP terminaron sin reportar recursos abiertos.

Los mensajes `Fallo de prueba T49` y `Fallo de prueba T48` son fallos de auditoría inyectados deliberadamente; sus pruebas esperan 500 y verifican rollback. Node mostró el aviso existente de VM Modules experimental.

**T49 completada y marcada en la lista de tareas.** Se detiene el trabajo aquí; T50 y las tareas posteriores permanecen pendientes.
