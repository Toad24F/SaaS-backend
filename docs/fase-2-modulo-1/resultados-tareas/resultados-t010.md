# Resultado M1-T010 — orden común de bloqueos

Fecha: 2026-09-25. Se definió una precedencia única para los bloqueos de identidad, negocio, licencia, sucursales, servicios y perfiles. Dentro de cada clase se usa ID ascendente; los correos se normalizan y ordenan por clave. El plan incluye activación frente a reemisión/suspensión, cupo frente a sucursal, y sucursal frente a horario como casos de cruce sin inversión de recursos compartidos.

## Archivos y función

- [`plan-modulo-1.md`](../plan-modulo-1.md): la sección 5.0 documenta la precedencia, la adquisición de uno en uno, revalidación tras el bloqueo y el tratamiento de recursos descubiertos tarde o de reintentos. Un comentario HTML aclara que es un contrato para implementaciones futuras.
- [`orden-bloqueos.ts`](../../../src/comun/orden-bloqueos.ts): ofrece una función pura que normaliza, valida, deduplica y ordena las claves antes de adquirir bloqueos. Sus comentarios explican la precedencia y el alcance; la función no abre transacciones.
- [`orden-bloqueos.spec.ts`](../../../src/comun/orden-bloqueos.spec.ts): comprueba el orden por clase e ID, correos normalizados, duplicados, IDs inválidos, el orden relativo de operaciones que se cruzan y la presencia del contrato en el plan. El comentario del caso de cruce indica que simula rutas futuras.
- [`tareas-modulo-1.md`](../tareas-modulo-1.md): marca M1-T010 como hecha, actualiza pendientes a 130 y enlaza este resultado.
- Este informe conserva la explicación de lo realizado, las pruebas y el alcance pendiente.

## Tests primero y verificaciones

La prueba focalizada se creó antes de la función y falló porque el módulo aún no existía. Después de escribir la función y el plan pasó **8/8**. La suite unitaria completa pasó **168/168 en 32 suites**; integración MariaDB pasó **65/65 en 16 suites**; HTTP/e2e pasó **93/93 en 9 suites**. `npm run build` y `npm run lint` pasaron. Los mensajes `ERROR` de e2e proceden de fallos inyectados en casos de rollback; Jest terminó con código 0.

La función y estas pruebas acreditan el orden de claves y la coherencia de los recorridos planificados. Los servicios existentes todavía no llaman al helper; las pruebas de carreras reales de cada operación futura siguen en sus tareas correspondientes.
