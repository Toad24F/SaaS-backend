# Evidencia de FIX-T024–FIX-T029

## Archivos y función

- `src/profesionales/dto/profesionales.dto.ts`: valida el identificador de sucursal en la ruta y exige que el interruptor `activo` sea un booleano JSON. El DTO existente de selección valida el arreglo completo, incluidos duplicados y `[]`.
- `src/profesionales/profesionales.controller.ts`: expone consultas y cambios de atención individual y selección de servicios para una sucursal asignada, con acceso para administrador y Profesional. Toma el reloj compartido para validar la reactivación.
- `src/profesionales/profesionales.service.ts`: valida actor, perfil, negocio y asignación; conserva preferencias al apagar atención; comprueba horarios y excepciones antes de reactivar; reemplaza solo los servicios de la sucursal solicitada y registra un evento por cambio real dentro de la transacción.
- `test/fix-modulo-1-t024-t029.e2e-spec.ts`: prueba rutas HTTP con JWT, licencia, dos negocios, administrador, recepción y dos profesionales; cubre cuerpos estrictos, permisos, aislamiento, selección vacía e idempotencia.
- `test/fix-modulo-1-t024-t029.integration-spec.ts`: prueba conservación y recuperación con MariaDB, conflictos de semana y excepción, y carreras coordinadas entre dos conexiones.
- `docs/Fix-modulo-1/tareas.md`: marca como hechas únicamente FIX-T024–FIX-T029 y enlaza esta evidencia.

## Flujo

El administrador o el Profesional propio consulta la asignación de una sucursal y envía `{ "activo": false }` para pausar su atención. La operación cambia únicamente `personal_sucursales.activo`: no borra horarios, selección general ni combinaciones de servicios y no cambia la sucursal global. Un reintento con el mismo valor no crea auditoría nueva.

Al reactivar, la transacción bloquea el perfil, igual que las ediciones de semana y excepciones. Lee las franjas conservadas de las sucursales que atienden y de la candidata, compara los intervalos reales con sus husos y rechaza un empalme sin cambiar el estado ni auditarlo. Para las excepciones, consulta el día civil SQL con `DATE_FORMAT`; convertir el `Date` del driver a UTC puede desplazar la fecha. Si la validación pasa, reactiva la asignación y reaparecen las preferencias previamente guardadas.

La selección por sucursal se consulta y reemplaza con `servicioIds`. El servidor obtiene el negocio del actor y exige que la sucursal esté asignada al perfil autorizado. Cada ID solicitado debe ser un servicio del negocio y estar seleccionado en general por ese Profesional. `[]` apaga todas las combinaciones de esa sucursal sin borrar filas; otro reemplazo recupera solo las indicadas y no modifica las demás sucursales. Los errores de validación ocurren antes de escribir, y una solicitud repetida no duplica auditoría.

## Pruebas y resultados

Las pruebas HTTP se escribieron y ejecutaron primero: las tres fallaron con 404 porque no existían las rutas. Las pruebas de integración también se ejecutaron antes de implementar: las tres fallaron por ausencia del método de atención individual. Tras implementar, una ampliación detectó el desplazamiento del día civil de excepciones; se corrigió y la repetición dirigida pasó.

- `npm run test:integration -- --runInBand test/fix-modulo-1-t024-t029.integration-spec.ts`: 1 suite y 3 pruebas aprobadas. Verifica pausa, recuperación, conflictos de semana y excepción, rollback, auditoría y carreras con dos conexiones.
- `npm run test:e2e -- --runInBand test/fix-modulo-1-t024-t029.e2e-spec.ts`: 1 suite y 3 pruebas aprobadas. Verifica estados HTTP, permisos, aislamiento, cuerpos inválidos, `[]`, preferencias de otra sucursal y reintentos.
- `npm run build`: aprobado.
- `npm run lint`: aprobado.
- `npm test -- --runInBand`: 57 suites y 303 pruebas aprobadas.
- `npm run test:integration -- --runInBand`: 45 suites y 215 pruebas aprobadas.
- `npm run test:e2e -- --runInBand`: 24 suites y 138 pruebas aprobadas. Los mensajes de error impresos por algunos casos históricos corresponden a fallos controlados de auditoría usados para comprobar reversión.
