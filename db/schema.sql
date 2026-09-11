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
-- Las tablas de autenticacion coinciden con las migraciones T15 a T18.
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
-- El correo queda reservado incluso mientras la cuenta esta pendiente.
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
    (activado_en IS NULL AND nombre IS NULL AND password_hash IS NULL)
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
-- suspendida_en indica suspension vigente, tambien antes de activar.
-- No hay un estado "vencida" persistido: se calcula si no esta suspendida.
--
-- Suspendida: conservar vence_en y suspendida_en; no vence
-- por el mero paso del tiempo. Renovar amplia el vencimiento conservado.
-- Reactivar habilitada: sumar a vence_en el tiempo desde suspendida_en
-- y limpiar suspendida_en, exactamente una vez dentro de una transaccion.
-- Reactivar pendiente solo limpia suspendida_en.
CREATE TABLE licencias (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  negocio_id     INT UNSIGNED NOT NULL,
  habilitada_en  DATETIME(6) NULL,
  vence_en       DATETIME(6) NULL,
  suspendida_en  DATETIME(6) NULL,
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
  proposito         ENUM('activacion_admin','activacion_recepcionista','recuperacion') NOT NULL,
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
    expira_en = DATE_ADD(creada_en, INTERVAL 1 HOUR)
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
-- Por qué: soporta el registro de N ubicaciones físicas por negocio con sus datos básicos.
-- De dónde: Módulo 1, "Gestión Multi-Locación: Capacidad de registrar N cantidad de consultorios, clínicas o sucursales físicas
CREATE TABLE sucursales (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  negocio_id     INT UNSIGNED NOT NULL,
  nombre         VARCHAR(150) NOT NULL,
  direccion      VARCHAR(255) NULL,
  telefono       VARCHAR(20)  NULL,
  notas_llegada  TEXT NULL, -- instrucciones para el cliente al llegar a la sucursal
  activo         BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT fk_sucursales_negocio
    FOREIGN KEY (negocio_id) REFERENCES negocios(id) ON DELETE CASCADE,
  INDEX idx_sucursales_negocio (negocio_id)
) ENGINE=InnoDB;


-- 4. SERVICIOS (catálogo)
-- Por qué: cataloga lo que se ofrece, con duracion_minutos como campo obligatorio porque el motor de disponibilidad depende de ese dato para calcular espacios.
-- De dónde: Módulo 1, "Catálogo de Servicios: Registro de servicios... con su nombre, costo y, de forma obligatoria, duración estimada en minutos".
CREATE TABLE servicios (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  negocio_id        INT UNSIGNED NOT NULL,
  nombre            VARCHAR(150) NOT NULL,
  costo             DECIMAL(10,2) NOT NULL DEFAULT 0,
  duracion_minutos  INT UNSIGNED NOT NULL,
  activo            BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT fk_servicios_negocio
    FOREIGN KEY (negocio_id) REFERENCES negocios(id) ON DELETE CASCADE,
  INDEX idx_servicios_negocio (negocio_id)
) ENGINE=InnoDB;


-- 5. PERSONAL (especialistas / empleados)
-- Por qué: representa a cada especialista/empleado que atiende citas.
-- De dónde: Módulo 1, "Matriz de Disponibilidad del Personal" — es la base sobre la que se construye esa matriz.
CREATE TABLE personal (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  negocio_id     INT UNSIGNED NOT NULL,
  nombre         VARCHAR(150) NOT NULL,
  especialidad   VARCHAR(150) NULL,
  email          VARCHAR(150) NULL,
  telefono       VARCHAR(20)  NULL,
  activo         BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT fk_personal_negocio
    FOREIGN KEY (negocio_id) REFERENCES negocios(id) ON DELETE CASCADE,
  INDEX idx_personal_negocio (negocio_id)
) ENGINE=InnoDB;

-- ---------------------------------------------------------
-- Relación sobre qué servicios puede dar cada especialista
-- Por qué: Es una relación muchos-a-muchos porque un especialista puede ofrecer varios servicios y un servicio puede 
-- ser dado por varios especialistas, no está explícita como tabla en el documento pero es necesaria para que el portal 
-- público solo muestre profesionales que si pueden hacer esos servicios.
-- De dónde: flujo del Módulo 3: Selección de Servicio > Selección de Sucursal > Selección de Profesional
-- ese tercer paso requiere saber qué profesionales pueden dar ese servicio.
CREATE TABLE personal_servicios (
  personal_id  INT UNSIGNED NOT NULL,
  servicio_id  INT UNSIGNED NOT NULL,
  PRIMARY KEY (personal_id, servicio_id),
  CONSTRAINT fk_ps_personal FOREIGN KEY (personal_id) REFERENCES personal(id) ON DELETE CASCADE,
  CONSTRAINT fk_ps_servicio FOREIGN KEY (servicio_id) REFERENCES servicios(id) ON DELETE CASCADE
) ENGINE=InnoDB;


-- 6. HORARIOS DEL PERSONAL (matriz de disponibilidad semanal)
-- Por que: Define en qué sucursal y qué bloques atiende cada persona por día.
-- si el personal_id tiene una hora de comida o descanso diario, el horario se divide en dos bloques (ej: 09:00-13:00 y 14:00-18:00).
-- De dónde: Módulo 1, "Cruce de ubicación: Definir en qué sucursal atiende el profesional según el día ".
CREATE TABLE horarios_personal (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  negocio_id     INT UNSIGNED NOT NULL,
  personal_id    INT UNSIGNED NOT NULL,
  sucursal_id    INT UNSIGNED NOT NULL,
  dia_semana     TINYINT UNSIGNED NOT NULL,   -- 0=domingo ... 6=sábado
  hora_inicio    TIME NOT NULL,
  hora_fin       TIME NOT NULL,
  CONSTRAINT fk_hp_negocio  FOREIGN KEY (negocio_id)  REFERENCES negocios(id)   ON DELETE CASCADE,
  CONSTRAINT fk_hp_personal FOREIGN KEY (personal_id) REFERENCES personal(id)  ON DELETE CASCADE,
  CONSTRAINT fk_hp_sucursal FOREIGN KEY (sucursal_id) REFERENCES sucursales(id) ON DELETE CASCADE,
  CONSTRAINT chk_hp_horas CHECK (hora_fin > hora_inicio),
  INDEX idx_hp_negocio_personal_dia (negocio_id, personal_id, dia_semana)
) ENGINE=InnoDB;

-- 7. BLOQUEOS DE HORARIO
-- Por que_ Cubre: descansos, vacaciones, feriados, emergencias.
-- si personal_id es NULL, el bloqueo aplica a toda la sucursal.
-- De dónde: combina dos requisitos distintos del documento; Módulo 1 (Horarios de descanso, bloqueados automáticamente) 
-- y Módulo 2 (Bloqueos Excepcionales: cancelar o bloquear días completos o franjas horarias por vacaciones, días festivos o emergencias).
CREATE TABLE bloqueos_horario (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  negocio_id     INT UNSIGNED NOT NULL,
  personal_id    INT UNSIGNED NULL,
  sucursal_id    INT UNSIGNED NULL,
  tipo           ENUM('vacaciones','feriado','emergencia') NOT NULL,
  fecha_inicio   DATE NOT NULL,
  fecha_fin      DATE NOT NULL,
  hora_inicio    TIME NULL,   -- NULL = todo el día
  hora_fin       TIME NULL,
  motivo         VARCHAR(255) NULL,
  CONSTRAINT fk_bh_negocio  FOREIGN KEY (negocio_id)  REFERENCES negocios(id)   ON DELETE CASCADE,
  CONSTRAINT fk_bh_personal FOREIGN KEY (personal_id) REFERENCES personal(id)  ON DELETE CASCADE,
  CONSTRAINT fk_bh_sucursal FOREIGN KEY (sucursal_id) REFERENCES sucursales(id) ON DELETE CASCADE,
  INDEX idx_bh_negocio_fecha (negocio_id, fecha_inicio, fecha_fin)
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
