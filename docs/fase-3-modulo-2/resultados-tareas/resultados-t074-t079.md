# Resultados M2-T074–M2-T079 — revalidación interna y protocolo de escritores

## Archivos y flujo

`src/disponibilidad/motor-disponibilidad.service.ts` añade el contrato interno `revalidarEnTransaccion`. Recibe el manager de una transacción activa del futuro escritor, la sesión autorizable, la combinación y el inicio solicitado. Captura el reloj tras el bloqueo que debe haber tomado el escritor, vuelve a leer autorización, reglas, oferta, duración, horario y ocupaciones y usa la misma evaluación puntual que la validación privada. Si se aporta un apartado propio, comprueba el hash de titular, negocio, Profesional, sucursal, servicio, intervalo UTC completo, liberación y expiración exacta antes de excluir **solo ese apartado**. Los comentarios en el servicio identifican el límite de responsabilidad, la comprobación previa a la exclusión y la decisión compartida. El método no crea citas, no consume apartados y no publica una garantía de reserva.

`test/fase-3-t074-t077.integration-spec.ts` prueba este contrato con MariaDB migrada desechable, reloj controlado y dos negocios. Sus comentarios explican la comprobación del segundo apartado y el intento con ID de otro negocio. `src/disponibilidad/disponibilidad-entradas.spec.ts` añade la comprobación de que la entrada HTTP rechaza `apartadoPropio`, para impedir que un cliente solicite la exclusión de un ID arbitrario.

`docs/fase-3/resultados-tareas/contrato-escritores-t078-t079.md` describe el orden de bloqueos, la fila común de `personal`, la relectura y el nuevo instante tras esperar, el consumo atómico, rollback y la coordinación con cambios colectivos. También prepara, uno por uno, las precondiciones de módulos 3/4, dos conexiones y resultados esperados de M2-I001–M2-I009. `docs/fase-3/tareas.md` marca únicamente M2-T074–M2-T079 como hechas.

Flujo: **solicitante autorizado → transacción del escritor → bloqueo común del Profesional → reloj nuevo → relectura transaccional de acceso, oferta y ocupaciones → comprobación íntegra del apartado propio → exclusión exclusiva de ese apartado → evaluación del inicio**. Después, un escritor real deberá insertar la cita y consumir el apartado en la misma transacción, o revertir todo con 409 si aparece un conflicto. Esa segunda parte queda diferida: los tests de este lote acreditan colaboración con el motor, no una reserva real ni RF-35–RF-37 completos.

## Tests primero y verificaciones

Se escribió primero `fase-3-t074-t077.integration-spec.ts`. Sus tres pruebas fallaron antes del código con `motor.revalidarEnTransaccion is not a function`; después de implementar el contrato pasaron. Comprueban manager activo y ausencia de transacción anidada; validez pública y manual del apartado propio; conservación de otra ocupación aun con la misma combinación; rechazo de hash, negocio, Profesional, sucursal, servicio, fin, expiración exacta o liberación incompatibles; y relectura tras cambiar oferta, duración, horario o insertar una cita de otra sucursal. Verifican además que la colaboración no inserta una cita ni libera el apartado.

La prueba unitaria de entrada HTTP rechaza la inyección de `apartadoPropio`. La compilación y el lint pasaron. M2-I001–M2-I009 siguen pendientes porque requieren escritores reales de módulos 3/4 y dos conexiones coordinadas; su preparación está documentada, pero no se declara aprobada.

## Resultado de ejecución — 16 de octubre de 2026

| Verificación | Resultado |
| --- | --- |
| `npm run build` | Aprobada |
| `npm run lint` | Aprobada |
| `npm test -- --runInBand` | 64 suites y 327 tests aprobados |
| `npm run test:integration -- --runInBand` | 56 suites y 253 tests aprobados |
| `npm run test:e2e -- --runInBand` | 28 suites y 145 tests aprobados |

Todas las suites terminaron con código de salida 0. `git diff --check` no encontró errores de formato. Los mensajes `ERROR` emitidos por Nest durante E2E pertenecen a casos que inyectan fallos de prueba; no hubo tests fallidos.

