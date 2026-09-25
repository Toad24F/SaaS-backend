# Evidencia de T01–T05

Fecha: 2026-09-10. Entorno verificado: Node 24.20.0, NestJS 12, Jest 30 y MariaDB real.
Las casillas de `tareas-auth.md` se dejan para marcado manual. No se ejecutó T06 ni tareas posteriores.

| Tarea | RF referenciados | Evidencia de finalización |
|---|---|---|
| T01 | Soporte transversal RF-01–40 | La suite mínima `src/app.controller.spec.ts` reproduce el error ESM sin módulos VM. |
| T02 | Soporte transversal RF-01–40 | La misma suite carga NestJS y ejecuta su assertion con el comando corregido; también pasan las cinco suites originales. |
| T03 | RF-15–16, RF-19 | AuthController y AuthService disponen de dobles explícitos; las pruebas de Usuarios y JwtStrategy ejecutan sus casos. |
| T04 | Soporte transversal RF-01–40 | 14 pruebas de configuración verifican aislamiento, campos obligatorios, confirmación, puertos y ausencia de secretos en errores. |
| T05 | RF-03, RF-11, RF-40 | Dos pruebas MariaDB verifican identificadores de conexión distintos y cierre de ambas conexiones en éxito y error, sin recursos abiertos detectados. |

## Diagnóstico y pruebas primero

El comando original `npm test -- --runInBand` fallaba en las cinco suites antes de ejecutar pruebas: `Must use import to load ES Module` al cargar NestJS.
La reproducción mínima conserva ese fallo al ejecutar:

```sh
node node_modules/jest/bin/jest.js --runInBand --runTestsByPath src/app.controller.spec.ts
```

Aunque Node admite ESM, la versión instalada de Jest comprueba `vm.SourceTextModule.prototype.hasAsyncGraph`, disponible al habilitar `--experimental-vm-modules`. Los scripts de pruebas ahora incluyen esa opción, sin modificar dependencias ni el formato de los módulos de producción. La advertencia experimental de Node es esperada.

Con la carga ESM resuelta, se reprodujeron fallos de inyección de UsuariosService/JwtService y del ThrottlerGuard en las pruebas de Auth. Se añadieron dobles de servicio y sustituciones de guards únicamente a nivel unitario; la aplicación conserva sus protecciones.

Las pruebas de aislamiento se escribieron antes de crear su implementación y fallaron por ausencia de `database.config`. Después de implementarla pasan todos sus casos. La prueba de integración también se escribió antes del ejecutor.

La configuración HTTP necesitó declarar `rootDir` en ts-jest para resolver TS5011 de TypeScript 6.

## Configuración de pruebas

- Copiar `.env.test.example` a `.env.test.local`, archivo ignorado por Git, y completar exclusivamente variables `TEST_DB_*`.
- `TEST_DB_CONFIRMED` repite el nombre exacto de la base dedicada. No hay fallback a `DB_*`; si `DB_NAME` está presente y coincide, la configuración se rechaza.
- El usuario confirmó que `citas_saas_auth` es exclusiva para pruebas. Se preparó su configuración local con las credenciales existentes, sin incorporarlas al repositorio.
- El setup de integración/HTTP no carga `.env`. La aplicación en modo test tampoco lo carga; exige la configuración validada antes de conectar.
- En tests, TypeORM no sincroniza tablas, no ejecuta migraciones automáticamente ni borra el esquema. El ejecutor de T05 utiliza dos fuentes de datos independientes con un máximo de una conexión cada una.
- Las pruebas ejecutadas no insertan, actualizan ni eliminan datos. No se ejecutó el SQL ni se alteraron entidades o tablas. El esquema nuevo y las entidades actuales aún requieren las tareas posteriores.

## Resultados

| Comando | Resultado |
|---|---|
| `npm test -- --runInBand` | 6 suites, 34 pruebas aprobadas. |
| `npm run test:integration -- --runInBand --detectOpenHandles` | 1 suite, 2 pruebas aprobadas contra MariaDB; sin recursos abiertos detectados. |
| `npm run test:e2e -- --runInBand --detectOpenHandles` | 1 suite, 1 prueba HTTP aprobada; sin recursos abiertos detectados. |
| `npm run build` | Aprobado. |
| `npm run lint` | Aprobado, sin advertencias del linter. |
| `npx tsc --noEmit --incremental false` | Aprobado. |

Estos resultados acreditan la infraestructura de T01–T05, no la aceptación completa de los RF. Por ejemplo, RF-03, RF-11 y RF-40 todavía necesitan sus pruebas de transacciones y concurrencia de negocio; RF-16 aún requiere la uniformidad de mensajes prevista en tareas posteriores. La prueba HTTP existente verifica únicamente la ruta raíz, no el recorrido futuro de autenticación.
