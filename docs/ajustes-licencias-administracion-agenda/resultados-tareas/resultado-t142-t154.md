# ALA-T142–T154 — comprobación final y estado de las suites

## Revisión y alcance

Revisión base `1da14bf`, con los cambios de este lote aún en el árbol de trabajo. Se escribieron primero los casos de `test/ala-t142-t145.integration-spec.ts` y se ejecutaron en rojo por falta del verificador. Después se añadió el verificador, se ejecutaron sus cuatro casos en verde y se corrieron las suites completas por manifiesto. Ninguna prueba de escritura se dirigió a la base cotidiana: `conBaseMigrada` crea y destruye bases temporales identificadas como prueba.

| Archivo | Función del cambio |
|---|---|
| `src/operacion/compatibilidad-ala.ts` | Lee en una transacción coherente los apartados antiguos aún vigentes, los descansos activos heredados y las excepciones antiguas. Si hay alguno, impide activar las escrituras ALA; no modifica ni purga filas. |
| `src/main.ts` | Antes de abrir el puerto en producción con `PORTAL_PUBLICO_ESCRITURAS=habilitadas`, ejecuta la barrera de compatibilidad. Deja el diagnóstico fuera de las respuestas públicas. |
| `test/ala-t142-t145.integration-spec.ts` | Prueba el límite exacto de vencimiento, la conservación de datos incompatibles, la actualización desde el esquema anterior y el rechazo de un nombre de base inseguro. Sus comentarios explican qué historial debe preservarse. |
| `scripts/generar-manifiesto-ala.mjs` | Enumera con `rg` todos los archivos de prueba y los reparte en lotes deterministas de duración prevista inferior a 30 minutos. |
| `scripts/ejecutar-manifiesto-ala.mjs` | Comprueba que el inventario coincide con el árbol actual, ejecuta cada lote y guarda código de salida, duración, resumen y casos fallidos. No excluye un lote porque otro falle. |
| `manifiesto-t146.json` | Lista los 221 archivos de prueba: 89 unitarios, 90 de integración y 42 HTTP, en 23 lotes. |
| `compilacion-lint-t147-t148.json` | Conserva comandos, salida y códigos de compilación y lint. |
| `ejecucion-unitarias-t149-t151.json`, `ejecucion-integracion-t149-t151.json`, `ejecucion-http-t149-t151.json` | Evidencia verificable por lote, con nombres de archivos y fallos. |
| `matriz-final-t152.md` | Vincula los 69 RF a casos y evidencias de ejecución; RF-63 conserva su estado diferido. |
| `docs/ajustes-licencias-administracion-agenda/tareas.md` | Marca T142–T154 tras cumplir sus criterios; las integraciones manuales siguen abiertas. |

### Regresiones ajustadas para ejecutar la suite completa

| Archivo | Qué comprueba ahora |
|---|---|
| `test/ala-t019-t022.integration-spec.ts` y `test/ala-t028-t034.integration-spec.ts` | Retroceden las migraciones correctas antes de sembrar el esquema antiguo y fijan creación, activación y habilitación al mismo reloj; así prueban migración y operaciones de licencia sin depender de la fecha del host. |
| `test/ala-t036-t040.integration-spec.ts` y `test/ala-t046-t049.integration-spec.ts` | Fijan fechas del fixture de licencias y correo para respetar los checks SQL y volver a probar avisos, rollback e idempotencia. |
| `test/fase-3-t074-t077.integration-spec.ts` | Usa un apartado propio con contexto ALA completo y mantiene coherente su fin protegido al alterar el intervalo; prueba exclusión y releída del motor. |
| `test/fase-4-t008-t013.integration-spec.ts` y `test/sucursales-t060.integration-spec.ts` | Retroceden primero las migraciones posteriores que dependen de las tablas antiguas, prueban la actualización histórica y restauran el esquema completo. |
| `test/fase-4-t058-t062.integration-spec.ts` | Reemplaza la expectativa de inicio 09:15 por 09:30, el siguiente inicio admisible según la secuencia pública ALA. |
| `test/horarios-t092-t096.integration-spec.ts` | Cambia casos de excepción retirada por huecos entre franjas, rechazo de descanso y rollback ante empalme. |
| `test/horarios-t097-t100.integration-spec.ts` y `test/fix-modulo-1-t024-t029.integration-spec.ts` | Conservan carreras entre escritores actuales y comprueban que una excepción heredada cierra la operación hasta transicionarse. |
| `test/ala-t082-t085.e2e-spec.ts` | Fija también la creación de licencia al reloj de la prueba para respetar su check SQL. |
| `test/horarios-t093-t095.e2e-spec.ts`, `test/seguridad-t131-t132.e2e-spec.ts` y `test/recorrido-t133.e2e-spec.ts` | Envían el contrato semanal sin descansos, comprueban rutas de excepción retiradas y conservan permisos, corte de acceso y recorrido real. |
| `test/bloqueos-t106-t110.e2e-spec.ts` y `test/fase-3-t062-t066.e2e-spec.ts` | Prueban huecos entre franjas, rechazo de excepción heredada y validación en el primer inicio realmente ofrecido. |
| `test/bajas-t111-t115.e2e-spec.ts` | Comprueba DELETE retirado, inhabilitación autorizada y conservación de usuarios y relaciones. |
| `test/credenciales-t49.e2e-spec.ts`, `test/licencias-t50.e2e-spec.ts`, `test/fix-modulo-1-t010-t018.e2e-spec.ts`, `test/recepcionistas-t48.e2e-spec.ts` y `test/profesionales-t071-t076.e2e-spec.ts` | Inyectan fallos en el `INSERT` SQL real de auditoría para verificar rollback entre módulos Nest. La proyección pública de Recepción incluye `inhabilitadoEn`. |

## Flujo de activación y actualización

1. Una instalación limpia aplica todas las migraciones en una base de prueba. `test/instalacion-t126-t127.integration-spec.ts` compara columnas, índices, checks y claves foráneas con `db/schema.sql`.
2. En actualización, una base temporal vuelve al último esquema público anterior a ALA. La prueba crea cuentas, relaciones, servicios, citas y apartados históricos, aplica las nueve migraciones nuevas y vuelve a leer las filas. La cita antigua conserva su costo aceptado nulo y un fin protegido igual al fin original: no se le atribuye una separación que no existía. El apartado heredado conserva el contexto ALA nulo.
3. Antes de activar escrituras públicas en producción, el arranque cuenta apartados heredados vigentes (`liberado_en IS NULL` y `ahora < expira_en`), descansos en filas semanales activas y excepciones antiguas. La lectura usa una transacción `REPEATABLE READ`. Cualquier cantidad positiva impide abrir el puerto con escrituras habilitadas. El operador debe cerrar escritores durante esta comprobación y resolver la transición de datos con un procedimiento aprobado; este código no borra historial.
4. El nombre de una base de test debe ser temporal, distinto de la base cotidiana y confirmado por el ejecutor. La prueba comprueba el rechazo antes de abrir conexión.

## Comandos y resultados

| Comprobación | Resultado |
|---|---|
| `npm run test:integration -- --runInBand test/ala-t142-t145.integration-spec.ts` | 4/4 pruebas, código 0. Se comprobó bloqueo por apartado vigente, liberación al vencimiento exacto, descanso/excepción persistentes, preservación de actualización y destino seguro. |
| `npm run test:integration -- --runInBand test/instalacion-t126-t127.integration-spec.ts` | 2/2 pruebas, código 0; instalación limpia y esquema canónico equivalentes. |
| `npm run build` | Código 0; salida conservada en `compilacion-lint-t147-t148.json`. |
| `npm run lint` | Código 0; salida conservada en `compilacion-lint-t147-t148.json`. |
| `node scripts/ejecutar-manifiesto-ala.mjs unitarias` | 5/5 lotes, 89/89 suites, 410/410 pruebas, código 0, sin saltados. |
| `node scripts/ejecutar-manifiesto-ala.mjs integracion` | 12/12 lotes, 90/90 suites, 421/421 pruebas, código 0, sin saltados. |
| `node scripts/ejecutar-manifiesto-ala.mjs http` | 6/6 lotes, 42/42 suites, 199/199 pruebas, código 0, sin saltados. |

Las duraciones reales de todos los lotes quedaron por debajo de 30 minutos. Los JSON finales enumeran cada archivo y el resumen Jest. El primer recorrido de integración (8 lotes fallidos) y HTTP (4 lotes fallidos) mostró fixtures con fechas del host, migraciones posteriores, contratos horarios retirados y dobles de auditoría que no alcanzaban todas las instancias Nest. Se corrigieron sus causas, se verificaron los archivos afectados por separado y se repitieron los 12 y 6 lotes completos. No se omitieron archivos ni se declararon verdes los primeros intentos fallidos.

## Compatibilidad y recuperación de despliegue (T153)

Los contratos nuevos retiran descansos y excepciones operativos, cambian el intervalo público por separación, redondean inicios, preservan la versión de reglas del apartado, limitan el teléfono por sucursal y pueden ocultar precios públicos. Las rutas o clientes que envían campos retirados deben actualizarse antes de abrir escrituras. La disponibilidad de un apartado heredado no autoriza reinterpretarlo con las reglas nuevas.

La secuencia de despliegue prevista es: respaldo verificable; detener escritores; aplicar migraciones; ejecutar la comprobación con el instante del servidor; resolver cualquier dato incompatible sin eliminarlo de forma implícita; desplegar clientes compatibles; abrir el interruptor de escrituras; vigilar errores. Si la comprobación falla, las escrituras siguen cerradas y se conserva la base para diagnóstico. La recuperación mediante código anterior requiere comprobar antes la compatibilidad de sus lectores con el esquema nuevo; revertir migraciones o restaurar un respaldo después de admitir reservas nuevas podría perder citas o intentos. Este documento no ejecuta despliegue ni habilita producción.

## Contraste de los ocho criterios (T154)

| Criterio de `spec.md` | Evidencia o límite vigente |
|---|---|
| 1. Trazabilidad y aprobación | [Matriz final](matriz-final-t152.md) enlaza los 69 RF con caso y resultado. La constitución y especificación siguen como propuesta: falta aprobación real, limitación explícita de este criterio. |
| 2. Licencias y correos | Casos `ala-t028-t034`, `ala-t036-t040`, `ala-t046-t049` y HTTP `licencias-t50` pasaron en las [suites finales](ejecucion-integracion-t149-t151.json). |
| 3. Cupos y recuperación | Casos `ala-t051-t056`, `ala-t061-t065`, `ala-t071-t074` y baja lógica HTTP pasaron; las cuentas y relaciones se conservaron. |
| 4. Precios y privacidad | Casos `ala-t075-t076`, `ala-t078-t081` y `ala-t133-t140` pasaron en la suite HTTP final. |
| 5. Horarios y motor | Preflight T142, casos `ala-t082-t085`, `ala-t086-t089`, `ala-t090-t093` y regresiones de fase 3 pasaron. |
| 6. Apartados y carreras | Casos `ala-t102-t109`, `ala-t110-t115`, `fase-4-t058-t062` y `fase-3-t074-t077` pasaron con filas finales. |
| 7. Cupo telefónico | Casos `ala-t116-t121` y `ala-t122-t132` pasaron. RF-63, ALA-I001–I003 y M3-I001/M2-I004 siguen diferidos hasta el escritor manual real. |
| 8. Calidad y límites | Build, lint, 410 unitarias, 421 de integración, 199 HTTP, instalación limpia y actualización segura pasaron. No se declara producción habilitada ni fase 4 cerrada. |

La aprobación documental y el escritor manual real son límites explícitos del ajuste. Marcar T154 acredita este contraste, no la aprobación de las fuentes ni el cierre de la fase 4. No se ejecutó despliegue.
