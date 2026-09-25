# Resultados de T72–T75

## Cambios realizados

- `test/seguridad-t72-t73-t75.e2e-spec.ts` agrega pruebas HTTP con Guards, reloj controlado y una base MariaDB migrada por escenario. T72 pausa el caso de uso después de autorizarlo, lleva el reloj al vencimiento exacto y comprueba tanto confirmación como rollback ante un fallo inducido. T73 envía seis peticiones simultáneas entre login, activación y recuperación desde una misma IP; comprueba el bloqueo compartido, su duración y el aislamiento de otra IP. T75 recorre una matriz de rutas y comprueba permisos, pertenencia, bloqueos de cuenta/licencia, logout, gestión del superadmin y conservación de bloqueos tras cambiar contraseñas. Los comentarios junto a las barreras, el proxy de prueba y los recorridos explican por qué se usan.
- `test/altas-t74.integration-spec.ts` agrega dos carreras con conexiones independientes: slug duplicado y correo de administrador duplicado después de normalizar mayúsculas y espacios. Verifica un único ganador y ausencia de negocio, licencia, usuario, código o auditoría parciales del alta rechazada. El comentario del test señala que la restricción SQL resuelve la carrera.
- `docs/tareas-auth.md` marca T72–T75 como hechas y actualiza los totales, enlazando esta evidencia.
- `docs/plan.md` actualiza el resumen de avance y delimita que T75 no prueba confirmaciones de reservas reales.

No se modificó código de producción: los comportamientos requeridos ya estaban implementados y se verificaron con las pruebas nuevas. Las pruebas se escribieron antes de cualquier cambio de implementación; al ejecutarlas se corrigió una sincronización del propio test T72 y la comparación de la fecha de suspensión en T75. T74 pasó desde su primera ejecución dirigida.

## Qué prueban los escenarios

- T72: operación admitida un milisegundo antes del vencimiento que termina después, rechazo de una nueva solicitud exactamente en el límite y rollback de usuario/auditoría ante fallo controlado.
- T73: cinco intentos fallidos admitidos, sexto bloqueado por 60 segundos, bloqueo sin prórroga, otra IP independiente y desbloqueo al instante exacto.
- T74: una sola alta exitosa por slug o correo duplicado y ninguna escritura parcial para la solicitud rechazada.
- T75: respuestas 401, 403 y 404 según sesión/bloqueo, rol y negocio; rutas de recepcionistas incluidas; logout durante suspensión; renovación que no reactiva; recuperación y restablecimiento que no levantan bloqueos. No acredita reservas reales.

## Verificaciones

| Comando | Resultado |
| --- | --- |
| `npm test -- --runInBand` | 26 suites, 118 pruebas aprobadas |
| `npm run test:integration -- --runInBand` | 13 suites, 56 pruebas aprobadas |
| `npm run test:e2e -- --runInBand` | 9 suites, 91 pruebas aprobadas |
| `npm run build` | Correcto |
| `npm run lint` | Correcto, sin advertencias |

Cada escenario de persistencia utiliza una base temporal que el helper elimina al terminar. Los mensajes `Fallo controlado T72` y otros fallos de prueba en la salida e2e son inyecciones deliberadas para verificar reversión, no errores de la suite si Jest termina en verde.
