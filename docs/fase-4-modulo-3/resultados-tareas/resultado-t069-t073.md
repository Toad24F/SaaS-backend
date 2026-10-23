# Resultado M3-T069–T073

Fecha: 19 de octubre de 2026.

## Archivos y finalidad

| Archivo | Qué hace |
| --- | --- |
| `src/reservas-publicas/contacto-reserva-publica.ts` | Valida nombre, teléfono y notas sin truncar; normaliza el contacto y calcula una huella HMAC del formulario normalizado. Sus comentarios explican el límite de caracteres y la normalización permitida. |
| `src/reservas-publicas/limite-cuerpo-publico.ts` | Instala un parser sobre el portal que limita el JSON original a 32 KiB, incluidos espacios y claves repetidas. Devuelve un 400 público ante exceso. |
| `src/main.ts` | Activa el parser limitado antes del parser general de Nest. |
| `src/reservas-publicas/intentos-reserva-publica.service.ts` | Prepara un intento propio bajo bloqueo de sesión y permite reconocer el resultado registrado con la misma huella, incluso después del vencimiento del apartado. Sus comentarios explican el orden de bloqueo, la lectura histórica y la ausencia de renovación. |
| `src/reservas-publicas/reservas-publicas.module.ts` | Registra y exporta el colaborador interno de intentos para el futuro escritor. |
| `.env.example` | Documenta la clave HMAC independiente que deberá conservarse para comparar reintentos. No contiene una clave utilizable. |
| `src/reservas-publicas/contacto-reserva-publica.spec.ts` | Prueba normalización, límites exactos, errores por campo y huellas equivalentes. |
| `src/reservas-publicas/limite-cuerpo-publico.spec.ts` | Prueba el límite exacto de bytes HTTP y el exceso formado solo por espacios. |
| `test/fase-4-t072-t073.integration-spec.ts` | Usa MariaDB migrada y reloj controlado para comprobar idempotencia, propiedad, vencimiento, resultado registrado y cierre terminal. |
| `docs/fase-4-modulo-3/tareas.md` | Registra el estado verificado de M3-T069–T073. |

## Flujo implementado

1. El servidor limita los bytes del JSON crudo del portal. El validador exige nombre y teléfono, recorta espacios en extremos, acepta nombres con acentos hasta 150 caracteres, quita espacios y guiones del teléfono y un prefijo inicial opcional `+52`, y exige diez dígitos nacionales. Las notas opcionales se recortan, admiten hasta 2.000 caracteres y se conservan como texto plano. Los errores indican el campo; no se solicita código telefónico.
2. El contacto ya normalizado se serializa en un orden fijo y se firma con HMAC-SHA256 usando `PORTAL_FORMULARIO_HMAC_SECRET`. La huella permite comparar un reintento sin guardar teléfono o notas en el intento. La clave debe ser independiente de JWT y CSRF y permanecer disponible durante la recuperación de intentos existentes.
3. `preparar` bloquea primero la sesión del navegador y después busca la clave del intento. Una clave repetida devuelve la misma fila si corresponde al mismo apartado; una clave nueva exige apartado propio, actual, vigente y con contexto público. La preparación no mueve `expira_en`, no cambia el puntero de la sesión y no registra cita. Un intento terminal `no_registrado` no se reabre.
4. El futuro escritor podrá llamar `reconocerEnTransaccion` bajo sus bloqueos. Si el intento está `registrado`, compara la huella en tiempo constante y proyecta el resultado de la cita guardada, sin exigir que siga vigente el apartado. Si el contenido cambió o el intento terminó `no_registrado`, devuelve conflicto. Un intento `preparado` devuelve ausencia de resultado para que el escritor continúe con la revalidación de T074.

Las rutas HTTP de preparación y registro corresponden a M3-T080; estas tareas dejan listo el contrato interno sin habilitar todavía la creación de citas.

## Pruebas y resultados

Se escribieron las pruebas antes de implementar cada bloque. La primera ejecución de contacto y de intentos falló porque los módulos aún no existían. Después de implementar, las pruebas dirigidas pasaron. La ejecución de integración en sandbox falló por `EACCES` al conectar a MariaDB local; con acceso local permitido, pasó.

| Comando | Resultado |
| --- | --- |
| `npm test -- --runInBand src/reservas-publicas/contacto-reserva-publica.spec.ts` | 1 suite, 9 pruebas aprobadas. |
| `npm test -- --runInBand src/reservas-publicas/limite-cuerpo-publico.spec.ts` | 1 suite, 2 pruebas aprobadas. |
| `npm run test:integration -- --runInBand fase-4-t072-t073` | 1 suite, 2 pruebas aprobadas con MariaDB local. |
| `npm run build` | Aprobado. |
| `npm run lint` | Aprobado. |
| `npm test -- --runInBand` | 72 suites, 361 pruebas aprobadas. |
| `npm run test:integration -- --runInBand` | 71 suites, 291 pruebas aprobadas. |
| `npm run test:e2e -- --runInBand` | 28 suites, 147 pruebas aprobadas. Los mensajes `ERROR` de fallos inyectados en pruebas históricas fueron esperados; el proceso terminó con código 0. |
