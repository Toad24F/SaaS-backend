# Resultados M1-T101–T105

## Trabajo realizado

| Archivo | Función del cambio |
| --- | --- |
| `src/bloqueos/validar-bloqueo.ts` | Valida alcance, tipo, motivo, fechas civiles y horas. Distingue días completos inclusivos de un intervalo continuo con dos horas. |
| `src/bloqueos/entities/bloqueo-horario.entity.ts` | Define la entidad con negocio, profesional o equipo, sucursal o todas, creador, motivo e intervalo. |
| `src/database/migrations/1760000015000-BloqueosHorario.ts` | Crea la tabla e índices con claves foráneas compuestas por negocio y restricciones SQL de tipo e intervalo. |
| `db/schema.sql` | Alinea el esquema de instalación con la migración y deja expresados los alcances mediante columnas nulas. |
| `src/bloqueos/bloqueos.service.ts` | Crea, edita, lista y elimina bloqueos bajo autorización por rol, estado de cuenta y pertenencia. La edición valida el alcance anterior y el nuevo; la eliminación afecta solo al ID autorizado. Recupera fechas civiles exactas desde SQL para evitar el desfase de hidratación de `DATE` en este entorno. |
| `src/bloqueos/bloqueos.module.ts` | Registra entidad, servicio y autorización en Nest; la capa HTTP corresponde a T108. |
| `src/bloqueos/validar-bloqueo.spec.ts` | Comprueba intervalos aceptados y entradas incompletas, invertidas o vacías. |
| `test/bloqueos-t101-t105.integration-spec.ts` | Verifica persistencia real, aislamiento entre negocios, permisos, modificación de alcance, consulta y borrado de bloques superpuestos. |
| `src/modulos-fase-2.spec.ts` | Incluye el repositorio nuevo en la prueba de composición sin conexión real. |
| `test/identidad-fase-2.integration-spec.ts` y `test/envios-correo.integration-spec.ts` | Actualizan el número esperado de migraciones y la reversión incremental al añadir T101. |
| `test/instalacion-t61.integration-spec.ts` y `test/sucursales-t060.integration-spec.ts` | Actualizan la instalación esperada y la reversión/reaplicación ordenada de las tablas que dependen de sucursales. |
| `docs/fase-2-modulo-1/tareas-modulo-1.md` | Marca T101–T105 como completadas y enlaza esta evidencia. |

Los comentarios agregados junto al validador, entidad, migración, servicio y esquema explican el alcance, las fechas civiles y las comprobaciones de pertenencia.

## Pruebas y verificaciones

- **Tests primero:** la nueva prueba unitaria falló inicialmente porque `validar-bloqueo.ts` aún no existía. Tras implementar, pasó. La prueba de integración detectó un desfase al leer `DATE`; se corrigió. Otra prueba nueva falló cuando una cuenta desactivada pudo leer bloqueos; se corrigió la autorización. La suite específica termina con **3/3**.
- **Suite unitaria completa:** `npm test -- --runInBand` → **53 suites, 292 pruebas aprobadas**.
- **Compilación:** `npm run build` → correcta.
- **Lint:** `npm run lint` → salida 0; cuatro avisos previos de imports sin uso en `src/auth/dto/acceso-codigo.dto.ts`.
- **Integración completa:** `npm run test:integration -- --runInBand` → **30/36 suites y 181/187 pruebas aprobadas**. Las seis fallas restantes están en T58 concurrente, invitaciones T037–T039, reversión histórica de códigos/identidad, envíos de correo y migraciones antiguas. Los casos afectados por el nuevo conteo y orden de migraciones se corrigieron y volvieron a pasar **6/6** junto a T101–T105.
- **E2E completa:** `npm run test:e2e -- --runInBand` → **13/17 suites y 102/120 pruebas aprobadas**. Los 18 fallos están en recorridos HTTP previos de autenticación, invitaciones, recepcionistas y licencias; los endpoints de bloqueos se implementarán en T108.

T106–T110 conservan la interpretación por zona de cada sucursal, la unión con disponibilidad y los contratos HTTP.
