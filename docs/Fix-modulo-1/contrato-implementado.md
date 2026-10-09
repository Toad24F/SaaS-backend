# Contrato implementado del fix del módulo 1

Estado comprobado el 9 de octubre de 2026. Esta referencia describe las rutas registradas en el backend para RF-01–RF-10 de [spec-fix.md](spec-fix.md). Los antecedentes del módulo 1 siguen en `docs/fase-2-modulo-1/`; sus pruebas no acreditan este fix. [La evidencia por tarea](tareas.md) identifica pruebas nuevas.

## Identidad y catálogo

El token determina el negocio del actor. Un ID de otro negocio se rechaza como recurso no disponible; un Profesional que intenta manejar otro perfil recibe acceso denegado. Las rutas privadas requieren una cuenta, sesión y licencia vigentes.

| Ruta | Acceso | Cuerpo | Respuesta y efecto |
| --- | --- | --- | --- |
| `POST /profesionales` | Administrador | `nombre`, `correo`, `password`, `especialidad` no vacía | **201**, perfil con `id`, `negocioId`, `usuarioId`, `nombre`, `correo`, `especialidad`, `activo`; crea la cuenta completa. |
| `PATCH /profesionales/:id` | Administrador | Campos editables de perfil | **200**, misma vista; obliga a completar `especialidad` si el perfil anterior aún la tiene vacía. |
| `POST /servicios` | Administrador o Profesional | `nombre`, `costo`, `duracionMinutos`, `descripcion?` | **201**, servicio con `descripcion` y `creadorPersonalId`; si lo crea un Profesional, lo selecciona solo para sí mismo y crea combinaciones en sus sucursales asignadas. |
| `PATCH /servicios/:id` | Administrador o Profesional autor | Datos editables del servicio | **200**, servicio actualizado sin transferir la autoría. |
| `POST /servicios/:id/desactivar` o `/reactivar` | Administrador | `{}` | **204**, cambia solo el estado global. |

`GET /servicios` y `GET /servicios/:id` están disponibles para administrador y Profesional del negocio. `DELETE /servicios/:id` sigue reservado al administrador y rechaza bajas con uso o historial.

## Selecciones y atención

| Ruta | Acceso | Cuerpo | Respuesta y efecto |
| --- | --- | --- | --- |
| `GET/PUT /profesionales/:id/servicios` | Administrador o Profesional propio | En `PUT`, `{ "servicioIds": [1, 2] }`; acepta `[]` | **200**, opciones con estado global `activo` e individual `seleccionado`. Desmarcar deja la selección inactiva y conserva preferencias por sucursal; volver a marcar las recupera. |
| `GET/PUT /profesionales/:id/sucursales` | Administrador | En `PUT`, `sucursalIds` únicos; acepta `[]` | **200**, IDs asignados. Una sucursal nueva recibe los servicios generales activos; un retiro permitido borra solo sus combinaciones. Horarios o excepciones impiden el retiro. |
| `GET /profesionales/:id/sucursales/:sucursalId/atencion` | Administrador o Profesional propio | — | **200**: `{ "sucursalId": 1, "activo": true }`; estado individual de la asignación. |
| `PUT /profesionales/:id/sucursales/:sucursalId/atencion` | Administrador o Profesional propio | `{ "activo": false }` con booleano JSON | **200**, misma vista. Pausa o recupera atención sin cambiar sucursal global, cupo, horarios ni preferencias; reactivar valida empalmes. |
| `GET /profesionales/:id/sucursales/:sucursalId/servicios` | Administrador o Profesional propio | — | **200**: `{ "sucursalId": 1, "servicioIds": [1] }`, selección vigente de esa sucursal. |
| `PUT /profesionales/:id/sucursales/:sucursalId/servicios` | Administrador o Profesional propio | `servicioIds` únicos; acepta `[]` | **200**, misma vista. Solo permite servicios del negocio seleccionados en general y deja intactas las otras sucursales. |

Las mutaciones ocurren en transacciones. Un reintento con el mismo estado no agrega auditoría; una operación rechazada no confirma cambios parciales. Los cuerpos inválidos producen **400**, una cuenta o rol sin permiso **403**, un recurso ajeno o no asignado **404**, y un estado u horario incompatible **409**.

## Consulta explicable de oferta

`GET /profesionales/:id/oferta` admite al administrador del negocio y al Profesional dueño del perfil. Devuelve `personalId`, `cuentaActiva` y `sucursales` ordenadas por ID. Cada sucursal asignada contiene `id`, `nombre`, `sucursalActiva`, `atencionActiva` y `servicios` del catálogo del mismo negocio, también ordenados. Cada servicio contiene:

```json
{
  "id": 1,
  "nombre": "Corte",
  "servicioActivo": true,
  "seleccionGeneralActiva": true,
  "seleccionSucursalActiva": false,
  "ofrecido": false,
  "motivosExclusion": ["servicio_no_ofrecido_en_sucursal"]
}
```

La consulta lee seis estados: cuenta, sucursal global, servicio global, selección general del Profesional, atención individual y selección por sucursal. `ofrecido` es verdadero únicamente si los seis están activos. `motivosExclusion` puede contener varios valores: `cuenta_inactiva`, `sucursal_inactiva`, `servicio_inactivo`, `servicio_no_seleccionado`, `atencion_inactiva` y `servicio_no_ofrecido_en_sucursal`. El resultado se calcula al leer y no se guarda como una bandera adicional. Consultar no cambia selecciones ni auditoría.

## Alcance actual

El backend también expone horarios semanales, excepciones, proyección de intervalos y bloqueos temporales para actores autorizados. La consulta de oferta informa **configuración y estados**. El portal público, el cálculo de espacios disponibles, la creación de reservas, WhatsApp y los reportes PDF continúan pendientes. Esta API no promete disponibilidad para una fecha ni confirma una cita.
