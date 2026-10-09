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
import { Usuario } from '../src/usuarios/entities/usuario.entity';
import { Negocio } from '../src/negocios/entities/negocio.entity';
import { Licencia } from '../src/licencias/entities/licencia.entity';
import { SesionesService } from '../src/auth/services/sesiones.service';

describe('T111–T115 rutas de baja y pertenencia', () => {
  it('devuelve 204 solo al administrador propio y 409 cuando hay relaciones', async () => {
    await conBaseMigrada(async (db) => {
      const reloj = new RelojPrueba(new Date('2026-10-01T12:00:00Z'));
      const modulo = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(DataSource).useValue(db).overrideProvider(RELOJ).useValue(reloj).compile();
      const app: INestApplication = modulo.createNestApplication();
      app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true,
        forbidNonWhitelisted: true }));
      try {
        await app.init();
        const tokens: Record<string, string> = {};
        const ids: Record<string, number> = {};
        for (const nombre of ['propio', 'ajeno']) {
          const negocio = await db.getRepository(Negocio).save({ nombre,
            slug: `bajas-http-${nombre}`, emailContacto: `${nombre}@bajas-http.test`,
            creadoEn: reloj.ahora(), activadoEn: reloj.ahora(), limiteSucursalesActivas: 3 });
          ids[nombre] = negocio.id;
          await db.getRepository(Licencia).save({ negocioId: negocio.id,
            habilitadaEn: reloj.ahora(), venceEn: new Date('2027-10-01T12:00:00Z'),
            suspendidaEn: null, creadoEn: reloj.ahora() });
          const admin = await db.getRepository(Usuario).save({ negocioId: negocio.id,
            nombre: 'Admin', email: `${nombre}@admin-bajas-http.test`, passwordHash: 'hash',
            rol: Rol.ADMIN_NEGOCIO, activo: true,
            creadoEn: reloj.ahora(), activadoEn: reloj.ahora() });
          const sesion = await app.get(SesionesService).crear(admin.id, reloj.ahora());
          tokens[nombre] = app.get(JwtService).sign({ sub: admin.id, sesionId: sesion.id,
            rol: admin.rol, negocioId: admin.negocioId });
        }
        const profesional = await db.getRepository(Usuario).save({ negocioId: ids.propio,
          nombre: 'Ana', email: 'ana@bajas-http.test', passwordHash: 'hash',
          rol: Rol.PROFESIONAL, activo: true,
          creadoEn: reloj.ahora(), activadoEn: reloj.ahora() });
        await db.query('INSERT INTO personal (id,negocio_id) VALUES (?,?)',
          [profesional.id, ids.propio]);
        const sesionPro = await app.get(SesionesService).crear(profesional.id, reloj.ahora());
        tokens.profesional = app.get(JwtService).sign({ sub: profesional.id,
          sesionId: sesionPro.id, rol: profesional.rol, negocioId: ids.propio });
        const sede = await db.query(`INSERT INTO sucursales
          (negocio_id,nombre,direccion,telefono,zona_horaria,activo)
          VALUES (?,'Centro','Calle Uno','6141234567','America/Chihuahua',1)`, [ids.propio]);
        const servicio = await db.query(`INSERT INTO servicios
          (negocio_id,nombre,costo,duracion_minutos,activo)
          VALUES (?,'Consulta',100,30,1)`, [ids.propio]);
        const rutas = [`/sucursales/${sede.insertId}`, `/servicios/${servicio.insertId}`,
          `/profesionales/${profesional.id}`];
        const http = app.getHttpServer();
        for (const ruta of rutas) {
          await request(http).delete(ruta).auth(tokens.ajeno, { type: 'bearer' }).expect(404);
          await request(http).delete(ruta).auth(tokens.profesional, { type: 'bearer' }).expect(403);
        }
        await db.query(`INSERT INTO personal_sucursales (negocio_id,personal_id,sucursal_id)
          VALUES (?,?,?)`, [ids.propio, profesional.id, sede.insertId]);
        await db.query(`INSERT INTO personal_servicios (negocio_id,personal_id,servicio_id)
          VALUES (?,?,?)`, [ids.propio, profesional.id, servicio.insertId]);
        for (const ruta of rutas) {
          const respuesta = await request(http).delete(ruta)
            .auth(tokens.propio, { type: 'bearer' }).expect(409);
          expect(respuesta.body.message).toContain('desactiv');
        }
        await db.query('DELETE FROM personal_servicios');
        await db.query('DELETE FROM personal_sucursales');
        // Una sesión iniciada es una relación real: primero se revoca y retira.
        await db.query('DELETE FROM sesiones WHERE usuario_id=?', [profesional.id]);
        for (const ruta of rutas) {
          await request(http).delete(ruta).auth(tokens.propio, { type: 'bearer' }).expect(204);
          await request(http).delete(ruta).auth(tokens.propio, { type: 'bearer' }).expect(404);
        }
        expect((await db.query('SELECT COUNT(*) total FROM usuarios WHERE id=?',
          [profesional.id]))[0].total).toBe('0');
      } finally { await app.close(); }
    });
  });
});
