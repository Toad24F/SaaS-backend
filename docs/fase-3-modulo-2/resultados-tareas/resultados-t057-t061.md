# Resultados M2-T057–M2-T061 — entradas y consulta HTTP privada

## Archivos y flujo

`src/disponibilidad/disponibilidad-entradas.ts` añade los contratos de entrada estrictos. La consulta de ranuras exige los tres IDs, `desde` y `hasta`; acepta `modalidad` pública por defecto o manual explícita. Comprueba fechas reales, orden y un máximo inclusivo de 31 fechas. La entrada puntual preparada para T062 exige IDs numéricos, fecha y hora `HH:mm`; una vez conocida la zona IANA de la sucursal, rechaza una hora local inexistente o ambigua. Ambas entradas rechazan campos ajenos, incluidos IDs de negocio o identidades de apartado aportadas por el cliente. Sus comentarios explican el límite técnico y la validación de zona posterior a la autorización.

`src/disponibilidad/disponibilidad.controller.ts` publica `GET/PUT /disponibilidad/configuracion` solo para el Administrador y `GET /disponibilidad` para Administrador, Recepción y Profesional autenticados. Pasa la identidad de la sesión a los servicios existentes; el cliente no elige el negocio. La palabra `publica` selecciona reglas del motor, pero la ruta sigue requiriendo sesión. Sus comentarios describen esta frontera y la revalidación del motor. `src/disponibilidad/disponibilidad-http.module.ts` conecta autenticación, guard de roles, controlador y dominio, sin incorporar escritores. `src/disponibilidad/base-fase-3.spec.ts` actualiza la expectativa de composición: el controlador existe solo en el módulo HTTP y los módulos de dominio siguen sin rutas.

Flujo de configuración: **JWT y rol Administrador → servicio de configuración → validación estricta de cuatro campos camelCase → lectura o reemplazo transaccional del conjunto → valores efectivos**. El servicio existente conserva la auditoría y el aislamiento por negocio. Flujo de ranuras: **JWT y rol autorizado → validación de IDs, fechas y modalidad → motor → lectura coherente de licencia, configuración, oferta, horarios y ocupaciones → ranuras del plan**. La respuesta no reserva la hora. El contrato puntual queda listo para T062; en este tramo no se registra `POST /disponibilidad/validar`.

`src/disponibilidad/disponibilidad-entradas.spec.ts` prueba los límites de entrada sin base de datos. `test/fase-3-t057-t061.e2e-spec.ts` arranca la aplicación con MariaDB migrada y desechable, reloj controlado, licencias y sesiones reales para probar rutas, permisos y separación de negocios. `docs/fase-3/tareas.md` marca únicamente T057–T061 como hechas. `tsconfig.build.tsbuildinfo` es la caché incremental que actualiza la compilación; no introduce lógica.

## Tests primero y verificaciones

Se escribieron las pruebas antes del código. La unitaria falló inicialmente porque faltaba `disponibilidad-entradas.ts`; la HTTP recibió 404 donde la prueba exigía 401 porque las rutas aún no estaban registradas. Tras implementar los contratos y el controlador, ambas pruebas dirigidas pasaron.

La unitaria comprueba los cuatro campos obligatorios y exactos de configuración, ausencia de coerción, IDs, fechas, rango inclusivo de 31 frente a 32 días, rango invertido, modalidad predeterminada y entrada puntual con minutos válidos, cambio de hora e identidad de apartado inadmisible. La HTTP comprueba valores iniciales, reemplazo completo, entradas extra y tipos erróneos, 401 sin sesión, 403 por rol, 404 por negocio ajeno, tres roles para consulta, modalidad manual y respuesta sin datos privados de ocupaciones.

Resultado del 15 de octubre de 2026:

| Verificación | Resultado |
| --- | --- |
| `npm run build` | Pasó |
| `npm run lint` | Pasó |
| `npm test -- --runInBand src/disponibilidad/disponibilidad-entradas.spec.ts` | 1 suite, 3 pruebas aprobadas |
| `npm run test:e2e -- --runInBand test/fase-3-t057-t061.e2e-spec.ts` | 1 suite, 1 prueba aprobada |
| `npm test -- --runInBand` | 64 suites, 327 pruebas aprobadas |
| `npm run test:integration -- --runInBand` | 55 suites, 250 pruebas aprobadas |
| `npm run test:e2e -- --runInBand` | 24 suites aprobadas y 2 fallidas; 138 pruebas aprobadas y 3 fallidas, de 141 |

Las tres fallas HTTP se reproducen al ejecutar aisladamente `auth-t45.e2e-spec.ts` y `horarios-t093-t095.e2e-spec.ts`. La primera espera un perfil sin `negocioNombre`, aunque la respuesta actual lo incluye. Las otras dos intentan insertar dos sucursales llamadas `Sede` en el mismo negocio y chocan con `uq_sucursales_negocio_nombre` durante el fixture, antes de llamar a las rutas de horarios. No se alteraron esas pruebas ni los módulos ajenos al tramo. La suite dirigida T057–T061 sí pasó. `git diff --check` no reportó errores de formato.

La validación HTTP puntual y los escritores reales de citas o apartados pertenecen a tareas posteriores.
