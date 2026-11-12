# ALA-T133–T141 — Contratos HTTP y expectativas históricas

## Revisión y archivos

Revisión base `fd34843`. Se escribieron primero las pruebas HTTP y se ejecutaron en rojo; las primeras fallas fueron de la semilla de correo y del nombre supuesto de la cookie. Se corrigió la fixture, se amplió la matriz y luego se revisaron las pruebas históricas que seguían usando contratos sustituidos. No se modificó código de producción ni documentos de evidencia histórica.

| Archivo | Qué hace el cambio |
|---|---|
| `test/ala-t133-t140.e2e-spec.ts` | Archivo nuevo. Arranca Nest con dos negocios, JWT de cinco roles y cookies públicas reales sobre una base migrada desechable. Recorre permisos, campos no autorizados, origen/CSRF/cuerpo, reintentos, redacción, auditoría y las rutas públicas y privadas. Sus comentarios explican las barreras y los resultados que se vuelven a leer. |
| `test/fase-3-t031-t038.integration-spec.ts` | Revisa la expectativa anterior de descanso y excepción operativos: comprueba el 409 de transición, que las filas antiguas permanecen y que una lectura posterior a la transición funciona, incluido DST. Cita ALA RF-36–RF-37. |
| `test/fase-3-t044-t049.integration-spec.ts` y `test/fase-3-t050-t056.integration-spec.ts` | Sustituyen el intervalo anterior por la separación y los descansos por huecos entre franjas; actualizan inicios redondeados y grupos compactos según ALA RF-36, RF-39–RF-40 y RF-46–RF-52. |
| `test/fase-3-t067-t073.e2e-spec.ts` | Representa el descanso como dos franjas y verifica la causa `horario_insuficiente`; el PUT usa el contrato nuevo de separación. Cita ALA RF-36, RF-38–RF-40. |
| `test/fase-4-t031-t035.integration-spec.ts` y `test/fase-4-t041-t044.integration-spec.ts` | Ajustan la revalidación de un apartado histórico sin contexto, la cuadrícula de cinco minutos y el rechazo por transición de excepción. Citan ALA RF-37, RF-46–RF-47 y RF-55. |
| `test/fase-4-t045-t051.integration-spec.ts`, `test/fase-4-t052-t057.integration-spec.ts` y `test/fase-4-t086-t091.integration-spec.ts` | Envían `tiempoEntreCitasMinutos`, retiran la llamada a excepciones operativas, representan un retiro de semana con el escritor real y conservan el modo capturado por el apartado. Citan ALA RF-37, RF-40, RF-46 y RF-54. |
| `docs/ajustes-licencias-administracion-agenda/tareas.md` | Marca T133–T141 y enlaza esta evidencia. |

## Flujo y pruebas

1. La frontera privada autentica un JWT y autoriza el rol; los servicios resuelven el negocio desde la sesión y comprueban pertenencia. La matriz T133 ejercita cupos de usuarios, baja y restauración, precio público y configuración con superadmin, administradores de dos negocios, Recepción y Profesional. Una mutación de otro negocio no alcanza su fila.
2. La frontera pública resuelve el negocio por slug. T134 envía campos de autoridad falsos en apartado, intento y reserva y comprueba 400 sin operación ni cita. T135 prueba cookie, origen y CSRF; el parser rechaza el cuerpo mayor de 32 KiB antes del controlador y no crea filas.
3. T136 prepara un intento real, induce un deadlock controlado en la primera transacción y confirma el reintento. Luego induce tres timeouts y verifica 503, intento aún preparado y cero citas adicionales. T137 comprueba que un error con apariencia de SQL sale como mensaje genérico, que un navegador ajeno no recupera contacto y que la visibilidad de precios se aplica a registro y resolución; las respuestas personales llevan `no-store`.
4. T138 repite publicación, configuración, baja, cupo y suspensión con la misma clave; solo los cambios reales producen eventos con antes/después, sin secretos. T139 recorre las nueve rutas públicas. T140 recorre las cinco rutas privadas y separa 200 funcional negativo de 500/503 técnicos redactados.
5. T141 revisa contratos históricos: 48 horas sigue siendo plazo predeterminado bajo ALA RF-03 y no se cambió; el teléfono continúa siendo contacto compartible con cupo por sucursal bajo ALA RF-56–RF-59 y no se cambió. Las expectativas incompatibles de intervalo, descanso y excepción sí se actualizaron con el RF correspondiente junto a cada bloque. Los documentos históricos permanecen intactos.

## Resultado de ejecución

- `npm run test:e2e -- --runInBand test/ala-t133-t140.e2e-spec.ts`: 8/8, código 0.
- `npm run test:e2e -- --runInBand test/fase-3-t067-t073.e2e-spec.ts`: 1/1, código 0.
- `npm run test:integration -- --runInBand test/fase-4-t086-t091.integration-spec.ts test/fase-4-t052-t057.integration-spec.ts`: 14/14, código 0.
- `npm run test:integration -- --runInBand test/fase-3-t031-t038.integration-spec.ts`: 3/3, código 0.
- `npm run test:integration -- --runInBand test/fase-3-t044-t049.integration-spec.ts`: 4/4, código 0.
- Lote de seis regresiones `fase-3-t005-t010`, `fase-3-t044-t049`, `fase-3-t050-t056`, `fase-4-t031-t035`, `fase-4-t041-t044` y `fase-4-t045-t051`: 6 suites y 21/21 pruebas, código 0.
- `npm test -- --runInBand`: 89 suites y 410/410 pruebas, código 0.
- `npm run build`: código 0.
- `npm run lint`: código 0 tras retirar un import no usado.

## Matriz RF → caso → resultado

| RF ALA | Caso o regresión | Resultado |
|---|---|---|
| RF-03–RF-04, RF-15 | T138, suspensión idempotente y evento único | Pasó |
| RF-17, RF-23, RF-31–RF-32, RF-40, RF-64 | T133 y T138, roles, dos negocios y auditoría | Pasó |
| RF-33–RF-35 | T137 y T139, precio visible/oculto y rutas públicas | Pasó |
| RF-36–RF-38 | Regresiones de horario, citas afectadas y transición de datos antiguos | Pasó |
| RF-39–RF-40, RF-46–RF-55 | T140 y regresiones de configuración, redondeo y apartado histórico | Pasó |
| RF-56–RF-59 | Revisión documental de teléfono compartido y cupo por sucursal; el comportamiento fue acreditado en T119–T122 | Sin cambio de expectativa aquí |
| RF-61, RF-64–RF-68 | T134–T137 y T139–T140, autoridad del cuerpo, seguridad, reintentos, errores y rutas | Pasó |
| RF-69 | T138, antes/después y no duplicación de auditoría | Pasó |

Las pruebas de escritura usan `conBaseMigrada`, que crea y destruye únicamente bases con nombre temporal validado. No se usó la base cotidiana. Las suites globales de fase 3/4 fuera de este lote conservan fallos históricos independientes; esta evidencia solo acredita los casos enumerados y no declara cerrada la fase ni integrada la reserva manual.
