# Resultados M2-T044–M2-T049 — cálculo inicial del motor

## Archivos y flujo

`src/disponibilidad/motor-disponibilidad.service.ts` añade la consulta privada interna del motor. Valida un rango de hasta 31 fechas, captura una sola vez el reloj e inicia una transacción `REPEATABLE READ`. Dentro de ella resuelve al actor y Profesional actuales, lee configuración, oferta, atención y ocupaciones con el mismo `EntityManager` y el mismo instante. No publica una ruta ni crea reservas.

Después genera inicios con `iniciosAnclados`, ya existente: cada bloque conserva su secuencia original aun tras descansos o bloqueos y los límites compartidos se desduplican. Filtra cada intervalo por duración completa y atención continua, ausencia de ocupaciones UTC de cualquier sucursal o servicio, anticipación inclusiva y horizonte calculado con la fecha civil de la sucursal. Ventana Libre devuelve todos los válidos ordenados. Agenda Compacta, en este tramo, devuelve el primer válido de cada bloque o tramo **sin ocupaciones de referencia**. Los candidatos próximos a ocupaciones y los grupos de respaldo corresponden a M2-T050–T051. Un error de lectura o una duración inválida se propaga; no se presenta como agenda vacía.

Flujo: **reloj único → transacción → autorización y licencia → configuración efectiva → oferta y duración/zona → franjas y cortes → citas/apartados vigentes → secuencia original → filtros físicos y comerciales → Ventana Libre o primer grupo compacto → resultado sin datos privados**. La consulta previa no garantiza una reserva.

`src/disponibilidad/configuracion-agenda.service.ts` incorpora `consultarEnContexto`, que lee los valores efectivos con el gestor transaccional del motor sin abrir otra conexión. `src/disponibilidad/oferta-efectiva.service.ts` exige esa transacción y entrega la duración y zona ya leídas, evitando una segunda consulta independiente. `src/disponibilidad/contratos-internos.ts` agrega las reglas efectivas al resultado para explicar la respuesta. `src/disponibilidad/disponibilidad.module.ts` registra y exporta el motor y su reloj inyectable. `test/fase-3-t044-t049.integration-spec.ts` prepara datos reales sobre MariaDB temporal para verificar el recorrido. `docs/fase-3/tareas.md` marca T044–T049 como hechas. `tsconfig.build.tsbuildinfo` es la caché incremental actualizada por `npm run build`, sin lógica de negocio.

## Tests primero y resultados

Se escribió primero `test/fase-3-t044-t049.integration-spec.ts`; su ejecución inicial falló porque `MotorDisponibilidadService` aún no existía. Tras implementarlo, el fixture reveló que la sesión de prueba debía durar exactamente 12 horas por restricción de BD; se corrigió el fixture y las cuatro pruebas pasaron.

La integración comprueba que las cuatro fuentes reciben el mismo gestor e instante; que Ventana Libre produce inicios ordenados y únicos desde el anclaje, con combinación, zona, reglas y cálculo, sin cliente, folio ni titular; que otra sucursal y otro servicio impiden el empalme, mientras un límite contiguo, la atención continua y la duración completa se respetan; que desactivar el servicio vacía la oferta; que 10:07 más 30 minutos con paso 15 ofrece 10:45 en Agenda Compacta y abre otro grupo tras un descanso; y que anticipación exacta, horizonte cero y último día permitido funcionan con fechas locales. Las pruebas previas de `proyeccion-atencion` conservan cobertura de anclajes, cortes y omisiones por cambio de hora.

Resultado final del 15 de octubre de 2026:

| Verificación | Resultado |
| --- | --- |
| `npm run build` | Pasó |
| `npm run lint` | Pasó |
| `npm test -- --runInBand` | 62 suites, 321 pruebas aprobadas |
| `npm run test:integration -- --runInBand test/fase-3-t044-t049.integration-spec.ts` | 1 suite, 4 pruebas aprobadas |
| `npm run test:integration -- --runInBand` | 54 suites, 246 pruebas aprobadas |

La comprobación adicional `npx tsc --noEmit --incremental false` informa errores de tipos preexistentes en otras pruebas que no bloquean `npm run build`; la anotación detectada en el nuevo test se corrigió y este archivo ya no figura entre esos errores. No se adelantaron la consulta HTTP, modalidad manual, escritores ni la búsqueda compacta junto a ocupaciones.
