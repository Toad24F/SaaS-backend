# Identidad compartida de Profesional

`personal.id` es la misma clave que `usuarios.id`. El perfil no genera un ID propio:
su clave primaria y la clave foránea compuesta `(negocio_id, id)` apuntan a la cuenta.
Las relaciones de servicios, sucursales y agenda siguen apuntando al perfil para
conservar la pertenencia al negocio y el bloqueo de la fila operativa.

Al crear un Profesional, la cuenta y el perfil se guardan en una transacción. El
frontend puede utilizar el `usuario.id` de `POST /auth/login` para las rutas del
Profesional. Cada operación sigue validando el rol, negocio y propiedad actuales;
la igualdad de IDs no concede permisos por sí misma.

La migración `1760000017000-RestaurarSuperadminLocal` puede reponer únicamente la
cuenta superadmin de esta base de desarrollo. Lee `SUPERADMIN_SEED_ID`,
`SUPERADMIN_SEED_NOMBRE`, `SUPERADMIN_SEED_EMAIL`,
`SUPERADMIN_SEED_PASSWORD_HASH`, `SUPERADMIN_SEED_CREADO_EN`,
`SUPERADMIN_SEED_ACTIVADO_EN` y `SUPERADMIN_SEED_CORREO_VERSION` del entorno.
El respaldo local se guarda en `.env`, que Git ignora. Si ninguna variable está
presente, la migración no crea una cuenta; si falta alguna, falla antes de insertar.
El hash de contraseña se conserva sin exponer la contraseña ni incorporarlo al
repositorio. Tras instalar las migraciones, la cuenta restaurada conserva su ID,
correo, nombre, hash y fechas originales.

Esta modificación de la migración inicial de `personal` requiere recrear la base
si ya se ejecutó su versión anterior. La base de desarrollo se reinició tras
comprobar que el respaldo local coincidía con el único superadmin existente.
