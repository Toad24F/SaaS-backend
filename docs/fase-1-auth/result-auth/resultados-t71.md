# Evidencia de T71: ejecutor de integración para persistencia

## Cambios realizados

- Se modificó `test/support/mariadb.ts` para agregar `conBaseMigrada`. El helper crea una base temporal con nombre aleatorio validado, aplica las migraciones T15–T18 y abre dos `DataSource` independientes con todas las entidades de la entrega.
- El helper conserva `conDosConexiones`, por lo que el contrato histórico de T05 no cambia.
- La limpieza ocurre en `finally`: primero cierra ambos pools y después elimina exclusivamente la base cuyo nombre cumple `citas_persistencia_<uuid>`. Si falla el caso o algún cierre, conserva y propaga los errores.
- Se agregó `test/persistencia.integration-spec.ts`, que usa repositorios TypeORM reales y no dobles. Inserta negocio, usuario pendiente y licencia, comprueba IDs asignados por MariaDB y verifica desde la segunda conexión el correo normalizado y la pertenencia.
- El segundo escenario provoca un error controlado y comprueba que ambas conexiones quedan cerradas y que la base temporal ya no existe.

El helper y las pruebas incluyen comentarios que explican la validación destructiva del nombre, el orden de cierre y el aislamiento. No se modificaron servicios, entidades, migraciones ni el SQL de referencia.

## Pruebas primero

La prueba se escribió antes del helper. La fase roja produjo 2 fallos porque `conBaseMigrada` todavía no existía. Tras implementarlo, una primera ejecución descubrió que el transformer de TypeORM normaliza el valor persistido sin mutar el objeto entregado a `save`; se corrigió la aserción para comprobar el valor mediante una lectura real desde la segunda conexión.

Los casos finales acreditan:

- ejecución de las migraciones de la entrega en una instalación nueva;
- carga de entidades reales y repositorios;
- dos conexiones independientes sobre la misma base temporal;
- IDs generados por MariaDB;
- visibilidad de datos y normalización entre conexiones;
- cierre de recursos y eliminación de datos tanto en éxito como en fallo.

Cada ejecución crea y elimina únicamente su propia base temporal. La base configurada en `TEST_DB_*` y sus datos permanecen intactos.

## Verificaciones finales

| Comando | Resultado |
| --- | --- |
| `npm run build` | Correcto |
| `npm run lint` | Correcto |
| `npm test -- --runInBand` | 18 suites, 81 pruebas aprobadas |
| `npm run test:integration -- --runInBand --detectOpenHandles` | 3 suites, 9 pruebas aprobadas |
| `npm run test:e2e -- --runInBand --detectOpenHandles` | 1 suite, 1 prueba aprobada |

T71 queda completada. No se inició T20 ni ninguna tarea posterior.
