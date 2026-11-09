# Ajuste de agenda — Periodo completo para el calendario

Fecha: 2026-11-09. Revisión base `f2460d2` con los cambios locales preexistentes de M4-T031–M4-T036, todavía sin commit. Se conservan esos cambios y sus informes históricos. Ajuste solicitado expresamente por el responsable tras revisar la demo como referencia visual. No implementa tareas posteriores ni conecta frontend.

Fuentes consultadas: [reglas](../../reglas.md), [constitución](../constitucion-modulo-4.md), [especificación](../spec.md), [plan](../plan.md), [tareas](../tareas.md) y contratos existentes de acceso, calendario, causas y errores. La petición actual sustituye la paginación anterior de citas; no sustituye los permisos ni las reglas de disponibilidad.

## Contrato aprobado y flujo

`GET /citas?desde=2025-12-29&hasta=2026-02-08` cubre 42 fechas inclusivas: seis semanas, incluidos días de meses vecinos. No son 42 citas. Conserva filtros de sucursal, Profesional, estado y nombre del paciente. Rechaza los antiguos parámetros `pagina`/`limite`; responde `{desde,hasta,citas}` sin `hayMas`. Es un cambio del contrato anterior, cuya paginación aún no consumía el frontend conectado.

1. Validar rango civil de 1 a 42 fechas y campos conocidos antes de abrir la lectura de agenda. La guarda JWT conserva su autenticación previa; la prueba de validación comprueba que no se llama a la frontera de acceso del caso de uso con entradas inválidas.
2. Reconstruir sesión/cuenta/rol/negocio/licencia y aplicar alcance de servidor por negocio y perfil propio. Conservar filtros, snapshots y selección temporal por zona histórica.
3. En una única transacción `REPEATABLE READ`, leer el periodo ordenado por inicio UTC e ID con límite interno de 1.001 filas. No hay `OFFSET` ni continuación entre solicitudes.
4. Si hay más de **1.000 citas después de fechas, alcance y filtros**, rechazar antes de calcular causas. Responder 400, `codigo: agenda_demasiado_amplia` y «Hay demasiadas citas para mostrar el periodo completo. Reduce el rango o filtra por sucursal o Profesional.». Nunca devolver citas truncadas o parciales. El código y texto solo se conservan para la excepción de dominio conocida; errores arbitrarios no pueden suplantarlos.
5. Si cabe, calcular causas con el mismo manager/reloj y devolver todas las citas autorizadas. Un fallo en cualquier causa aborta la respuesta completa. Un resultado vacío correcto conserva fechas y `citas: []`.
6. Enviar un resumen para las tarjetas: ID, versión, negocio, sucursal/personal/servicio, extremos UTC/locales y zona histórica, estado, origen, folio, nombre histórico de paciente/combinación y causas. No enviar teléfono, notas, precio, clienteId ni fin protegido internos en la lista.
7. `GET /citas/:id` conserva contacto/notas/precio y snapshot completo propio. `GET /citas/:id/historial` conserva páginas y privacidad. Las tres rutas conservan guardas y `no-store`; disponibilidad privada/pública conserva **31 fechas**, sin ampliar motor ni horizonte.

El tope de 1.000 es una decisión técnica inicial y provisional para acotar respuesta y cálculo de causas, no un cupo para registrar reservas ni una garantía de rendimiento. Debe medirse con una carga representativa antes de ajustarlo. Las pruebas de frontera usan mayoritariamente citas canceladas para separar corrección del límite de un benchmark de causas. La interfaz futura debe pedir acotar si recibe el código de exceso, no interpretar el rechazo como calendario vacío.

«Periodo completo» se refiere a las citas registradas autorizadas dentro de las fechas/filtros. No incluye una promesa de disponibilidad: apartados vigentes, horarios y bloqueos también condicionan una reserva. Un hueco visual no autoriza crear o mover citas; los escritores deben revalidar el motor y sus bloqueos comunes según los contratos vigentes.

## Archivos de este ajuste y propósito

| Archivo | Cambio |
| --- | --- |
| `src/citas/consulta-agenda.entrada.ts` | Admite 42 fechas inclusivas y retira páginas del contrato; rechaza `pagina`/`limite`, aunque sus valores fueran válidos antes. |
| `src/citas/consulta-agenda.service.ts` | Lee el conjunto completo sin offset, controla volumen con una fila centinela antes de causas y construye un resumen explícito ligero. Conserva detalle, historial y su autorización. |
| `src/citas/limites-agenda.ts` | Nuevo archivo con topes técnicos, código/mensaje seguros y excepción específica de periodo demasiado amplio. |
| `src/citas/errores-operativos.ts` | Reconoce solo la excepción nueva para conservar su texto/código seguros, sin permitir que un error arbitrario copie ese contenido. Mantiene normalización idempotente y siete estados previos. |
| `test/agenda-periodo-completo.spec.ts` | Nuevo archivo: nueve casos sobre rango 1/7/31/42 frente a 43 fechas, parámetros obsoletos, disponibilidad a 31 y error seguro no suplantable. |
| `test/agenda-periodo-completo.e2e-spec.ts` | Nuevo archivo: cuatro casos con aplicación real, dos conexiones y bases migradas. Prueba 111 filas completas, extremos de las seis semanas y día 43 excluido, fronteras de 1.000/1.001, filtros tras rechazo, resumen/detalle/historial y fotografía de lectura. |
| `test/fase-5-t025-agenda.spec.ts` | Adapta validación previa al contrato sin páginas y rango máximo actual; conserva casos temporales existentes. |
| `test/fase-5-t026-t030.integration-spec.ts` | Sustituye expectativas de páginas por periodos completos y orden estable, incluso 111 filas. El contacto/notas se comprueban ahora en detalle propio. Conserva filtros, roles y zonas. |
| `test/fase-5-t034-t036.e2e-spec.ts` | Adapta entradas, reconstrucción del periodo y cuerpo vacío al contrato nuevo. Conserva pruebas de guardas, privacidad, fechas, cinco estados, causas y fallos sin resultados parciales. |
| `docs/reglas.md` | Distingue 42 fechas de agenda frente a 31 de disponibilidad y preserva paginación del directorio/historiales. |
| `docs/fase-5-modulo-4/spec.md` | Incorpora la decisión solicitada al contrato normativo de lectura, incluido el tope provisional. Conserva los 47 RF y su numeración. |
| `docs/fase-5-modulo-4/plan.md` | Define API, respuesta y flujo completos sin páginas, control previo a causas y lectura coherente. Identifica el inventario inicial como antecedente, para no negar las rutas ya implementadas. |
| `docs/fase-5-modulo-4/tareas.md` | Enlaza esta revisión y actualiza criterios de M4-T025/M4-T030/M4-T090. No marca tareas futuras. |
| `docs/fase-5-modulo-4/resultados-tareas/matriz-aceptacion-t001.md` | Actualiza aceptación prevista de rango/búsqueda y enlaza evidencia nueva sin cerrar RF completos de interfaz. |
| `docs/fase-5-modulo-4/resultados-tareas/ajuste-agenda-periodo-completo.md` | Nuevo informe con la autorización, flujo, ruptura del contrato anterior, archivos, ciclo rojo/verde y resultados verificables. |

Los demás archivos modificados/sin seguimiento que ya estaban en el árbol al comenzar pertenecen al lote anterior y se preservan; no se atribuyen como creación de este ajuste. `tsconfig.build.tsbuildinfo` ya tenía cambios: el comando de build conserva sus bytes de entrada y los repone en `finally`, sin restaurarlo a HEAD ni descartar trabajo previo.

## Pruebas primero

Antes de modificar implementación se añadieron y ejecutaron `test/agenda-periodo-completo.spec.ts` y `test/agenda-periodo-completo.e2e-spec.ts`. Unitarias iniciales: **6 fallidas y 3 aprobadas de 9**, 2,049 s, por páginas aún presentes, rango de 42 rechazado y parámetros antiguos aceptados. HTTP inicial: **4 fallidas de 4**, 8,735 s, por contrato anterior de 31 fechas y falta del error de volumen. No se atribuye cobertura nueva a esos fallos.

Después de implementar: nuevas unitarias 9/9 y HTTP 4/4 (2,082 s y 10,311 s). Se adaptaron las pruebas previas para exigir conjuntos completos, preservando alcance, fechas, estados, snapshot en detalle y paginación del historial. Se reforzó además la prueba de los extremos del día 1/día 42 y exclusión del día 43 antes de la verificación final.

## Verificaciones

| Verificación | Resultado |
| --- | --- |
| Unitarias focalizadas (entrada, calendario y errores) | 3 suites, 53/53 aprobadas, 4,963 s. |
| Integración focalizada (regresión de lista, causas, detalle e historial) | 2 suites, 11/11 aprobadas, 21,871 s. |
| HTTP focalizado (contrato nuevo y lecturas previas) | 2 suites, 11/11 aprobadas, 23,286 s. |
| HTTP nuevo final con extremos reforzados | 1 suite, 4/4 aprobadas, 9,934 s. |
| `npm run build` | Aprobado, código 0; `Incremental_preservado=True`. |
| `npm run lint` | Aprobado, código 0, sin advertencias. |
| `npm test -- --runInBand` | 94 suites aprobadas y una fallida; 507 aprobadas y una fallida de 508, 64,172 s, código 1. |
| `npm run test:integration -- --runInBand` | 96 suites, 482/482 aprobadas, 810,209 s, código 0. |
| Suite HTTP/e2e completa | 45 suites, 214/214 aprobadas, 496,016 s, código 0; base efímera separada eliminada al finalizar. |

Se usan exclusivamente bases de escritura identificadas como test; los casos nuevos se ejecutan con AppModule, JWT, manager, reloj y dos conexiones reales en bases efímeras `citas_m4_test_<UUID>`, con limpieza del helper. No se modifica frontend, esquema, entidades, migraciones ni escritores.

El único fallo unitario completo es el pendiente anterior de `test/ala-preparacion-documental.spec.ts:16`: espera «pendiente de aprobación» en la constitución de ajustes que ya declara aprobación. Se conserva como pendiente externo; no se modifica esa prueba ni su constitución ni se declara aprobada toda la suite unitaria.

`git diff --quiet HEAD` confirmó que la prueba documental y su constitución permanecen sin cambios. Las nueve pruebas unitarias y cuatro HTTP nuevas suman **13/13 aprobadas**; las pruebas adaptadas conservan sus casos de aislamiento, estados, zonas y fallos. La ejecución HTTP completa incluye los 210 casos anteriores más los cuatro nuevos.

HTTP completo usa el mismo Jest/configuración de `npm run test:e2e -- --runInBand`, sin filtros. Un padre Node registra `ts-node` con `transpileOnly`/`rootDir='.'`, carga `test/setup-env.ts`, crea/migra una base con `conBaseOperativa`, pasa su nombre al hijo como `TEST_DB_NAME`/`TEST_DB_CONFIRMED`, espera la salida y la limpieza antes de devolver el código. Así se separa de la base de la integración completa. Comando del hijo:

```text
node --experimental-vm-modules node_modules/jest/bin/jest.js --config ./test/jest-e2e.json --runInBand
```

No se cambia `.env.test.local` ni el reloj del sistema. Los comentarios nuevos explican el rango inclusivo, límites técnicos frente a cupos de reserva, fila centinela después del alcance, lectura completa, proyección ligera y rechazo seguro sin cálculo parcial. El frontend permanece pendiente de integración: debe consumir `{desde,hasta,citas}` y abrir detalle para datos completos; usar los parámetros antiguos ahora devuelve 400.

## Revisión de cierre

Se verificaron los bordes 42/43 fechas y 1.000/1.001 citas, orden estable, vacío legítimo, aislamiento, filtros después del rechazo, snapshot histórico en detalle, historial paginado, lectura coherente con dos conexiones y fallos sin resultados parciales. Las pruebas focalizadas suman 75 casos aprobados (53 unitarios, 11 de integración y 11 HTTP), con repetición final de los cuatro HTTP nuevos tras reforzar los extremos. Las suites completas y su único pendiente documental están en la tabla.

Se revisó la coherencia de reglas, especificación, plan, criterios y matriz con el contrato actual; enlaces locales válidos y `git diff --check` sin errores. El build conservó los bytes previos del archivo incremental modificado. Se mantiene la evidencia de M4-T031–M4-T036 como antecedente y no se marcan tareas posteriores, no se cierra la fase ni se habilita producción. El límite de volumen requiere medición representativa futura; estas pruebas acreditan corrección y regresión, no capacidad productiva.
