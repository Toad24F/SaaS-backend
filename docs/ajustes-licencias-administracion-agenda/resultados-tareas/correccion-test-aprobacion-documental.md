# Corrección del test de aprobación documental

Fecha: 2026-11-10. Revisión base: `5b45c5b`, con cambios locales del lote M4-T043–M4-T047 presentes al comenzar. Alcance: corregir el test documental obsoleto, sin modificar funcionalidad ni casillas de otras tareas. Fuentes: [reglas](../../reglas.md), [constitución](../constitucion.md), [especificación](../spec.md), [plan](../plan.md) y [tareas](../tareas.md).

## Causa y archivos

`test/ala-preparacion-documental.spec.ts:16` todavía exigía «pendiente de aprobación» en las tres fuentes actuales. Además buscaba el encabezado «Referencias y precedencia propuesta». Los documentos ya registraban su aprobación por el responsable del proyecto el 8 de noviembre de 2026 y la precedencia vigente. El fallo era una expectativa documental desactualizada.

| Archivo | Cambio y propósito |
| --- | --- |
| `test/ala-preparacion-documental.spec.ts` | Actualiza el nombre del primer caso y exige aprobación en el encabezado de cada fuente, con la fecha registrada. Comprueba la precedencia vigente y que aprobar documentos no acredita implementación ni integración manual. Conserva terminología, alcance backend, inventario y plantilla. Añade comentarios que explican la separación entre estado vigente y evidencia histórica. |
| `docs/ajustes-licencias-administracion-agenda/tareas.md` | Enlaza este complemento en ALA-T002 sin cambiar su casilla ni su evidencia original. |
| Este informe | Registra causa, flujo de validación, comandos y resultados de la corrección. |

Constitución, especificación, plan y [evidencia histórica ALA-T002–T007](resultado-t002-t007.md) permanecen intactos. Los informes de M4 conservan el fallo que realmente observaron; este complemento registra su resolución posterior.

## Flujo comprobado

1. Leer las tres fuentes vigentes y verificar su estado aprobado, sin aceptar «pendiente de aprobación» en ellas.
2. Comprobar la precedencia de las reglas aprobadas sobre antecedentes incompatibles, el alcance backend y la advertencia de que aprobación no equivale a implementación.
3. Leer la evidencia histórica y exigir que conserve el estado de propuesta pendiente que tenía al ejecutarse aquella preparación documental.
4. Mantener los otros dos casos sobre contratos/rutas conservadas y campos obligatorios de evidencia.

## Comandos y resultados

| Comando o comprobación | Resultado |
| --- | --- |
| `npm test -- --runInBand test/ala-preparacion-documental.spec.ts` antes del cambio | Un test fallido y dos aprobados; 0,850 s, código 1. Reproduce la expectativa obsoleta de la línea 16. |
| Mismo comando después del cambio | Tres tests aprobados, 0,400 s, código 0. |
| `npm test -- --runInBand` | **96 suites y 545 tests aprobados**, cero fallos y cero omitidos; 65,415 s, código 0. |
| `npm run lint` | Aprobado, código 0, sin avisos. |
| `npm run build` | Aprobado, código 0. |
| `git -c core.safecrlf=false diff --check` y enlaces locales | Sin errores de espacios ni enlaces rotos. |

La suite unitaria completa se ejecutó con acceso a puertos locales porque algunos tests existentes levantan servidores HTTP. Esta corrección no escribe en MariaDB. Pruebas omitidas: no se repiten integración, e2e ni navegador porque solo cambian comprobaciones documentales y su evidencia; la lógica productiva y los contratos HTTP permanecen sin cambios en esta corrección. No se atribuyen resultados nuevos de esas suites.

Resultado: queda resuelto el fallo documental previo. No se cierran fases, producción ni las integraciones manuales diferidas ALA-I001–ALA-I003/M2-I004/M3-I001.
