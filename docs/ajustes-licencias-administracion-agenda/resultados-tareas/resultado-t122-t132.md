# ALA-T122–T132 — Carreras del escritor público

## Qué se realizó

Se agregó `test/ala-t122-t132.integration-spec.ts`. No se cambió código de producción: este lote verifica el escritor, resolutor y concesión públicos existentes frente a escrituras simultáneas y cambios de reglas. Se actualizó `tareas.md` para enlazar esta evidencia y marcar T122–T132.

El archivo nuevo crea una base MariaDB migrada y desechable por escenario, dos módulos Nest con conexiones independientes y un reloj inyectado. Sus auxiliares preparan sesiones, apartados e intentos reales; una barrera retiene una fila de negocio o pausa un contendiente en un punto conocido. Después de liberar la barrera, las aserciones leen clientes, citas, intentos y apartados confirmados. Las pausas tienen comentarios junto al código para explicar el orden y la razón de cada lectura final.

## Flujo comprobado

1. Dos navegadores preparan apartados e intentos propios. Cuando el caso exige un cambio colectivo, la segunda conexión actualiza la fila correspondiente mientras el escritor espera antes de bloquear y releer los recursos.
2. El escritor toma sesión e intento, luego usuarios, negocio, licencia, oferta, perfil y apartado. Tras la espera usa el reloj inyectado y revalida el estado efectivo. Si puede registrar, el mismo commit guarda cliente, cita pendiente, consumo del apartado y resultado del intento. Si hay conflicto, las filas parciales no aparecen.
3. El resolutor usa las mismas filas de exclusión. Si el escritor confirmó primero, devuelve la cita ya registrada. Si el cierre terminal confirmó primero, el escritor tardío no puede insertar ni revivir el apartado.
4. Un apartado que ya existe conserva modo, separación y costo capturados. Una concesión nueva usa la configuración actual. Las bajas de oferta y los cambios de horario o duración se vuelven a evaluar para impedir un registro incompatible; una cita anterior permanece en la base.

## Casos y resultado

| Tarea | Comprobación |
|---|---|
| T122 | Dos profesionales compiten por el último lugar del mismo teléfono; una cita y un cliente nuevos, un intento registrado y otro rechazado por cupo. |
| T123 | Dos sucesores del rechazo compiten por el puntero; solo el primero queda actual, su repetición devuelve el mismo ID y el intento anterior no escribe. |
| T124–T125 | Barreras fuerzan escritor antes que resolutor y el orden inverso; se leen cita, intento y liberación finales. |
| T126 | Dos sucursales del mismo profesional tienen atención contigua y protección incompatible. La fixture construye dos apartados adversariales con separación capturada de 15 minutos: ambos escritores pueden rechazar por la ocupación mutua; nunca se confirman dos citas ni quedan consumos parciales. |
| T127 | En ambos órdenes, la cita conserva separación cero; una nueva concesión captura Agenda Compacta y 30 minutos. |
| T128–T129 | En ambos órdenes, baja de profesional, sucursal o servicio rechaza el registro tardío y una nueva concesión; la cita confirmada antes de la baja permanece recuperable. |
| T130 | El reloj avanza al vencimiento exacto mientras espera el escritor: no registra y el titular puede resolver su intento. |
| T131 | En ambos órdenes, reducción de horario o bloqueo rechaza el registro tardío y conserva la cita anterior. |
| T132 | El costo cambiado después del apartado no altera los 100.00 aceptados; una duración nueva incompatible rechaza sin cliente ni cita nuevos. |

## Verificación

Revisión base `a1f7cad`, con los tres archivos de este lote sin confirmar en Git. Entorno: Node/Jest del repositorio, MariaDB local mediante bases `citas_persistencia_<uuid>` creadas y destruidas por `conBaseMigrada`; ninguna prueba de escritura usó la base cotidiana. El acceso local a MariaDB y a los servidores HTTP de prueba requirió ejecutar los comandos fuera del aislamiento de red del entorno.

- `npm run build`: pasó.
- `npm run lint`: pasó.
- `npm test -- --runInBand`: 89 suites, 410 pruebas, todas pasaron.
- `npm run test:integration -- --runInBand test/ala-t122-t132.integration-spec.ts`: 1 suite, 13 pruebas, todas pasaron.
- `npm run test:e2e -- --runInBand test/ala-t116-t121.e2e-spec.ts`: 1 suite, 1 prueba, pasó.

Los cinco comandos anteriores terminaron con código 0. `git diff --check` terminó con código 0; advirtió únicamente que Git normalizará el fin de línea de `tareas.md` a CRLF.

## Matriz RF → prueba → resultado

| RF | Casos que lo ejercitan | Resultado focal |
|---|---|---|
| RF-07–RF-08 | T130: reloj en vencimiento y resolución propia | Pasó |
| RF-25, RF-28–RF-30 | T128–T129: bajas en dos órdenes y nueva concesión | Pasó |
| RF-35 | T132: costo histórico y duración incompatible | Pasó |
| RF-38 | T131: horario y bloqueo | Pasó |
| RF-43–RF-45 | T126, T131: fin protegido y horario | Pasó |
| RF-53–RF-55 | T127–T132: reglas capturadas y revalidación | Pasó |
| RF-56–RF-59 | T122: último cupo por teléfono | Pasó |
| RF-60–RF-61 | T123: sucesor único y envío antiguo | Pasó |
| RF-65–RF-68 | T122–T125, T130: serialización, resultado terminal y recuperación | Pasó |

La prueba T126 usa un estado adversarial para exigir el invariante de máximo una ocupación; no acredita que el flujo normal pueda conceder dos apartados mutuamente incompatibles. La integración manual real sigue diferida según ALA-I002 y los contratos M3-I001/M2-I004.

Se inició `npm run test:integration -- --runInBand` para la integración completa. Mostró fallos fuera del archivo nuevo: `fase-4-t086-t091` espera `guardarExcepcion` y la configuración de intervalo anterior; `ala-t036-t040` falla al sembrar usuarios por `chk_usuarios_activacion`; `fase-3-t031-t038` y `fase-4-t052-t057` conservan expectativas de excepciones retiradas; `ala-t019-t022` encuentra un fin nulo; `sucursales-t060` falla al revertir una FK. Tras esos fallos, el proceso permaneció sin producir resumen y se interrumpió con código 1. Por ello no hay cifra global confiable de suites o pruebas; esta ejecución **no** se presenta como regresión completa aprobada. El archivo nuevo sí terminó de forma independiente con 13/13.
