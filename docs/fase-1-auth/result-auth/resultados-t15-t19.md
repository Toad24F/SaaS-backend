# Evidencia de T15–T19: migraciones y SQL de referencia

## Cambios realizados

### T15 — Negocios y usuarios

- Se agregó `1760000000000-CrearNegociosUsuarios.ts`. Crea ambas tablas con slug y correo únicos, correo normalizado, pertenencia obligatoria según rol, cuentas pendientes coherentes y una columna generada que impide dos administradores del mismo negocio, incluso pendientes.
- La migración incluye `down` en orden inverso para retirar únicamente sus tablas.

### T16 — Licencias

- Se agregó `1760000001000-CrearLicencias.ts`. Crea una licencia estrictamente anual por negocio, sin modalidad ni plan, con habilitación/vencimiento conjuntos y reglas de suspensión compatibles con licencias pendientes o vigentes.
- Incluye claves únicas para una licencia por negocio y para reforzar referencias compuestas por tenant.

### T17 — Códigos y sesiones

- Se agregó `1760000002000-CrearCodigosSesiones.ts`. Crea códigos vinculados mediante negocio y usuario, emisor válido, hash único, propósito, historial y un único código vigente por cuenta/propósito.
- La misma migración crea sesiones con UUID, usuario existente, duración exacta de una hora y revocación coherente.

### T18 — Auditoría y límites

- Se agregó `1760000003000-CrearAuditoriaLimites.ts`. Crea eventos con operación única, actor válido y destinos de usuario/licencia reforzados por `negocio_id`.
- También crea un contador único por IP con índices de ventana y bloqueo.

### T19 — Coherencia y versionado

- Se modificó `db/schema.sql` únicamente en su bloque de autenticación para reflejar las cuatro migraciones, retirar modalidad/plan y actualizar las referencias a RF-01–RF-38. Las tablas históricas de citas se conservaron sin cambios.
- Se modificó `.gitignore` para seguir ignorando el resto de `db/`, pero permitir versionar exclusivamente `db/schema.sql`.
- Se actualizaron las entidades con precisión `DATETIME(6)`, columnas generadas, índices, restricciones `CHECK` y relaciones compuestas equivalentes a las migraciones.

Cada migración y ajuste técnico incluye comentarios breves sobre su propósito, aislamiento o restricción. No se migró ni eliminó la base `TEST_DB_*` existente y no se tocaron datos cotidianos.

## Pruebas primero

Antes de implementar se agregó `test/migrations.integration-spec.ts` y `src/database/schema.spec.ts`. La fase roja falló porque no existían las migraciones y el SQL aún contenía modalidad, plan y referencias RF históricas.

La suite de integración crea una base temporal con nombre aleatorio validado, aplica las cuatro migraciones y usa dos conexiones independientes. Verifica:

- correos duplicados/no normalizados, pertenencia por rol y administrador único pendiente;
- licencia única, estados nullable coherentes, habilitación válida y suspensiones incompatibles;
- códigos/sesiones con cuentas existentes, hash único e historial de códigos;
- rechazo de usuarios y licencias de otro negocio en auditoría;
- carrera de inserción de una misma IP, aceptando una sola fila;
- reversión de las cuatro migraciones sin dejar tablas del modelo.

La base temporal se elimina al terminar, incluso tras cerrar ambas conexiones. Este ejecutor es exclusivo de la prueba de migraciones; T71, que ampliará el soporte compartido de persistencia, permanece pendiente.

`schema.spec.ts` verifica las siete tablas de autenticación, la licencia anual sin modalidad/plan y la ausencia de RF-39/RF-40 en ese bloque.

## Verificaciones finales

| Comando | Resultado |
| --- | --- |
| `npm run build` | Correcto |
| `npm run lint` | Correcto |
| `npm test -- --runInBand` | 18 suites, 81 pruebas aprobadas |
| `npm run test:integration -- --runInBand --detectOpenHandles` | 2 suites, 7 pruebas aprobadas |
| `npm run test:e2e -- --runInBand --detectOpenHandles` | 1 suite, 1 prueba aprobada |

T15, T16, T17, T18 y T19 quedan completadas. No se inició T71, T20 ni ninguna tarea posterior.
