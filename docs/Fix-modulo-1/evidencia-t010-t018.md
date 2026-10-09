# Evidencia de FIX-T010–FIX-T018

## Archivos y función

- `src/profesionales/dto/profesionales.dto.ts`: exige especialidad no vacía en el alta y admite su edición validada.
- `src/profesionales/profesionales.service.ts`: guarda la especialidad, la devuelve en las vistas y exige completarla en la próxima edición de un perfil heredado vacío. Cuenta, perfil y auditoría permanecen en la misma transacción.
- `src/servicios/dto/servicio.dto.ts`: acepta descripción opcional en alta y edición, con recorte y rechazo de valores que no son texto.
- `src/auth/services/autorizacion.service.ts`: añade un permiso compartido de creación/edición para administrador y Profesional; el permiso de control global sigue reservado al administrador.
- `src/servicios/servicios.controller.ts`: abre lectura, alta y edición del catálogo al Profesional y proyecta descripción y autoría sin datos privados. La desactivación, reactivación y baja siguen bajo el rol administrador.
- `src/servicios/servicios.service.ts`: fija la autoría al crear, comprueba pertenencia y autor en la edición, y guarda servicio, selección propia, oferta inicial por cada sucursal asignada y auditoría en una transacción. La edición no transfiere la autoría.
- `test/fix-modulo-1-t010-t018.e2e-spec.ts`: prueba el contrato HTTP nuevo con sesiones reales, dos negocios, tres roles, dos profesionales, MariaDB y una falla final de auditoría.
- `src/auth/services/autorizacion-fase-2.spec.ts`: amplía la matriz de permisos para verificar la separación entre edición compartida y control global.
- `test/servicios-t067-t070.e2e-spec.ts`: adapta la regresión histórica al permiso de lectura del Profesional; conserva comprobaciones de pertenencia y control global.
- `test/profesionales-t071-t076.e2e-spec.ts`: añade especialidad a sus altas para conservar la prueba histórica de perfil, asignación y sesión.
- `test/profesionales-t077-t080.e2e-spec.ts`: añade especialidad al fixture de selección general de servicios.
- `test/profesionales-t081-t082.integration-spec.ts`: añade especialidad a las altas directas del servicio para seguir probando persistencia y carreras anteriores.
- `test/sucursales-t065.e2e-spec.ts`: actualiza altas auxiliares de Profesional y aclara que sus cuentas de prueba sin perfil no pueden crear servicios.
- `test/regresion-auth-t128.e2e-spec.ts`: completa la alta auxiliar del Profesional en la regresión de autorización.
- `test/recorrido-t133.e2e-spec.ts`: completa la alta del Profesional en el recorrido previo de horario y selección.
- `test/seguridad-t131-t132.e2e-spec.ts`: completa especialidad al editar el perfil heredado de su matriz de acceso durante la gracia de licencia; sigue verificando el corte en el límite de 48 horas.
- `docs/Fix-modulo-1/tareas.md`: registra como hechas únicamente FIX-T010–FIX-T018 al finalizar las verificaciones y enlaza esta evidencia.

## Flujo

El administrador crea un Profesional con identidad completa y especialidad. Un perfil anterior con especialidad `NULL` sigue consultable; cuando se edita, la solicitud debe traer una especialidad válida. La edición guarda cuenta y perfil junto con un único evento de auditoría si hubo cambios.

Al crear un servicio, el servidor obtiene el negocio del actor. Si es Profesional, bloquea su perfil, fija `creador_personal_id`, inserta la selección general activa y crea una combinación activa en cada sucursal asignada. La auditoría se escribe al final de la misma transacción: una falla revierte todas las filas. El servicio entra al catálogo compartido, sin asignarse a otros profesionales. El administrador crea servicios sin autor profesional. Ambos pueden editar datos globales; un Profesional solo puede editar los servicios de los que es autor. El control global de estado y la baja permanecen administrativos.

## Pruebas

La nueva suite e2e se escribió y ejecutó primero: falló en los cuatro escenarios antes de implementar el cambio. Después comprueba especialidad ausente o vacía, perfil heredado consultable, edición heredada obligatoria, descripción ausente/informada/editada, oferta inicial del autor, rollback de alta y edición por auditoría, roles, dos negocios, rechazo de autor ajeno y estabilidad de autoría. La matriz unitaria verifica el permiso nuevo. Las suites históricas verifican continuidad de contratos compatibles; sus fixtures de alta se ajustaron a la especialidad requerida.

## Resultados

- `npm run build`: aprobado.
- `npm run lint`: aprobado.
- `npm test -- --runInBand`: 57 suites y 303 pruebas aprobadas.
- `npm run test:integration -- --runInBand`: 43 suites y 209 pruebas aprobadas.
- `npm run test:e2e -- --runInBand`: 23 suites y 135 pruebas aprobadas. La primera ejecución completa detectó un fixture heredado que editaba sin especialidad; se corrigió y la repetición completa pasó.

Los mensajes de error de auditoría en la salida e2e proceden de fallos inyectados para comprobar la reversión; no son fallos de la suite. La conservación de preferencias al desmarcar y los interruptores individuales corresponden a FIX-T019 y posteriores.
