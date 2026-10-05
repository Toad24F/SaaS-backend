# Política de eliminación de sucursales, servicios y Profesionales

Esta política implementa D11 y M1-T111. Una baja física solo corresponde a un registro del negocio del administrador autenticado que nunca tuvo uso operativo ni conserva relaciones. La creación técnica y su evento de auditoría no cuentan como historial operativo. Cualquier edición, desactivación, reactivación, asignación, selección u otro evento posterior sí cuenta, aun cuando se haya retirado la relación actual. Ninguna baja borra eventos de auditoría. Ante relaciones o historial, la API responde 409 y propone desactivar; una ID ajena o ausente responde 404.

| Registro | Relaciones que impiden la baja | Historial impeditivo |
| --- | --- | --- |
| Sucursal | `personal_sucursales`, `horarios_personal`, `excepciones_horario`, `bloqueos_horario` por `sucursal_id` | Evento de recurso `sucursal` distinto de `sucursal_creada`, o asignación registrada en las instantáneas de `profesional_sucursales_modificadas` aunque ya se haya retirado. |
| Servicio | `personal_servicios` por `servicio_id` | Evento de recurso `servicio` distinto de `servicio_creado`, o selección registrada en las instantáneas de `profesional_servicios_modificados` aunque ya se haya retirado. |
| Profesional y cuenta | `personal_sucursales`, `personal_servicios`, `horarios_personal`, `excepciones_horario`, `bloqueos_horario` por `personal_id`; sesiones, códigos emitidos o recibidos, bloqueos creados y auditoría donde su cuenta actuó o figura fuera del alta técnica | Evento de recurso `profesional` distinto de `profesional_creado`. |

Para un Profesional elegible se retiran juntos perfil, cuenta y reserva técnica de correo. Su evento `profesional_creado` permanece con el recurso y su instantánea; solo se desvincula la FK `usuario_id` que impediría retirar la cuenta. El evento de eliminación también se conserva sin secretos. Las relaciones no se borran para hacer elegible un registro.

Las operaciones bloquean el registro padre y hacen lecturas actuales con bloqueo sobre sus relaciones antes de eliminar. Las claves foráneas son la última defensa cuando otra conexión crea una relación durante la baja: una de las dos operaciones falla y la transacción revierte también su auditoría. Las futuras tablas de citas deberán incluirse en las comprobaciones antes de habilitar su migración; sus claves foráneas seguirán impidiendo una baja concurrente.
