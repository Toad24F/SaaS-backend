# Resultados M1-T081–M1-T082 — persistencia y concurrencia de selecciones

Fecha: 2026-10-01. M1-T080 ya estaba implementada y marcada como hecha en [T077–T080](resultados-t077-t080.md); en esta entrega se verifica su contrato y se añaden las pruebas exigidas por T081 y T082. No fue necesario cambiar código de producción.

## Flujo comprobado

1. El administrador crea perfiles completos. Cada selección se guarda en `personal_servicios` con el negocio derivado de su cuenta; el catálogo, la cuenta y las asignaciones a sucursales quedan en tablas independientes.
2. El formulario envía el conjunto completo de `servicioIds`. Un guardado agrega o retira relaciones del perfil bloqueado y confirma auditoría en la misma transacción. Otra conexión vuelve a leer las casillas y recupera exactamente la selección persistida, incluso tras desmarcar y guardar `[]`.
3. Dos altas simultáneas con el mismo correo compiten por la unicidad global. Solo una confirma cuenta, perfil, reserva de correo y evento de alta.
4. Dos guardados del mismo perfil usan conexiones independientes. El bloqueo del perfil hace que el resultado final sea uno de los conjuntos completos enviados, sin mezcla ni duplicados.
5. Si un servicio se desactiva mientras se intenta seleccionarlo, puede conservarse una selección que haya confirmado primero o rechazarse la nueva selección; la oferta efectiva consulta el estado global vigente y queda vacía para ese servicio inactivo.

## Archivos

| Archivo | Qué hace |
| --- | --- |
| `test/profesionales-t081-t082.integration-spec.ts` | Nuevo archivo de cuatro pruebas sobre MariaDB migrada y dos conexiones; verifica persistencia, aislamiento, alta concurrente, reemplazo concurrente y desactivación global. Sus comentarios explican las conexiones y la barrera. |
| `docs/fase-2-modulo-1/tareas-modulo-1.md` | Marca T081–T082 como hechas y enlaza esta evidencia; mantiene T080 como hecha. |
| `docs/fase-2-modulo-1/resultados-tareas/resultados-t081-t082.md` | Este documento explica el flujo, archivos y resultados. |

## Tests primero

Las cuatro pruebas se escribieron y ejecutaron antes de modificar código de producción. **4/4 pasaron en la primera ejecución enfocada**: el servicio previo ya satisfacía los criterios. Por eso no se hicieron cambios funcionales adicionales.

| Prueba | Qué verifica |
| --- | --- |
| Guardar, desmarcar, recargar y vaciar | La lectura desde otra conexión refleja el conjunto; `[]` conserva cuenta y sucursal, y otro perfil y el catálogo no cambian. |
| Dos altas con igual correo | Una sola cuenta, perfil, reserva y auditoría; la otra petición recibe conflicto. |
| Dos reemplazos del mismo perfil | El conjunto final coincide por completo con uno de los dos envíos y no hay duplicados. |
| Selección frente a desactivación | Un servicio globalmente inactivo no aparece en la oferta, independientemente de cuál transacción confirma primero. |

| Verificación | Resultado |
| --- | --- |
| Pruebas enfocadas nuevas | **4/4** aprobadas en MariaDB temporal migrada. |
| `npm test -- --runInBand` | 49 suites, **257/257** aprobadas. |
| `npm run test:integration -- --runInBand` | 31 suites, **169/169** aprobadas. |
| `npm run test:e2e -- --runInBand` | 16 suites, **118/118** aprobadas. |
| `npm run build` | Aprobado. |
| `npm run lint` | Aprobado. |

Las tres suites completas suman **544 pruebas aprobadas**. Los mensajes `ERROR` de algunas pruebas HTTP provienen de fallos inyectados para comprobar rollback; Jest terminó con código 0. Las bases de prueba son desechables y no se enviaron correos reales.
