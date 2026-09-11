# Evidencia de T08: entidad Negocio

## Cambios realizados

- Se trasladó `Negocio` de `src/usuarios/entities` a `src/negocios/entities`, de modo que la entidad pertenezca a su módulo de dominio.
- Se modificó la entidad para conservar nombre, slug, correo, teléfono y fecha de creación, agregar `activadoEn` nullable y retirar `EstadoNegocio`. El negocio ya no representa una suspensión propia; esa responsabilidad corresponde a la licencia.
- Se modificó `NegociosModule` para registrar y exportar el repositorio de `Negocio`, mientras `UsuariosModule` registra únicamente `Usuario`.
- Se actualizaron la relación de `Usuario`, los imports, fixtures y pruebas que apuntaban a la ubicación anterior.
- Se ajustaron `AuthService` y `JwtStrategy` para comprobar si el negocio está activado mediante `activadoEn`. Los futuros bloqueos por suspensión siguen perteneciendo a las tareas de licencia.
- Se agregaron comentarios breves en la entidad, los módulos y la validación de autenticación para explicar la separación entre activación del negocio y bloqueo comercial de la licencia.

No se modificaron migraciones, SQL, licencias ni datos existentes.

## Pruebas primero

Se agregó `src/negocios/entities/negocio.entity.spec.ts` antes de implementar. Inicialmente falló porque la entidad todavía no existía en el módulo Negocios. Sus tres casos verifican los campos de identidad/contacto y activación, la ausencia de estado o suspensión propios y la pertenencia exclusiva del repositorio a `NegociosModule`.

También se actualizaron las pruebas de autenticación, composición y fixtures. Se agregó un caso que rechaza el login de un usuario cuyo negocio continúa pendiente. La primera ejecución E2E detectó que `telefonoContacto: string | null` necesitaba declarar `varchar` explícitamente; corregido el metadato, la suite completa pasó.

## Verificaciones finales

| Comando | Resultado |
| --- | --- |
| `npm run build` | Correcto |
| `npm run lint` | Correcto |
| `npm test -- --runInBand` | 11 suites, 56 pruebas aprobadas |
| `npm run test:integration -- --runInBand --detectOpenHandles` | 1 suite, 2 pruebas aprobadas |
| `npm run test:e2e -- --runInBand --detectOpenHandles` | 1 suite, 1 prueba aprobada |

T08 queda completada. No se inició T09 ni ninguna tarea posterior.
