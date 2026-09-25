# Resultados T80 — modelo de recepción sin activación pendiente

Fecha: 2026-09-15.

T80 retira el propósito `activacion_recepcionista` del modelo de instalación nueva. Solo el primer administrador puede reservar correo sin nombre, hash ni activación; recepción y superadmin deben tener los tres campos completos. La invitación y la activación pública de recepción se retiran mientras T81 y T83 incorporan el alta directa.

## Trabajo por archivo

| Archivo | Cambio y finalidad; pruebas realizadas |
|---|---|
| `src/database/modelo-recepcionistas.spec.ts` (nuevo) | Comprueba que entidad, migraciones y SQL comparten los dos propósitos vigentes y restringen el estado pendiente al administrador. Se ejecutó primero y falló en sus dos casos antes de cambiar producción; pasó en la suite unitaria final. |
| `test/modelo-recepcionistas.integration-spec.ts` (nuevo) | Aplica las migraciones en una base MariaDB desechable y prueba administrador pendiente, recepción completa, rechazo de recepción sin credenciales, superadmin pendiente y propósito retirado. Pasó en la integración completa. |
| `test/invitaciones-recepcionistas.integration-spec.ts` (retirado) | Sus tres pruebas exigían la invitación y el código que T80 elimina. La prueba nueva verifica la restricción del modelo en su lugar; no se excluyeron suites con `skip`. |
| `src/usuarios/entities/usuario.entity.ts`, `src/database/migrations/1760000000000-CrearNegociosUsuarios.ts`, `db/schema.sql` (modificados) | El `CHECK` permite campos nulos solo con rol `admin_negocio` y activación pendiente. Se verificó la metadata con la prueba unitaria y la restricción real con integración MariaDB. El SQL de referencia queda coherente con la migración. |
| `src/codigos/entities/codigo-acceso.entity.ts`, `src/database/migrations/1760000002000-CrearCodigosSesiones.ts` (modificados) | Enum y columna SQL admiten únicamente `activacion_admin` y `recuperacion`. Pruebas unitarias verifican el enum y la sincronía documental; integración rechaza el propósito anterior incluso con FKs y hash válidos. |
| `src/altas/altas.service.ts`, `src/altas/activaciones.service.ts`, `src/auth/acceso-codigo.controller.ts` (modificados) | Eliminan la invitación que persistía recepción pendiente y su activación por código. Se conservaron alta y activación del administrador; integración T31/T33 y HTTP T46 las comprobaron. El test HTTP nuevo verifica 404 para la ruta retirada. |
| `src/usuarios/recepcionistas.controller.ts`, `src/usuarios/usuarios-http.module.ts`, `src/usuarios/dto/recepcionistas.dto.ts` (modificados) | Eliminan POST de invitación, su DTO y las dependencias del módulo ya innecesarias. Las consultas y desactivación existentes siguieron probándose por HTTP en T48; POST responde 404 hasta el alta directa de T83. |
| `src/licencias/services/politica-acceso-licencia.service.ts` (modificado) | Elimina la política de activación tardía de recepción, que ya no tiene consumidor. Sus escenarios de clasificación, acceso y reservas siguen cubiertos por la suite unitaria; el spec se actualizó a ese contrato. |
| `test/support/datos-negocios.ts` (modificado) | La fixture reutilizable deja de producir `recepcionistaPendiente`: mantiene recepción completa y permite que la matriz pruebe el bloqueo del negocio pendiente separadamente. Su spec verifica campos, aislamiento y estados de licencia. |
| `src/codigos/entities/codigo-acceso.entity.spec.ts`, `src/licencias/services/politica-acceso-licencia.service.spec.ts`, `test/support/datos-negocios.spec.ts` (modificados) | Sustituyen expectativas del flujo retirado por enum de dos propósitos y cuentas completas. Pasaron en la suite unitaria. |
| `test/activaciones.integration-spec.ts`, `test/codigos-auditoria.integration-spec.ts`, `test/auth-dominio-t26-t30.integration-spec.ts`, `test/altas-negocio.integration-spec.ts`, `test/cuentas-licencias-t38-t44.integration-spec.ts`, `test/migrations.integration-spec.ts` (modificados) | Ajustan fixtures antiguas para crear superadmin y recepción completos, conservan administrador pendiente donde corresponde y siguen comprobando activación inicial, códigos, auditoría, aislamiento, licencias y rollback. Pasaron en las nueve suites de integración. |
| `test/auth-t46.e2e-spec.ts`, `test/recepcionistas-t48.e2e-spec.ts` (modificados) | Retiran expectativas HTTP de invitación/activación y prueban 404 sin efectos; mantienen activación, recuperación, consulta, desactivación, reemisión y límite compartido. Tras retirar una ruta pública, el test del límite realiza cinco intentos reales con las rutas vigentes. Se repitió T46 y se ejecutó la suite HTTP integral. |
| `tsconfig.build.tsbuildinfo` (generado) | Caché incremental actualizada por `npm run build`; no contiene una migración ni datos de la base. |

Los bloques de producción y fixtures modificados contienen comentarios breves que explican el estado pendiente permitido, los propósitos restantes y la retirada de rutas y servicios históricos.

## Verificación

| Comando | Resultado |
|---|---|
| `npm test -- --runInBand` | 26 suites, 118 pruebas aprobadas. |
| `npm run test:integration -- --runInBand` | 9 suites, 32 pruebas aprobadas, solo bases temporales desechables. |
| `npm run test:e2e -- --runInBand` | 7 suites, 79 pruebas aprobadas; incluye 404 de ambas rutas retiradas y las operaciones históricas vigentes. |
| `npm run build` | Aprobado. |
| `npm run lint` | Aprobado. |
| `git diff --check` | Aprobado. |

La primera ejecución de la prueba T80 fue roja (2/2 fallos esperados) antes de la implementación. Tras actualizar el código, los fallos de fixtures antiguos y del conteo HTTP se corrigieron; no se ocultaron con exclusiones. No se modificaron bases existentes ni se migraron datos históricos. T81–T85 permanecen pendientes para el alta directa, restablecimiento y sus contratos/pruebas.

T80 queda completada tras estas verificaciones. La lista de ejecución enlaza este informe; no se inició T81.
