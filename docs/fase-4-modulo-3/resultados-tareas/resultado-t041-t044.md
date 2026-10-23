# Resultado M3-T041–T044

Fecha: 18 de octubre de 2026. Este lote normaliza los errores de las rutas públicas existentes y verifica con HTTP y MariaDB la selección de oferta y el cálculo público de disponibilidad. No añade rutas ni escritores de apartados o citas.

## Archivos y finalidad

| Archivo | Qué realiza |
| --- | --- |
| `src/reservas-publicas/errores-publicos.ts` | Convierte excepciones conocidas, fallos temporales de base y errores inesperados en respuestas públicas 400/401/403/404/409/500/503 con mensaje y acción. Usa textos fijos para no publicar SQL, trazas ni datos privados. |
| `src/reservas-publicas/portal-publico.controller.ts` | Aplica el normalizador común a catálogo, disponibilidad e inicialización de sesión; conserva las respuestas correctas de lectura, incluso las agendas vacías. |
| `src/reservas-publicas/errores-publicos.spec.ts` | Comprueba cada estado, acción y ausencia de causas privadas en el cuerpo; distingue 503 temporal de 500 inesperado. |
| `test/fase-4-t041-t044.integration-spec.ts` | Ejercita el portal anónimo sobre dos negocios: estados de oferta, cambios de selección, límites exactos, errores de lectura, continuidad, ocupaciones contiguas, descansos, modos y DST. |
| `docs/fase-4-modulo-3/tareas.md` | Marca M3-T041–T044 al finalizar las verificaciones. |
| `docs/fase-4-modulo-3/resultados-tareas/resultado-t041-t044.md` | Conserva el flujo y el resultado comprobable de este lote. |

## Flujo comprobado

1. El controlador valida el slug y los filtros, consulta el catálogo efectivo o llama al motor público. Si la consulta termina bien, devuelve 200; una lista de opciones o ranuras vacía es un resultado válido.
2. Si falla una etapa, el controlador entrega la excepción al normalizador. Este conserva únicamente los estados públicos previstos y asigna una acción: corregir datos, reiniciar sesión, volver a seleccionar o reintentar. Los detalles de la causa no entran en el cuerpo HTTP.
3. El catálogo exige simultáneamente servicio, sucursal, cuenta de Profesional, asignación y selecciones activas. El cliente que cambia servicio o sucursal recibe opciones dependientes recalculadas; un ID de otro negocio no produce nombres de ese negocio.
4. Disponibilidad conserva la instantánea del motor compartido. La anticipación se compara con el instante capturado y el horizonte con la fecha local de la sucursal. La petición acepta hasta 31 fechas inclusivas aunque la configuración de horizonte sea mayor.
5. El cálculo cruza bloques consecutivos solo cuando hay continuidad de Profesional y sucursal, respeta descansos y ocupaciones sin bloquear extremos contiguos. Ventana Libre conserva más candidatos; Agenda Compacta selecciona referencias próximas. En DST, una recurrencia inválida aparece como omisión y una excepción explícita inválida produce 400.

## Pruebas

Se escribieron las pruebas antes del cambio. La unitaria falló inicialmente porque no existía `errores-publicos.ts`; las nuevas pruebas de integración pasaron con el motor existente, confirmando que las reglas de oferta y agenda ya estaban implementadas. Después del normalizador, ambas pruebas focalizadas pasaron.

La prueba de oferta apaga por separado servicio, sucursal, cuenta, asignación, selección general y selección por sucursal: cada apagado elimina la combinación del catálogo y deja cero ranuras. Luego activa una segunda combinación para verificar que cambiar servicio y sucursal recalcula las opciones sin revelar datos privados o de otro negocio.

La prueba de límites comprueba anticipación en el minuto exacto, horizonte local cero y último día inclusivo, rangos de 31 y 32 fechas, y la diferencia entre 200 vacío, 503 temporal, 500 inesperado y 404 por licencia no disponible. Los fallos no devuelven `ranuras` parciales.

La prueba de agenda verifica dos bloques consecutivos, una ocupación cuyo extremo permite empezar justo al terminar, un descanso que elimina el empalme y menos opciones en Agenda Compacta. Verifica también la omisión de recurrencias durante el salto y el retroceso DST de Nueva York, y el rechazo de una excepción explícita con hora inexistente.

| Comando | Resultado |
| --- | --- |
| `npm test -- --runInBand errores-publicos.spec.ts` | 1 suite, 7 pruebas aprobadas. |
| `npm run test:integration -- --runInBand fase-4-t041-t044` | 1 suite, 4 pruebas aprobadas. |
| `npm run test:integration -- --runInBand fase-4-t041-t044 fase-4-t036-t040 fase-4-t031-t035` | 3 suites, 9 pruebas aprobadas. |
| `npm run build` | Aprobado. |
| `npm run lint` | Aprobado. |
| `npm test -- --runInBand` | 68 suites, 341 pruebas aprobadas. |
| `npm run test:integration -- --runInBand` | 65 suites, 280 pruebas aprobadas. |
| `npm run test:e2e -- --runInBand` | 28 suites, 147 pruebas aprobadas. |
