# Evidencia de T06: reloj y datos reutilizables

RF referenciados: **RF-06, RF-10, RF-20, RF-23 y RF-28**.

Se escribieron primero las suites `test/support/reloj.spec.ts` y `test/support/datos-negocios.spec.ts`. La primera ejecución falló porque los helpers aún no existían. Después se implementaron y se ejecutó la suite completa.

## Uso

```ts
import { RelojPrueba } from '../test/support/reloj';
import { crearDosNegocios } from '../test/support/datos-negocios';

const reloj = new RelojPrueba(new Date('2026-09-10T12:00:00Z'));
const [primero, segundo] = await crearDosNegocios(reloj);
// primero.negocio, primero.administrador y primero.recepcionista
reloj.avanzar(30 * 60 * 1000);
const ahora = reloj.ahora();
```

Ajustar las rutas de importación al archivo que utilice los helpers. El reloj permite fijar fechas y avanzar por milisegundos sin esperas. Devuelve copias de Date, rechaza entradas inválidas y no modifica el reloj global; los futuros servicios deberán recibir explícitamente el proveedor de tiempo al probarse.

Los datos se generan en memoria con las entidades actuales. Cada negocio tiene administrador y recepcionista propios, con relaciones coherentes, IDs distintos y correos/slugs únicos. Los IDs sintéticos son exclusivos del contexto de ejecución y no deben persistirse en MariaDB; las futuras pruebas de persistencia deberán usar IDs asignados por la base. El hash bcrypt válido utiliza coste reducido exclusivamente en estas fixtures.

## Verificación

- `npm test -- --runInBand`: **8 suites, 45 pruebas aprobadas**, incluidas 11 nuevas.
- `npm run build`: aprobado.
- `npm run lint`: aprobado, sin advertencias del linter.
- `npx tsc --noEmit --incremental false`: aprobado.

Se verifican avance temporal exacto, independencia entre relojes, rechazo de fechas/avances inválidos, pertenencia de usuarios, ausencia de colisiones entre llamadas y ausencia de objetos/fechas compartidos entre negocios.

**T06 puede marcarse manualmente como hecha.** No se modificó su casilla ni se inició T07. No hubo cambios de producción o de base de datos. Esta tarea prepara herramientas para verificar los RF; no implementa todavía las reglas de códigos, sesiones o vigencias.
