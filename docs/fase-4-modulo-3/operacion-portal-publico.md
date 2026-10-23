# Operación del portal público de reservas

Esta guía describe el orden de instalación y la respuesta ante incidentes del módulo 3. No autoriza publicar el sistema: la decisión de entrega depende de M3-T136. Las variables de entorno se cargan en los procesos del backend y de las migraciones desde el gestor de despliegue; los valores de ejemplo no son secretos utilizables.

## 1. Preparar configuración y datos

1. Configurar MariaDB/MySQL para el negocio de datos existente y conservar un respaldo antes de actualizar. Usar las variables `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASS` y `DB_NAME` en el entorno del backend. No usar las variables `TEST_DB_*` ni una base desechable en el servicio cotidiano.
2. Configurar `NODE_ENV=production` y `PORTAL_PUBLICO_ESCRITURAS=cerradas`. Producción también cierra nuevas escrituras cuando la variable falta o tiene un valor distinto de `habilitadas`. El ejemplo [`.env.example`](../../.env.example) deja el interruptor cerrado.
3. Configurar `PORTAL_PUBLICO_ORIGEN` con el origen HTTPS exacto que verá el navegador, sin ruta ni barra final. Configurar `PORTAL_CSRF_SECRET` y `PORTAL_FORMULARIO_HMAC_SECRET` como claves aleatorias independientes, de al menos 32 caracteres, distintas de `JWT_SECRET`. Guardarlas solo en el gestor de secretos del backend. La clave HMAC del formulario debe conservarse mientras haya intentos cuyo resultado pueda necesitar recuperación o repetición.
4. Configurar los demás requisitos vigentes de autenticación, licencias y correo según los módulos anteriores. No incluir claves ni credenciales en `VITE_*`: Vite las expone al navegador.

## 2. Instalar en orden

1. Con las variables de base ya cargadas en el proceso de consola, instalar dependencias del backend y ejecutar `npm run migration:run` desde su raíz. La configuración de TypeORM tiene `migrationsRun: false`, `synchronize: false` y `dropSchema: false`: iniciar NestJS no aplica migraciones automáticamente. En una actualización desde fase 3, ejecutar las migraciones aditivas; no reinstalar tablas ni usar `db/schema.sql` como sustituto de una migración sobre datos existentes.
2. Verificar que las migraciones terminaron correctamente y que los datos anteriores siguen presentes. Después ejecutar `npm run build` y arrancar el backend compatible con `npm run start:prod`, aún con escrituras públicas cerradas. El comando de migración debe recibir las variables exportadas en su propio entorno; un archivo `.env` aislado no garantiza que la CLI las lea.
3. Instalar y compilar `frontend-saas` con `npm ci` y `npm run build` después de disponer del contrato backend. Publicar su `dist/` mediante el servidor estático previsto. `VITE_API_URL` solo configura la API del panel y el proxy de desarrollo de Vite; el portal público utiliza rutas relativas `/publico/...` del mismo origen. No trasladar secretos al build frontend.
4. Configurar TLS y el proxy de despliegue antes de ofrecer `/reservas/:slug`. La tabla describe el enrutamiento requerido sin fijar un dominio, certificado ni archivo Nginx que todavía no se han acordado:

   | Ruta que recibe el navegador | Destino y regla |
   | --- | --- |
   | `/publico/negocios/:slug/...` | Enviar a NestJS bajo **el mismo origen HTTPS**, conservando método, cuerpo, ruta, encabezado `Origin` y cookie. No quitar `/publico` ni añadir `/api`. |
   | `/reservas/:slug` y recursos del frontend | Servir `dist/`; las rutas SPA vuelven a `index.html` sin interceptar `/publico`. |

   El navegador debe poder guardar la cookie anónima HttpOnly, SameSite=Strict y Secure en producción, y usar Web Locks y BroadcastChannel en un contexto seguro. El CORS administrativo no habilita cookies entre orígenes; el proxy de mismo origen es necesario para el portal.
5. Comprobar en el entorno de validación catálogo, disponibilidad, sesión y recuperación con un negocio de prueba, además de build, lint y suites relevantes. La salida pública de una cita es `pendiente`; no se debe mostrar como confirmación por WhatsApp.

## 3. Habilitar nuevas reservas

Con migraciones, backend, frontend, HTTPS, proxy y pruebas de aceptación aprobados, cambiar `PORTAL_PUBLICO_ESCRITURAS` a `habilitadas` en la configuración del backend y reiniciar o desplegar los procesos para que reciban el nuevo entorno. Una variable cambiada fuera de un proceso ya iniciado no modifica su `process.env`. Comprobar la configuración efectiva de **todas** las instancias antes de anunciar apertura; el interruptor es por proceso y no una fila compartida de base de datos. La licencia del negocio y la oferta siguen siendo condiciones independientes.

## 4. Cerrar ante una incidencia y recuperar

1. Cambiar `PORTAL_PUBLICO_ESCRITURAS=cerradas` en todas las instancias y reiniciarlas o drenarlas de forma coordinada. Una petición que ya estaba en curso puede confirmar antes de que la instancia observe el cierre; consultar su intento, nunca asumir fracaso por la pérdida de respuesta.
2. Con escrituras cerradas, las nuevas concesiones, preparaciones y primeras reservas devuelven 503 seguro. La consulta de un apartado propio, su liberación, la repetición de una reserva ya registrada y `POST /publico/negocios/:slug/intentos/:id/resolver` siguen disponibles bajo cookie, origen y CSRF válidos. El cierre operativo no borra ni libera en masa apartados, citas o intentos. Los apartados no liberados vencen a los cinco minutos originales; las citas `pendiente` siguen ocupando su intervalo.
3. Ante un envío incierto, conservar el negocio, ID de apartado y clave del intento; reintentar la **resolución de la misma clave**. Si responde `registrado`, mostrar el mismo folio. Si responde `no_registrado`, el cierre es durable y entonces puede iniciarse otro flujo cuando las escrituras vuelvan a abrir. Si responde 503, conservar la incertidumbre y reintentar después; no crear otro intento ni buscar por teléfono o folio. El contacto y las notas permanecen solo en memoria del portal.
4. Mantener estables los secretos de CSRF y HMAC del formulario durante la recuperación. Cambiarlos puede invalidar la sesión o impedir comparar un reintento anterior. Si se perdió la cookie propia, el portal no debe ofrecer acceso a resultados por teléfono, folio o clave ajena. La inicialización de sesión puede seguir sujeta a la licencia; el cierre operativo por interruptor y el cierre comercial por licencia son controles distintos.
5. Revisar contadores agregados de `conflicto`, `expiracion`, `fallo` y `recuperacion`, y la disponibilidad técnica. Los contadores son por proceso y se reinician al reiniciarlo; no contienen contacto, notas ni credenciales. Resolver el incidente y repetir las comprobaciones antes de reabrir. No revertir migraciones borrando citas o intentos reales: corregir hacia delante y preservar la historia.

## Evidencia y límites

- [T126–T131](resultados-tareas/resultado-t126-t131.md): interruptor, métricas, build, lint y suites backend.
- [T132](../../../frontend-saas/docs/fase-4/resultados-tareas/resultado-t132.md) y [T133](../../../frontend-saas/docs/fase-4/resultados-tareas/resultado-t133.md): build/Node y navegador del frontend.
- [T134](resultados-tareas/resultado-t134.md): integración pública real; M2-I004/M3-I001 permanece diferida al escritor manual del módulo 4.

La configuración concreta de Nginx, dominio, certificados y proceso de publicación requiere decisiones de infraestructura. Esta guía define el contrato del proxy y el orden seguro, sin afirmar que producción esté habilitada.
