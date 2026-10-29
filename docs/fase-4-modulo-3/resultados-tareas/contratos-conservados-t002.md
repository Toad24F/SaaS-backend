# M3-T002 — Contratos que se conservan

Fuente: [spec](../spec.md), [plan](../plan.md), controlador privado `src/disponibilidad/disponibilidad.controller.ts` y sus validadores. La demo del frontend no constituye una consulta pública implementada.

| Ruta privada | Permiso y efecto actual |
| --- | --- |
| `GET /disponibilidad/configuracion` | JWT, Administrador del negocio; lee configuración. |
| `PUT /disponibilidad/configuracion` | JWT, Administrador del negocio; reemplaza conjunto completo. |
| `GET /disponibilidad` | JWT, Administrador/Recepción/Profesional; este último solo su perfil; consulta sin escribir. |
| `POST /disponibilidad/validar` | Mismos roles y alcance de perfil; valida un inicio, sin crear ocupación. |
| `GET /disponibilidad/citas-afectadas` | Mismos roles, negocio y alcance propio del Profesional; lee causas sin mutar citas. |

El motor limita cada consulta a **31 fechas inclusivas**, usa zona IANA de sucursal y duración completa, y distingue modalidad pública de manual. La modalidad manual sigue siendo privada y omite únicamente compactación, intervalo, anticipación y horizonte. Citas no canceladas y apartados no liberados antes de `expira_en` ocupan al Profesional entre sucursales. La consulta no reserva: los escritores futuros deben bloquear el perfil común y revalidar tras la espera.

La cita pública futura empezará en **`pendiente`** y conservará inicio, fin y zona originales. Este lote no registra rutas públicas capaces de crear apartados o citas. El flujo previsto separa resolución del negocio, selección y disponibilidad, apartado propio, formulario, escritura atómica y recuperación del resultado; la autenticación interna no se reutiliza como identidad de visitante.
