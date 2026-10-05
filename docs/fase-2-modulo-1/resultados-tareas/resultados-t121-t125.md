# Resultados M1-T121–T125

## Cambios por archivo

| Archivo | Qué hace |
| --- | --- |
| `src/operacion/ejecucion-periodica.service.ts` | Ejecuta al arrancar y cada minuto la conciliación, detección de avisos y hasta 100 trabajos de correo; impide solapar ciclos del mismo proceso y detiene el temporizador al cerrar. |
| `src/operacion/operacion.module.ts` y `src/app.module.ts` | Conectan el coordinador a la aplicación; la ejecución automática se desactiva en el entorno de pruebas para usar un reloj y transporte controlados. |
| `src/licencias/services/conciliador-suspensiones.service.ts` y `src/licencias/licencias.module.ts` | Localizan suspensiones cuyo límite llegó, atribuyen el cambio al superadministrador que lo pidió y reutilizan la operación transaccional que congela tiempo y audita una sola vez. |
| `src/config/configuracion-correo.ts` | Valida al arranque productivo claves HMAC versionadas distintas de JWT, remitente y parámetros SMTP, sin mostrar secretos. |
| `src/correos/procesador-correo.service.ts` | Actualiza su comentario de contrato: ahora el coordinador también lo invoca al arrancar. |
| `.env.example` y `docs/fase-2-modulo-1/configuracion-correo.md` | Dan marcadores sin claves reales e instrucciones de configuración, rotación y recuperación de envíos. |
| `db/schema.sql` | Corrige el cierre de la restricción de horarios y un comentario SQL inválido; así el esquema de referencia se ejecuta completo y coincide con las migraciones en los dominios T124–T125. |
| `src/operacion/ejecucion-periodica.service.spec.ts` y `src/config/configuracion-correo.spec.ts` | Prueban el orden del ciclo y reinicio, la versión HMAC anterior vigente y la configuración incompleta o compartida con JWT. |
| `test/ejecutor-t121-t122.integration-spec.ts` | Prueba con MariaDB temporal el fallo y reintento de SMTP falso, la recuperación de un arrendamiento, y la suspensión al límite exacto con conciliación tardía. |
| `test/esquema-t124-t125.integration-spec.ts` | Ejecuta `db/schema.sql` en una base desechable y compara con la base migrada columnas, índices, claves foráneas, reglas y restricciones de identidad, mensajería, catálogos y calendario. |
| `src/modulos.spec.ts` | Simula el conciliador nuevo para mantener aislada la prueba de composición sin conexión a la base. |
| `docs/fase-2-modulo-1/tareas-modulo-1.md` | Marca M1-T121–T125 y enlaza este resultado. |

Los bloques incorporados tienen comentarios sobre la recuperación, la validación y los límites de cada ciclo. No se modificaron migraciones históricas. El envío tiene semántica de al menos una entrega: una caída después del acuse SMTP y antes de persistirlo puede duplicar el correo al recuperar el arrendamiento.

## Tests y verificaciones

- **Tests primero:** las pruebas iniciales fallaron porque no existían el coordinador ni la validación de configuración; la comparación del SQL detectó dos errores de sintaxis. Se implementó el ciclo y se corrigió el esquema antes de repetirlas.
- **Pruebas dirigidas:** 3/3 de ciclo y conciliación, 2/2 de esquema y 3/3 casos unitarios de configuración y ciclo; transporte falso, reloj fijo y bases temporales.
- **Compilación:** `npm run build` correcta.
- **Lint:** `npm run lint` sin errores; cuatro avisos previos de imports sin uso en `src/auth/dto/acceso-codigo.dto.ts`.
- **Suite unitaria completa:** `npm test -- --runInBand` → **56/56 suites y 298/298 pruebas aprobadas**.
- **Suite de integración completa:** `npm run test:integration -- --runInBand` → **34/40 suites y 196/202 pruebas aprobadas**. Persisten seis fallos anteriores de concurrencia T58, invitaciones, reversión histórica de migraciones y restricciones de envíos. Las dos suites nuevas pasaron.
- **Suite E2E completa:** `npm run test:e2e -- --runInBand` → **15/19 suites y 106/124 pruebas aprobadas**. Persisten 18 fallos anteriores de autenticación, identidad HTTP, recepcionistas y recorridos de licencia; no se añadieron casos E2E en este bloque.
