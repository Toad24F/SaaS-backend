# Resultados de T78–T85

T80–T83 ya estaban completadas y conservan sus evidencias anteriores; esta entrega añade la evidencia pendiente de T78, T79, T84 y T85. No se modificó código de producción.

## Archivos y función

- `test/recepcionistas-t78-t84.integration-spec.ts` (nuevo): usa dos conexiones MariaDB contra una base temporal migrada. T78 enfrenta desactivaciones y reactivaciones simultáneas, incluidas órdenes opuestas; valida estados y eventos seriales, revocación irreversible de sesiones e identidad intacta. Inyecta un fallo de auditoría para probar el rollback conjunto de cuenta, sesiones y evento. T84 enfrenta altas con correo normalizado duplicado, comprueba hash, activación, auditoría sin secretos y ausencia de código; restablece cuentas activas y desactivadas, prueba revocación de dos sesiones y rollback del hash/estado ante fallo. Los comentarios del archivo explican las carreras y el punto transaccional.
- `test/recepcionistas-t48.e2e-spec.ts` (ampliado): T79 verifica que reactivar requiere un login nuevo y que el JWT revocado nunca recupera acceso, incluso después de una nueva sesión; T85 prueba que alta y restablecimiento devuelven 401 con administrador inactivo o licencia suspendida/vencida, sin escrituras. Sus pruebas previas siguen acreditando 201/204, respuesta exacta sin hash/código, normalización, contraseña, duplicados, campos extra, roles, recursos ajenos y desaparición de la ruta antigua. Los comentarios nuevos describen por qué la reactivación no restaura sesiones y cómo crear un vencimiento SQL válido.
- `docs/tareas-auth.md` (actualizado): marca T78, T79, T84 y T85 como completadas y enlaza este resultado; T80–T83 permanecen marcadas con sus informes propios.
- `docs/plan.md` (actualizado): resume que ya hay evidencia de concurrencia, persistencia y contratos HTTP para el flujo completo de recepción.

## Tests primero

Los casos nuevos se escribieron antes de modificar implementación. Los cinco tests dirigidos de integración pasaron con el servicio existente. En la primera ejecución HTTP, T79 pasó y T85 detectó una fecha inválida en la propia fixture: `vence_en` no puede igualar `habilitada_en`. Se avanzó un segundo el reloj de prueba y ambos tests pasaron. No se alteró la regla del sistema para acomodar la prueba.

## Verificación final

| Comando | Resultado |
| --- | --- |
| `npm test -- --runInBand` | 26 suites, 118 pruebas aprobadas |
| `npm run test:integration -- --runInBand` | 14 suites, 61 pruebas aprobadas |
| `npm run test:e2e -- --runInBand` | 9 suites, 93 pruebas aprobadas |
| `npm run build` | Correcto |
| `npm run lint` | Correcto, sin advertencias |

Las bases de integración y e2e son desechables. Ninguna prueba crea reservas reales ni modifica la base configurada de trabajo.
