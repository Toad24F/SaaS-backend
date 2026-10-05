# Resultados M1-T126–T130

## Cambios por archivo

| Archivo | Qué hace |
| --- | --- |
| `db/schema.sql` | Ordena las columnas de licencia como quedan tras las migraciones históricas; conserva fechas, solicitud, bloqueo, remanente cero y versión. |
| `test/instalacion-t126-t127.integration-spec.ts` | Instala las migraciones en base desechable, compara columnas de todas las tablas de dominio con `schema.sql`, comprueba segunda ejecución vacía y prueba remanente cero. |
| `test/esquema-t124-t125.integration-spec.ts` | Amplía la comparación de columnas, índices, claves foráneas y restricciones a `licencias`. |
| `src/auth/dto/acceso-codigo.dto.ts` | Vuelve obligatorio el ID del negocio en la activación HTTP y valida su rango; retira un bloque comentado de DTO. |
| `src/auth/acceso-codigo.controller.ts` | Pasa el ID validado al caso de uso de activación. |
| `src/altas/activaciones.service.ts` | Comprueba que el negocio indicado coincida con el asociado al código antes de crear la cuenta o consumirlo. |
| `test/auth-t45.e2e-spec.ts` | Sustituye la expectativa de una cuenta incompleta por el comportamiento de una invitación sin `Usuario` previo. |
| `test/regresion-auth-t128.e2e-spec.ts` | Recorre invitación, activación, login, sesión, recuperación sin código en respuesta y rechazo de recuperación para Profesional. |
| `src/licencias/licencias.service.ts` | Usa transacciones `READ COMMITTED` para leer el estado actual al serializar suspensión, renovación y reactivación concurrentes. |
| `src/licencias/licencias.service.spec.ts` | Adapta el doble de transacción al aislamiento explícito. |
| `test/licencias-reintentos.integration-spec.ts` | Añade aniversario bisiesto en Chihuahua, remanente cero, idempotencia y rollback al fallar auditoría. |
| `test/sucursales-t065.e2e-spec.ts` | Añade una matriz de permisos de cuatro roles, IDs y cuerpos ajenos para catálogos, cupo y perfiles, con comparación de efectos persistidos. |
| `docs/fase-2-modulo-1/tareas-modulo-1.md` | Marca T126–T130 y enlaza estos resultados. |

Los bloques nuevos incluyen comentarios sobre bases desechables, pertenencia, reloj, aislamiento y reversión. No se reescribió ninguna migración histórica ni se usaron destinatarios reales.

## Pruebas y verificaciones

- **Tests primero:** la comparación completa detectó una diferencia de orden en columnas de licencia; la regresión HTTP detectó la omisión de `negocioId`; la carrera T58 reprodujo una suspensión efectiva después de reactivar. Se corrigieron antes de repetir las pruebas.
- **Instalación y esquema:** 2/2 pruebas T126–T127 y 3/3 comparaciones por dominio aprobadas; las 17 migraciones se aplican una vez y la segunda ejecución devuelve cero cambios.
- **Licencias:** 5/5 casos de aniversario, remanente, rollback y reintentos; 13/13 casos de la suite de concurrencia; la carrera T58 pasó otras tres repeticiones dirigidas.
- **Autenticación y permisos:** 9/9 casos HTTP de identidad, 1/1 recorrido T128 y 1/1 matriz T130; la regresión HTTP existente de T45/T48/T49/T51–T60 aprobó 48/48 casos.
- **Compilación:** `npm run build` correcta.
- **Lint:** `npm run lint` sin errores ni avisos.
- **Suite unitaria completa:** `npm test -- --runInBand` → **56/56 suites y 298/298 pruebas aprobadas**.
- **Suite de integración completa:** `npm run test:integration -- --runInBand` → **37/41 suites y 204/208 pruebas aprobadas**. Persisten cuatro fallos anteriores: dos reversiones históricas de `CodigosInvitacion` y dos expectativas de rechazo SQL que MariaDB acepta con aviso en esta instalación. Las pruebas T126–T127 y T129 pasaron; también dejaron de fallar la carrera T58 y la activación con negocio ajeno.
- **Suite E2E completa:** `npm run test:e2e -- --runInBand` → **20/20 suites y 126/126 pruebas aprobadas**. Los 18 fallos E2E observados antes de este bloque ya no aparecen; la activación valida ahora el negocio de la invitación.
