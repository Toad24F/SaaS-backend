import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { RELOJ } from '../src/comun/reloj';
import { RelojPrueba } from './support/reloj';
import { conBaseMigrada } from './support/mariadb';
import { Rol } from '../src/auth/enums/rol.enum';
import { SesionesService } from '../src/auth/services/sesiones.service';
import { HorariosService } from '../src/horarios/horarios.service';
import { AtencionService } from '../src/horarios/atencion.service';
import { BloqueosService } from '../src/bloqueos/bloqueos.service';

const semana = (sucursalId: number, inicioMinutos: number, finMinutos: number,
  orden = 0) => ({ diaSemana: 1, orden, sucursalId, inicioMinutos, finMinutos,
    activo: true });
const nueva = { modo: 'agenda_compacta', tiempoEntreCitasMinutos: 5,
  anticipacionMinutos: 15, diasFuturos: 0 };

// La base migrada y las sesiones reales prueban el contrato sin tocar datos cotidianos.
async function escenario(ejecutar: (app: INestApplication, db: DataSource, datos: {
  negocioId: number; profesionalId: number; servicioId: number;
  sedes: number[]; tokens: Record<string, string> }) => Promise<void>) {
  await conBaseMigrada(async (db) => {
    const reloj = new RelojPrueba(new Date('2026-11-02T14:07:00.000Z'));
    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DataSource).useValue(db).overrideProvider(RELOJ).useValue(reloj).compile();
    const app = modulo.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true,
      forbidNonWhitelisted: true }));
    try {
      await app.init();
      const alta = await db.query(`INSERT INTO negocios
        (nombre,slug,email_contacto,creado_en,activado_en,limite_sucursales_activas)
        VALUES ('Agenda','ala-086','agenda@ala.test','2026-01-01','2026-01-01',3)`);
      const negocioId = Number(alta.insertId);
      await db.query(`INSERT INTO licencias
        (negocio_id,creado_en,habilitada_en,vence_en)
        VALUES (?,'2026-01-01','2026-01-01','2027-01-01')`, [negocioId]);
      const roles = [['admin', Rol.ADMIN_NEGOCIO], ['recepcion', Rol.RECEPCIONISTA],
        ['profesional', Rol.PROFESIONAL]] as const;
      const tokens: Record<string, string> = {};
      let profesionalId = 0;
      for (const [nombre, rol] of roles) {
        const cuenta = await db.query(`INSERT INTO usuarios
          (negocio_id,nombre,email,password_hash,rol,activo,creado_en,activado_en)
          VALUES (?,?,?,'hash',?,1,'2026-01-01','2026-01-01')`,
        [negocioId, nombre, `${nombre}@ala.test`, rol]);
        const id = Number(cuenta.insertId);
        if (rol === Rol.PROFESIONAL) profesionalId = id;
        const sesion = await app.get(SesionesService).crear(id, reloj.ahora());
        tokens[nombre] = app.get(JwtService).sign({ sub: id, sesionId: sesion.id,
          rol, negocioId });
      }
      await db.query('INSERT INTO personal (id,negocio_id) VALUES (?,?)',
        [profesionalId, negocioId]);
      const sedes: number[] = [];
      for (const [nombre, zona] of [['Este', 'America/New_York'],
        ['Oeste', 'America/Phoenix'], ['Sin asignar', 'UTC']]) {
        const sucursal = await db.query(`INSERT INTO sucursales
          (negocio_id,nombre,direccion,telefono,zona_horaria)
          VALUES (?,?,'Calle Uno','6141234567',?)`, [negocioId, nombre, zona]);
        sedes.push(Number(sucursal.insertId));
      }
      for (const sucursalId of sedes.slice(0, 2)) {
        await db.query(`INSERT INTO personal_sucursales
          (negocio_id,personal_id,sucursal_id) VALUES (?,?,?)`,
        [negocioId, profesionalId, sucursalId]);
      }
      const servicio = await db.query(`INSERT INTO servicios
        (negocio_id,nombre,costo,duracion_minutos) VALUES (?,'Consulta',100,30)`, [negocioId]);
      const servicioId = Number(servicio.insertId);
      await db.query(`INSERT INTO personal_servicios
        (negocio_id,personal_id,servicio_id) VALUES (?,?,?)`,
      [negocioId, profesionalId, servicioId]);
      for (const sucursalId of sedes.slice(0, 2)) {
        await db.query(`INSERT INTO personal_servicios_sucursales
          (negocio_id,personal_id,sucursal_id,servicio_id) VALUES (?,?,?,?)`,
        [negocioId, profesionalId, sucursalId, servicioId]);
      }
      await ejecutar(app, db, { negocioId, profesionalId, servicioId, sedes, tokens });
    } finally { await app.close(); }
  });
}

describe('ALA-T086–T089: sedes, configuración y modalidad', () => {
  it('no elude asignaciones ni empalmes UTC y un bloqueo corta la franja fusionada', async () => {
    await escenario(async (app, _db, { negocioId, profesionalId, sedes }) => {
      const horarios = app.get(HorariosService);
      const base = await horarios.guardarSemana(negocioId, profesionalId, [
        semana(sedes[0], 540, 600), semana(sedes[0], 600, 660, 1),
      ], '2026-11-02');
      expect(base).toHaveLength(1);
      await expect(horarios.guardarSemana(negocioId, profesionalId,
        [...base, semana(sedes[2], 720, 780)], '2026-11-02'))
        .rejects.toMatchObject({ status: 404 });
      // Nueva York 09:00 y Phoenix 07:00 son el mismo instante UTC en noviembre.
      await expect(horarios.guardarSemana(negocioId, profesionalId,
        [...base, semana(sedes[1], 420, 480)], '2026-11-02'))
        .rejects.toMatchObject({ status: 409 });
      expect(await horarios.consultarSemana(negocioId, profesionalId)).toEqual(base);
      // Phoenix 09:00 empieza exactamente cuando termina Nueva York 11:00 en UTC.
      const contiguas = await horarios.guardarSemana(negocioId, profesionalId,
        [...base, semana(sedes[1], 540, 600)], '2026-11-02');
      expect(contiguas).toHaveLength(2);
      await app.get(BloqueosService).crear(profesionalId, { personalId: profesionalId,
        sucursalId: sedes[0], tipo: 'emergencia', motivo: 'Pausa',
        fechaInicio: '2026-11-02', fechaFin: '2026-11-02',
        inicioMinutos: 600, finMinutos: 630 });
      const atencion = await app.get(AtencionService).consultar(profesionalId,
        negocioId, profesionalId, '2026-11-02', '2026-11-02');
      expect(atencion.intervalos.filter((x) => x.sucursalId === sedes[0])
        .map((x) => [x.inicioMinutos, x.finMinutos]))
        .toEqual([[540, 600], [630, 660]]);
    });
  });

  it('reemplaza configuración completa, audita una vez y conserva estado ante 400', async () => {
    await escenario(async (app, db, { negocioId, tokens }) => {
      const http = app.getHttpServer();
      const ruta = '/disponibilidad/configuracion';
      const inicial = { modo: 'ventana_libre', tiempoEntreCitasMinutos: 0,
        anticipacionMinutos: 15, diasFuturos: 60 };
      await request(http).get(ruta).expect(401);
      expect((await request(http).get(ruta).auth(tokens.admin, { type: 'bearer' })
        .expect(200)).body).toEqual(inicial);
      await request(http).put(ruta).auth(tokens.profesional, { type: 'bearer' })
        .send(nueva).expect(403);
      await request(http).put(ruta).auth(tokens.recepcion, { type: 'bearer' })
        .send(nueva).expect(403);
      expect((await request(http).put(ruta).auth(tokens.admin, { type: 'bearer' })
        .send(nueva).expect(200)).body).toEqual(nueva);
      await request(http).put(ruta).auth(tokens.admin, { type: 'bearer' })
        .send({ ...nueva, intervaloMinutos: 15 }).expect(400);
      await request(http).put(ruta).auth(tokens.admin, { type: 'bearer' })
        .send({ ...nueva, tiempoEntreCitasMinutos: 7 }).expect(400);
      await request(http).put(ruta).auth(tokens.admin, { type: 'bearer' })
        .send(nueva).expect(200);
      expect((await request(http).get(ruta).auth(tokens.admin, { type: 'bearer' })
        .expect(200)).body).toEqual(nueva);
      const [fila] = await db.query(`SELECT modo, tiempo_entre_citas_minutos separacion,
        anticipacion_minutos anticipacion, dias_futuros horizonte
        FROM configuracion_agenda WHERE negocio_id=?`, [negocioId]);
      expect(fila).toMatchObject({ modo: 'agenda_compacta', separacion: 5,
        anticipacion: 15, horizonte: 0 });
      const eventos = await db.query(`SELECT valores_antes antes, valores_despues despues
        FROM eventos_auditoria WHERE negocio_id=?
          AND accion='configuracion_agenda_modificada'`, [negocioId]);
      expect(eventos).toHaveLength(1);
      const json = (valor: unknown) => typeof valor === 'string' ? JSON.parse(valor) : valor;
      expect(json(eventos[0].antes)).toEqual(inicial);
      expect(json(eventos[0].despues)).toEqual(nueva);
    });
  });

  it('conserva las cinco rutas privadas y permite validar manual fuera de anticipación', async () => {
    await escenario(async (app, _db, { negocioId, profesionalId, servicioId, sedes, tokens }) => {
      await app.get(HorariosService).guardarSemana(negocioId, profesionalId,
        [semana(sedes[0], 540, 720)], '2026-11-02');
      const http = app.getHttpServer();
      const consulta = { personalId: profesionalId, sucursalId: sedes[0],
        servicioId, desde: '2026-11-02', hasta: '2026-11-02' };
      await request(http).get('/disponibilidad/configuracion')
        .auth(tokens.recepcion, { type: 'bearer' }).expect(403);
      await request(http).get('/disponibilidad').auth(tokens.recepcion, { type: 'bearer' })
        .query(consulta).expect(200);
      await request(http).get('/disponibilidad').auth(tokens.profesional, { type: 'bearer' })
        .query({ ...consulta, modalidad: 'manual' }).expect(200);
      const cuerpo = { personalId: profesionalId, sucursalId: sedes[0],
        servicioId, fechaLocal: '2026-11-02', horaInicio: '09:10' };
      expect((await request(http).post('/disponibilidad/validar')
        .auth(tokens.profesional, { type: 'bearer' })
        .send({ ...cuerpo, modalidad: 'publica' }).expect(200)).body.valido).toBe(false);
      expect((await request(http).post('/disponibilidad/validar')
        .auth(tokens.profesional, { type: 'bearer' })
        .send({ ...cuerpo, modalidad: 'manual' }).expect(200)).body.valido).toBe(true);
      await request(http).put('/disponibilidad/configuracion')
        .auth(tokens.admin, { type: 'bearer' }).send(nueva).expect(200);
      // La modalidad manual omite anticipación y cuadrícula, pero su fin protegido
      // aún debe caber dentro de la atención continua.
      expect((await request(http).post('/disponibilidad/validar')
        .auth(tokens.profesional, { type: 'bearer' })
        .send({ ...cuerpo, horaInicio: '11:25', modalidad: 'manual' })
        .expect(200)).body.valido).toBe(true);
      expect((await request(http).post('/disponibilidad/validar')
        .auth(tokens.profesional, { type: 'bearer' })
        .send({ ...cuerpo, horaInicio: '11:26', modalidad: 'manual' })
        .expect(200)).body.valido).toBe(false);
      const futuro = { ...cuerpo, fechaLocal: '2026-11-09', horaInicio: '09:11' };
      expect((await request(http).post('/disponibilidad/validar')
        .auth(tokens.profesional, { type: 'bearer' })
        .send({ ...futuro, modalidad: 'publica' }).expect(200)).body.valido).toBe(false);
      expect((await request(http).post('/disponibilidad/validar')
        .auth(tokens.profesional, { type: 'bearer' })
        .send({ ...futuro, modalidad: 'manual' }).expect(200)).body.valido).toBe(true);
      await request(http).get('/disponibilidad/citas-afectadas')
        .auth(tokens.profesional, { type: 'bearer' })
        .query({ desde: '2026-11-02', hasta: '2026-11-02' }).expect(200);
    });
  });
});
