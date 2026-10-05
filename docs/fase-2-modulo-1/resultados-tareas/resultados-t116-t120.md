# Resultados M1-T116–T120

## Cambios por archivo

| Archivo | Qué hace |
| --- | --- |
| `src/licencias/services/aviso-elegible.ts` | Define la ventana inclusiva desde 48 horas antes y exclusiva al vencer; excluye licencias no habilitadas o bloqueadas. |
| `src/licencias/services/avisos-vencimiento.service.ts` | Detecta vencimientos con reloj explícito, vuelve a comprobar bajo bloqueo la licencia y el administrador actual, y encola una sola vez por versión. |
| `src/licencias/licencias.module.ts` | Publica el detector bajo demanda y conecta la bandeja de correos. La ejecución periódica corresponde a T121. |
| `src/correos/bandeja-correo.service.ts` | Rechaza avisos con versión, fecha, negocio o destinatario obsoletos antes de persistirlos. |
| `src/correos/procesador-correo.service.ts` | Toma avisos además de códigos, revalida vencimiento y destinatario antes de entregar, descarta obsoletos, reintenta fallos vigentes y evita reenviar confirmados. |
| `src/licencias/licencias.service.ts` | Invalida pendientes en la misma transacción de renovación, suspensión efectiva o reactivación y avanza la versión en transiciones reales. |
| `src/database/migrations/1760000016000-SuspensionTrasVencimiento.ts` | Corrige la restricción para permitir que la suspensión de 48 horas se materialice al vencer o después. |
| `src/licencias/entities/licencia.entity.ts` y `db/schema.sql` | Mantienen el modelo y el esquema de referencia acordes con la migración. |
| `test/avisos-t116-t120.integration-spec.ts` | Comprueba frontera de 48 horas, detección tardía, deduplicación, dos procesadores, fallo/reintento, expiración, destinatario sustituido y transiciones de licencia. |
| `test/encolado-correo.integration-spec.ts` | Actualiza la prueba histórica de encolado para usar una licencia y administradora realmente vigentes. |
| `test/identidad-fase-2.integration-spec.ts`, `test/envios-correo.integration-spec.ts` y `test/instalacion-t61.integration-spec.ts` | Actualizan el conteo de migraciones instaladas de 16 a 17, conservando las afirmaciones históricas de esquema. |
| `test/concurrencia-t52-t57.integration-spec.ts` | Espera la versión adicional de la suspensión efectiva en la carrera de renovación y reactivación. |
| `src/licencias/licencias.service.spec.ts` y `src/modulos.spec.ts` | Amplían los dobles de prueba para la invalidación de avisos y la composición del detector bajo demanda. |
| `docs/fase-2-modulo-1/tareas-modulo-1.md` | Marca T116–T120 y enlaza estos resultados. |

Los bloques nuevos y modificados incluyen comentarios que explican bloqueos, versión, descarte y conservación del historial. Los mensajes se construyen al procesar; la bandeja guarda referencias, no el cuerpo del correo.

## Pruebas y verificaciones

- **Tests primero:** la suite nueva falló inicialmente porque faltaba el detector. Después descubrió que la restricción SQL impedía materializar la suspensión exactamente al vencer y que cancelar una suspensión durante la gracia no cambiaba la versión. Ambos casos se corrigieron antes de ejecutar las suites completas.
- **Pruebas dirigidas:** 6/6 casos nuevos de integración; con la regresión de encolado, 10/10 casos en 2 suites.
- **Compilación:** `npm run build` correcta.
- **Lint:** `npm run lint` sin errores; cuatro avisos previos de imports sin uso en `src/auth/dto/acceso-codigo.dto.ts`.
- **Suite unitaria completa:** `npm test -- --runInBand` → **54/54 suites y 295/295 pruebas aprobadas**.
- **Suite de integración completa:** `npm run test:integration -- --runInBand` → **32/38 suites y 191/197 pruebas aprobadas**. Persisten seis fallos anteriores: concurrencia T58, invitaciones T037–T039, reversión histórica de códigos/identidad y validaciones de envíos/migraciones. La suite nueva de avisos pasó 6/6.
- **Suite E2E completa:** `npm run test:e2e -- --runInBand` → **15/19 suites y 106/124 pruebas aprobadas**. Persisten 18 fallos anteriores de autenticación, identidad HTTP, recepcionistas y recorridos de licencia; ninguno pertenece a los avisos.
