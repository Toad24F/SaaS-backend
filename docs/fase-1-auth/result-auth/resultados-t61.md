# Resultado de T61 — instalación desde cero

Fecha: 2026-09-23

## Trabajo realizado

- `test/instalacion-t61.integration-spec.ts` agrega la prueba de aceptación de
  T61. Crea una base aleatoria desechable, aplica las cuatro migraciones, inicia
  el `AppModule` real con `synchronize`, `dropSchema` y `migrationsRun` en
  `false`, y confirma que una segunda ejecución no reaplica migraciones. El
  helper valida el nombre antes de crear y eliminar la base, por lo que nunca
  apunta a la base cotidiana.
- La migración `1760000002000-CrearCodigosSesiones.ts`, la entidad `Sesion` y
  `db/schema.sql` ahora expresan la misma restricción de 12 horas que ya usaba
  `SesionesService`. `.env.example` y el entorno de pruebas también usan `12h`
  para que el JWT y la fila persistida caduquen juntos.
- Las pruebas de dominio, integración y HTTP que fabricaban o vencían sesiones
  de una hora se ajustaron a 12 horas. `docs/plan.md` y T28 documentan el nuevo
  contrato sin renovación deslizante.
- Se revisó el alta directa de recepcionistas. `UsuariosService` asigna
  `creadoEn` y `activadoEn` con el mismo objeto `Date`; esto evita que el
  `DEFAULT CURRENT_TIMESTAMP(6)` de MariaDB genere `creado_en` después de
  `activado_en` y mantiene válida `chk_usuarios_activacion`. La prueba T81
  comprueba ambas fechas.

Los bloques nuevos o relevantes conservan comentarios junto al código para
explicar el aislamiento de la base, la segunda ejecución idempotente, la ventana
de 12 horas y el uso de un único instante en el alta de recepción.

## Pruebas primero

La primera ejecución focalizada se hizo antes de modificar la migración:
1 suite ejecutada, 1 caso aprobado y 1 fallido. El caso de 12 horas fue rechazado
por `chk_sesiones_expiracion`, lo que reprodujo la diferencia entre el servicio
y la instalación nueva.

Después de la corrección, la misma prueba focalizada terminó con 1 suite y 2
casos aprobados. Los casos acreditan:

1. instalación de las cuatro migraciones sobre una base nueva desechable;
2. arranque del módulo real sin sincronización automática;
3. segunda ejecución con cero migraciones pendientes y cuatro filas de historial;
4. aceptación de sesiones de 12 horas y rechazo de sesiones de una hora.

## Verificación final

- Suite unitaria: 26 suites, 118 pruebas aprobadas.
- Integración completa: 15 suites, 63 pruebas aprobadas.
- HTTP/e2e completa: 9 suites, 93 pruebas aprobadas.
- Compilación: `npm run build`, correcta.
- Lint: `npm run lint`, correcto y sin diagnósticos.

Las trazas de error T48–T50 y T72 durante e2e son fallos deliberadamente
inyectados para comprobar rollback; Jest cerró todas las suites en verde. T61
queda completada y no se inició T62.
