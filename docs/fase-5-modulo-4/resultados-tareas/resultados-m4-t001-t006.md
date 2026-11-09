# Evidencia M4-T001–M4-T006

Fecha: 2026-11-08. Revisión base: `cf43c57` más cambios locales de este lote. Alcance: preparación documental y de pruebas de fase 5; detenerse tras M4-T006. No implementa persistencia M4 ni escritor manual.

## Archivos y propósito

- `matriz-aceptacion-t001.md`: enumera los 47 RF locales, ajustes aplicables, diez criterios, tareas y escenarios previstos. Separa antecedentes de evidencia nueva; deja pendiente la aceptación funcional.
- `contratos-conservados-t002.md`: identifica roles, suspensión configurable, cinco rutas privadas, motor, escritor público, separación, cupo y orden de bloqueos; explica el flujo de futura integración.
- `test/fase-5-t001-t002.spec.ts`: verifica completitud de la matriz, integraciones diferidas y enlaces a archivos existentes.
- `test/fase-5-t003-t006.integration-spec.ts`: prueba bases temporales, fixtures, reloj, rollback y concurrencia real, con comprobación de filas finales y limpieza.
- `test/support/operacion-fase-5.ts`: añade `conBaseOperativa`, amplía la semilla pública con roles/licencia/cinco estados/clientes independientes y ejecuta el control de espera en la fila común del Profesional. Los comentarios explican las fronteras y la limpieza.
- `test/support/mariadb.ts`: admite el prefijo cerrado `citas_m4_test` además del prefijo histórico, conservando el valor por defecto, migraciones y eliminación protegida.
- `test/support/escenario-portal.ts`: permite reutilizar la semilla existente únicamente con los dos patrones efímeros autorizados.
- `tareas.md`: registra únicamente las casillas del lote cumplidas, sin cerrar tareas posteriores.

## Flujo del ejecutor

1. Exigir `NODE_ENV=test` y configuración `TEST_DB_*` confirmada y distinta de `DB_NAME`; no cargar `.env` cotidiano.
2. Generar `citas_m4_test_<UUID>`, crear el esquema y aplicar migraciones actuales. Abrir dos DataSource independientes hacia ese mismo esquema.
3. Sembrar dos negocios con dos zonas, cuentas de Administrador/Recepción/Profesional, licencia vigente, Profesional compartido entre sucursales, cinco estados y fichas con teléfono compartido. Son datos de preparación, no citas creadas por un escritor manual real.
4. Usar `RelojPrueba`, sin sustituir Date global ni cambiar el reloj del sistema. Inyectar fallo antes del commit para comprobar ausencia de filas parciales.
5. Para concurrencia, abrir dos QueryRunner con `READ COMMITTED`. A bloquea `personal` y modifica una marca de control; una barrera habilita B. Consultar `INNODB_LOCK_WAITS` y `INNODB_TRX` hasta observar que B espera exactamente a A, con plazo acotado. Liberar A; B continúa y confirma su marca. Verificar el valor final.
6. En el caso de fallo durante espera, revertir A, impedir que B escriba, esperar su desenlace y revertir B. Comprobar que la marca original sigue intacta. Liberar ambos runners, destruir pools y eliminar solo el esquema generado. Consultar `information_schema.SCHEMATA` para demostrar su ausencia.

El usuario de pruebas necesita permisos de crear/eliminar sus esquemas y consultar la espera InnoDB (habitualmente `PROCESS`). La prueba falla si no observa el bloqueo; no lo sustituye por una suposición basada en temporizadores.

## Tests primero y resultados iniciales

Se escribieron ambas suites antes del soporte y los documentos. Primera ejecución documental: **2 tests fallidos**, por archivos todavía inexistentes. Primera ejecución de integración: **suite fallida**, por módulo de soporte todavía inexistente (0 tests ejecutados).

La siguiente ejecución encontró bloqueo de red del sandbox (`EACCES localhost:3306`); se repitió con acceso permitido al servidor local. La ejecución real detectó una asignación duplicada heredada de la semilla pública; se eliminó el INSERT redundante. Después, la suite nueva de integración aprobó **7/7**. Los resultados finales tras revisión se registran a continuación.

## Verificación final

| Comando | Resultado |
| --- | --- |
| `npm run build` | Aprobado, código 0. |
| `npm run lint` | Aprobado, código 0, sin advertencias tras conservar los errores fuera de `finally`. |
| `npm test -- --runInBand test/fase-5-t001-t002.spec.ts` | 1 suite, 2/2 tests aprobados. |
| `npm run test:integration -- --runInBand test/fase-5-t003-t006.integration-spec.ts test/fase-4-t001-t007.integration-spec.ts` | 2 suites, 13/13 tests aprobados (7 nuevos y 6 de regresión del soporte público). |
| `npm test -- --runInBand` con servidores HTTP locales permitidos | 89 suites aprobadas y 1 fallida; 411 tests aprobados y 1 fallido, 412 totales; 57,641 s. |
| `npm run test:integration -- --runInBand` | 91/91 suites y 428/428 tests aprobados; 631,773 s, código 0. Incluye el soporte final del lote. |
| `npm run test:e2e -- --runInBand` | 42/42 suites y 199/199 tests aprobados; 420,025 s, código 0. Ejecutada después de integración para no competir por fixtures comunes. Los errores inyectados que aparecen en consola forman parte de casos aprobados de rollback. |

La primera ejecución unitaria dentro del sandbox tuvo 408 aprobados y 4 fallidos: tres por `EACCES` al conectar a puertos efímeros del test de tamaño de cuerpo y uno documental. Al permitir el acceso HTTP, solo quedó el fallo documental anterior en `test/ala-preparacion-documental.spec.ts:16`: exige «pendiente de aprobación», pero la constitución de ajustes ya declara la aprobación del 8 de noviembre de 2026. `git diff --quiet HEAD -- test/ala-preparacion-documental.spec.ts docs/ajustes-licencias-administracion-agenda/constitucion.md` devolvió 0: ambos archivos son idénticos a la revisión base. Se registra el pendiente sin modificar tareas de otro módulo ni presentar toda la suite como aprobada.

## Criterios comprobados del lote

| Tarea | Evidencia propia y explicación |
| --- | --- |
| M4-T001 | Test documental: coteja los 47 RF con la spec, ajustes, diez CF, referencias diferidas y enlaces existentes. La matriz describe pruebas previstas, sin atribuir aceptación funcional. |
| M4-T002 | Test documental e inspección de código/normas: identifica contratos, roles y cinco rutas; el inventario explica cómo deben colaborar las futuras escrituras y cuáles son sus fronteras. |
| M4-T003 | Tests de guardas antes de conexión, migraciones, dos IDs de conexión diferentes y ausencia del esquema en el servidor tras destruirlo. |
| M4-T004 | Test consulta roles, cinco estados, fichas diferentes con teléfono igual y atención multisucursal; comprueba dos zonas, aislamiento por combinación de negocio/perfil y eliminación posterior del esquema completo. |
| M4-T005 | Test fija -1/0/+1 ms alrededor de vencimiento de apartado, fin, inicio/cupo y plazo de licencia; fuerza un fallo tras INSERT y consulta ausencia de filas después del rollback. Reutiliza reloj y fallo transaccional existentes. |
| M4-T006 | Tests observan espera InnoDB real, continuación y marca final confirmada; ante fallo durante espera verifican rollback de la marca original, cierre de ambos DataSource y eliminación de la base. |

Los seis criterios del lote tienen evidencia propia: 2 tests documentales y 7 de integración nuevos, además de la regresión indicada. Se marcan exclusivamente M4-T001–M4-T006; el fallo unitario documental ajeno queda expresamente pendiente y no se declara aprobada la suite unitaria global. La verificación de formato con `git diff --check` no reportó errores. El archivo incremental generado por build se devolvió a su contenido original para no incluirlo en el cambio.

## Límites de la evidencia

Las pruebas de reloj solo acreditan la capacidad de fijar antes/en/después; no prueban todavía transiciones operativas reales de M4. El control SQL acredita infraestructura M4-T006, no escritores. M2-I004/M3-I001, ALA-I001–ALA-I003, M3-T136 y la aceptación funcional del panel permanecen pendientes. No se cierra la fase ni se habilita producción.
