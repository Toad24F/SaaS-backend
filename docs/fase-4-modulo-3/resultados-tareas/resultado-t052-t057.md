# Resultado M3-T052–T057

Fecha: 18 de octubre de 2026. El lote coordina las mutaciones operativas que compiten con la revalidación del futuro escritor público. Los escritores reales de apartados y citas siguen sin conectarse; la habilitación externa permanece cerrada.

## Archivos y finalidad

| Archivo | Qué hace |
| --- | --- |
| `src/comun/bloqueos-coordinados.ts` | Añade la barrera transaccional por negocio y el bloqueo de sucursales, servicios y perfiles en orden ascendente, verificando pertenencia. |
| `src/servicios/servicios.service.ts` | Las altas, ediciones de costo/duración, cambios de estado y bajas cruzan la barrera antes de tocar catálogo; se releen en `READ COMMITTED`. |
| `src/profesionales/profesionales.service.ts` | El alta de perfil, las asignaciones, la atención por sucursal y ambas selecciones de servicios usan la barrera. Las selecciones toman sucursales y servicios antes del perfil. |
| `src/horarios/horarios.service.ts` | Semana y excepciones descubren sucursales asignadas tras la barrera, bloquean sedes antes del perfil y validan/escriben en `READ COMMITTED`. |
| `src/bloqueos/bloqueos.service.ts` | Creación, edición y retiro de bloqueos descubren los alcances individual y colectivo tras la barrera; bloquean sedes y perfiles antes de la fila del bloqueo. |
| `test/fase-4-t052-t057.integration-spec.ts` | Usa dos conexiones reales para comprobar espera en negocio y que la mutación no retiene servicio, perfil o bloqueo antes de cruzar la barrera. |
| `docs/fase-4-modulo-3/tareas.md` | Marca M3-T052–T057 como terminadas. |
| `docs/fase-4-modulo-3/resultados-tareas/resultado-t052-t057.md` | Registra el flujo, la matriz de coordinación y las verificaciones de este lote. |

## Flujo de escritura

1. La entrada valida su formato y el actor autenticado. La transacción de escritura usa `READ COMMITTED` y toma primero la cuenta del actor cuando el servicio la consulta.
2. La fila del negocio es la barrera de descubrimiento. Una mutación que esperaba esa fila lee asignaciones, catálogo y alcances **después** de obtenerla, con lo que ve los cambios ya confirmados. El alta de un Profesional también cruza la barrera antes de insertar su perfil.
3. Dentro del negocio, las sucursales se bloquean por ID ascendente, seguidas de los servicios y perfiles necesarios. La selección de servicios conserva la comprobación de pertenencia, estado activo y permisos. Los horarios conservan su validación de recurrencias y sustitución atómica. Las filas de bloqueos se toman después de todos los perfiles afectados.
4. Para un bloqueo colectivo se descubren todos los perfiles del negocio bajo la barrera. Una edición reúne los alcances anterior y nuevo antes de bloquear; una asignación nueva espera la misma barrera. El borrado vuelve a verificar alcance y elimina solo la PK autorizada.
5. El escritor público preparado por M3-T047 tomará estas mismas filas y releerá la oferta y disponibilidad dentro de su transacción. La consulta pública por sí sola no reserva. La integración completa se verificará cuando existan los escritores reales.

## Matriz de coordinación del inventario M3-T045

| Escritor | Coordinación comprobada o límite |
| --- | --- |
| `CoordinacionReservaPublicaService` | Sesión y operación/intento; luego usuarios, negocio, licencia, sucursales, servicios, perfiles y ocupaciones por IDs ascendentes. Contrato preparado; sin escritura real de reserva. |
| `UsuariosService` y `CredencialesService` | Cuenta del actor y destino, sin perfil Profesional; conservan revocación y permisos. |
| `ProfesionalesService.crear/editar/cambiarEstado/eliminar` | Alta: actor → negocio → cuenta nueva → perfil nuevo; edición/estado/baja: usuario destino → perfil. La nueva alta espera un bloqueo colectivo del negocio. |
| `LicenciasService` | Actor → negocio → licencia; relectura tras esperar, cubierta en M3-T050. |
| `ConfiguracionAgendaService` y `SucursalesService` | Actor → negocio → sucursales → perfiles afectados cuando procede, cubierto en M3-T051. |
| `ServiciosService` | Actor → negocio → servicio existente; el alta de autor Profesional toma su perfil bajo la barrera. |
| `ProfesionalesService.asignarSucursales` | Actor → negocio → sedes antiguas y nuevas → perfil → relaciones; las altas de asignación no escapan a un cambio colectivo. |
| `ProfesionalesService.seleccionarServicios/cambiarAtencionSucursal/seleccionarServiciosSucursal` | Actor → negocio → sedes → servicios solicitados → perfil → selecciones, según la ruta. |
| `HorariosService.guardarSemana/guardarExcepcion/retirarExcepcion` | Negocio → sedes asignadas → perfil → franjas/excepciones. No utiliza una prelectura anterior a la barrera. |
| `BloqueosService.crear/editar/eliminar` | Actor → negocio → sedes afectadas → perfiles afectados → bloqueo. Los alcances colectivos incluyen todos los perfiles existentes. |
| `AltasService`, `ActivacionesService`, avisos y correo | Flujo histórico de alta/avisos, sin escritor de ocupación ni oferta operativa de un negocio ya habilitado. La inversión histórica de activación licencia/negocio del inventario previo sigue registrada; no se presenta como integración del escritor público. |

## Pruebas y resultado

La prueba de dos conexiones se escribió antes de cambiar los servicios. Falló inicialmente con `Lock wait timeout exceeded`: la edición conservaba la fila de servicio mientras esperaba el negocio. Tras la corrección, `FOR UPDATE NOWAIT` de la segunda conexión pudo obtener las filas de servicio, perfil y bloqueo reteniendo el negocio en la primera. Se ejercitaron edición/estado de catálogo, asignación, selección general y por sucursal, atención, semana, alta y retirada de excepción, edición y borrado de bloqueo, y alta colectiva.

| Comando | Resultado |
| --- | --- |
| `npm run test:integration -- --runInBand fase-4-t052-t057` | 1 suite, 1 prueba aprobada; primero falló según lo previsto en rojo. |
| `npm run build` | Aprobado. |
| `npm run lint` | Aprobado. |
| `npm test -- --runInBand` | 69 suites, 343 pruebas aprobadas. |
| `npm run test:integration -- --runInBand` | 67 suites, 283 pruebas aprobadas. |
| `npm run test:e2e -- --runInBand` | 28 suites, 147 pruebas aprobadas. |

La prueba de espera demuestra el orden y la relectura en las rutas ejercitadas, pero no acredita concesión ni confirmación de apartados/citas. La habilitación externa se mantiene cerrada hasta probar esos escritores reales con los criterios diferidos del módulo 2.
