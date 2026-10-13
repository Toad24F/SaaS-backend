# Evidencia M2-T020–M2-T025 — configuración de agenda

## Archivos y flujo

`src/disponibilidad/configuracion-agenda.validador.ts` define el conjunto completo de cuatro reglas y los valores efectivos iniciales (Ventana Libre, 15/15/60). Acepta solo los seis intervalos previstos, anticipación entera no negativa en múltiplos de cinco y horizonte entero no negativo. Rechaza campos ausentes o desconocidos y números que no pueden guardarse como `INT UNSIGNED` o desbordan el cálculo de fecha. Sus comentarios explican el reemplazo íntegro y por qué no se permiten conversiones numéricas implícitas. `configuracion-agenda.validador.spec.ts` comprueba sus límites válidos e inválidos.

`src/disponibilidad/configuracion-agenda.service.ts` lee la configuración del negocio derivado de la cuenta activa del administrador. Si no existe fila, devuelve los valores iniciales sin insertar ni auditar. Para guardar, valida el conjunto, abre una transacción, vuelve a comprobar el actor, bloquea la fila del negocio (también antes de la primera configuración), compara contra los valores efectivos y guarda solo una transición real con su evento anterior/nuevo. La auditoría usa negocio y acción porque el esquema histórico restringe `recurso_tipo`. El fallo de cualquier paso revierte datos y evento. Los comentarios explican bloqueo, repetición sin efectos y rollback. `src/disponibilidad/disponibilidad.module.ts` registra y exporta el servicio para las consultas internas posteriores; no publica rutas HTTP, reservadas para M2-T060–T071.

`test/fase-3-t020-t025.integration-spec.ts` usa bases temporales y dos conexiones independientes. Comprueba lectura sin escritura, aislamiento entre negocios, rechazo a recepción y a `negocioId` suministrado, escritura íntegra, auditoría de cambio real, repetición sin evento, rollback por entrada inválida o falla de auditoría y carrera de primeras escrituras. `src/disponibilidad/base-fase-3.spec.ts` adapta la antigua prueba de composición: ahora admite el proveedor interno M01, pero sigue prohibiendo controladores y escritores HTTP prematuros. `docs/fase-3/tareas.md` registra el cierre de las seis tareas y enlaza esta evidencia.

Flujo: **actor actual → valores efectivos o defecto sin escritura** para consulta; **validación completa → transacción → actor actual → bloqueo del negocio → comparación → configuración + auditoría → commit** para cambio. El bloqueo del padre serializa incluso dos altas simultáneas cuando todavía no existe la fila. Si el conjunto es igual, se devuelve sin alterar filas ni eventos. No se modifican citas existentes ni se ofrece aún un endpoint público.

## Pruebas escritas primero

La primera prueba unitaria falló porque el validador todavía no existía. Tras crear el validador y servicio, los casos de integración descubrieron que el `CHECK` histórico de auditoría no admite un nuevo `recurso_tipo`; el evento se ajustó al contrato actual. Otro fallo de prueba reveló que el driver devuelve JSON ya deserializado, por lo que la aserción acepta ambos formatos. La primera suite unitaria global encontró una expectativa de T004 ya obsoleta (dominio sin proveedores); se actualizó conservando la prohibición de controladores. Los casos dirigidos quedaron en verde: **2 pruebas unitarias y 3 de integración**.

Verificación global: `npm run build` y `npm run lint` sin errores; `npm test -- --runInBand`: **59 suites, 308 pruebas aprobadas**; `npm run test:integration -- --runInBand`: **50 suites, 229 pruebas aprobadas**; `npm run test:e2e -- --runInBand test/recorrido-t133.e2e-spec.ts`: **1 suite, 1 prueba aprobada**. La ejecución unitaria previa a actualizar la prueba histórica obtuvo 1 fallo y 307 aciertos; la repetición completa quedó verde.

## Límite

Esta sección implementa M01 como servicio interno. Los permisos específicos de disponibilidad y la política de licencia de lectura se incorporarán con M2-T026–T027; las rutas HTTP privadas de configuración corresponden a M2-T060–T071. No se atribuye aquí cobertura HTTP nueva.
