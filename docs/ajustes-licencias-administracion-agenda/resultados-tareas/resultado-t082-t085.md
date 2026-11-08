# Resultado — ALA-T082–ALA-T085

Fecha: 31 de octubre de 2026. Se escribieron las pruebas primero: `fusion-franjas.spec.ts` falló inicialmente porque faltaba el módulo. La prueba HTTP encontró después un tipo de recurso de auditoría no admitido por el esquema; se corrigió y pasó. Las pruebas nuevas con persistencia usan `conBaseMigrada`, que crea, migra y elimina bases MariaDB desechables.

## Flujo

1. `PUT /profesionales/:id/horario` recibe la semana completa. El DTO ya no declara campos de descanso; la validación estricta responde 400 incluso si llegan con valor `null`. Una llamada interna con descanso no nulo también se rechaza. Un descanso se expresa mediante un hueco entre dos franjas.
2. Las tres rutas de excepciones por fecha dejan de registrarse y responden 404. Los lectores de atención pública, privada, coordinación y reactivación ya no aplican excepciones. Entidades, tablas y filas históricas permanecen. Si un perfil conserva excepciones o descansos antiguos, su lectura o escritura operativa devuelve 409 hasta una transición explícita: no se abre disponibilidad al ignorarlos.
3. El reemplazo bloquea negocio, sedes y perfil; comprueba pertenencia e IDs y valida cada franja. Fusiona transitivamente solo franjas completas contiguas del mismo día, sucursal y estado. Conserva huecos y borradores incompletos. Ordena la semana de forma determinista y conserva el menor ID existente de cada grupo, o crea uno nuevo.
4. Se valida el conjunto canónico contra empalmes y zonas antes de escribir. Un conflicto revierte todo. Si el cambio llegó por HTTP y realmente modificó la semana, la misma transacción audita el antes y después; repetir una semana idéntica no duplica el evento.

## Archivos

| Archivo | Qué hace |
| --- | --- |
| `src/horarios/dto/horarios.dto.ts` | Retira descanso y DTO de excepciones del contrato HTTP. |
| `src/horarios/horarios.controller.ts`, `horarios-acceso.service.ts` | Retiran rutas y fachada de excepciones; pasan el actor al reemplazo. |
| `src/horarios/horarios.service.ts` | Valida y guarda la semana canónica con ID estable, transacción y auditoría. |
| `src/horarios/fusion-franjas.ts` | Fusiona franjas completas sin mutar la entrada y ordena el resultado. |
| `src/horarios/transicion-horarios.ts` | Detecta datos históricos incompatibles sin borrarlos. |
| `src/horarios/atencion.service.ts`, `src/disponibilidad/atencion-interna.service.ts` | Proyectan semana y bloqueos sin excepciones; cierran la lectura ante datos heredados. |
| `src/horarios/coordinacion-horarios.ts`, `src/profesionales/profesionales.service.ts` | Validan coordinación y reactivación solo con semana y bloquean datos heredados. |
| `src/horarios/fusion-franjas.spec.ts` | Prueba fusión transitiva, menor ID, huecos, otros estados/sedes/días y borradores. |
| `test/ala-t082-t085.e2e-spec.ts` | Prueba HTTP, atención, rutas retiradas, fusión, auditoría, repetición, rollback y conservación histórica. |
| `docs/ajustes-licencias-administracion-agenda/tareas.md` | Marca T082–T085 y enlaza esta evidencia. |

Los bloques nuevos llevan comentarios junto a la normalización, el cierre ante datos heredados y la auditoría.

## Pruebas y resultados

| Comando | Resultado |
| --- | --- |
| `npm test -- --runInBand src/horarios/fusion-franjas.spec.ts` | Rojo inicial por módulo ausente; final: 1 suite, 2/2 pruebas aprobadas. |
| `npm run test:e2e -- --runInBand test/ala-t082-t085.e2e-spec.ts` | 1 suite, 3/3 pruebas aprobadas; el reintento dirigido junto a credenciales también aprobó la suite ALA. |
| `npm run test:integration -- --runInBand test/horarios-t090-t091.integration-spec.ts` | 1 suite, 3/3 pruebas aprobadas. |
| `npm test -- --runInBand` | 85 suites, 396/396 pruebas aprobadas al repetir con acceso a loopback. |
| `npm run build`, `npm run lint`, `git diff --check` | Aprobados; lint sin avisos al final. |
| `npm run test:integration -- --runInBand` | 72 suites aprobadas, 12 fallidas; 365/384 pruebas aprobadas. Nueve suites anteriores ejercitan descansos/excepciones retirados. Tres fallan en migraciones/configuración no modificadas: `fase-4-t008-t013`, `ala-t019-t022`, `sucursales-t060`. |
| `npm run test:e2e -- --runInBand` | 27 suites aprobadas, 11 fallidas; 163/182 pruebas aprobadas. Hay expectativas antiguas de excepciones/descansos y fallos en pruebas de auditoría y representación de otros módulos. |

Las suites completas **no están verdes**. Las pruebas históricas que esperan la capacidad retirada requieren adaptación al contrato ALA. Los otros fallos se registran sin atribuirles cobertura aprobada ni modificarlos fuera de T082–T085. ALA-T086 y posteriores quedan pendientes; M3-I001/M2-I004 siguen diferidas al escritor manual real. No se declara fase cerrada ni producción habilitada.
