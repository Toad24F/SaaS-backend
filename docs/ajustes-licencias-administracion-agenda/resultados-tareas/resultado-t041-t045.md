# Resultado — ALA-T041–ALA-T045

Revisión base: `ca0c71c`. Cambios de esta entrega sin commit. Alcance: selección preventiva 15/7, preparación de mensajes de licencia y ejecución periódica. No acredita los RF completos ni cierra la fase.

## Archivos y flujo implementado

1. `src/licencias/services/aviso-elegible.ts`: agrega `umbralPreventivo`. Más de 15 días no genera aviso; entre 15 y más de 7 elige 15; desde 7 hasta antes de vencer elige 7. Licencias sin habilitar, congeladas o bloqueadas no son elegibles. Conserva `avisoElegible` para procesar referencias históricas del tipo anterior; el detector no crea nuevos avisos de dos días.
2. `src/licencias/services/avisos-vencimiento.service.ts`: el detector consulta candidatos y los relee en READ COMMITTED bajo negocio → licencia. Al alcanzar siete días descarta trabajos de quince todavía no entregados y encola una sola referencia por versión y umbral. Usa la bandeja durable existente y el administrador vigente. Los comentarios explican la barrera y la releída.
3. `src/correos/procesador-correo.service.ts`: habilita la reclamación de todos los tipos implementados. La transacción corta de reclamación termina antes de preparar el mensaje. La preparación y el reintento bloquean negocio → licencia → envío, validan administrador, destinatario, vencimiento, ciclo y operación; descartan referencias sustituidas. Construyen el cuerpo en memoria antes del transporte. Las plantillas cubren prevención, vencimiento, suspensión programada/inmediata/efectiva, revocación, reactivación y renovación. Una renovación suspendida conserva ese estado en el texto. Una suspensión posterior invalida el mensaje de renovación anterior. Los comentarios explican el orden y la validación.
4. `src/operacion/ejecucion-periodica.service.ts`: después de conciliar las suspensiones ejecuta el detector de límites naturales y luego el preventivo, antes de drenar los correos. La conciliación conserva el instante original del bloqueo aunque el ejecutor llegue tarde. Su prueba unitaria actualiza el orden esperado.
5. `test/ala-t041-t045.integration-spec.ts`: agrega nueve casos con reloj y transporte controlados, filas reales y bases desechables. Los comentarios explican límites, drenaje de cola y coordinación entre conexiones.
6. `test/ala-t036-t040.integration-spec.ts`: actualiza la comprobación temporal del procesador: ahora el nuevo tipo se prepara después del commit, manteniendo cero SMTP durante el encolado.
7. `test/avisos-t116-t120.integration-spec.ts` y `test/ejecutor-t121-t122.integration-spec.ts`: adaptan la regresión al preventivo 15/7. La revocación dentro de la gracia conserva la versión del vencimiento, según el contrato ya implementado en T036–T040.
8. `tareas.md`: registra únicamente T041–T045 y enlaza esta evidencia.

El flujo completo es: reloj del ciclo → conciliación de suspensiones → detección de vencimientos → selección de umbral → commit de bandeja → reclamación corta → commit de reclamación → validación bajo bloqueos de dominio → texto en memoria → transporte controlado → resultado durable. No se envía SMTP dentro de la transición de licencia. La garantía observada de descarte corresponde a la validación previa al transporte; esta entrega no acredita toda la estrategia de fallos SMTP de T047.

## Pruebas y resultados

Se escribieron primero cinco pruebas de integración que fallaron ante la implementación anterior. Se ampliaron para cubrir mensajes y una carrera con dos conexiones. En la revisión final se agregó primero el caso de renovación seguida de suspensión: falló porque enviaba «La licencia está vigente»; después se validó también la versión de suspensión.

Los nueve casos nuevos cubren: antes/en/después de 15 y 7 días y vencimiento; recuperación a seis días con descarte de quince y texto real; fechas de programación/revocación/reactivación; renovación obsoleta y renovación suspendida; renovación seguida de suspensión; suspensión inmediata y vencimiento natural; ciclo revocado y destinatario sustituido; reclamación confirmada mientras negocio está bloqueado sin retener envío; repetición del ciclo sin duplicados y congelación tardía al instante previsto.

| Verificación | Resultado |
| --- | --- |
| `npm test -- --runInBand src/licencias src/correos src/operacion` | 13 suites, 52/52 aprobadas |
| Integración relacionada, comando indicado abajo | 6 suites, 49/49 aprobadas |
| HTTP relacionado, comando indicado abajo | 4 suites, 24/24 aprobadas |
| `npm run build` | Correcto |
| `npm run lint` | Correcto |
| `git diff --check` | Correcto |

Comando de integración:

```powershell
npm run test:integration -- --runInBand test/ala-t041-t045.integration-spec.ts test/ala-t036-t040.integration-spec.ts test/avisos-t116-t120.integration-spec.ts test/ejecutor-t121-t122.integration-spec.ts test/envios-correo.integration-spec.ts test/procesador-correo.integration-spec.ts
```

Comando HTTP:

```powershell
npm run test:e2e -- --runInBand test/ala-t035.e2e-spec.ts test/licencias-t50.e2e-spec.ts test/licencias-vigencia-t051-t057.e2e-spec.ts test/envios-correo.e2e-spec.ts
```

La primera regresión detectó expectativas históricas de aviso a dos días y del procesador sin plantillas; se actualizaron al contrato actual. La ejecución HTTP imprime errores intencionales de los casos de rollback de T50 y termina correctamente. Las pruebas usan bases desechables identificadas como test y transporte falso; no modifican `Citas_Saas`, la base original ni `.env`, ni envían correos reales. No se requieren migraciones para este lote.

## Cierre del lote

T041–T045 completadas según sus criterios. T046 y posteriores permanecen pendientes. RF-63, M3-I001 y M2-I004 siguen diferidos a sus escritores reales; este lote no habilita producción ni cierra la fase.
