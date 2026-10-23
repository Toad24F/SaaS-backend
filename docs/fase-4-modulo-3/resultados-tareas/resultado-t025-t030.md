# Resultado M3-T025–T030

Fecha: 18 de octubre de 2026. Este lote abre únicamente la inicialización de sesión anónima del portal. Las consultas públicas de catálogo y disponibilidad, los apartados y los escritores de citas pertenecen a tareas posteriores.

## Archivos y función

| Archivo | Qué realiza |
| --- | --- |
| `src/reservas-publicas/resolver-negocio-publico.service.ts` | Busca el slug en una transacción coherente, comprueba activación y `puedeAceptarReserva`, y devuelve solo ID interno, slug y nombre. El 404 es uniforme para negocios inexistentes o sin acceso. |
| `src/reservas-publicas/sesion-reserva-publica.service.ts` | Genera una credencial aleatoria de 32 bytes, guarda solo su SHA-256 por negocio y reutiliza la fila al recibir la misma cookie. No crea un usuario ni captura contacto. |
| `src/reservas-publicas/proteccion-portal.service.ts` | Exige origen configurado y una cabecera no simple para iniciar. Provee token CSRF enlazado a la cookie para las siguientes mutaciones, incluso liberaciones, y rechaza cookies duplicadas o inválidas. |
| `src/reservas-publicas/portal-publico.controller.ts` | Expone `POST /publico/negocios/:slug/sesion`; rechaza cuerpos con datos, emite cookie HttpOnly/SameSite Strict, Secure en producción, limita el Path al negocio, devuelve la proyección mínima con token CSRF y marca respuesta `no-store`. Redacta errores técnicos. |
| `src/reservas-publicas/reservas-publicas.module.ts` | Registra servicios y reutiliza licencia y reloj del módulo de disponibilidad. |
| `src/reservas-publicas/reservas-publicas-http.module.ts` | Registra solo el controlador de inicialización pública. |
| `src/disponibilidad/contexto-disponibilidad.service.ts` | Separa el contexto común de cálculo de la identidad privada; `resolverPublico` valida al Profesional dentro del negocio y de la transacción sin actor ficticio. |
| `src/disponibilidad/disponibilidad.module.ts` | Exporta el mismo reloj inyectable al resolver público. |
| `src/main.ts` | Declara expresamente que el CORS administrativo no admite credenciales; el portal usa un proxy del mismo origen. |
| `src/app.module.ts` | Aclara el alcance de la frontera HTTP pública. |
| `.env.example` | Documenta el origen público exacto y una clave CSRF distinta del JWT; los valores reales se proporcionan en el entorno. |
| `src/reservas-publicas/reservas-publicas.contract.spec.ts` | Comprueba que solo se agregó el controlador de inicio y que el dominio no publica controladores. |
| `src/reservas-publicas/proteccion-portal.service.spec.ts` | Prueba origen, cabecera de inicio, token CSRF ligado a la credencial y rechazo de cookies duplicadas o mal formadas. |
| `test/fase-4-t025-t030.integration-spec.ts` | Prueba la ruta con MariaDB migrada desechable y el contexto público transaccional sin usuario. |
| `docs/fase-4-modulo-3/tareas.md` | Marca únicamente M3-T025–T030 al completar sus verificaciones. |

## Flujo

1. El navegador llama a `POST /publico/negocios/:slug/sesion` bajo el origen configurado, con `X-Portal-Inicializacion: 1` y sin cuerpo de contacto. El servidor rechaza cualquier origen ajeno antes de consultar datos.
2. El resolver lee negocio y licencia en una misma instantánea y usa la política comercial existente. Si no se puede reservar, entrega un 404 uniforme.
3. Si no hay cookie de sesión pública, el servidor genera una credencial aleatoria y guarda solo su hash ligado al negocio. Si ya existe una cookie válida del mismo negocio, encuentra esa fila y responde sin duplicarla. Una cookie desconocida o usada en otro negocio exige reiniciar.
4. La respuesta contiene solo nombre y slug públicos más un token CSRF derivado con una clave de entorno. La credencial utilizable viaja únicamente en cookie HttpOnly; `SameSite=Strict`, Path por negocio y `Secure` en producción reducen su exposición. La respuesta y los errores llevan `Cache-Control: no-store`.
5. Las mutaciones posteriores deberán presentar origen permitido y `X-CSRF-Token` coincidente con esa cookie, también al liberar apartados. El contexto común de cálculo aporta manager, instante, negocio y Profesional; la ruta privada conserva actor, sesión y rol en su propia autorización.

## Pruebas

Se escribieron primero las pruebas: fallaron porque no existían el controlador ni `resolverPublico`. Después se comprobó slug inexistente, negocio sin licencia, desactivación y vencimiento exacto; inicio sin JWT, rechazo de cuerpo, origen incorrecto y cookie inválida o de otro negocio; repetición sin duplicar fila; hash persistido y respuesta sin RFC, correo, teléfono, clientes ni secretos. Una falla técnica simulada produjo 500 redactado y `no-store`. Las pruebas unitarias comprueban el CSRF enlazado a la credencial y el rechazo de cookies duplicadas.

| Comando | Resultado |
| --- | --- |
| `npm run test:integration -- --runInBand fase-4-t025-t030` | 1 suite, 2 pruebas aprobadas. |
| `npm test -- --runInBand proteccion-portal reservas-publicas.contract` | 2 suites, 4 pruebas aprobadas. |
| `npm run build` | Aprobado. |
| `npm run lint` | Aprobado, sin advertencias tras el ajuste del slug. |
| `npm test -- --runInBand` | 66 suites, 332 pruebas aprobadas. |
| `npm run test:integration -- --runInBand` | 62 suites, 271 pruebas aprobadas. |
| `npm run test:e2e -- --runInBand` | 28 suites, 147 pruebas aprobadas. |

La cookie y el token CSRF no sustituyen la revalidación de licencia, oferta y disponibilidad que harán los escritores posteriores en su propia transacción.
