# Resultados M2-T050–M2-T056 — compactación, manual y validación puntual

## Archivos y flujo

`src/disponibilidad/seleccion-compacta.ts` implementa la selección de Agenda Compacta. Para cada bloque o tramo conserva el anclaje original, localiza el inicio de la secuencia más próximo antes de una cita o apartado que permita terminar justo en su comienzo y el más próximo desde su fin real, y comprueba que cada vecino siga siendo un candidato válido. Una referencia que cruza dos bloques conserva sus extremos UTC originales. Si ninguno de esos vecinos sirve pero queda espacio, ofrece el primer candidato restante del tramo como grupo independiente. Desduplica y ordena las ranuras. Los comentarios del archivo explican el ajuste, los extremos persistidos y el respaldo.

`src/disponibilidad/motor-disponibilidad.service.ts` conecta ese selector con las ocupaciones reales y añade `modalidad` a la consulta interna. La modalidad manual genera inicios cada minuto; omite solo estrategia compacta, intervalo público, anticipación y horizonte. Ambas modalidades conservan autorización, licencia, oferta activa, duración, atención, bloqueos, ausencia de empalmes UTC y límite de 31 fechas por consulta. La manual rechaza el pasado. `validar` toma fecha y hora local explícitas, reutiliza una sola lectura transaccional del motor, rechaza horas locales inválidas o ambiguas y devuelve inicio, fin, validez y motivos funcionales; no crea citas ni apartados. Una hora pública válida físicamente debe pertenecer a la oferta de su estrategia actual.

Flujo: **sesión y reloj → transacción coherente → configuración y oferta → zona y atención → citas/apartados vigentes → candidatos físicos → reglas pública/manual → selección compacta o lista libre → respuesta**. La validación puntual usa ese mismo flujo y compara el inicio local solicitado con las ranuras producidas. Cuando no pertenece, distingue oferta inactiva, pasado o anticipación, horizonte, falta de atención, ocupación, secuencia y estrategia. La consulta no garantiza una reserva; la revalidación dentro del escritor corresponde a tareas posteriores.

`src/disponibilidad/seleccion-compacta.spec.ts` prueba el selector sin BD: duración de 20 minutos con paso de 15, los dos lados de una referencia, una cita que cruza bloques y la apertura de un grupo cuando fallan vecinos próximos. `test/fase-3-t050-t056.integration-spec.ts` prueba el motor sobre una MariaDB migrada y desechable con reloj controlado; los comentarios señalan el vencimiento sin borrado, la independencia de días y la ausencia de escrituras. `docs/fase-3/tareas.md` marca T050–T056 como hechas. `tsconfig.build.tsbuildinfo` es la caché incremental actualizada automáticamente por la compilación y no contiene lógica de negocio.

## Tests primero y verificaciones

Las dos pruebas nuevas se escribieron antes de implementar. La unitaria falló por no existir el selector. La integración falló porque la agenda compacta todavía devolvía vacío ante ocupaciones y porque aún no existía `validar`. Después de implementar ambos caminos, pasaron las pruebas dirigidas y la regresión T044–T049.

La integración cubre referencias de cita de otra sucursal y servicio, apartado vigente y vencido exactamente, grupos en otro día sin llenar el anterior, manual 10:07 fuera del paso público, omisión de las cuatro reglas comerciales, pasado, descanso, cierre, servicio inactivo, licencia vencida y ocupación ajena. Comprueba que validar no crea apartados, que una hora físicamente libre puede quedar fuera de Agenda Compacta, y los límites de anticipación cero o superior al horizonte, horizonte cero y 60, último día inclusivo y medianoche local.

Resultado del 15 de octubre de 2026:

| Verificación | Resultado |
| --- | --- |
| `npm run build` | Pasó |
| `npm run lint` | Pasó |
| `npm test -- --runInBand` | 63 suites, 324 pruebas aprobadas |
| `npm run test:integration -- --runInBand test/fase-3-t050-t056.integration-spec.ts` | 1 suite, 4 pruebas aprobadas |
| `npm run test:integration -- --runInBand` | 55 suites, 250 pruebas aprobadas |

La comprobación adicional `npx tsc --noEmit --incremental false` sigue informando errores de tipos preexistentes en pruebas ajenas a este tramo; los archivos nuevos no figuran entre ellos. No se añadieron rutas HTTP ni escritores de reservas.
