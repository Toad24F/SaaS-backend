# Resultado M3-T031–T035

Fecha: 18 de octubre de 2026. Este lote conecta el contexto público autorizado con el mismo motor de disponibilidad que usan las rutas privadas. La entrada pública es todavía un contrato interno del motor: la ruta HTTP anónima de disponibilidad corresponde a M3-T040. No se añaden escritores de apartados ni citas.

## Archivos modificados y finalidad

| Archivo | Qué realiza |
| --- | --- |
| `src/disponibilidad/contexto-disponibilidad.service.ts` | Relee activación, licencia y pertenencia del Profesional dentro del manager transaccional público. La autorización privada sigue reconstruyendo sesión, cuenta y rol; ningún contexto público crea un usuario ficticio. |
| `src/disponibilidad/motor-disponibilidad.service.ts` | Añade `consultarPublico` y `revalidarPublicoEnTransaccion`. Ambas entradas preparan el contexto y comparten el mismo cálculo, la misma oferta y la misma comprobación puntual con las entradas privadas. La consulta captura un instante y usa `REPEATABLE READ`; el escritor aporta su propio manager y la modalidad pública queda fija. |
| `src/disponibilidad/configuracion-agenda.service.ts` | Acepta el contexto mínimo de cálculo para leer las reglas en la transacción compartida. |
| `src/disponibilidad/atencion-interna.service.ts` | Acepta el contexto mínimo para proyectar horarios y descansos sin depender de un rol. |
| `src/disponibilidad/bloqueos-aplicables.service.ts` | Acepta el contexto mínimo para aplicar bloqueos del mismo negocio y Profesional. |
| `src/disponibilidad/ocupaciones.service.ts` | Acepta el contexto mínimo para leer citas y apartados de todas las sucursales del Profesional con el instante capturado. |
| `src/disponibilidad/oferta-efectiva.service.ts` | Lee oferta desde el contexto común; exige de forma explícita un contexto privado con rol para la modalidad manual. |
| `test/fase-4-t025-t030.integration-spec.ts` | Añade una licencia vigente al escenario anterior para comprobar la nueva relectura de política en el contexto público. |
| `test/fase-4-t031-t035.integration-spec.ts` | Añade pruebas del cálculo compartido, revalidación pública, cinco rutas privadas, aislamiento, cookie, origen, `no-store` y registros capturados. |
| `docs/fase-4-modulo-3/tareas.md` | Marca únicamente M3-T031–T035 al terminar la verificación. |

## Flujo de cálculo y revalidación

1. La ruta privada existente reconstruye sesión vigente, cuenta, licencia, rol y pertenencia del Profesional dentro de la transacción. Solo entonces pasa su contexto al motor. La modalidad manual sigue exigiendo el permiso privado.
2. La entrada pública interna recibe el ID de negocio resuelto por el servidor. Captura un único instante, abre `REPEATABLE READ` y vuelve a comprobar negocio activado, licencia y Profesional en esa instantánea. Usa modalidad `publica` sin JWT ni rol ficticio.
3. Ambas entradas llaman al mismo cálculo: reglas efectivas, oferta, horarios, bloqueos, ocupaciones, límites, zona horaria y selección de ranuras. Los lectores reciben manager, instante, negocio y Profesional; por ello la consulta pública no copia el algoritmo ni llama por HTTP a las rutas privadas.
4. El escritor público futuro, después de adquirir sus bloqueos, pasará su manager a `revalidarPublicoEnTransaccion`. El método no abre otra transacción, relee acceso y combinación con el instante posterior a la espera y fuerza modalidad pública aunque un objeto interno contenga `manual`.
5. La revalidación solo excluye un apartado si coinciden negocio, hash del titular, Profesional, sucursal, servicio, intervalo completo y vigencia. Un hash incorrecto deja la ocupación y devuelve una negativa funcional; un Profesional ajeno al negocio recibe 404. Ninguna revalidación crea ni libera una ocupación.

## Pruebas

Las pruebas se escribieron primero y fallaron porque el motor no tenía `consultarPublico` ni `revalidarPublicoEnTransaccion`. Después compararon ranuras privadas y públicas de la misma agenda; comprobaron rechazo de sesión privada revocada, licencia pública vencida y Profesional cruzado. La revalidación verificó el apartado propio exacto, hash incorrecto, negocio ajeno, modalidad pública obligatoria y ausencia de una transacción anidada. Por HTTP se recorrieron las cinco rutas privadas con permisos y aislamiento, además del rechazo de modalidad manual en la ruta pública aún inexistente. Se probaron origen y cookie inválidos, `no-store`, cuerpo redactado ante un fallo técnico y registros capturados sin cookie, contacto ni huellas.

| Comando | Resultado |
| --- | --- |
| `npm run test:integration -- --runInBand fase-4-t031-t035 fase-4-t025-t030` | 2 suites, 5 pruebas aprobadas. |
| `npm run build` | Aprobado. |
| `npm run lint` | Aprobado. |
| `npm test -- --runInBand` | 66 suites, 332 pruebas aprobadas. |
| `npm run test:integration -- --runInBand` | 63 suites, 274 pruebas aprobadas. |
| `npm run test:e2e -- --runInBand` | 28 suites, 147 pruebas aprobadas. |

La consulta pública sigue sin ruta anónima hasta M3-T040. La revalidación es un contrato interno para escritores posteriores; no expone exclusiones de apartados por HTTP.
