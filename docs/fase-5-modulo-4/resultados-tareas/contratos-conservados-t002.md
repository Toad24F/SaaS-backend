# M4-T002 — Contratos conservados y recorrido previsto

Revisión de fuentes: 2026-11-08. Este inventario identifica contratos existentes; no acredita rutas ni escritor del módulo 4. Estado de aceptación funcional: **Pendiente**.

## Autoridad y precedencia

La [constitución](../constitucion-modulo-4.md), [spec](../spec.md) y [plan](../plan.md) M4 gobiernan el panel. Los [ajustes aprobados](../../ajustes-licencias-administracion-agenda/spec.md) prevalecen frente a antecedentes incompatibles. En particular, la mención histórica de 48 horas en el [contrato de escritores](../../fase-3-modulo-2/resultados-tareas/contrato-escritores-t078-t079.md) se interpreta con plazo configurable **0–30** días enteros y dos por defecto; el acceso termina en el primero entre bloqueo programado y vencimiento natural.

## Identidad, roles y licencia

- [AutorizacionService](../../../src/auth/services/autorizacion.service.ts) centraliza la matriz cerrada de permisos y comprueba pertenencia/propiedad del actor recibido. Cada caso M4 deberá reconstruir además sesión, usuario activo, rol, licencia y pertenencia actual; JWT e IDs del cuerpo no bastan.
- Administrador (`admin_negocio`) y Recepción (`recepcionista`) gestionarán citas/clientes propios. Profesional (`profesional`) leerá solo sus citas, con contacto y notas, sin gestionar citas ni acceder al directorio. Superadmin no hereda permisos operativos. Son obligaciones M4 que aún necesitan M4-T020–M4-T023.
- [LicenciasService](../../../src/licencias/licencias.service.ts) y [entidad Licencia](../../../src/licencias/entities/licencia.entity.ts) conservan plazos, vencimiento, suspensión y tiempo restante. Probar sesiones ya abiertas y límites exactos; no asumir un plazo fijo universal.

## Cinco rutas privadas que se conservan

Fuente: [DisponibilidadController](../../../src/disponibilidad/disponibilidad.controller.ts).

| Ruta | Contrato conservado |
| --- | --- |
| `GET /disponibilidad/configuracion` | Solo Administrador. |
| `PUT /disponibilidad/configuracion` | Solo Administrador; reemplazo completo validado y atómico. |
| `GET /disponibilidad` | Administrador/Recepción/Profesional con alcance autorizado. |
| `POST /disponibilidad/validar` | Validación puntual, HTTP 200 para negativa funcional; no escribe reservas. |
| `GET /disponibilidad/citas-afectadas` | Causas actuales sin mutar ni cancelar citas. |

La modalidad `publica` de una ruta privada significa reglas de cálculo y no acceso anónimo. El portal mantiene su [controlador público](../../../src/reservas-publicas/portal-publico.controller.ts), cookie/sesión propia y negocio resuelto por slug. M4 no debe simular una sesión administrativa para él.

## Motor, separación y cupo

- [MotorDisponibilidadService](../../../src/disponibilidad/motor-disponibilidad.service.ts): `revalidarEnTransaccion` trabaja con el mismo manager y una transacción activa. El cálculo no adquiere por sí solo toda la exclusión ni confirma la reserva.
- Modalidad `manual`: omite estrategia pública, anticipación y horizonte; mantiene acceso, licencia, oferta efectiva activa, duración, separación, franjas continuas, bloqueos, ocupaciones entre sucursales e inicios no pasados. No duplicar el motor en frontend.
- Toda cita no cancelada (incluida Pendiente y No asistió) conserva su intervalo protegido. Un apartado ocupa hasta justo antes de expirar o hasta liberarse. Extremos protegidos contiguos se permiten. Conservar inicio, fin de atención, separación, fin protegido y zona históricos.
- [CupoTelefonicoService](../../../src/reservas-publicas/cupo-telefonico.service.ts): cuenta en transacción citas con `inicioUtc > ahora`, no canceladas, por negocio, sucursal y teléfono normalizado; máximo dos compartidas por todos los profesionales/servicios. No cuenta apartados, pasadas o ya iniciadas. Otra sucursal conserva cupo propio. Teléfono compartido no identifica ni fusiona fichas. El alta manual debe integrarlo; reactivar no impone este cupo.

## Flujo conservado y colaboración futura

1. Resolver actor, negocio y clave del intento en servidor. El [escritor público](../../../src/reservas-publicas/registro-reserva-publica.service.ts) conserva su identidad pública y sus resultados idempotentes.
2. Abrir `READ COMMITTED`. En público, bloquear primero sesión y operación/intento; en manual, usuario/actor e intento antes de dominio. No adquirir usuarios después del perfil.
3. Tomar negocio como barrera común del cupo y cambios colectivos; continuar licencia, sucursal, servicio y fila común `personal` del Profesional; ordenar IDs ascendentes dentro de cada clase y después las ocupaciones. Ver [coordinación pública](../../../src/reservas-publicas/coordinacion-reserva-publica.service.ts) y [bloqueos comunes](../../../src/comun/bloqueos-coordinados.ts).
4. Tras esperar, releer usando el mismo manager y capturar reloj vigente: licencia, oferta, costo, duración, separación, configuración, horario, bloqueos, ocupaciones y cupo. Una lectura previa no garantiza registro.
5. En el futuro escritor manual, guardar cliente nuevo si procede, cita Confirmada, snapshot, evento e intento registrado en un commit. El escritor público sigue creando Pendiente; su falta de confirmación no libera ocupación automáticamente.
6. Si se pierde respuesta, resolver la misma clave bajo exclusión; devolver mismo folio o ausencia terminal durable, o 503 si sigue incierto. Nunca inferir fracaso por una lectura simple sin fila. Rollback no renueva apartados ni deja datos parciales.

## Frontera de evidencia

M4-T006 demuestra solo que dos conexiones reales esperan y continúan sobre el bloqueo común del Profesional y que se limpian ante fallo. M4-T051 en adelante debe probar los escritores reales. M2-I004/M3-I001 y ALA-I001–ALA-I003 continúan pendientes, al igual que M3-T136. El [informe del lote](m4-t001-t006.md) registra la evidencia nueva; los resultados históricos no sustituyen estas integraciones.
