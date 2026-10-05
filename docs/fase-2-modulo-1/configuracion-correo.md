# Configuración de correo y rotación de claves

El ejecutor de correo arranca con la aplicación y repite el ciclo cada minuto. En cada ciclo materializa las suspensiones vencidas, detecta avisos de licencia y procesa hasta 100 trabajos elegibles de la bandeja. Los arrendamientos de trabajos interrumpidos vencen a los cinco minutos; el siguiente ciclo puede recuperarlos. La base de datos serializa la toma entre procesos.

## Variables

La plantilla [`.env.example`](../../.env.example) contiene solo marcadores. Configurar los valores reales en el entorno de despliegue, fuera del repositorio:

| Variable | Uso |
| --- | --- |
| `JWT_SECRET` | Firma las sesiones. Debe ser propio y distinto de todas las claves HMAC. |
| `CODIGOS_HMAC_VERSION_ACTUAL` | Versión con la que se emiten códigos nuevos. |
| `CODIGOS_HMAC_CLAVES` | Mapa JSON de versión a clave de derivación, con 32 caracteres o más por clave. |
| `CORREO_REMITENTE` | Dirección visible del emisor; debe ser una dirección válida y autorizada por el proveedor SMTP. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_TIMEOUT_MS` | Conexión, autenticación y tiempo de espera del transporte. |

El arranque productivo verifica que estén presentes la versión HMAC activa, una clave distinta de `JWT_SECRET`, el remitente y los datos SMTP requeridos. Los errores nombran la variable, nunca su valor. No registrar estas claves, contraseñas, códigos derivados ni cuerpos de correo.

## Rotación

1. Agregar una versión nueva a `CODIGOS_HMAC_CLAVES` y conservar las anteriores. Cambiar `CODIGOS_HMAC_VERSION_ACTUAL` a la nueva versión en la misma publicación.
2. Reiniciar los procesos con la configuración completa. Los códigos previos se derivan con la versión persistida en cada emisión; los nuevos usan la versión activa.
3. Retirar una versión anterior solo cuando ya no existan códigos vigentes ni envíos pendientes o arrendados que dependan de ella. Comprobar además los reintentos fallidos recuperables.
4. Rotar `JWT_SECRET` y las credenciales SMTP de forma independiente. La rotación de JWT afecta las sesiones según la política de autenticación; cambiar SMTP no modifica los códigos persistidos.

Las pruebas de rotación y de recuperación usan dominios `example.test` y un transporte controlado; no envían mensajes reales. El acuse SMTP puede perderse si el proceso cae después de entregar y antes de guardar la confirmación, por lo que la recuperación ofrece entrega al menos una vez, con posibles duplicados en esa ventana.
