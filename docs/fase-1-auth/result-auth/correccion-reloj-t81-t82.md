# Corrección del reloj de pruebas T81 y T82

Fecha: 2026-09-16

## Problema reproducido

La suite de integración falló antes del cambio con 4 de 43 casos en rojo. Los
escenarios T81 y T82 usaban `2026-09-15T18:00:00.000Z` como instante fijo,
mientras MariaDB asignaba `creado_en` con su reloj real. Al ejecutarse después de
esa fecha, las operaciones intentaban guardar una activación o suspensión anterior
a la creación persistida y las restricciones `chk_usuarios_activacion` y
`chk_licencias_suspension` rechazaban correctamente los datos.

## Corrección

`test/recepcionistas-t76-t81.integration-spec.ts` incorpora
`instantePosteriorAActivacion`. El helper toma la activación realmente persistida
por la fixture y sitúa el reloj controlado un día después. Los casos T81 y T82 ya
no dependen del día calendario en que se ejecuta la suite y conservan un orden
temporal válido para cuentas, licencias y sesiones.

No se modificó código de producción, entidades, migraciones ni restricciones SQL.
Tampoco se inició ninguna tarea pendiente posterior.

## Pruebas primero y verificación

1. Ejecución previa: integración completa con 1 suite fallida y 4 de 43 pruebas
   fallidas por las dos restricciones temporales.
2. Suite focalizada después de la corrección: 1 suite y 9 pruebas aprobadas.
3. Integración completa: 11 suites y 43 pruebas aprobadas.
4. Suite unitaria completa: 26 suites y 118 pruebas aprobadas.
5. `npm run lint`: correcto, sin diagnósticos.
6. `npm run build`: correcto.

La corrección queda cerrada exclusivamente como estabilización de las pruebas de
T81 y T82.
