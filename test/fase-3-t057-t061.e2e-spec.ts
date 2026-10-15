import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { RELOJ } from '../src/comun/reloj';
import { Rol } from '../src/auth/enums/rol.enum';
import { SesionesService } from '../src/auth/services/sesiones.service';
import { crearDatosOcupaciones } from './support/ocupaciones-fase-3';
import { conBaseMigrada } from './support/mariadb';
import { RelojPrueba } from './support/reloj';

const ahora = new Date('2026-07-06T16:07:00Z');
const inicial = { modo: 'ventana_libre', intervaloMinutos: 15,
  anticipacionMinutos: 15, diasFuturos: 60 };
const nueva = { modo: 'agenda_compacta', intervaloMinutos: 10,
  anticipacionMinutos: 0, diasFuturos: 0 };

describe('M2-T057–T061: configuración y consulta HTTP privadas', () => {
  it('registra GET/PUT de configuración y GET de ranuras con permisos, límites y aislamiento', async () => {
    await conBaseMigrada(async (db: DataSource) => {
      const reloj = new RelojPrueba(ahora);
      const [a, b] = (await crearDatosOcupaciones(db, reloj)).negocios;
      for (const negocio of [a, b]) {
        await db.query('UPDATE negocios SET activado_en=creado_en WHERE id=?', [negocio.id]);
        await db.query(`INSERT INTO licencias
          (negocio_id,creado_en,habilitada_en,vence_en)
          VALUES (?,'2026-01-01','2026-01-01','2027-01-01')`, [negocio.id]);
      }
      // Los datos del fixture no deben ocultar ranuras de la ruta nueva.
      await db.query('DELETE FROM bloqueos_temporales');
      await db.query('DELETE FROM citas');
      await db.query(`INSERT INTO horarios_personal (negocio_id,personal_id,sucursal_id,
        dia_semana,orden,inicio_minutos,fin_minutos,activo)
        VALUES (?,?,?,1,0,540,780,1)`,
      [a.id, a.personalId, a.sucursales[0]]);
      const modulo = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(DataSource).useValue(db)
        .overrideProvider(RELOJ).useValue(reloj).compile();
      const app: INestApplication = modulo.createNestApplication();
      app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true,
        forbidNonWhitelisted: true }));
      try {
        await app.init();
        const alta = async (negocioId: number, rol: Rol, nombre: string) => {
          const fila = await db.query(`INSERT INTO usuarios
            (negocio_id,nombre,email,password_hash,rol,activo,activado_en)
            VALUES (?,?,?,'hash',?,1,CURRENT_TIMESTAMP(6))`,
          [negocioId, nombre, `${nombre}@agenda-http.test`, rol]);
          return Number(fila.insertId);
        };
        const token = async (usuarioId: number, rol: Rol, negocioId: number) => {
          const sesion = await app.get(SesionesService).crear(usuarioId, ahora);
          return app.get(JwtService).sign({ sub: usuarioId, sesionId: sesion.id,
            rol, negocioId });
        };
        const adminA = await token(await alta(a.id, Rol.ADMIN_NEGOCIO, 'admin-a'),
          Rol.ADMIN_NEGOCIO, a.id);
        const adminB = await token(await alta(b.id, Rol.ADMIN_NEGOCIO, 'admin-b'),
          Rol.ADMIN_NEGOCIO, b.id);
        const recepcion = await token(await alta(a.id, Rol.RECEPCIONISTA, 'recepcion-a'),
          Rol.RECEPCIONISTA, a.id);
        const profesional = await token(a.personalId, Rol.PROFESIONAL, a.id);
        const http = app.getHttpServer();
        const ruta = '/disponibilidad/configuracion';
        await request(http).get(ruta).expect(401);
        expect((await request(http).get(ruta).auth(adminA, { type: 'bearer' })
          .expect(200)).body).toEqual(inicial);
        await request(http).get(ruta).auth(recepcion, { type: 'bearer' }).expect(403);
        await request(http).put(ruta).auth(profesional, { type: 'bearer' })
          .send(nueva).expect(403);
        expect((await request(http).put(ruta).auth(adminA, { type: 'bearer' })
          .send(nueva).expect(200)).body).toEqual(nueva);
        await request(http).put(ruta).auth(adminA, { type: 'bearer' })
          .send({ ...nueva, negocioId: b.id }).expect(400);
        await request(http).put(ruta).auth(adminA, { type: 'bearer' })
          .send({ ...nueva, diasFuturos: '0' }).expect(400);
        expect((await request(http).get(ruta).auth(adminB, { type: 'bearer' })
          .expect(200)).body).toEqual(inicial);

        const consulta = { personalId: a.personalId, sucursalId: a.sucursales[0],
          servicioId: a.servicios[0], desde: '2026-07-06', hasta: '2026-07-06' };
        const leer = (credencial: string, datos: Record<string, unknown> = consulta) =>
          request(http).get('/disponibilidad').auth(credencial, { type: 'bearer' })
            .query(datos);
        await request(http).get('/disponibilidad').query(consulta).expect(401);
        const respuesta = await leer(adminA).expect(200);
        expect(respuesta.body).toMatchObject({ negocioId: a.id,
          modalidad: 'publica', zonaHoraria: 'America/Chihuahua',
          reglas: nueva, ranuras: expect.any(Array) });
        expect(respuesta.body.ranuras.length).toBeGreaterThan(0);
        expect(JSON.stringify(respuesta.body)).not.toMatch(/clienteId|titularHash/);
        await leer(profesional, { ...consulta, modalidad: 'manual' }).expect(200);
        await leer(recepcion).expect(200);
        await leer(adminB).expect(404);
        await leer(adminA, { ...consulta, hasta: '2026-08-06' }).expect(400);
        await leer(adminA, { ...consulta, apartadoId: 1 }).expect(400);
      } finally { await app.close(); }
    });
  });
});
