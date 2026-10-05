# Resultados M1-T131–M1-T132 — permisos HTTP y corte de acceso

Fecha: 2026-10-05. Este bloque audita rutas existentes de horarios, excepciones, atención, bloqueos y administración ante aislamiento por negocio y corte de licencia/cuenta. No modifica los servicios de producción.

## Flujo verificado

1. Una petición con JWT pasa por `JwtStrategy`: verifica sesión abierta, cuenta activa y licencia en el instante del reloj inyectado. Si el bloqueo programado de la licencia ya llegó, la petición termina en 401 antes de consultar un recurso o validar un cuerpo.
2. Mientras hay acceso, las rutas de horario, excepciones y atención obtienen el negocio del actor persistido. Un perfil de otro negocio responde 404; otro perfil del mismo negocio responde 403 al Profesional. Un ID de sucursal ajeno no crea franjas ni excepciones.
3. Los bloqueos validan tanto el alcance previo como el solicitado. Un Profesional no puede cambiar un bloqueo propio para abarcar al equipo, a otro perfil o a una sucursal ajena; un administrador ajeno no puede editarlo ni eliminarlo. El rechazo conserva la fila.
4. El superadmin solicita la suspensión, que programa el corte a las 48 horas. Sesiones abiertas dentro de la gracia acceden un minuto antes; en el milisegundo exacto y un milisegundo después, una matriz de lecturas y escrituras recibe 401. La consulta `mi-vigencia` no omite este corte. El superadmin puede consultar, renovar y reactivar la licencia, tras lo cual vuelve el acceso de las cuentas activas.
5. La cuenta de un Profesional desactivado recibe 401 en sus rutas propias aunque la licencia siga vigente y conserve una sesión sin revocar en la fixture.

## Archivos

| Archivo | Qué hace |
| --- | --- |
| `test/seguridad-t131-t132.e2e-spec.ts` | Nuevo archivo de cuatro pruebas HTTP con dos negocios, perfiles distintos, sucursales propias y ajenas, sesiones persistidas y reloj controlado. Sus comentarios explican la fixture, la matriz y el límite exacto. |
| `test/identidad-fase-2.integration-spec.ts` | Corrige una preparación histórica: deshace migraciones hasta la predecesora de identidad por nombre, sin asumir una cantidad fija de migraciones posteriores. |
| `docs/fase-2-modulo-1/tareas-modulo-1.md` | Marca T131 y T132 como hechas y enlaza esta evidencia. |
| `docs/fase-2-modulo-1/resultados-tareas/resultados-t131-t132.md` | Documenta el flujo, los archivos y los resultados de las verificaciones. |

## Tests primero

Se escribieron primero las cuatro pruebas. La primera ejecución no llegó a ejecutarlas por un `EPERM` al resolver la carpeta temporal del sandbox. Al ejecutarlas fuera de esa restricción, la fixture falló con `chk_negocios_activacion`: su reloj era anterior a la fecha `creado_en` predeterminada. Se fijó `creadoEn` al mismo instante controlado en negocios y licencias. La prueba enfocada terminó **4/4 aprobada** con el código de producción existente, por lo que no se hicieron cambios funcionales.

Las pruebas cubren (1) semana, excepciones y atención entre negocios, perfiles y sucursales; (2) filtros y cambio de alcance de bloqueos sin efectos secundarios; (3) matriz de rutas nuevas de lectura y escritura antes/en/después de las 48 horas; y (4) corte para un Profesional desactivado con sesión abierta.

La primera suite completa de integración obtuvo **207/208**: solo falló una prueba anterior de T013 que deshacía 12 migraciones por cantidad fija y dejaba instalada `IdentidadPendiente`. Se ajustó para retroceder hasta `CrearAuditoriaLimites`; su ejecución enfocada pasó **4/4**. La suite completa se repitió después del ajuste.

| Verificación | Resultado final |
| --- | --- |
| Pruebas enfocadas T131–T132 | **4/4** aprobadas. |
| `npm test -- --runInBand` | 56 suites, **298/298** pruebas aprobadas. |
| `npm run test:integration -- --runInBand` | 41 suites, **208/208** pruebas aprobadas tras corregir la prueba histórica. |
| `npm run test:e2e -- --runInBand` | 21 suites, **130/130** pruebas aprobadas. |
| `npm run build` | Aprobado. |
| `npm run lint` | Aprobado, también tras el ajuste de T013. |

Las tres suites completas suman **636 pruebas aprobadas**. Algunas pruebas HTTP imprimen `ERROR` por fallos inyectados deliberadamente para comprobar rollback; Jest terminó con código 0. Las pruebas usan bases MariaDB desechables y no envían correos reales.
