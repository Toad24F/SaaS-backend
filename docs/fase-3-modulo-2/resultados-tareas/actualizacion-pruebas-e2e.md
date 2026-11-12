# Actualización de pruebas e2e históricas

Esta nota registra la corrección de tres fallos en dos suites e2e anteriores a la fase 3. Los resultados anotados en `resultados-t057-t061.md` y `resultados-t062-t066.md` describen sus ejecuciones originales; esta verificación posterior no modifica aquella evidencia histórica.

## Cambios y flujo comprobado

- `test/auth-t45.e2e-spec.ts` verifica que `GET /auth/profile`, después de iniciar sesión, entregue también `negocioNombre` con el nombre vigente del negocio. Mantiene la comprobación de que la respuesta no incluya el hash de contraseña y de que el cierre de sesión revoque solo el token presentado. El comentario junto a la expectativa explica de dónde sale el nombre.
- `test/horarios-t093-t095.e2e-spec.ts` crea dos sucursales del mismo negocio con nombres diferentes (`Sede 1` y `Sede 2`) y zonas horarias distintas. Así respeta `uq_sucursales_negocio_nombre` sin alterar el recorrido: crear negocio, usuarios y sesiones; asociar al profesional con ambas sucursales; consultar y modificar horarios según rol; comprobar excepciones y conflictos entre zonas. Un comentario explica la necesidad de nombres únicos.

Solo se ajustaron datos y expectativas de prueba. No se modificaron controladores, servicios, entidades, migraciones ni el contrato HTTP.

## Verificación

Antes del ajuste, la suite e2e completa terminó con **25 de 27 suites** y **141 de 144 pruebas** aprobadas: una expectativa de perfil omitía `negocioNombre` y dos casos de horarios fallaban al preparar sucursales con el mismo nombre. Después del ajuste:

| Comando | Resultado |
| --- | --- |
| `npm run test:e2e -- --runInBand --runTestsByPath test/auth-t45.e2e-spec.ts test/horarios-t093-t095.e2e-spec.ts` | 2 suites y 12 pruebas aprobadas |
| `npm run test:e2e -- --runInBand` | 27 suites y 144 pruebas aprobadas |
| `npm run build` y `npm run lint` | Sin errores |

Las trazas de errores «fallo controlado» que aparecen durante e2e son fallos inyectados deliberadamente para verificar manejo de errores; no son casos fallidos de Jest.
