# Matriz RF → prueba → resultado

Fecha de verificación: 2026-09-23. Fuentes vigentes: [Constitución](Constitución.md),
[especificación](../spec/spec-auth.md) y [plan](plan.md).

`Aprobado` significa que las suites indicadas pasaron. `Parcial` identifica
explícitamente la parte implementada y la integración externa pendiente; no se
usa evidencia histórica para atribuir cobertura nueva.

| RF | Pruebas concretas | Resultado |
|---|---|---|
| RF-01 | `altas-negocio.integration-spec.ts`; `negocios-t47.e2e-spec.ts` | Aprobado: alta exclusiva del superadmin con identidad requerida. |
| RF-02 | `altas-negocio.integration-spec.ts`; `recorridos-t51-t58-t60.e2e-spec.ts` | Aprobado: negocio, admin pendiente, licencia anual y código se crean juntos. |
| RF-03 | `altas-t74.integration-spec.ts`; `negocios-t47.e2e-spec.ts` | Aprobado: slug/correo normalizados duplicados aceptan como máximo un alta y no dejan parciales. |
| RF-04 | `autorizacion.service.spec.ts`; `seguridad-t72-t73-t75.e2e-spec.ts` | Aprobado: roles de negocio no crean negocios ni administran licencias. |
| RF-05 | `auth-dominio-t26-t30.integration-spec.ts`; `recepcionistas-t48.e2e-spec.ts` | Aprobado: administración completa limitada al negocio propio. |
| RF-06 | `recorridos-t51-t58-t60.e2e-spec.ts`; `seguridad-t72-t73-t75.e2e-spec.ts` | Aprobado: recursos ajenos responden 404/denegación sin mutaciones. |
| RF-07 | `autorizacion.service.spec.ts`; `recepcionistas-t48.e2e-spec.ts` | Aprobado: recepción no obtiene operaciones administrativas. |
| RF-08 | `activaciones.integration-spec.ts`; `auth-t46.e2e-spec.ts` | Aprobado: código inicial válido establece nombre/contraseña de la cuenta prevista. |
| RF-09 | `activaciones.integration-spec.ts`; `recorridos-t51-t58-t60.e2e-spec.ts` | Aprobado: activación inicia el año y consume el código atómicamente. |
| RF-10 | `auth-t46.e2e-spec.ts`; `codigos-auditoria.integration-spec.ts` | Aprobado: códigos incorrectos, vencidos, usados o reemplazados no activan. |
| RF-11 | `concurrencia-t52-t57.integration-spec.ts` | Aprobado: activaciones concurrentes consumen el código una sola vez. |
| RF-12 | `auth-dominio-t26-t30.integration-spec.ts`; `recepcionistas-t48.e2e-spec.ts` | Aprobado: reemisión invalida el anterior, conserva el destino y concede 48 horas. |
| RF-13 | `recepcionistas-t76-t81.integration-spec.ts`; `recepcionistas-t48.e2e-spec.ts` | Aprobado: alta directa completa, rol/tenant del servidor, hash y ausencia de código. |
| RF-14 | `activaciones.integration-spec.ts`; `seguridad-t72-t73-t75.e2e-spec.ts` | Aprobado: suspensión bloquea activación y gestión autenticada. |
| RF-15 | `auth.service.spec.ts`; `auth-t45.e2e-spec.ts` | Aprobado: login exige cuenta/negocio/licencia vigentes y emite sesión del rol actual. |
| RF-16 | `auth.service.spec.ts`; `auth-t45.e2e-spec.ts` | Aprobado: credenciales y estados inválidos usan rechazo uniforme. |
| RF-17 | `auth-dominio-t26-t30.integration-spec.ts`; `seguridad-t72-t73-t75.e2e-spec.ts` | Aprobado: cinco intentos conjuntos por IP, sexto bloqueado y concurrencia serializada. |
| RF-18 | `auth-t45.e2e-spec.ts`; `auth-flujos.spec.ts` | Aprobado: logout revoca la sesión presentada y evita reutilizarla. |
| RF-19 | `jwt.strategy.spec.ts`; `seguridad-t72-t73-t75.e2e-spec.ts` | Aprobado: cada solicitud consulta sesión, cuenta y licencia actuales. |
| RF-20 | `auth-dominio-t26-t30.integration-spec.ts`; `auth-t45.e2e-spec.ts`; `seguridad-t72-t73-t75.e2e-spec.ts` | Aprobado: límite exacto de 12 horas; una operación ya autorizada confirma o revierte atómicamente. |
| RF-21 | `politica-contrasenas.service.spec.ts`; `credenciales-t49.e2e-spec.ts` | Aprobado: cambio exige clave actual y nueva válida. |
| RF-22 | `cuentas-licencias-t38-t44.integration-spec.ts`; `credenciales-t49.e2e-spec.ts` | Aprobado: solo superadmin autoriza recuperación de administradores. |
| RF-23 | `codigos-auditoria.integration-spec.ts`; `credenciales-t49.e2e-spec.ts` | Aprobado: recuperación dura 30 minutos, pertenece a una cuenta y reemplaza códigos previos. |
| RF-24 | `cuentas-licencias-t38-t44.integration-spec.ts`; `auth-t46.e2e-spec.ts` | Aprobado: consumo cambia hash, consume código y revoca sesiones. |
| RF-25 | `cuentas-licencias-t38-t44.integration-spec.ts`; `credenciales-t49.e2e-spec.ts` | Aprobado: cambiar contraseña revoca todas las sesiones. |
| RF-26 | `cuentas-licencias-t38-t44.integration-spec.ts`; `seguridad-t72-t73-t75.e2e-spec.ts` | Aprobado: recuperación conserva cuenta inactiva y bloqueos de licencia. |
| RF-27 | `politica-contrasenas.service.spec.ts`; `recepcionistas-t48.e2e-spec.ts` | Aprobado: política común de 12 caracteres y máximo bcrypt en todos los flujos. |
| RF-28 | `calendario-licencias.service.spec.ts`; `activaciones.integration-spec.ts` | Aprobado: año calendario en Chihuahua, incluido 29 de febrero. |
| RF-29 | `politica-acceso-licencia.service.spec.ts`; `recorridos-t51-t58-t60.e2e-spec.ts` | **Parcial:** acceso autenticado se bloquea al vencimiento exacto. Pendiente integrar y probar confirmación transaccional de reservas reales. |
| RF-30 | `licencias-t50.e2e-spec.ts`; `seguridad-t72-t73-t75.e2e-spec.ts` | Aprobado: bloqueo conserva datos y permite gestión del superadmin. |
| RF-31 | `calendario-licencias.service.spec.ts`; `cuentas-licencias-t38-t44.integration-spec.ts`; `licencias-t50.e2e-spec.ts` | Aprobado: renovaciones vigentes, tardías y acumulativas suman años sin pérdida. |
| RF-32 | `cuentas-licencias-t38-t44.integration-spec.ts`; `licencias-t50.e2e-spec.ts` | Aprobado: renovar suspendida conserva suspensión y amplía tiempo congelado. |
| RF-33 | `politica-acceso-licencia.service.spec.ts`; `seguridad-t72-t73-t75.e2e-spec.ts` | **Parcial:** suspensión bloquea usuarios y la política rechaza nuevas reservas. Pendiente integrar y probar el endpoint real de confirmación de reservas. |
| RF-34 | `cuentas-licencias-t38-t44.integration-spec.ts`; `licencias-t50.e2e-spec.ts` | Aprobado: reactivación exige demás estados válidos y devuelve tiempo restante. |
| RF-35 | `codigos-auditoria.integration-spec.ts`; `concurrencia-t52-t57.integration-spec.ts`; `recepcionistas-t78-t84.integration-spec.ts` | Aprobado: actor/destino/cambios sin secretos, un evento real y rollback conjunto. |
| RF-36 | `cuentas-licencias-t38-t44.integration-spec.ts`; `recorridos-t51-t58-t60.e2e-spec.ts` | Aprobado: suspensión congela exactamente el tiempo restante. |
| RF-37 | `cuentas-licencias-t38-t44.integration-spec.ts`; `licencias-t50.e2e-spec.ts` | Aprobado: reactivación proyecta el vencimiento con tiempo y renovaciones conservados. |
| RF-38 | `concurrencia-t52-t57.integration-spec.ts`; `licencias-t50.e2e-spec.ts` | Aprobado: transiciones repetidas/concurrentes son idempotentes y serializables. |
| RF-39 | `recepcionistas-t76-t81.integration-spec.ts`; `recepcionistas-t48.e2e-spec.ts` | Aprobado: reactivación propia conserva identidad, credenciales y activación. |
| RF-40 | `modelo-recepcionistas.integration-spec.ts`; `recepcionistas-t78-t84.integration-spec.ts` | Aprobado: alta y auditoría confirman/revierten juntas; recepción nunca queda pendiente. |
| RF-41 | `recepcionistas-t76-t81.integration-spec.ts`; `recepcionistas-t48.e2e-spec.ts` | Aprobado: desactivar revoca sesiones; reactivar no las restaura. |
| RF-42 | `recepcionistas-t78-t84.integration-spec.ts`; `recepcionistas-t48.e2e-spec.ts` | Aprobado: transiciones concurrentes se serializan, auditan una vez y revierten juntas. |
| RF-43 | `recepcionistas-t76-t81.integration-spec.ts`; `recepcionistas-t78-t84.integration-spec.ts` | Aprobado: restablecimiento propio cambia hash y revoca sesiones en una transacción. |
| RF-44 | `recepcionistas-t76-t81.integration-spec.ts`; `recepcionistas-t48.e2e-spec.ts` | Aprobado: restablecimiento conserva identidad, pertenencia, activación y estado. |

## Resultado global

- RF-01–RF-28, RF-30–RF-32 y RF-34–RF-44: evidencia aprobada.
- RF-29 y RF-33: política y bloqueo autenticado aprobados; confirmación de
  reservas reales pendiente hasta que exista ese módulo.
- No se implementaron reservas, pagos, pantallas ni envío automático de códigos.
