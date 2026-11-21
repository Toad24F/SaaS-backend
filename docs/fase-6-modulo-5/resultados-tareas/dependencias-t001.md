# M5-T001 — Dependencias y contratos vigentes

La [constitución](../constitucion-modulo-5.md) y la [especificación del módulo 5](../spec.md) rigen el alcance nuevo. El [plan](../plan.md) define la arquitectura prevista y [las tareas](../tareas.md) fijan el orden y los criterios. Aplicar la precedencia de las [reglas transversales](../../reglas.md) y conservar los contratos compatibles de los módulos anteriores.

| Fuente vigente | Contrato que debe conservarse |
| --- | --- |
| [Ajustes de licencias y agenda](../../ajustes-licencias-administracion-agenda/spec.md) | Licencia y permisos verificados en servidor, suspensión con plazo de 0 a 30 días, incluidos límites exactos para sesiones abiertas. El cupo telefónico se comparte entre altas nuevas de ambos orígenes por teléfono normalizado y sucursal. |
| [Motor de disponibilidad](../../fase-3-modulo-2/spec-modulo-2.md) y [contrato de escritores](../../fase-3-modulo-2/resultados-tareas/contrato-escritores-t078-t079.md) | Mantener las cinco rutas privadas y el motor común. Escribir bajo `READ COMMITTED`, respetar el orden de bloqueos y releer después de esperar la fila común del Profesional para proteger intervalos entre sedes. Conservar la duración y separación histórica aplicables, la zona IANA y las comparaciones UTC. La modalidad manual conserva sus reglas vigentes. |
| [Portal público](../../fase-4-modulo-3/spec.md) | Resolver el negocio por slug y mantener sesión anónima, origen/CSRF, apartado de cinco minutos y recuperación idempotente propia aunque cambie la licencia. El alta pública sigue naciendo Pendiente. La política temporal del módulo 5 solo se aplica conforme a sus condiciones y generaciones, sin plazos ni mensajes retroactivos para citas heredadas. |
| [Gestión operativa](../../fase-5-modulo-4/spec.md) y [evidencia final](../../fase-5-modulo-4/resultados-tareas/m4-t116-t124.md) | Reutilizar escritores, versiones, intentos, eventos, estados y snapshots. La agenda privada conserva el periodo completo autorizado hasta 42 fechas y exige acotar por encima de 1.000 citas filtradas. La reactivación queda fuera del cupo de altas nuevas. El módulo 5 amplía gestión propia del Profesional y precisa los efectos de reprogramar Pendiente y reactivar Cancelada. Identidad, automatización y retiro del folio entran por etapas y se preservan IDs e intentos. |

## Pendientes y antecedentes

- [Lista del módulo 4](../../fase-5-modulo-4/tareas.md) y [evidencia de carreras](../../fase-5-modulo-4/resultados-tareas/m4-t104-t115.md). M4-T116–M4-T124 constan con evidencia final. La integración del módulo 4 acreditó ALA-I001–ALA-I003 con escritores reales, incluida la disputa por el último cupo y la separación entre sedes. Las [casillas de ajustes](../../ajustes-licencias-administracion-agenda/tareas.md) reflejan ese estado.
- [Lista del módulo 2](../../fase-3-modulo-2/tareas.md) y [lista del módulo 3](../../fase-4-modulo-3/tareas.md). M2-I001–M2-I009 siguen con casillas abiertas en su lista original. Hay evidencia de carreras públicas en el módulo 3 y un anexo del módulo 4 para M2-I004 y M3-I001, cuyas casillas históricas siguen abiertas. M3-T136 también sigue pendiente. Los resultados previos orientan la regresión y conservan su alcance original.

## Flujo y restricciones

La entrada pública conserva su autorización por sesión y la privada por actor, negocio y rol. Los escritores pasan por las barreras de negocio y recursos del motor antes de modificar ocupaciones. Los cambios nuevos deberán preservar atomicidad, recuperación de intentos y snapshots históricos. Para automatización, la cita y los trabajos se confirmarían en la misma transacción y el transporte se ejecutaría después del commit. Para reportes, el backend produciría un corte consistente y el navegador prepararía todas las filas del mismo corte para imprimir.

Esta preparación usa únicamente esquemas desechables, datos sintéticos y evidencia propia. Se excluyen cuentas de cliente, pagos, fusión automática, confirmación desde el portal y generación de PDF en backend. La aceptación real de WhatsApp depende de los recursos externos descritos en la [nota de proveedor](proveedor-whatsapp-t006.md).
