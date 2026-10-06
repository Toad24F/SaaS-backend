# Resultados M1-T133–M1-T137 — recorrido y suites finales

Fecha: 2026-10-05. El alcance corresponde al módulo 1 de fase 2: identidad, catálogos, agenda de profesionales y licencias. Las citas reales siguen fuera de este módulo.

## Flujo verificado

1. Una sesión de superadmin llama `POST /negocios`. La respuesta contiene referencias de la invitación y no revela el código; todavía no existe cuenta administradora. La bandeja entrega el código a `TransporteCorreoControlado`, sin conexión SMTP externa.
2. El destinatario usa código, correo y negocio en `POST /auth/activar-administrador`, crea su cuenta con contraseña y obtiene un JWT por `POST /auth/login`.
3. La administradora crea una sucursal, un servicio y una cuenta Profesional. Asigna la sucursal; el Profesional guarda su franja semanal y selecciona el servicio. La oferta de la sucursal contiene ese servicio.
4. El Profesional envía una selección vacía. La oferta queda vacía y `GET /profesionales/:id/horario` devuelve la misma franja. Al restablecer la selección, vuelve la oferta. Un bloqueo propio recorta la atención proyectada de 09:00–12:00 a 09:00–10:00 y 11:00–12:00.
5. El superadmin suspende la licencia. Antes del corte sigue disponible el horario. Se crean sesiones vigentes un minuto antes del límite para distinguir el corte de una caducidad de sesión; exactamente a las 48 horas el Profesional recibe 401. La reactivación restablece acceso con la misma sesión y conserva horario, selección, oferta y bloqueo. La instalación temporal del módulo 1 no tiene tabla `citas`.

## Archivos

| Archivo | Qué hace |
| --- | --- |
| `test/recorrido-t133.e2e-spec.ts` | Nuevo caso HTTP conjunto. Usa instalación MariaDB desechable, reloj inyectado, sesión y JWT reales, correo falso y comprobaciones de persistencia. Los comentarios separan alta/correo, catálogos, sesiones al límite y ausencia de citas. |
| `docs/fase-2-modulo-1/tareas-modulo-1.md` | Marca T133–T137 como hechas y enlaza esta evidencia. Actualiza el número de tareas pendientes. |
| `docs/fase-2-modulo-1/resultados-tareas/resultados-t133-t137.md` | Describe el flujo, las verificaciones y el alcance de cada archivo modificado. |

## Tests primero y resultados

Se escribió el caso T133 antes de las verificaciones generales. La primera ejecución fue roja por un sello `creado_en` generado por MariaDB posterior al reloj fijo de la fixture (`chk_altas_estado`). Se movió el reloj de prueba a un instante posterior al actual. La siguiente ejecución mostró que las sesiones originales habían vencido antes de la reactivación; se añadieron sesiones frescas un minuto antes del corte para comprobar la causa correcta del 401. La prueba también dejó claro que el esquema migrado de este módulo no incluye `citas`; se verificó su ausencia sin simular citas. La ejecución enfocada final pasó **1/1** sin cambios en código de producción.

| Verificación | Resultado |
| --- | --- |
| `npm run test:e2e -- --runInBand recorrido-t133.e2e-spec.ts` | **1/1** aprobada. |
| `npm run build` | Aprobado. |
| `npm run lint` | Aprobado. |
| `npm test -- --runInBand` | 56 suites, **298/298** aprobadas. |
| `npm run test:integration -- --runInBand` | 41 suites, **208/208** aprobadas sobre bases MariaDB nuevas y desechables. |
| `npm run test:e2e -- --runInBand` | 22 suites, **131/131** aprobadas con reloj y transporte controlados. |

Las tres suites completas suman **637 pruebas aprobadas**. Algunos casos e2e anteriores imprimen errores provocados para comprobar rollback; Jest terminó con código 0. La prueba T133 entrega un correo simulado en memoria. Las suites no requieren entregar correo real. No se declaran pruebas de reservas ni citas reales como terminadas.
