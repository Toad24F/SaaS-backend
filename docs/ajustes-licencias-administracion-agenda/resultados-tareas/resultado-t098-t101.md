# Resultado — ALA-T098–ALA-T101

Fecha: 2 de noviembre de 2026.

## Flujo

La consulta pública y la revalidación de un apartado nuevo leen oferta, configuración, atención y ocupaciones dentro de su respectiva transacción. Con esas mismas fuentes construyen espacios libres y llaman al generador de Agenda Libre de T094–T097. En `ventana_libre` se devuelven todos sus inicios válidos. En `agenda_compacta` se agrupan esos mismos candidatos por fecha civil de la sucursal y se conserva únicamente el inicio UTC más temprano de cada fecha. La tarde permanece oculta si existe un horario válido anterior ese día; otra fecha se evalúa de forma independiente.

Un apartado vigente se resta de los espacios libres, por lo que Compacta avanza al siguiente inicio ofrecible. Al liberarlo o al alcanzar exactamente su vencimiento, la lectura deja de contarlo y vuelve a considerar el inicio anterior. La concesión pública revalida bajo sus bloqueos y consulta la misma lista estratégica que la ruta de disponibilidad. El navegador no puede aportar modalidad manual, separación, costo ni fin calculado.

La modalidad manual conserva su cálculo independiente por minuto y las excepciones que ya tenía. La validación pública ya no exige el antiguo anclaje a la cuadrícula original: la pertenencia a la lista generada determina si el inicio se ofrece. Un cálculo correcto sin candidatos responde 200 con `ranuras: []`; una excepción técnica se traduce a 500 o 503 sin ranuras parciales ni mensaje interno.

## Archivos agregados o modificados

| Archivo | Qué hace |
| --- | --- |
| `src/disponibilidad/primeros-compactos.ts` (nuevo) | Selecciona el primer candidato válido por fecha civil IANA de la sucursal y ordena los días por instante UTC. Sus comentarios explican agrupación y comparación. |
| `src/disponibilidad/primeros-compactos.spec.ts` (nuevo) | Prueba mañana frente a tarde, días independientes, fecha local distinta de la UTC y conjunto vacío. Los nombres de los casos y el comentario del cruce de fecha explican las condiciones verificadas. |
| `src/disponibilidad/motor-disponibilidad.service.ts` | Conecta espacios libres, generación pública y selección compacta a consulta y revalidación; retira la comprobación de anclaje público anterior y conserva el recorrido manual. Los comentarios separan el flujo manual y el público. |
| `test/ala-t098-t101.e2e-spec.ts` (nuevo) | Crea una base MariaDB migrada y desechable por caso, configura oferta real y prueba las rutas públicas de disponibilidad, sesión, apartado y liberación. Los comentarios explican la fixture y las franjas de dos fechas. |
| `docs/ajustes-licencias-administracion-agenda/tareas.md` | Marca T098–T101 y enlaza esta evidencia. |
| `docs/ajustes-licencias-administracion-agenda/resultados-tareas/resultado-t098-t101.md` | Registra el flujo, los archivos, las pruebas y los resultados. |

No se agregaron entidades, migraciones ni columnas. La captura persistida de modo y separación en apartados corresponde a T102–T104.

## Tests primero

Se escribieron las pruebas unitarias y HTTP antes del código productivo. La primera ejecución unitaria falló porque `primeros-compactos.ts` no existía. La primera ejecución HTTP mostró el defecto funcional: Compacta devolvía 09:00 y 14:00 en cada fecha, cuando debe devolver solo 09:00. Tras implementar la selección y la conexión, pasaron los casos nuevos. Se añadió después un caso HTTP de duración 32 minutos para comprobar 09:00 → 09:35 y que 09:05 no pueda concederse aunque caiga dentro de la franja.

| Comando | Resultado |
| --- | --- |
| `npm test -- --runInBand primeros-compactos.spec.ts candidatos-libres.spec.ts` | 2 suites, 10/10 pruebas aprobadas. |
| `npm run test:e2e -- --runInBand ala-t098-t101.e2e-spec.ts` | 1 suite, 5/5 pruebas aprobadas. Comprueba dos fechas compactas, avance/liberación/vencimiento, estrategia compartida, rechazo de campos del cliente, duración 32, vacío 200 y errores seguros 500/503 sin resultados parciales. |
| `npm test -- --runInBand` | 89 suites, 410/410 pruebas aprobadas con acceso a puertos locales. |
| `npm run test:integration -- --runInBand ala-t090-t093.integration-spec.ts` | 1 suite, 2/2 pruebas aprobadas; conserva el contrato persistido de espacios libres que usa el motor. |
| `npm run build`, `npm run lint`, `git diff --check` | Aprobados. |

Se intentó también la integración completa. Antes de interrumpirla tras más de dos minutos sin nuevos resultados, mostró fallos de pruebas históricas que esperan cuadrícula/anclajes y Compacta por tramo, usan `intervaloMinutos` o `guardarExcepcion` retirados, requieren transición de horarios antiguos o revierten migraciones con FK. No se obtuvo un conteo final de esa corrida y **no se presenta como aprobada**. Los cinco casos HTTP nuevos y la integración focalizada terminaron en verde sobre bases desechables.

T102–T104 siguen pendientes de persistir y consumir condiciones originales del apartado. M3-I001/M2-I004 continúa diferida al escritor manual real. No se declara producción habilitada ni fase cerrada.
