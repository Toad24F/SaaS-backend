# Resultado M3-T036–T040

Fecha: 18 de octubre de 2026. Este lote publica la selección progresiva de oferta y la consulta anónima de disponibilidad del portal para un negocio identificado por su slug. No crea apartados ni citas.

## Archivos y finalidad

| Archivo | Qué realiza |
| --- | --- |
| `src/reservas-publicas/entradas-publicas.ts` | Valida los únicos filtros permitidos en catálogo y disponibilidad. Exige IDs positivos, fechas válidas y un máximo de 31 fechas inclusivas; rechaza negocio, modalidad manual, horas y exclusiones del navegador. |
| `src/reservas-publicas/catalogo-publico.service.ts` | Lee una instantánea de combinaciones efectivas del negocio. Proyecta únicamente servicio, costo, duración, sucursal y nombre del Profesional; las etapas dependen del servicio y la sucursal elegidos. |
| `src/reservas-publicas/resolver-negocio-publico.service.ts` | Expone la autorización por slug dentro de un manager recibido para que negocio, licencia y catálogo se lean en la misma transacción. La consulta de sesión sigue usando ese método. |
| `src/reservas-publicas/portal-publico.controller.ts` | Añade `GET /catalogo` y `GET /disponibilidad` sin JWT ni cookie. Valida la entrada, responde sin caché y traduce errores técnicos sin exponer datos internos. |
| `src/reservas-publicas/reservas-publicas.module.ts` | Registra el servicio de catálogo y exporta el motor para el controlador HTTP. |
| `src/reservas-publicas/reservas-publicas-http.module.ts` | Actualiza el comentario de la frontera HTTP para reflejar las dos consultas anónimas. |
| `src/reservas-publicas/entradas-publicas.spec.ts` | Prueba filtros progresivos, límite inclusivo de fechas y rechazo de campos reservados al servidor. |
| `test/fase-4-t036-t040.integration-spec.ts` | Comprueba las rutas reales con dos negocios, oferta efectiva, filtrado, privacidad y ranuras con reloj fijo. |
| `test/fase-4-t031-t035.integration-spec.ts` | Actualiza la expectativa de la ruta pública existente: ahora rechaza modalidad manual con 400, pues la ruta ya existe. |
| `docs/fase-4-modulo-3/tareas.md` | Marca M3-T036–T040 terminadas tras la verificación. |

## Flujo

1. `GET /publico/negocios/:slug/catalogo` acepta cero filtros, `servicioId` o `servicioId` más `sucursalId`. La sucursal sin servicio y cualquier campo ajeno producen 400.
2. El servicio captura el instante, abre `REPEATABLE READ` y autoriza el slug, activación y licencia en esa misma instantánea. Consulta uniones acotadas por `negocio_id` y exige estados activos en servicio, sucursal, cuenta, asignación y selecciones.
3. Sin filtros devuelve los servicios que tienen al menos una combinación efectiva. Al seleccionar servicio devuelve sus sucursales compatibles; al añadir sucursal devuelve sus Profesionales. Un ID de otro negocio deja vacía la etapa dependiente y nunca proyecta nombres ajenos.
4. `GET /publico/negocios/:slug/disponibilidad` acepta Profesional, sucursal, servicio y fechas locales `desde`/`hasta`. El slug determina el negocio; la modalidad es siempre pública. La validación permite hasta 31 fechas inclusivas por petición y no modifica el horizonte configurado.
5. El motor público existente vuelve a comprobar licencia, perfil y oferta dentro de su transacción y calcula reglas, horarios, bloqueos y ocupaciones con un instante capturado. Devuelve ranuras, zona horaria e instante de cálculo. Una agenda legítimamente vacía sigue siendo 200.

## Pruebas y resultados

Se escribieron primero las pruebas. La prueba unitaria falló porque aún no existía el validador; la primera ejecución de integración quedó bloqueada por el acceso del sandbox a MariaDB local. Tras implementar las rutas, la prueba focalizada de integración pasó con el permiso local. Las pruebas comprueban proyección de servicio y costo, etapas de sucursal y Profesional, aislamiento de otro negocio, rechazo de demo y filtros desconocidos, ranuras con zona e instante fijado, horizonte de 90 días, rango exacto de 31 fechas y rechazo de 32, modalidad manual e identidades de exclusión.

| Comando | Resultado |
| --- | --- |
| `npm test -- --runInBand entradas-publicas.spec.ts` | 1 suite, 2 pruebas aprobadas. |
| `npm run test:integration -- --runInBand fase-4-t036-t040` | 1 suite, 2 pruebas aprobadas. |
| `npm run build` | Aprobado. |
| `npm run lint` | Aprobado. |
| `npm test -- --runInBand` | 67 suites, 334 pruebas aprobadas. |
| `npm run test:integration -- --runInBand` | 64 suites, 276 pruebas aprobadas. |
| `npm run test:e2e -- --runInBand` | 28 suites, 147 pruebas aprobadas. |

Las verificaciones específicas de fallos técnicos, carreras y estrategias quedan en las tareas de prueba posteriores M3-T042–T044.
