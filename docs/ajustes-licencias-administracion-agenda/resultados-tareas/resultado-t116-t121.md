# Resultado — ALA-T116–ALA-T121

Fecha: 2 de noviembre de 2026.

## Flujo implementado

El rechazo por cupo queda confirmado como `no_registrado` con la huella del formulario y la causa normativa `cupo_telefono_excedido`. Una respuesta perdida se resuelve bloqueando primero la sesión y el intento propios. Si la causa es cupo, el resolutor devuelve esa causa y calcula `puedeCorregir` con el puntero actual, generación, propiedad, liberación y vencimiento del apartado según el reloj del servidor. No libera ni renueva el apartado. Reconoce también la causa `cupo_telefonico` guardada por el lote anterior y la proyecta con el código público normativo.

Un intento ausente o preparado que se resuelve sin resultado conserva el cierre genérico: confirma `no_registrado` y libera únicamente el apartado propio que siga actual. Esa ausencia no autoriza sucesión. Si la espera no permite conocer el resultado, el contrato conserva 503 sin cerrar artificialmente el intento. La repetición de una cita registrada se reconoce antes de contar cupo y devuelve la misma cita y folio, aun cuando el teléfono ya haya alcanzado dos citas futuras.

Al reservar por HTTP, solo el rechazo de cupo devuelve 409 con código `cupo_telefono_excedido`, acción `corregir` y el mensaje exacto de RF-61. Los demás conflictos siguen usando la respuesta segura genérica. La preparación pública acepta `intentoAnteriorId` opcional, lo valida estrictamente y exige que señale el rechazo propio y actual por cupo; una clave nueva sin esa autorización no sustituye el envío incierto. Los datos de otras citas nunca aparecen en la respuesta.

El conteo usa `inicioUtc > ahora`: justo en el inicio una cita deja de consumir cupo, aunque no haya terminado. Las canceladas no cuentan. Dos nombres con el mismo teléfono producen clientes y resúmenes independientes; no se fusionan ni se sobrescriben.

## Archivos agregados o modificados

| Archivo | Qué hace |
| --- | --- |
| `src/reservas-publicas/cupo-telefonico.service.ts` | Define el código y mensaje públicos de cupo, la excepción específica y la lectura compatible de causas antiguas; conserva el conteo transaccional. Los comentarios explican por qué solo esa causa es pública. |
| `src/reservas-publicas/registro-reserva-publica.service.ts` | Persiste la causa normativa en rechazos nuevos y devuelve la excepción de cupo después del commit. |
| `src/reservas-publicas/intentos-reserva-publica.service.ts` | Reconoce rechazos normativos o anteriores para permitir sucesión y reproduce el conflicto terminal sin reabrir ni volver a contar. El comentario explica los envíos tardíos. |
| `src/reservas-publicas/resolucion-reserva-publica.service.ts` | Recupera la causa propia y calcula si aún cabe corregir; conserva la liberación genérica y los 503. El comentario explica el orden de bloqueo y por qué no libera un rechazo conocido. |
| `src/reservas-publicas/errores-publicos.ts` | Traduce la excepción específica al mensaje exacto de RF-61 y mantiene redactados los demás errores. El comentario explica esa separación. |
| `test/ala-t116-t121.integration-spec.ts` (nuevo) | Verifica rechazo recuperable, causa anterior, cierre genérico, 503, límites temporales, personas independientes, vencimiento, propiedad y huella estable sobre bases migradas. Los comentarios explican la preparación y las condiciones de cada caso. |
| `test/ala-t116-t121.e2e-spec.ts` (nuevo) | Recorre cookie, CSRF y rutas reales: 409 específico, resolución, sucesor, repetición, campos desconocidos y envío tardío. Sus comentarios explican la fixture pública. |
| `test/ala-t110-t115.integration-spec.ts` | Ajusta la expectativa de la causa persistida al código normativo que escribe este lote. |
| `docs/ajustes-licencias-administracion-agenda/tareas.md` | Marca T116–T121 y enlaza esta evidencia. |
| Este archivo | Describe el flujo, cada cambio y las pruebas del lote. |
| `tsconfig.build.tsbuildinfo` | Caché de compilación generado; ya estaba modificado al iniciar el trabajo y se conservó. |

No se cambió el esquema ni las migraciones; los campos de causa, sucesión y puntero ya existían. La causa anterior se lee para conservar resultados registrados, mientras que las escrituras nuevas usan la forma normativa.

## Tests primero y resultados

Se escribieron las pruebas de integración y HTTP antes del cambio de producción. La primera integración dio **1 fallo y 4 aprobaciones**: faltaban causa y `puedeCorregir` al resolver el rechazo. La primera HTTP falló porque el 409 aún tenía código y mensaje genéricos. Después se añadió primero la prueba de compatibilidad con la causa anterior; falló y se implementó su lectura.

Las pruebas cubren el límite temporal antes, en y después del inicio; cancelaciones; respuesta perdida y posibilidad de corregir sin ampliar el apartado; ausencia y cierre genérico; 503 sin estado inventado; dos personas con teléfono compartido; repetición registrada con cupo lleno; apartado vencido o ajeno; intento incierto; clave con contenido incompatible; y la respuesta pública exacta sin información de otras citas.

| Comando | Resultado |
| --- | --- |
| `npm run test:integration -- --runInBand ala-t116-t121.integration-spec.ts ala-t110-t115.integration-spec.ts fase-4-t074-t079.integration-spec.ts` | 3 suites, 15/15 pruebas aprobadas. |
| `npm run test:e2e -- --runInBand ala-t116-t121.e2e-spec.ts fase-4-t080-t085.e2e-spec.ts` | 2 suites, 16/16 pruebas HTTP aprobadas. |
| `npm test -- --runInBand` | 89 suites, 410/410 pruebas aprobadas. |
| `npm run test:integration -- --runInBand` | 69 suites aprobadas, 19 fallidas; 340/405 pruebas aprobadas. Ninguna suite de T116–T121 falló. Los fallos restantes corresponden a contratos históricos de horarios, licencias, disponibilidad y migraciones; no se presentan como aprobados. |
| `npm run build`, `npm run lint`, `git diff --check` | Aprobados. |

Las 19 suites históricas aún fallidas incluyen usos de `guardarExcepcion` o `intervaloMinutos` retirados, fixtures incompatibles con activación y transición de horarios, expectativas antiguas de candidatos y reversión de migraciones con claves foráneas. La revisión de esas expectativas está prevista en T141 y la verificación de migraciones en T142–T145; no se alteraron para ocultar fallos de esta ejecución.

La integración manual RF-63/M3-I001/M2-I004 sigue diferida hasta que exista el escritor manual real. Este lote termina en T121; no acredita las carreras T122–T132 ni el cierre de fase.
