# Resultados M2-T062–M2-T066 — validación puntual y errores HTTP

## Archivos y flujo

`src/disponibilidad/disponibilidad.controller.ts` registra `POST /disponibilidad/validar` con respuesta 200 y los mismos guardias privados de consulta. Aplica la entrada puntual estricta, toma la identidad de la sesión y llama al método `validar` existente del motor. Ese método calcula el fin con la duración efectiva y devuelve `valido` y `motivos`; la ruta no crea citas ni apartados. El controlador también traduce errores de las tres rutas existentes y la nueva: conserva 400/401/403/404, responde 503 para códigos de desconexión, tiempo de espera o bloqueo transitorio conocidos y 500 para fallos inesperados. El mensaje técnico es genérico y no devuelve SQL, trazas ni ranuras parciales. Los comentarios en el archivo explican esa frontera y la ausencia de escritura.

`test/fase-3-t062-t066.e2e-spec.ts` añade tres pruebas HTTP con aplicación real, MariaDB migrada desechable y reloj inyectado. El fixture crea dos negocios con licencia, usuarios de cada rol, sesiones y oferta, y los comentarios explican los datos críticos. La prueba de gracia crea una sesión dentro de las doce horas permitidas por el sistema y mantiene ese mismo token antes y en el límite de 48 horas; para probar después el vencimiento natural abre otra sesión válida, sin forzar una duración de sesión ilegal. `docs/fase-3/tareas.md` marca solo T062–T066 como hechas. `tsconfig.build.tsbuildinfo` es la caché incremental actualizada por `npm run build` y no contiene lógica de negocio.

Flujo: **JWT vigente → rol → entrada estricta → lectura transaccional del motor con reloj único → autorización actual y licencia → oferta, horario y ocupaciones → cálculo de inicio y fin → 200 con validez y causas**. La ruta pública en nombre sigue siendo privada. Si no hay espacios, la consulta entrega 200 con `ranuras: []`; si un inicio no cabe, la validación entrega 200 con causas. Si la fuente o el cálculo fallan, la petición termina sin resultado parcial en 503 o 500 y el cliente puede reintentar. La consulta y la validación no garantizan ni confirman una reserva.

## Tests primero y verificaciones

La prueba HTTP se escribió antes de implementar. Una primera ejecución detectó un error del fixture: intentaba extender una sesión más allá de las doce horas que permite la base. Se corrigió el fixture y, todavía antes del código de producción, se obtuvo la señal roja buscada: la nueva ruta devolvía 404 y una desconexión simulada se devolvía como 500. Al registrar la ruta, otra ejecución mostró el 201 predeterminado de POST; se fijó 200 porque esta operación solo valida. La suite dirigida pasó después.

Los casos comprueban: Administrador, Recepción y Profesional propio; Profesional ajeno del mismo negocio (403) y de otro negocio (404); superadmin (403); ausencia de JWT (401); Recepción sin acceso a configuración; IDs, fecha, hora, rango y campo de apartado inválidos (400); validación positiva y negativa; día sin horario, día completo por cita y oferta inactiva (200); hora local ambigua (400); ausencia de escrituras tras reintentos; acceso durante la gracia de suspensión y rechazo exactamente a las 48 horas y después; vencimiento natural, cuenta inactiva y sesión revocada (401); fallo temporal de fuente (503), fallo inesperado del motor (500), recuperación del reintento y ausencia de datos privados en respuestas.

Resultado del 15 de octubre de 2026:

| Verificación | Resultado |
| --- | --- |
| `npm run build` | Pasó |
| `npm run lint` | Pasó |
| `npm test -- --runInBand` | 64 suites, 327 pruebas aprobadas |
| `npm run test:e2e -- --runInBand test/fase-3-t062-t066.e2e-spec.ts` | 1 suite, 3 pruebas aprobadas |
| `npm run test:integration -- --runInBand` | 55 suites, 250 pruebas aprobadas |
| `npm run test:e2e -- --runInBand` | 25 suites aprobadas y 2 fallidas; 141 pruebas aprobadas y 3 fallidas, de 144 |

Los tres fallos de la suite HTTP completa son los mismos observados y reproducidos aisladamente al cerrar T057–T061: `auth-t45.e2e-spec.ts` espera que el perfil no incluya `negocioNombre`, mientras la respuesta actual sí lo incluye; `horarios-t093-t095.e2e-spec.ts` intenta insertar dos sucursales llamadas `Sede` en el mismo negocio y falla por `uq_sucursales_negocio_nombre` antes de probar las rutas. Ninguno corresponde a las rutas de disponibilidad de este tramo. `git diff --check` terminó sin errores de formato; Git solo avisó de la conversión de LF a CRLF que aplicará a un archivo.

Las escrituras reales de citas y apartados y su revalidación al confirmar siguen reservadas a los módulos posteriores.
