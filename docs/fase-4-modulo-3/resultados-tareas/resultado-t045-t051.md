# Resultado M3-T045–T051

Fecha: 18 de octubre de 2026. Este lote prepara el protocolo transaccional de los futuros escritores públicos y alinea las mutaciones de cuenta/perfil, licencia, configuración y sucursal que compiten por esos recursos. Todavía no concede apartados ni registra citas.

## Inventario de bloqueos (M3-T045)

Orden común exigido por el plan: **sesión → operación/intento** para una solicitud pública; después **usuarios → negocio → licencia → sucursales → servicios → perfiles → ocupaciones**, con IDs ascendentes dentro de cada clase. Un escritor administrativo no toma las filas de sesión pública. La fila de negocio es la barrera de descubrimiento para cambios colectivos.

| Servicio y métodos que escriben | Orden observado antes del lote | Acción del lote o tarea posterior |
| --- | --- | --- |
| `UsuariosService.crearRecepcionista`, `restablecerContrasenaRecepcionista`, `cambiarAccesoRecepcionista`; `CredencialesService` | Cuenta del actor y/o destino, sin perfil Profesional. | Sin inversión cuenta/perfil en estas rutas; se conservan permisos y revocación. |
| `ProfesionalesService.crear`, `editar`, `cambiarEstado`, `eliminar` | Crear insertaba cuenta antes del perfil; editar, estado y eliminar tomaban **perfil → usuario**, inversión frente al plan. | M3-T049 cambia esas tres rutas a **usuario → perfil** y a `READ COMMITTED`. |
| `LicenciasService.suspender`, `materializarSuspension` (conciliación), `reactivar`, `renovar` | Actor → licencia; faltaba la barrera de negocio antes de la licencia. | M3-T050 descubre el negocio sin bloquear la licencia y luego toma **usuario actor → negocio → licencia**, releyendo bajo `READ COMMITTED`. Todas las transiciones comparten `operar`. |
| `ConfiguracionAgendaService.guardar` | Actor → negocio → configuración, pero la transacción usaba el aislamiento por defecto. | M3-T051 conserva el orden y usa `READ COMMITTED` para releer configuración después de esperar. |
| `SucursalesService.crear`, `editar`, `desactivar`, `eliminar`, `reactivar`, `cambiarLimite` | Actor → negocio → sucursal → perfiles afectados para zona o reactivación. | M3-T051 conserva la barrera y los perfiles ascendentes; las seis escrituras usan `READ COMMITTED`. |
| `ServiciosService.crear`, `editar`, `cambiarEstado`, `eliminar`; `ProfesionalesService.seleccionarServicios`, `cambiarAtencionSucursal`, `seleccionarServiciosSucursal` | Servicio o perfil/selección sin barrera común en todas las rutas. | Inventariados para M3-T052, que coordinará catálogo, costo, duración y selecciones. |
| `ProfesionalesService.asignarSucursales` | Perfil antes de descubrir nuevas asignaciones y sin barrera de negocio. | Inversión colectiva identificada para M3-T053. |
| `HorariosService.guardarSemana`, `guardarExcepcion`, `retirarExcepcion` | Perfil antes de horarios; falta coordinación completa con la barrera y sucursales. | Inventariados para M3-T054. |
| `BloqueosService.crear`, `editar`, `eliminar` | Actor y fila de bloqueo; la coordinación con el perfil común queda incompleta. | Inventariados para M3-T055. |
| `AltasService` y `ActivacionesService` | Altas iniciales bloquean invitación/código y, al activar, licencia antes de negocio. | El portal no está habilitado antes de activar; se documenta la inversión para la verificación global M3-T057. No se cambió el consumo histórico de códigos en este lote. |
| `AvisosVencimientoService.detectar` y `ProcesadorCorreoService.reintentar` | Pueden tomar licencia al decidir un aviso; no cambian suspensión, renovación ni elegibilidad de reserva. | Inventariados para revisar junto con avisos y bloqueo colectivo en M3-T057. |

## Archivos modificados y finalidad

| Archivo | Qué realiza |
| --- | --- |
| `src/reservas-publicas/coordinacion-reserva-publica.service.ts` | Abre transacciones públicas `READ COMMITTED` con hasta tres intentos completos; bloquea sesión y crea/relee operación o intento por clave; adquiere filas de dominio en orden y captura el instante después de esperar. No crea una cita ni un apartado. |
| `src/reservas-publicas/reservas-publicas.module.ts` | Registra y exporta el colaborador para los escritores públicos futuros. |
| `src/comun/transaccion-identidad.ts` | Permite seleccionar `READ COMMITTED` en los escritores administrativos coordinados sin cambiar el aislamiento por defecto de otras llamadas. Conserva rollback y reintentos históricos. |
| `src/profesionales/profesionales.service.ts` | Edición, activación/desactivación y eliminación bloquean la cuenta Profesional antes del perfil y reevalúan en `READ COMMITTED`; mantienen 404 uniforme para IDs ajenos, validaciones, revocación y auditoría. |
| `src/licencias/licencias.service.ts` | Las cuatro transiciones comparten el orden actor, negocio, licencia; la licencia se relee después de la barrera. Conserva tiempo remanente, idempotencia y auditoría existentes. |
| `src/licencias/licencias.service.spec.ts` | Actualiza el doble de transacción para el nuevo orden y lo comprueba explícitamente durante la renovación. |
| `src/disponibilidad/configuracion-agenda.service.ts` | Sustituye el aislamiento por `READ COMMITTED` en el reemplazo atómico de reglas después de bloquear el negocio. |
| `src/sucursales/sucursales.service.ts` | Aplica `READ COMMITTED` a altas, edición de zona, desactivación, eliminación, reactivación y límite sin cambiar su barrera negocio → sucursal → perfiles. |
| `src/reservas-publicas/coordinacion-reserva-publica.service.spec.ts` | Prueba reintento completo con clave estable, máximo de tres intentos, `READ COMMITTED`, 503 técnico y ausencia de reintento funcional. |
| `test/fase-4-t045-t051.integration-spec.ts` | Prueba rollback real, convergencia por clave, aislamiento, orden de recursos, instante posterior a bloqueos y esperas de mutaciones administrativas. |
| `docs/fase-4-modulo-3/tareas.md` | Marca M3-T045–T051 tras completar las verificaciones. |
| `docs/fase-4-modulo-3/resultados-tareas/resultado-t045-t051.md` | Conserva este inventario, flujo y resultados de prueba. |

## Flujo preparado

1. El escritor futuro conservará su clave de operación o intento antes de llamar a `transaccion`. Cada intento usa un manager nuevo de `READ COMMITTED`; TypeORM revierte todo al fallar. Un deadlock, espera agotada o conflicto de vista repite como máximo tres veces. Si persiste, el colaborador devuelve 503 y no declara ocupado el horario.
2. Dentro del manager se bloquea la fila de sesión del negocio y titular. Al buscar o crear una operación o intento se vuelve a tomar esa fila y después la fila de la clave. Su unicidad durable hace que dos peticiones del mismo navegador converjan a la misma identidad; una clave con selección o apartado incompatible produce 409.
3. Para escribir ocupaciones se bloquean cuentas de usuarios y luego negocio, licencia, sucursales, servicios, perfiles y ocupaciones, todos por negocio y con IDs ascendentes. Un recurso ajeno se rechaza uniformemente. El instante se toma tras la última espera para que el escritor posterior pueda releer disponibilidad con ese tiempo y manager.
4. Las transiciones administrativas alineadas compiten por las mismas filas. Renovación y suspensión esperan la barrera de negocio antes de poseer la licencia; cambios de cuenta Profesional toman usuario antes de perfil; configuración y sucursal releen tras la espera. Los escritores reales de apartados y citas se conectarán en tareas posteriores.

## Pruebas

Las pruebas se escribieron primero y fallaron inicialmente porque el colaborador no existía. Una aserción adicional detectó la inversión real de licencia: la transición retenía su fila antes de esperar la barrera. Después de alinearla, `FOR UPDATE NOWAIT` pudo tomar la licencia mientras la transición esperaba al negocio. La prueba del perfil comprueba análogamente que una mutación bloqueada en la cuenta todavía no retiene el perfil.

El caso transaccional fuerza un deadlock simulado después de insertar la operación: la primera inserción se revierte y el reintento con la misma clave deja una sola fila. Dos intentos concurrentes con igual sesión y clave devuelven el mismo ID. También se comprueban rechazo de usuario de otro negocio, orden de los `FOR UPDATE`, IDs ascendentes, instante del reloj inyectado y esperas de suspensión, reactivación, renovación, conciliación, configuración, cambio de zona y desactivación de sucursal. La prueba unitaria exige 503 tras tres fallos técnicos y una sola ejecución para el error funcional.

La primera e2e completa detectó una regresión 404 → 409 al consultar un Profesional ajeno después de invertir el orden cuenta/perfil. Añadí ese caso a la integración, mantuve el 404 uniforme y repetí las tres suites e2e afectadas: 3 suites y 9 pruebas aprobadas. Las suites completas finales se ejecutaron con esta corrección.

| Comando | Resultado |
| --- | --- |
| `npm test -- --runInBand coordinacion-reserva-publica.service.spec.ts` | 1 suite, 2 pruebas aprobadas. |
| `npm run test:integration -- --runInBand fase-4-t045-t051` | 1 suite, 2 pruebas aprobadas. |
| `npm test -- --runInBand licencias.service.spec.ts coordinacion-reserva-publica.service.spec.ts` | 4 suites, 13 pruebas aprobadas. |
| `npm run test:e2e -- --runInBand seguridad-t131-t132 sucursales-t065 bajas-t111-t115` | 3 suites, 9 pruebas aprobadas tras corregir el 404. |
| `npm run build` | Aprobado. |
| `npm run lint` | Aprobado. |
| `npm test -- --runInBand` | 69 suites, 343 pruebas aprobadas. |
| `npm run test:integration -- --runInBand` | 66 suites, 282 pruebas aprobadas. |
| `npm run test:e2e -- --runInBand` | 28 suites, 147 pruebas aprobadas. |

La revisión de coordinación total M3-T057 sigue pendiente hasta conectar las rutas T052–T055 y los escritores reales. Este lote prepara su protocolo sin afirmar que una reserva ya sea atómica de extremo a extremo.
