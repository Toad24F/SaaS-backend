# Resultado — ALA-T057–ALA-T060

Revisión base: estado anterior a este lote; cambios sin commit. Se escribieron primero las pruebas. Los casos HTTP y de integración usan bases MariaDB migradas y desechables identificadas como test.

## Archivos y flujo

- `test/ala-t057.e2e-spec.ts`: inicia la aplicación con guardas, sesiones reales y dos negocios. Comprueba los límites iniciales, la modificación exclusiva del superadmin, consultas propias de cada administrador, denegación a otros roles y a un negocio ajeno, validación de cuerpo completo y conflicto al reducir por debajo del consumo. La primera ejecución falló con 404 antes de agregar las rutas.
- `src/negocios/dto/negocios-http.dto.ts`: agrega `CambiarLimitesUsuariosDto`. Exige ambos límites como enteros de 1 a 4294967295; la tubería global rechaza campos extra y cuerpos parciales.
- `src/negocios/negocios.controller.ts`: expone `GET /negocios/:id/cupo-usuarios` y `PATCH /negocios/:id/limites-usuarios`, bajo el guard de superadmin existente. El actor sale de la sesión; el servicio revalida rol y negocio en la transacción.
- `src/profesionales/profesionales.controller.ts` y `src/usuarios/recepcionistas.controller.ts`: agregan `GET /profesionales/cupo` y `GET /recepcionistas/cupo` antes de las rutas `:id`. Solo el Administrador consulta su negocio, derivado del usuario autenticado; la respuesta muestra límite, activos y disponibles del rol.
- `src/usuarios/usuarios.module.ts`, `src/negocios/negocios-http.module.ts` y `src/profesionales/profesionales-http.module.ts`: registran y comparten `CuposUsuariosService` con los controladores sin duplicar la política de conteo.
- `src/usuarios/cupos-usuarios.service.ts`: ajusta la inyección de `DataSource` para la composición Nest. La política y los bloqueos creados en T051–T056 se reutilizan sin cambiar su cálculo.
- `src/modulos.spec.ts`: simula el nuevo servicio en la prueba de composición sin base de datos. La prueba aislada falló al aparecer la dependencia y volvió a pasar tras este ajuste.
- `test/ala-t058-t060.integration-spec.ts`: prueba cinco carreras en bases reales con dos conexiones. Una barrera retiene la primera transacción durante su auditoría, después de haber escrito y tomado el bloqueo del negocio; la segunda operación empieza antes de liberar el commit. Se inspeccionan las filas finales de usuarios, perfiles, reservas de correo y límites.
- `tareas.md`: marca T057–T060 y enlaza esta evidencia.

Flujo HTTP: guardia de sesión y rol → identidad del negocio desde la ruta autorizada o el usuario propio → servicio de cupos → transacción `READ COMMITTED` y barrera de negocio → conteo por rol → respuesta o actualización conjunta de límites y auditoría. Las altas y reactivaciones toman esa misma barrera antes de consumir el último lugar. Si la primera operación lo ocupa, la segunda relee el consumo y recibe 409. Si una reducción llega primero, el alta excedente recibe 409; si el alta llega primero, la reducción incompatible recibe 409. Ningún caso desactiva una cuenta para ajustar el límite.

## Pruebas y resultados

| Comando | Resultado |
| --- | --- |
| `npm test -- --runInBand src/usuarios src/profesionales src/negocios src/modulos.spec.ts` | 8 suites, 35/35 pruebas aprobadas |
| `npm run test:integration -- --runInBand test/ala-t058-t060.integration-spec.ts test/ala-t051-t056.integration-spec.ts test/profesionales-t081-t082.integration-spec.ts test/recepcionistas-t76-t81.integration-spec.ts` | 4 suites, 23/23 pruebas aprobadas |
| `npm run test:e2e -- --runInBand test/ala-t057.e2e-spec.ts test/profesionales-t071-t076.e2e-spec.ts test/recepcionistas-t48.e2e-spec.ts` | 3 suites, 25/25 pruebas aprobadas |
| `npm run build` | Correcto |
| `npm run lint` | Correcto |

Las trazas HTTP de auditoría inyectada pertenecen a los casos antiguos de rollback; no hubo fallos de suite. Los cinco casos de carrera comprobaron tanto el resultado de las promesas como los límites, usuarios, perfiles y reservas persistidos.

T057–T060 cumplen sus criterios. T061 y posteriores permanecen pendientes; este lote no cierra la fase ni habilita producción. M3-I001/M2-I004 siguen diferidas al escritor manual real.
