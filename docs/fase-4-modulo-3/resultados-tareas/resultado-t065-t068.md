# Resultado M3-T065–T068

Fecha: 18 de octubre de 2026.

## Archivos y finalidad

| Archivo | Qué hace |
| --- | --- |
| `test/fase-4-t065-t068.integration-spec.ts` | Añade cuatro pruebas HTTP con MariaDB migrada, reloj inyectado y sesiones anónimas reales. Cada caso aísla su base y comprueba tanto las respuestas como las filas persistidas. Los comentarios del archivo explican la preparación, los commits y las comprobaciones históricas. |
| `docs/fase-4-modulo-3/tareas.md` | Marca M3-T065–T068 como hechas tras verificar la suite. |
| `docs/fase-4-modulo-3/resultados-tareas/resultado-t065-t068.md` | Explica el flujo ejercitado y conserva los resultados de las verificaciones. |

No se modificó código de producción: las pruebas nuevas pasaron con el servicio y las rutas de M3-T058–T064.

## Flujo comprobado

1. **Plazo:** la primera concesión guarda `expira_en` a cinco minutos del reloj del servidor. Las lecturas, una entrada inválida, una clave reutilizada con otra selección y la repetición correcta no cambian ese valor ni insertan otro apartado. Un milisegundo antes sigue vigente; en el límite exacto y después aparece vencido, aunque la fila histórica se conserve.
2. **Reemplazo:** al pedir otra selección, la primera transacción libera el apartado actual e incrementa la generación. Si la nueva hora no está disponible, la operación termina rechazada y el apartado anterior sigue liberado. Con generaciones posteriores, un aviso de liberación o la repetición de una clave antigua no altera el apartado más reciente; solo queda uno vigente.
3. **Interrupción:** se provoca un error técnico en la revalidación de la segunda transacción. La respuesta pública oculta el detalle interno; la primera transacción permanece confirmada con la liberación anterior y la operación `preparada`. Reintentar la misma clave concede una sola fila. Una negativa funcional posterior queda terminal y repetirla no crea un apartado.
4. **Propiedad, precio e historia:** otro titular y una sesión de otro negocio no pueden consultar ni liberar el apartado. El costo se copia desde el servicio al conceder; cambiar el catálogo no modifica el costo aceptado de la operación anterior, y una nueva toma el costo actualizado. Un bloqueo histórico sin sesión ni operación pública sigue ocupando el intervalo, pero ninguna sesión del portal puede consultarlo o liberarlo.

## Pruebas y resultados

Se escribió primero `test/fase-4-t065-t068.integration-spec.ts` y se ejecutó antes de cualquier cambio de producción. Los cuatro casos pasaron directamente; la evidencia demuestra el contrato existente sin ampliar el alcance a registro de citas.

| Comando | Resultado |
| --- | --- |
| `npm run test:integration -- --runInBand fase-4-t065-t068` | 1 suite, 4 pruebas aprobadas. |
| `npm run build` | Aprobado. |
| `npm run lint` | Aprobado. |
| `npm test -- --runInBand` | 70 suites, 350 pruebas aprobadas. |
| `npm run test:integration -- --runInBand` | 70 suites, 289 pruebas aprobadas. |
| `npm run test:e2e -- --runInBand` | 28 suites, 147 pruebas aprobadas. |
