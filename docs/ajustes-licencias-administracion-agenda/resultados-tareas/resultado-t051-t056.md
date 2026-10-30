# Resultado — ALA-T051–ALA-T056

Revisión base: estado anterior a este lote; cambios sin commit. Se escribieron primero las pruebas de integración. Usan bases MariaDB migradas, desechables e identificadas como test.

## Archivos y flujo

- `src/usuarios/cupos-usuarios.service.ts`: centraliza el conteo por `negocio_id`, rol, `activo` y ausencia de `inhabilitado_en`. Cuenta usuarios, sin unir sucursales: un Profesional asignado a dos sedes ocupa un lugar. `exigirCupoDisponible` se llama dentro de la transacción después de bloquear el negocio. `cambiarLimites` exige superadmin, valida enteros desde uno, toma la misma barrera, comprueba ambos consumos y guarda los dos límites y su auditoría en un commit. Si uno queda por debajo del consumo o falla auditoría, no cambia ninguno ni desactiva cuentas. `consultar` devuelve límites, activos y disponibles como operación de dominio; las rutas HTTP quedan para T057.
- `src/profesionales/profesionales.service.ts`: el alta comprueba cupo bajo la barrera antes de crear cuenta, perfil, reserva de correo o auditoría. La transición de estado toma esa barrera y solo exige lugar al pasar de inactivo a activo. Desactivar deja de contar por la consulta de usuarios sin borrar el perfil.
- `src/usuarios/usuarios.service.ts`: el alta directa de Recepción usa `READ COMMITTED`, bloquea el negocio y comprueba cupo antes de escribir. Desactivar y reactivar comparten la barrera; reactivar exige un lugar. Las escrituras de usuario, sesiones, reserva y auditoría permanecen transaccionales.
- `test/ala-t051-t056.integration-spec.ts`: comprueba conteo con dos sucursales, otros roles y negocios, cuentas inactivas e inhabilitadas; límites iniciales 5/3; cambio conjunto, valores inválidos, rol indebido, reducción bajo consumo y rollback por fallo de auditoría; altas excedentes sin filas parciales; aislamiento de otro negocio; liberación y recuperación de lugar en ambos roles. Los comentarios explican la barrera y las filas que se comparan.
- `tareas.md`: marca T051–T056 y enlaza esta evidencia.

Flujo: el actor administrativo se identifica desde la base → la transacción bloquea la fila del negocio → el conteo relee usuarios activos del rol en ese negocio → si hay lugar se crea o reactiva la cuenta; si no, responde conflicto y revierte. El superadmin usa la misma barrera para cambiar ambos límites, de modo que una alta no pueda adelantarse entre la comprobación y el guardado. El consumo no se almacena como contador: desactivar libera un lugar al dejar `activo=false`.

## Inventario de invitaciones — T055

La única ruta de activación por código vigente es `POST /acceso-codigo/activar-administrador`, atendida por `src/auth/acceso-codigo.controller.ts` y `src/altas/activaciones.service.ts`; crea exclusivamente el primer `ADMIN_NEGOCIO`, rol que no consume estos dos cupos. `src/usuarios/recepcionistas.controller.ts` documenta que la antigua invitación de recepción se sustituyó por alta directa; sus rutas vigentes son alta completa y reactivación. `src/profesionales/profesionales.controller.ts` también expone alta directa y reactivación, sin activación por invitación. Por ello no hay escritor de invitación aplicable a Profesional o Recepción que integrar en T055; no se añadió una ruta ficticia ni se modificó el consumo de códigos del administrador.

## Pruebas y resultados

| Comando | Resultado |
| --- | --- |
| `npm test -- --runInBand src/usuarios src/profesionales src/negocios` | 7 suites, 32/32 pruebas aprobadas |
| `npm run test:integration -- --runInBand test/ala-t051-t056.integration-spec.ts test/profesionales-t081-t082.integration-spec.ts test/recepcionistas-t76-t81.integration-spec.ts test/recepcionistas-t78-t84.integration-spec.ts` | 4 suites, 23/23 pruebas aprobadas |
| `npm run test:e2e -- --runInBand test/profesionales-t071-t076.e2e-spec.ts test/recepcionistas-t48.e2e-spec.ts` | 2 suites, 24/24 pruebas aprobadas |
| `npm run build` | Correcto |
| `npm run lint` | Correcto |

La prueba inicial falló porque el servicio de cupos aún no existía. En la primera ejecución tras implementarlo, el caso de reservas usaba por error un campo `negocioId` inexistente en `CorreoAcceso`; se corrigió la prueba y se repitió la suite. Las trazas de errores inyectados que muestra la suite HTTP pertenecen a sus casos de rollback; terminó con 24 pruebas aprobadas.

T051–T056 cumplen sus criterios. T057 expondrá las rutas y T058–T060 verificarán carreras explícitas por el último lugar. Este lote no cierra la fase ni habilita producción; M3-I001/M2-I004 siguen diferidas al escritor manual real.
