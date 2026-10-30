# Resultado — ALA-T046–ALA-T050

Revisión base: estado anterior a esta entrega; cambios sin commit. Se escribieron primero las pruebas. Las integraciones usan bases MariaDB nuevas, desechables e identificadas como test; el transporte no envía correos reales.

## Archivos y flujo

- `test/ala-t046-t049.integration-spec.ts` comprueba transiciones en tablas migradas. Fuerza un error al encolar después de escribir licencia, operación y auditoría: el rollback deja las cuatro tablas como estaban. Simula rechazo y timeout SMTP, comprueba el reintento y que el bloqueo no cambia. Simula aceptación seguida de caída antes del acuse: vence el arrendamiento y se reclama la misma fila. Las carreras usan dos conexiones y ambos órdenes de renovación con suspensión y reactivación; verifican fecha final, remanente, operaciones, auditoría y avisos.
- `test/ala-t050.e2e-spec.ts` inicia la aplicación real con guardas, sesión persistida y reloj inyectado. Reutiliza el mismo JWT justo antes, exactamente en y después del bloqueo programado o vencimiento natural. La sesión nace cerca del límite para aislar el vencimiento de licencia del vencimiento independiente de la sesión. También verifica que un administrador del negocio no pueda renovar licencias.
- `src/correos/transporte-correo.ts` añade la identidad lógica opcional al mensaje transitorio. Es el ID de la fila durable de la bandeja, sin cuerpo ni dato personal.
- `src/correos/procesador-correo.service.ts` pasa ese ID al transporte en cada intento. Reclama la fila tras el commit de la transición, prepara el texto, envía fuera de la transacción y registra el resultado. Una caída entre aceptación y acuse deja el mismo trabajo recuperable.
- `src/correos/transporte-correo-smtp.ts` usa el ID durable y el dominio del remitente para fijar `Message-ID`; valida que el ID sea numérico. Reintentos de la misma fila llevan la misma cabecera. SMTP aún puede entregar físicamente dos veces.
- `src/correos/transporte-correo-smtp.spec.ts` prueba la cabecera estable. La prueba falló primero por la cabecera ausente y pasó tras implementarla.
- `tareas.md` marca T046–T050 y enlaza esta evidencia.

El flujo de concurrencia es: el superadmin inicia la operación → se bloquean negocio y licencia → se relee el estado → se guardan licencia, auditoría, operación y bandeja en un commit → la segunda operación obtiene los bloqueos y calcula desde el estado confirmado. Renovar no reinicia el plazo de suspensión; reactivar restituye el remanente congelado, y renovar agrega la anualidad. El correo se entrega después del commit.

## Pruebas y resultados

| Comando | Resultado |
| --- | --- |
| `npm test -- --runInBand src/correos/transporte-correo-smtp.spec.ts src/correos/transporte-correo-controlado.spec.ts src/licencias` | 11 suites, 51/51 pruebas aprobadas |
| `npm run test:integration -- --runInBand test/ala-t046-t049.integration-spec.ts test/ala-t041-t045.integration-spec.ts test/ala-t036-t040.integration-spec.ts` | 3 suites, 32/32 pruebas aprobadas |
| `npm run test:e2e -- --runInBand test/ala-t050.e2e-spec.ts test/ala-t035.e2e-spec.ts test/licencias-vigencia-t051-t057.e2e-spec.ts` | 3 suites, 11/11 pruebas aprobadas |
| `npm run build` | Correcto |
| `npm run lint` | Correcto |

La primera integración no llegó a ejecutar casos porque el entorno aislado rechazó la conexión local a MariaDB (`EACCES`); se repitió con acceso local y aprobó. La simulación de caída después de aceptación muestra expresamente dos intentos físicos asociados a una fila lógica. El identificador estable ayuda a reconocerlos, pero no garantiza entrega física única.

T046–T050 cumplen sus criterios. Este lote no cierra la fase ni habilita producción. M3-I001/M2-I004 siguen diferidas al escritor manual real.
