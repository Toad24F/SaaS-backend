# Resultados M2-T086–M2-T091 — gates y cierre documental

Revisión base comprobada con `git rev-parse HEAD`: `8d41bc3d10481d1bf4c6c013766e64fa5768f2ca`, más estos documentos de cierre. Este lote verifica el código ya entregado y documenta su contrato; no agrega escritores de citas ni apartados ni cambia código de producción.

## Archivos y flujo documentado

`referencia-entrega-modulo-2.md` enumera las cinco rutas privadas, roles, entradas y respuestas; explica valores iniciales, 31 fechas inclusivas, modalidad manual, errores y el límite entre validar y reservar. Enlaza la especificación, el plan, este resultado y el protocolo de los futuros escritores.

`trazabilidad-cierre-modulo-2.md` vincula los doce criterios de finalización y todos los grupos RF-01–RF-45 con pruebas de esta revisión o con obligaciones futuras explícitas. Distingue las pruebas del motor y la revalidación interna de la confirmación real y deja M2-I001–M2-I009 sin aprobar. `docs/fase-3/tareas.md` marca únicamente T086–T091 cuando sus gates y documentos están comprobados. Este archivo deja las cifras, comandos, cobertura y límites del cierre.

Flujo operativo entregado: **JWT y licencia → autorización por negocio/rol → una transacción de lectura y un instante → configuración, oferta, atención y ocupaciones coherentes → ranuras o validación puntual privada → respuesta sin datos del cliente**. Las citas afectadas se consultan aparte y conservan los compromisos originales. La validación interna del futuro escritor relee bajo su transacción; la confirmación y la exclusión mutua de escritores aún requieren los módulos 3/4.

## Tests primero y cobertura de los gates

Antes de redactar el contrato de cierre se ejecutó la suite unitaria final (T086), que incluye validador íntegro de agenda, anclajes y DST, compactación y validación estricta de entradas. Se ejecutaron después las suites completas de integración y E2E sobre bases temporales.

- **T087 — modelo y configuración:** `fase-3-t005-t010`, `t011-t015`, `t016-t019`, `t020-t025` y `instalacion-t126-t127` verifican migración, paridad con `db/schema.sql`, referencias por negocio, límites, carreras de primera escritura, bajas e historial. Evidencia para RF-01–RF-12, RF-18, RF-20 y la persistencia de RF-31–RF-41.
- **T088 — tiempo y coherencia:** `fase-3-t031-t038`, `t039-t043`, `t044-t049`, `t050-t056`, `t074-t077` y `t080-t081` cubren zona, DST, duración, ocupaciones, expiración exacta, modalidades, revalidación y dos conexiones durante una lectura. `fase-3-t067-t073` cubre las afectaciones por HTTP. T18 permanece diferido.
- **T089 — cinco rutas privadas:** `fase-3-t057-t061`, `t062-t066` y `t067-t073` comprueban GET/PUT de configuración, GET de ranuras, POST de validación y GET de citas afectadas; incluyen roles, aislamiento, licencia, rango, vacío legítimo, errores 400/401/403/404/503/500 y omisión de datos sensibles. No confirman citas reales.

## Resultado de ejecución — 16 de octubre de 2026

| Comando desde la raíz | Resultado |
| --- | --- |
| `npm run build` | Aprobado |
| `npm run lint` | Aprobado |
| `npm test -- --runInBand` | 64 suites y 327 tests aprobados |
| `npm run test:integration -- --runInBand` | 57 suites y 255 tests aprobados |
| `npm run test:e2e -- --runInBand` | 28 suites y 147 tests aprobados |

Todos los comandos terminaron con código de salida 0. Los mensajes `ERROR` de Nest durante E2E corresponden a fallos que esas pruebas inyectan para comprobar la respuesta; Jest no registró tests fallidos. Los enlaces de los dos documentos nuevos se comprobaron como rutas locales existentes.

La lectura, las pruebas con ocupaciones sembradas y el contrato de colaboración no prueban reservas simultáneas. **RF-35–RF-36 conservan la confirmación real pendiente; RF-37 y M2-I001–M2-I009 siguen pendientes de escritores reales con dos conexiones y bloqueos compartidos.**

