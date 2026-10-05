-- Esquema de entrega: autenticacion, negocios y licencias (RF-01 a RF-38).
-- Base: ../db/schema.sql; requisitos: spec/spec-auth.md y docs/plan.md.
-- Instalacion NUEVA. No es una migracion de la base existente.
-- Objetivo: MariaDB 10.6+ / MySQL 8.0.16+ con InnoDB y CHECK habilitados.
-- No ejecutar con opciones que ignoren errores (por ejemplo, --force).
-- El nombre separado evita usar la base original citas_saas.
-- Si esta base ya existe, CREATE DATABASE falla: detener la importacion.
-- No se incluyen DROP, TRUNCATE, usuarios, contrasenas ni datos iniciales.
--
-- Cambios: negocios y usuarios; nuevas licencias, codigos_acceso, sesiones,
-- eventos_auditoria y limites_intentos. Las otras 10 tablas se conservan.
-- Las tablas de autenticacion parten de las migraciones T15 a T18; el tramo
-- incremental de identidad de fase 2 se aplica al final de este script.
--
-- Este DDL no sustituye la autorizacion ni las transacciones del backend:
-- * Solo superadmin administra licencias, que siempre son anuales.
-- * Suspender/reactivar/renovar bloquea la fila de licencia y audita
--   dentro de la misma transaccion; repetir no debe duplicar tiempo.
-- * Alta, activacion y consumo de codigo son atomicos y de un solo uso.
-- * Login y cambios de contrasena coordinan el bloqueo de la cuenta.
-- * Roles, pertenencia y vigencia se revalidan en cada solicitud.
-- * Las tablas originales de citas aun requieren el trabajo posterior
--   de pertenencia entre recursos y exclusion de reservas concurrentes.
--

SET NAMES utf8mb4;
SET SESSION time_zone = '+00:00';
SET SESSION sql_mode = 'STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION';

CREATE DATABASE citas_saas_auth
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE citas_saas_auth;

-- 1. NEGOCIOS (tenant existente; RF-01, RF-02, RF-09, RF-30).
-- Sin estado activo/suspendido: la suspension reside en licencias.
CREATE TABLE negocios (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nombre            VARCHAR(150) NOT NULL,
  slug              VARCHAR(100) NOT NULL,
  email_contacto    VARCHAR(150) NOT NULL,
  telefono_contacto VARCHAR(20) NULL,
  activado_en       DATETIME(6) NULL,
  creado_en         DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  UNIQUE KEY uq_negocios_slug (slug),
  CONSTRAINT chk_negocios_activacion CHECK (
    activado_en IS NULL OR activado_en >= creado_en
  )
) ENGINE=InnoDB;

-- 2. USUARIOS (RF-03, RF-05 a RF-08, RF-13, RF-15, RF-19, RF-27).
-- El backend normaliza email con trim + minusculas antes de escribir.
-- Solo el primer admin puede reservar correo pendiente. Recepcion y superadmin
-- siempre requieren nombre, hash y activacion en la misma escritura.
-- activo es independiente de activado_en; desactivar no borra la cuenta.
-- admin_negocio_unico es calculada: no incluirla en INSERT/UPDATE.
CREATE TABLE usuarios (
  id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  negocio_id          INT UNSIGNED NULL,
  nombre              VARCHAR(150) NULL,
  email               VARCHAR(150) NOT NULL,
  password_hash       VARCHAR(255) NULL,
  rol                 ENUM('superadmin','admin_negocio','recepcionista') NOT NULL,
  activo              BOOLEAN NOT NULL DEFAULT TRUE,
  activado_en         DATETIME(6) NULL,
  creado_en           DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  admin_negocio_unico  INT UNSIGNED GENERATED ALWAYS AS (
    CASE WHEN rol = 'admin_negocio' THEN negocio_id ELSE NULL END
  ) STORED,
  UNIQUE KEY uq_usuarios_email (email),
  UNIQUE KEY uq_usuario_admin_negocio (admin_negocio_unico),
  UNIQUE KEY uq_usuarios_negocio_id (negocio_id, id),
  CONSTRAINT fk_usuarios_negocio FOREIGN KEY (negocio_id) REFERENCES negocios(id),
  CONSTRAINT chk_usuarios_rol_negocio CHECK (
    (rol = 'superadmin' AND negocio_id IS NULL)
    OR (rol IN ('admin_negocio','recepcionista') AND negocio_id IS NOT NULL)
  ),
  CONSTRAINT chk_usuarios_email_normalizado CHECK (
    BINARY email = BINARY LOWER(TRIM(email)) AND CHAR_LENGTH(email) > 0
  ),
  CONSTRAINT chk_usuarios_activo CHECK (activo IN (0,1)),
  CONSTRAINT chk_usuarios_activacion CHECK (
    (rol = 'admin_negocio' AND activado_en IS NULL
      AND nombre IS NULL AND password_hash IS NULL)
    OR (
      activado_en IS NOT NULL
      AND nombre IS NOT NULL AND CHAR_LENGTH(TRIM(nombre)) > 0
      AND password_hash IS NOT NULL AND CHAR_LENGTH(password_hash) > 0
      AND activado_en >= creado_en
    )
  )
) ENGINE=InnoDB;

-- LICENCIAS (RF-02, RF-09, RF-14, RF-28 a RF-38).
-- Una licencia estrictamente anual por negocio, sin modalidad ni plan.
-- habilitada_en se establece al activar al primer administrador.
-- suspension_solicitada_en y bloqueo_programado_en representan las 48 horas de gracia.
-- congelada_en marca el bloqueo materializado; remanente_ms conserva tiempo desde ese límite.
-- suspendida_en se mantiene como compatibilidad de estado efectivo; version_vencimiento
-- identifica cambios del vencimiento para consumidores y auditoría.
CREATE TABLE licencias (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  negocio_id     INT UNSIGNED NOT NULL,
  habilitada_en  DATETIME(6) NULL,
  vence_en       DATETIME(6) NULL,
  suspendida_en  DATETIME(6) NULL,
  suspension_solicitada_en DATETIME(6) NULL,
  bloqueo_programado_en DATETIME(6) NULL,
  congelada_en DATETIME(6) NULL,
  remanente_ms BIGINT UNSIGNED NULL,
  version_vencimiento INT UNSIGNED NOT NULL DEFAULT 0,
  creado_en      DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  actualizado_en DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
                   ON UPDATE CURRENT_TIMESTAMP(6),
  UNIQUE KEY uq_licencias_negocio (negocio_id),
  UNIQUE KEY uq_licencias_negocio_id (negocio_id, id),
  INDEX idx_licencias_vencimiento (suspendida_en, vence_en),
  CONSTRAINT fk_licencias_negocio FOREIGN KEY (negocio_id) REFERENCES negocios(id),
  CONSTRAINT chk_licencias_vigencia CHECK (
    (habilitada_en IS NULL AND vence_en IS NULL)
    OR (
      habilitada_en IS NOT NULL AND vence_en IS NOT NULL
      AND vence_en > habilitada_en
    )
  ),
  CONSTRAINT chk_licencias_habilitacion CHECK (
    habilitada_en IS NULL OR habilitada_en >= creado_en
  ),
  CONSTRAINT chk_licencias_suspension CHECK (
    suspendida_en IS NULL OR (
      suspendida_en >= creado_en
      AND (
        habilitada_en IS NULL
        OR (
          suspendida_en >= habilitada_en
          AND suspendida_en < vence_en
        )
      )
    )
  )
) ENGINE=InnoDB;

-- CODIGOS DE ACCESO (RF-08 a RF-14, RF-22 a RF-24).
-- Codigos aleatorios de alta entropia: guardar SHA-256 hexadecimal, no el valor
-- entregado. El backend establece 48 h para activacion y 30 min para recuperacion.
-- La FK compuesta impide asociar el destinatario a otro negocio.
-- El emisor puede ser el superadmin global; su rol/pertenencia se valida en API.
-- Reemitir primero invalida el anterior dentro de la misma transaccion.
-- Un codigo expirado se mantiene como historial; no se reactiva.
CREATE TABLE codigos_acceso (
  id                BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  negocio_id        INT UNSIGNED NOT NULL,
  usuario_id        INT UNSIGNED NOT NULL,
  emisor_usuario_id INT UNSIGNED NOT NULL,
  proposito         ENUM('activacion_admin','recuperacion') NOT NULL,
  codigo_hash       CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  emitido_en        DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  expira_en         DATETIME(6) NOT NULL,
  consumido_en      DATETIME(6) NULL,
  invalidado_en     DATETIME(6) NULL,
  vigente_unico     TINYINT GENERATED ALWAYS AS (
    CASE WHEN consumido_en IS NULL AND invalidado_en IS NULL THEN 1 ELSE NULL END
  ) STORED,
  UNIQUE KEY uq_codigos_hash (codigo_hash),
  UNIQUE KEY uq_codigos_cuenta_proposito (usuario_id, proposito, vigente_unico),
  INDEX idx_codigos_destinatario (negocio_id, usuario_id),
  INDEX idx_codigos_expiracion (expira_en),
  CONSTRAINT fk_codigos_destinatario
    FOREIGN KEY (negocio_id, usuario_id) REFERENCES usuarios(negocio_id, id),
  CONSTRAINT fk_codigos_emisor
    FOREIGN KEY (emisor_usuario_id) REFERENCES usuarios(id),
  CONSTRAINT chk_codigos_hash CHECK (
    CHAR_LENGTH(codigo_hash) = 64 AND codigo_hash NOT REGEXP '[^0-9a-f]'
  ),
  CONSTRAINT chk_codigos_expiracion CHECK (expira_en > emitido_en),
  CONSTRAINT chk_codigos_consumo CHECK (
    consumido_en IS NULL OR (
      consumido_en >= emitido_en AND consumido_en < expira_en
    )
  ),
  CONSTRAINT chk_codigos_invalidacion CHECK (
    invalidado_en IS NULL OR invalidado_en >= emitido_en
  ),
  CONSTRAINT chk_codigos_estado CHECK (
    consumido_en IS NULL OR invalidado_en IS NULL
  )
) ENGINE=InnoDB;

-- SESIONES (RF-15, RF-18 a RF-20, RF-24, RF-25).
-- El UUID identifica la sesion del JWT, pero no reemplaza su firma.
-- El negocio se obtiene desde usuarios: no se duplica un negocio_id manipulable.
-- Cerrar sesion marca revocada_en; cambiar/recuperar contrasena revoca todas.
CREATE TABLE sesiones (
  id          CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  usuario_id  INT UNSIGNED NOT NULL,
  creada_en   DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  expira_en   DATETIME(6) NOT NULL,
  revocada_en DATETIME(6) NULL,
  INDEX idx_sesiones_usuario (usuario_id, revocada_en, expira_en),
  INDEX idx_sesiones_expiracion (expira_en),
  CONSTRAINT fk_sesiones_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
  CONSTRAINT chk_sesiones_expiracion CHECK (
    -- La sesión y el JWT vencen juntos después de una ventana fija de 12 horas.
    expira_en = DATE_ADD(creada_en, INTERVAL 12 HOUR)
  ),
  CONSTRAINT chk_sesiones_revocacion CHECK (
    revocada_en IS NULL OR revocada_en >= creada_en
  )
) ENGINE=InnoDB;

-- EVENTOS DE AUDITORIA (RF-35, RF-38).
-- actor_usuario_id puede ser superadmin; negocio_id describe el destino.
-- usuario_id y licencia_id opcionales son destinos dentro de ese negocio.
-- Un evento global puede indicar solo el actor, sin destinos de negocio.
-- operacion_id identifica el cambio logico para no duplicarlo en un reintento.
-- La API solo inserta/consulta eventos y filtra JSON con una lista permitida:
-- nunca contrasenas, hashes, codigos, tokens ni cuerpos completos de peticiones.
CREATE TABLE eventos_auditoria (
  id               BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  operacion_id     CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  actor_usuario_id INT UNSIGNED NOT NULL,
  negocio_id       INT UNSIGNED NULL,
  usuario_id       INT UNSIGNED NULL,
  licencia_id      INT UNSIGNED NULL,
  accion           VARCHAR(64) NOT NULL,
  ocurrido_en      DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  valores_antes    JSON NULL,
  valores_despues  JSON NULL,
  UNIQUE KEY uq_auditoria_operacion (operacion_id),
  INDEX idx_auditoria_negocio_fecha (negocio_id, ocurrido_en),
  INDEX idx_auditoria_actor_fecha (actor_usuario_id, ocurrido_en),
  CONSTRAINT fk_auditoria_actor FOREIGN KEY (actor_usuario_id) REFERENCES usuarios(id),
  CONSTRAINT fk_auditoria_negocio FOREIGN KEY (negocio_id) REFERENCES negocios(id),
  CONSTRAINT fk_auditoria_usuario
    FOREIGN KEY (negocio_id, usuario_id) REFERENCES usuarios(negocio_id, id),
  CONSTRAINT fk_auditoria_licencia
    FOREIGN KEY (negocio_id, licencia_id) REFERENCES licencias(negocio_id, id),
  CONSTRAINT chk_auditoria_destino CHECK (
    (usuario_id IS NULL AND licencia_id IS NULL) OR negocio_id IS NOT NULL
  ),
  CONSTRAINT chk_auditoria_accion CHECK (CHAR_LENGTH(TRIM(accion)) > 0)
) ENGINE=InnoDB;

-- LIMITES DE INTENTOS (RF-17).
-- Origen = IP canonica IPv4/IPv6; no confiar en cabeceras de proxy arbitrarias.
-- La misma fila cuenta login y validacion de codigos de forma conjunta.
-- El backend incrementa con bloqueo de fila: cinco intentos por minuto;
-- el sexto bloquea un minuto. Reiniciar el proceso no reinicia el contador.
CREATE TABLE limites_intentos (
  origen             VARCHAR(45) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  ventana_inicio     DATETIME(6) NOT NULL,
  intentos           INT UNSIGNED NOT NULL DEFAULT 0,
  bloqueado_hasta    DATETIME(6) NULL,
  INDEX idx_limites_ventana (ventana_inicio),
  INDEX idx_limites_bloqueo (bloqueado_hasta),
  CONSTRAINT chk_limites_origen CHECK (CHAR_LENGTH(TRIM(origen)) > 0),
  CONSTRAINT chk_limites_bloqueo CHECK (
    bloqueado_hasta IS NULL OR bloqueado_hasta >= ventana_inicio
  )
) ENGINE=InnoDB;

-- TABLAS ORIGINALES DE CITAS: conservadas sin cambios en esta entrega.
-- Sus indices de disponibilidad aceleran consultas, pero por si solos no
-- garantizan ausencia de empalmes ni pertenencia cruzada de todos los recursos.

-- 3. SUCURSALES
-- Por qué: soporta ubicaciones físicas por negocio, zona local y conteo de activas.
-- De dónde: Módulo 1, "Gestión Multi-Locación: Capacidad de registrar N cantidad de consultorios, clínicas o sucursales físicas
CREATE TABLE sucursales (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  negocio_id     INT UNSIGNED NOT NULL,
  nombre         VARCHAR(150) NOT NULL,
  direccion      VARCHAR(255) NOT NULL,
  telefono       VARCHAR(20)  NOT NULL,
  zona_horaria   VARCHAR(64) NOT NULL,
  url_google_maps VARCHAR(2048) NULL,
  notas_llegada  TEXT NULL, -- instrucciones para el cliente al llegar a la sucursal
  activo         BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en      DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  CONSTRAINT fk_sucursales_negocio
    FOREIGN KEY (negocio_id) REFERENCES negocios(id) ON DELETE RESTRICT,
  UNIQUE KEY uq_sucursales_negocio_id (negocio_id, id),
  INDEX idx_sucursales_negocio_activo (negocio_id, activo),
  CONSTRAINT chk_sucursales_nombre CHECK (CHAR_LENGTH(TRIM(nombre)) > 0),
  CONSTRAINT chk_sucursales_direccion CHECK (CHAR_LENGTH(TRIM(direccion)) > 0),
  CONSTRAINT chk_sucursales_telefono CHECK (CHAR_LENGTH(TRIM(telefono)) > 0),
  CONSTRAINT chk_sucursales_zona CHECK (CHAR_LENGTH(TRIM(zona_horaria)) > 0)
) ENGINE=InnoDB;


-- 4. SERVICIOS (catálogo)
-- Por qué: cataloga lo que se ofrece, con duracion_minutos como campo obligatorio porque el motor de disponibilidad depende de ese dato para calcular espacios.
-- De dónde: Módulo 1, "Catálogo de Servicios: Registro de servicios... con su nombre, costo y, de forma obligatoria, duración estimada en minutos".
CREATE TABLE servicios (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  negocio_id        INT UNSIGNED NOT NULL,
  nombre            VARCHAR(150) NOT NULL,
  costo             DECIMAL(10,2) NOT NULL,
  duracion_minutos  INT UNSIGNED NOT NULL,
  activo            BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en         DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  CONSTRAINT fk_servicios_negocio
    FOREIGN KEY (negocio_id) REFERENCES negocios(id) ON DELETE RESTRICT,
  UNIQUE KEY uq_servicios_negocio_id (negocio_id, id),
  INDEX idx_servicios_negocio_activo (negocio_id, activo),
  CONSTRAINT chk_servicios_nombre CHECK (CHAR_LENGTH(TRIM(nombre)) > 0),
  CONSTRAINT chk_servicios_costo CHECK (costo >= 0),
  CONSTRAINT chk_servicios_duracion CHECK (duracion_minutos > 0),
  CONSTRAINT chk_servicios_activo CHECK (activo IN (0, 1))
) ENGINE=InnoDB;


-- 5. PERSONAL (perfil de la cuenta Profesional)
-- La identidad y el acceso viven en usuarios; el perfil solo representa relaciones operativas.
CREATE TABLE personal (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  negocio_id     INT UNSIGNED NOT NULL,
  usuario_id     INT UNSIGNED NOT NULL,
  UNIQUE KEY uq_personal_usuario (usuario_id),
  UNIQUE KEY uq_personal_negocio_id (negocio_id, id),
  CONSTRAINT fk_personal_negocio
    FOREIGN KEY (negocio_id) REFERENCES negocios(id) ON DELETE RESTRICT,
  CONSTRAINT fk_personal_usuario
    FOREIGN KEY (negocio_id, usuario_id) REFERENCES usuarios(negocio_id, id) ON DELETE RESTRICT
) ENGINE=InnoDB;

-- Varias sucursales por perfil; la pertenencia se verifica en ambas claves compuestas.
CREATE TABLE personal_sucursales (
  negocio_id   INT UNSIGNED NOT NULL,
  personal_id  INT UNSIGNED NOT NULL,
  sucursal_id  INT UNSIGNED NOT NULL,
  PRIMARY KEY (negocio_id, personal_id, sucursal_id),
  INDEX idx_ps_sucursal (negocio_id, sucursal_id),
  CONSTRAINT fk_ps_perfil FOREIGN KEY (negocio_id, personal_id)
    REFERENCES personal(negocio_id, id) ON DELETE RESTRICT,
  CONSTRAINT fk_ps_sucursal FOREIGN KEY (negocio_id, sucursal_id)
    REFERENCES sucursales(negocio_id, id) ON DELETE RESTRICT
) ENGINE=InnoDB;

-- Selecciones individuales futuras; el precio y el estado global siguen en servicios.
CREATE TABLE personal_servicios (
  negocio_id   INT UNSIGNED NOT NULL,
  personal_id  INT UNSIGNED NOT NULL,
  servicio_id  INT UNSIGNED NOT NULL,
  PRIMARY KEY (negocio_id, personal_id, servicio_id),
  INDEX idx_pserv_servicio (negocio_id, servicio_id),
  CONSTRAINT fk_pserv_perfil FOREIGN KEY (negocio_id, personal_id)
    REFERENCES personal(negocio_id, id) ON DELETE RESTRICT,
  CONSTRAINT fk_pserv_servicio FOREIGN KEY (negocio_id, servicio_id)
    REFERENCES servicios(negocio_id, id) ON DELETE RESTRICT
) ENGINE=InnoDB;


-- 6. HORARIOS DEL PERSONAL: minutos locales y borradores inactivos.
-- La sucursal informada debe ser una asignación de ese Profesional en ese negocio.
CREATE TABLE horarios_personal (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  negocio_id     INT UNSIGNED NOT NULL,
  personal_id    INT UNSIGNED NOT NULL,
  dia_semana     TINYINT UNSIGNED NOT NULL, -- 0=domingo ... 6=sábado
  orden          INT UNSIGNED NOT NULL DEFAULT 0,
  sucursal_id    INT UNSIGNED NULL,
  inicio_minutos INT UNSIGNED NULL,
  fin_minutos    INT UNSIGNED NULL,
  descanso_inicio_minutos INT UNSIGNED NULL,
  descanso_fin_minutos INT UNSIGNED NULL,
  activo         BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE KEY uq_horarios_negocio_id (negocio_id, id),
  INDEX idx_horarios_personal_dia_orden (negocio_id, personal_id, dia_semana, orden),
  INDEX idx_horarios_asignacion (negocio_id, personal_id, sucursal_id),
  CONSTRAINT fk_horarios_personal FOREIGN KEY (negocio_id, personal_id)
    REFERENCES personal(negocio_id, id) ON DELETE RESTRICT,
  CONSTRAINT fk_horarios_asignacion FOREIGN KEY (negocio_id, personal_id, sucursal_id)
    REFERENCES personal_sucursales(negocio_id, personal_id, sucursal_id) ON DELETE RESTRICT,
  CONSTRAINT chk_horarios_dia CHECK (dia_semana BETWEEN 0 AND 6),
  CONSTRAINT chk_horarios_orden CHECK (orden >= 0),
  CONSTRAINT chk_horarios_activo CHECK (activo IN (0, 1)),
  CONSTRAINT chk_horarios_limites CHECK (
    (inicio_minutos IS NULL OR inicio_minutos BETWEEN 0 AND 1439)
    AND (fin_minutos IS NULL OR fin_minutos BETWEEN 1 AND 1440)
    AND (descanso_inicio_minutos IS NULL OR descanso_inicio_minutos BETWEEN 0 AND 1439)
    AND (descanso_fin_minutos IS NULL OR descanso_fin_minutos BETWEEN 1 AND 1440)),
  CONSTRAINT chk_horarios_pares CHECK (
    (inicio_minutos IS NULL OR fin_minutos IS NULL OR inicio_minutos < fin_minutos)
    AND (descanso_inicio_minutos IS NULL OR descanso_fin_minutos IS NULL
      OR descanso_inicio_minutos < descanso_fin_minutos)),
  CONSTRAINT chk_horarios_completos CHECK (activo = 0 OR (
    sucursal_id IS NOT NULL AND inicio_minutos IS NOT NULL AND fin_minutos IS NOT NULL
    AND inicio_minutos < fin_minutos
    AND ((descanso_inicio_minutos IS NULL AND descanso_fin_minutos IS NULL)
      OR (descanso_inicio_minutos IS NOT NULL AND descanso_fin_minutos IS NOT NULL
        AND descanso_inicio_minutos >= inicio_minutos
        AND descanso_inicio_minutos < descanso_fin_minutos
        AND descanso_fin_minutos <= fin_minutos)))
) ENGINE=InnoDB;

-- Una cabecera sin hijas reemplaza la fecha por un día sin atención.
CREATE TABLE excepciones_horario (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  negocio_id INT UNSIGNED NOT NULL,
  personal_id INT UNSIGNED NOT NULL,
  sucursal_id INT UNSIGNED NOT NULL,
  fecha_local DATE NOT NULL,
  UNIQUE KEY uq_excepciones_negocio_id (negocio_id, id),
  UNIQUE KEY uq_excepciones_profesional_sucursal_fecha
    (negocio_id, personal_id, sucursal_id, fecha_local),
  CONSTRAINT fk_excepciones_personal FOREIGN KEY (negocio_id, personal_id)
    REFERENCES personal(negocio_id, id) ON DELETE RESTRICT,
  CONSTRAINT fk_excepciones_asignacion FOREIGN KEY (negocio_id, personal_id, sucursal_id)
    REFERENCES personal_sucursales(negocio_id, personal_id, sucursal_id) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE franjas_excepcion_horario (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  negocio_id INT UNSIGNED NOT NULL,
  excepcion_id INT UNSIGNED NOT NULL,
  orden INT UNSIGNED NOT NULL DEFAULT 0,
  inicio_minutos INT UNSIGNED NOT NULL,
  fin_minutos INT UNSIGNED NOT NULL,
  descanso_inicio_minutos INT UNSIGNED NULL,
  descanso_fin_minutos INT UNSIGNED NULL,
  INDEX idx_franjas_excepcion_orden (negocio_id, excepcion_id, orden),
  CONSTRAINT fk_franjas_excepcion FOREIGN KEY (negocio_id, excepcion_id)
    REFERENCES excepciones_horario(negocio_id, id) ON DELETE RESTRICT,
  CONSTRAINT chk_franjas_excepcion_orden CHECK (orden >= 0),
  CONSTRAINT chk_franjas_excepcion_intervalo CHECK (
    inicio_minutos BETWEEN 0 AND 1439 AND fin_minutos BETWEEN 1 AND 1440
    AND inicio_minutos < fin_minutos),
  CONSTRAINT chk_franjas_excepcion_descanso CHECK (
    (descanso_inicio_minutos IS NULL AND descanso_fin_minutos IS NULL)
    OR (descanso_inicio_minutos IS NOT NULL AND descanso_fin_minutos IS NOT NULL
      AND descanso_inicio_minutos >= inicio_minutos
      AND descanso_inicio_minutos < descanso_fin_minutos
      AND descanso_fin_minutos <= fin_minutos))
) ENGINE=InnoDB;

-- 7. BLOQUEOS DE HORARIO (T101-T105).
-- personal_id NULL afecta al equipo; sucursal_id NULL afecta a todas las sedes.
-- Ambas horas NULL incluyen cada día; con horas, el intervalo es continuo entre fechas.
CREATE TABLE bloqueos_horario (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  negocio_id INT UNSIGNED NOT NULL,
  personal_id INT UNSIGNED NULL,
  sucursal_id INT UNSIGNED NULL,
  creador_usuario_id INT UNSIGNED NOT NULL,
  tipo VARCHAR(30) NOT NULL,
  motivo VARCHAR(500) NOT NULL,
  fecha_inicio DATE NOT NULL,
  fecha_fin DATE NOT NULL,
  inicio_minutos INT UNSIGNED NULL,
  fin_minutos INT UNSIGNED NULL,
  creado_en DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  UNIQUE KEY uq_bloqueos_negocio_id (negocio_id, id),
  INDEX idx_bloqueos_profesional_fechas (negocio_id, personal_id, fecha_inicio, fecha_fin),
  INDEX idx_bloqueos_sucursal_fechas (negocio_id, sucursal_id, fecha_inicio, fecha_fin),
  CONSTRAINT fk_bloqueos_negocio FOREIGN KEY (negocio_id)
    REFERENCES negocios(id) ON DELETE RESTRICT,
  CONSTRAINT fk_bloqueos_personal FOREIGN KEY (negocio_id, personal_id)
    REFERENCES personal(negocio_id, id) ON DELETE RESTRICT,
  CONSTRAINT fk_bloqueos_sucursal FOREIGN KEY (negocio_id, sucursal_id)
    REFERENCES sucursales(negocio_id, id) ON DELETE RESTRICT,
  CONSTRAINT fk_bloqueos_creador FOREIGN KEY (negocio_id, creador_usuario_id)
    REFERENCES usuarios(negocio_id, id) ON DELETE RESTRICT,
  CONSTRAINT chk_bloqueos_tipo CHECK (tipo IN ('vacaciones','dia_festivo','emergencia')),
  CONSTRAINT chk_bloqueos_motivo CHECK (CHAR_LENGTH(TRIM(motivo)) > 0),
  CONSTRAINT chk_bloqueos_fechas CHECK (fecha_inicio <= fecha_fin),
  CONSTRAINT chk_bloqueos_horas CHECK (
    (inicio_minutos IS NULL AND fin_minutos IS NULL) OR
    (inicio_minutos BETWEEN 0 AND 1439 AND fin_minutos BETWEEN 1 AND 1440
      AND (fecha_inicio < fecha_fin OR inicio_minutos < fin_minutos)))
) ENGINE=InnoDB;


-- 8. CLIENTES
-- Por qué: guarda los datos capturados en el formulario público, con telefono VARCHAR(10) validación exigida.
--De dónde: Módulo 3, "Validación de Datos: Captura obligatoria de Nombre completo, Teléfono a 10 dígitos (para WhatsApp)".
CREATE TABLE clientes (
  id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  negocio_id       INT UNSIGNED NOT NULL,
  nombre_completo  VARCHAR(150) NOT NULL,
  telefono         VARCHAR(10)  NOT NULL,   -- 10 dígitos, validado en backend
  email            VARCHAR(150) NULL,
  creado_en        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_clientes_negocio
    FOREIGN KEY (negocio_id) REFERENCES negocios(id) ON DELETE CASCADE,
  UNIQUE KEY uq_cliente_por_negocio (negocio_id, telefono),
  INDEX idx_clientes_negocio (negocio_id)
) ENGINE=InnoDB;

-- 9. CITAS
-- Por qué: es la tabla central del sistema; el campo estado replica el ciclo de vida exigido, origen distingue 
-- reserva pública de agendamiento manual, y folio da el número de control mostrado en la confirmación.
-- De dónde: Módulo 4; Control de Ciclo de Vida de la Cita: Pendiente, Confirmada, Completada, Cancelada o No Asistió (No-Show)
-- Módulo 3; Confirmación Inmediata: Pantalla de confirmación y folio de control
-- Módulo 4, Agendamiento Manual: Opción para que el recepcionista o médico agende citas directamente.
CREATE TABLE citas (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  negocio_id        INT UNSIGNED NOT NULL,
  sucursal_id       INT UNSIGNED NOT NULL,
  personal_id       INT UNSIGNED NOT NULL,
  servicio_id       INT UNSIGNED NOT NULL,
  cliente_id        INT UNSIGNED NOT NULL,
  fecha             DATE NOT NULL,
  hora_inicio       TIME NOT NULL,
  hora_fin          TIME NOT NULL,
  estado            ENUM('pendiente','confirmada','completada','cancelada','no_asistio')
                     NOT NULL DEFAULT 'pendiente',
  motivo_consulta   TEXT NULL,
  folio             VARCHAR(20) NOT NULL UNIQUE,
  origen            ENUM('portal_publico','manual') NOT NULL DEFAULT 'portal_publico',
  creado_en         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_citas_negocio   FOREIGN KEY (negocio_id)  REFERENCES negocios(id)   ON DELETE CASCADE,
  CONSTRAINT fk_citas_sucursal  FOREIGN KEY (sucursal_id) REFERENCES sucursales(id) ON DELETE RESTRICT,
  CONSTRAINT fk_citas_personal  FOREIGN KEY (personal_id) REFERENCES personal(id)   ON DELETE RESTRICT,
  CONSTRAINT fk_citas_servicio  FOREIGN KEY (servicio_id) REFERENCES servicios(id)  ON DELETE RESTRICT,
  CONSTRAINT fk_citas_cliente   FOREIGN KEY (cliente_id)  REFERENCES clientes(id)   ON DELETE RESTRICT,
  CONSTRAINT chk_citas_horas CHECK (hora_fin > hora_inicio),
  -- clave para el motor de disponibilidad: buscar choques rápido
  INDEX idx_citas_disponibilidad (negocio_id, personal_id, fecha, hora_inicio, hora_fin)
) ENGINE=InnoDB;

-- 10. BLOQUEOS TEMPORALES (prevención de concurrencia)
-- Por qué: existe como tabla separada (no dentro de citas) porque es un registro de corta duración que expira, 
-- no una cita real; evita que dos clientes reserven el mismo horario mientras uno llena el formulario.
-- De dónde: Módulo 3, "Prevención de Concurrencia: Bloqueo temporal del horario mientras el usuario completa el 
-- formulario para evitar que dos personas reserven el mismo espacio simultáneamente".
CREATE TABLE bloqueos_temporales (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  negocio_id     INT UNSIGNED NOT NULL,
  personal_id    INT UNSIGNED NOT NULL,
  fecha          DATE NOT NULL,
  hora_inicio    TIME NOT NULL,
  hora_fin       TIME NOT NULL,
  session_token  VARCHAR(100) NOT NULL,
  expira_en      TIMESTAMP NOT NULL,
  CONSTRAINT fk_bt_negocio  FOREIGN KEY (negocio_id)  REFERENCES negocios(id)  ON DELETE CASCADE,
  CONSTRAINT fk_bt_personal FOREIGN KEY (personal_id) REFERENCES personal(id) ON DELETE CASCADE,
  INDEX idx_bt_vigencia (negocio_id, personal_id, fecha, expira_en)
) ENGINE=InnoDB;

-- 11. NOTIFICACIONES WHATSAPP (bitácora de envíos)
-- -Por qué: es una bitácora de envíos (no solo un campo booleano) porque hay que distinguir el tipo de mensaje 
-- y guardar la respuesta de la API para poder auditar fallos.
-- De dónde: Módulo 5, Notificaciones por WhatsApp: 1. Mensaje de confirmación inmediata al agendar. 
-- 2. Mensaje de recordatorio previo a la cita el tipo enum tiene esos dos valores exactos.
CREATE TABLE notificaciones_whatsapp (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  negocio_id     INT UNSIGNED NOT NULL,
  cita_id        INT UNSIGNED NOT NULL,
  tipo           ENUM('confirmacion','recordatorio') NOT NULL,
  estado_envio   ENUM('pendiente','enviado','fallido') NOT NULL DEFAULT 'pendiente',
  respuesta_api  TEXT NULL,
  enviado_en     TIMESTAMP NULL,
  creado_en      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_nw_negocio FOREIGN KEY (negocio_id) REFERENCES negocios(id) ON DELETE CASCADE,
  CONSTRAINT fk_nw_cita    FOREIGN KEY (cita_id)    REFERENCES citas(id)    ON DELETE CASCADE,
  INDEX idx_nw_negocio (negocio_id)
) ENGINE=InnoDB;

-- FASE 2, MODULO 1: IDENTIDAD PENDIENTE (M1-T011 a M1-T013).
-- Estas sentencias reproducen el resultado de la migracion incremental nueva;
-- RFC y destinatario siguen anulables hasta sustituir el alta historica.
ALTER TABLE negocios
  ADD COLUMN rfc VARCHAR(13) NULL,
  ADD COLUMN correo_administrador VARCHAR(150) NULL,
  ADD COLUMN limite_sucursales_activas INT UNSIGNED NOT NULL DEFAULT 1,
  ADD CONSTRAINT chk_negocios_cupo CHECK (limite_sucursales_activas >= 1),
  ADD CONSTRAINT chk_negocios_rfc CHECK (rfc IS NULL OR CHAR_LENGTH(TRIM(rfc)) > 0),
  ADD CONSTRAINT chk_negocios_correo_administrador CHECK (
    correo_administrador IS NULL OR (
      BINARY correo_administrador = BINARY LOWER(TRIM(correo_administrador))
      AND CHAR_LENGTH(correo_administrador) > 0
    )
  );

-- La invitacion pendiente existe sin usuario ni credenciales incompletas.
CREATE TABLE altas_administrador (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  negocio_id INT UNSIGNED NOT NULL,
  correo VARCHAR(150) NOT NULL,
  estado ENUM('pendiente','activada') NOT NULL DEFAULT 'pendiente',
  usuario_creado_id INT UNSIGNED NULL,
  creado_en DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  activado_en DATETIME(6) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_altas_administrador_negocio (negocio_id),
  UNIQUE KEY uq_altas_administrador_negocio_id (negocio_id, id),
  CONSTRAINT fk_altas_negocio FOREIGN KEY (negocio_id) REFERENCES negocios(id),
  CONSTRAINT fk_altas_usuario FOREIGN KEY (negocio_id, usuario_creado_id)
    REFERENCES usuarios(negocio_id, id),
  CONSTRAINT chk_altas_correo CHECK (
    BINARY correo = BINARY LOWER(TRIM(correo)) AND CHAR_LENGTH(correo) > 0
  ),
  CONSTRAINT chk_altas_estado CHECK (
    (estado = 'pendiente' AND usuario_creado_id IS NULL AND activado_en IS NULL)
    OR (estado = 'activada' AND usuario_creado_id IS NOT NULL
      AND activado_en IS NOT NULL AND activado_en >= creado_en)
  )
) ENGINE=InnoDB;

-- El correo tiene un titular exclusivo; las altas de cuentas existentes se
-- conectaran a esta autoridad comun en M1-T017 y M1-T018.
CREATE TABLE correos_acceso (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  correo VARCHAR(150) NOT NULL,
  alta_administrador_id INT UNSIGNED NULL,
  usuario_id INT UNSIGNED NULL,
  creado_en DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_correos_acceso_correo (correo),
  UNIQUE KEY uq_correos_acceso_alta (alta_administrador_id),
  UNIQUE KEY uq_correos_acceso_usuario (usuario_id),
  CONSTRAINT fk_correos_acceso_alta FOREIGN KEY (alta_administrador_id)
    REFERENCES altas_administrador(id),
  CONSTRAINT fk_correos_acceso_usuario FOREIGN KEY (usuario_id)
    REFERENCES usuarios(id),
  CONSTRAINT chk_correos_acceso_correo CHECK (
    BINARY correo = BINARY LOWER(TRIM(correo)) AND CHAR_LENGTH(correo) > 0
  ),
  CONSTRAINT chk_correos_acceso_titular CHECK (
    (alta_administrador_id IS NOT NULL AND usuario_id IS NULL)
    OR (alta_administrador_id IS NULL AND usuario_id IS NOT NULL)
  )
) ENGINE=InnoDB;

-- FASE 2, MODULO 1: CUENTAS Y DESTINOS DE AUDITORIA (M1-T014 a M1-T016).
-- Aplica despues del tramo de identidad pendiente; el administrador historico
-- conserva su estado pendiente hasta reemplazar el alta en M1-T035.
ALTER TABLE usuarios DROP CONSTRAINT chk_usuarios_rol_negocio;
ALTER TABLE usuarios MODIFY COLUMN rol
  ENUM('superadmin','admin_negocio','recepcionista','profesional') NOT NULL;
ALTER TABLE usuarios ADD CONSTRAINT chk_usuarios_rol_negocio CHECK (
  (rol = 'superadmin' AND negocio_id IS NULL)
  OR (rol IN ('admin_negocio','recepcionista','profesional') AND negocio_id IS NOT NULL)
);
ALTER TABLE usuarios ADD UNIQUE KEY uq_usuarios_id_email (id, email);
ALTER TABLE altas_administrador ADD UNIQUE KEY uq_altas_id_correo (id, correo);
-- Las FKs compuestas impiden reservar un correo distinto al del titular.
ALTER TABLE correos_acceso
  ADD CONSTRAINT fk_correos_acceso_usuario_correo FOREIGN KEY (usuario_id, correo)
    REFERENCES usuarios(id, email),
  ADD CONSTRAINT fk_correos_acceso_alta_correo FOREIGN KEY (alta_administrador_id, correo)
    REFERENCES altas_administrador(id, correo);

ALTER TABLE eventos_auditoria DROP CONSTRAINT chk_auditoria_destino;
ALTER TABLE eventos_auditoria
  ADD COLUMN alta_administrador_id INT UNSIGNED NULL,
  ADD COLUMN recurso_tipo VARCHAR(32) NULL,
  ADD COLUMN recurso_id INT UNSIGNED NULL,
  ADD CONSTRAINT fk_auditoria_alta FOREIGN KEY (negocio_id, alta_administrador_id)
    REFERENCES altas_administrador(negocio_id, id),
  ADD CONSTRAINT chk_auditoria_destino CHECK (
    (usuario_id IS NULL AND licencia_id IS NULL AND alta_administrador_id IS NULL
      AND recurso_tipo IS NULL) OR negocio_id IS NOT NULL
  ),
  ADD CONSTRAINT chk_auditoria_recurso CHECK (
    (recurso_tipo IS NULL AND recurso_id IS NULL)
    OR (recurso_tipo IN ('sucursal','servicio','profesional','horario','bloqueo')
      AND recurso_id IS NOT NULL AND recurso_id > 0)
  );

-- FASE 2, MODULO 1: CODIGOS POR INVITACION Y CLAVE VERSIONADA (T020–T024).
-- El codigo utilizable se deriva fuera de MariaDB; solo se guarda su hash.
ALTER TABLE altas_administrador
  ADD COLUMN correo_version INT UNSIGNED NOT NULL DEFAULT 1,
  ADD CONSTRAINT chk_altas_correo_version CHECK (correo_version >= 1);
ALTER TABLE usuarios
  ADD COLUMN correo_version INT UNSIGNED NOT NULL DEFAULT 1,
  ADD CONSTRAINT chk_usuarios_correo_version CHECK (correo_version >= 1);
ALTER TABLE codigos_acceso DROP FOREIGN KEY fk_codigos_destinatario;
ALTER TABLE codigos_acceso
  MODIFY COLUMN usuario_id INT UNSIGNED NULL,
  ADD COLUMN alta_administrador_id INT UNSIGNED NULL,
  ADD COLUMN destinatario_version INT UNSIGNED NOT NULL DEFAULT 1,
  ADD COLUMN emision_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  ADD COLUMN nonce CHAR(32) CHARACTER SET ascii COLLATE ascii_bin NULL,
  ADD COLUMN clave_version INT UNSIGNED NULL,
  ADD COLUMN correo_destinatario VARCHAR(150) NULL,
  ADD COLUMN legado_fase_1 BOOLEAN NOT NULL DEFAULT FALSE,
  ADD UNIQUE KEY uq_codigos_alta_proposito
    (alta_administrador_id, proposito, vigente_unico),
  ADD UNIQUE KEY uq_codigos_emision (emision_id),
  ADD INDEX idx_codigos_alta (negocio_id, alta_administrador_id),
  ADD CONSTRAINT fk_codigos_destinatario FOREIGN KEY (negocio_id, usuario_id)
    REFERENCES usuarios(negocio_id, id),
  ADD CONSTRAINT fk_codigos_alta FOREIGN KEY (negocio_id, alta_administrador_id)
    REFERENCES altas_administrador(negocio_id, id);
-- Se marca el respaldo histórico antes de comprobar los destinos nuevos.
UPDATE codigos_acceso SET legado_fase_1 = 1;
ALTER TABLE codigos_acceso
  ADD CONSTRAINT chk_codigos_destino CHECK (
    (proposito = 'activacion_admin' AND alta_administrador_id IS NOT NULL
      AND usuario_id IS NULL AND legado_fase_1 = 0)
    OR (proposito = 'recuperacion' AND usuario_id IS NOT NULL
      AND alta_administrador_id IS NULL)
    OR (proposito = 'activacion_admin' AND usuario_id IS NOT NULL
      AND alta_administrador_id IS NULL AND legado_fase_1 = 1)
  ),
  ADD CONSTRAINT chk_codigos_derivacion CHECK (
    (legado_fase_1 = 1 AND emision_id IS NULL AND nonce IS NULL
      AND clave_version IS NULL AND correo_destinatario IS NULL)
    OR (legado_fase_1 = 0 AND emision_id IS NOT NULL AND nonce IS NOT NULL
      AND clave_version IS NOT NULL AND correo_destinatario IS NOT NULL)
  ),
  ADD CONSTRAINT chk_codigos_version CHECK (destinatario_version >= 1
    AND (clave_version IS NULL OR clave_version >= 1)),
  ADD CONSTRAINT chk_codigos_correo CHECK (correo_destinatario IS NULL OR
    (BINARY correo_destinatario = BINARY LOWER(TRIM(correo_destinatario))
      AND CHAR_LENGTH(correo_destinatario) > 0));

-- FASE 2, MODULO 1: BANDEJA DURABLE DE CORREO (T025–T026).
-- Solo referencias y metadatos persistentes; el contenido del mensaje vive en memoria.
ALTER TABLE codigos_acceso
  ADD UNIQUE KEY uq_codigos_negocio_id (negocio_id, id);
CREATE TABLE envios_correo (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  negocio_id INT UNSIGNED NOT NULL,
  tipo ENUM('activacion_admin','recuperacion','aviso_vencimiento') NOT NULL,
  correo_destinatario VARCHAR(150) NOT NULL,
  clave_dedupe VARCHAR(160) NOT NULL,
  codigo_acceso_id BIGINT UNSIGNED NULL,
  licencia_id INT UNSIGNED NULL,
  version_vencimiento INT UNSIGNED NULL,
  estado ENUM('pendiente','tomado','enviado','fallido','descartado') NOT NULL DEFAULT 'pendiente',
  intentos INT UNSIGNED NOT NULL DEFAULT 0,
  proximo_intento_en DATETIME(6) NOT NULL,
  arrendamiento_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  arrendado_hasta DATETIME(6) NULL,
  confirmado_en DATETIME(6) NULL,
  ultimo_error VARCHAR(255) NULL,
  creado_en DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  actualizado_en DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_envios_clave_dedupe (clave_dedupe),
  INDEX idx_envios_trabajo (estado, proximo_intento_en, arrendado_hasta),
  INDEX idx_envios_codigo (negocio_id, codigo_acceso_id),
  INDEX idx_envios_licencia (negocio_id, licencia_id),
  CONSTRAINT fk_envios_negocio FOREIGN KEY (negocio_id) REFERENCES negocios(id),
  CONSTRAINT fk_envios_codigo FOREIGN KEY (negocio_id, codigo_acceso_id)
    REFERENCES codigos_acceso(negocio_id, id),
  CONSTRAINT fk_envios_licencia FOREIGN KEY (negocio_id, licencia_id)
    REFERENCES licencias(negocio_id, id),
  CONSTRAINT chk_envios_clave CHECK (
    BINARY clave_dedupe = BINARY TRIM(clave_dedupe) AND CHAR_LENGTH(clave_dedupe) > 0),
  CONSTRAINT chk_envios_correo CHECK (
    BINARY correo_destinatario = BINARY LOWER(TRIM(correo_destinatario))
    AND CHAR_LENGTH(correo_destinatario) > 0),
  CONSTRAINT chk_envios_referencia CHECK (
    (tipo IN ('activacion_admin','recuperacion') AND codigo_acceso_id IS NOT NULL
      AND licencia_id IS NULL AND version_vencimiento IS NULL)
    OR (tipo = 'aviso_vencimiento' AND codigo_acceso_id IS NULL
      AND licencia_id IS NOT NULL AND version_vencimiento >= 1)),
  CONSTRAINT chk_envios_intentos CHECK (intentos >= 0),
  CONSTRAINT chk_envios_arrendamiento CHECK (
    (estado = 'tomado' AND arrendamiento_id IS NOT NULL AND arrendado_hasta IS NOT NULL)
    OR (estado <> 'tomado' AND arrendamiento_id IS NULL AND arrendado_hasta IS NULL)),
  CONSTRAINT chk_envios_confirmacion CHECK (
    (estado = 'enviado' AND confirmado_en IS NOT NULL)
    OR (estado <> 'enviado' AND confirmado_en IS NULL))
) ENGINE=InnoDB;
