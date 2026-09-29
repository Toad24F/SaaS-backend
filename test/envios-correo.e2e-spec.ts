import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { ProcesadorCorreoService } from '../src/correos/procesador-correo.service';
import { BandejaCorreoService } from '../src/correos/bandeja-correo.service';
import { TransporteCorreoControlado } from '../src/correos/transporte-correo-controlado';
import { DerivadorCodigo } from '../src/codigos/derivador-codigo';
import { CodigosService } from '../src/codigos/codigos.service';
import { AuditoriaService } from '../src/auditoria/auditoria.service';
import { PropositoCodigoAcceso } from '../src/codigos/entities/codigo-acceso.entity';
import { Usuario } from '../src/usuarios/entities/usuario.entity';
import { Rol } from '../src/auth/enums/rol.enum';
import { RELOJ } from '../src/comun/reloj';
import { conBaseMigrada } from './support/mariadb';
import { RelojPrueba } from './support/reloj';
import { crearActivo, crearSuperadmin, fechaSegura, PASSWORD_T51_T60 } from './support/escenarios-t51-t60';

describe('M1-T034: consulta y reintento HTTP', () => {
  it('solo superadmin consulta y reintenta, sin código ni SMTP y sin cruzar negocios', async () => {
    await conBaseMigrada(async (db) => {
      const reloj = new RelojPrueba(fechaSegura());
      const derivador = new DerivadorCodigo({ 1: 'clave-de-prueba-controlada-123456789012345' }, 1);
      const smtp = new TransporteCorreoControlado();
      const procesador = new ProcesadorCorreoService(db, smtp, derivador, reloj);
      const modulo = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(DataSource).useValue(db).overrideProvider(RELOJ).useValue(reloj)
        .overrideProvider(ProcesadorCorreoService).useValue(procesador).compile();
      const app = modulo.createNestApplication();
      app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
      try {
        await app.init();
        const superadmin = await crearSuperadmin(db, reloj.ahora());
        const activo = await crearActivo(db, superadmin.id, reloj.ahora());
        reloj.avanzar(1000);
        const cuentas = [activo.administrador];
        for (const rol of [Rol.RECEPCIONISTA, Rol.PROFESIONAL]) cuentas.push(await db.getRepository(Usuario).save({
          negocioId: activo.negocioId, nombre: rol, email: `${rol}@example.test`, rol,
          passwordHash: activo.administrador.passwordHash, activo: true, activadoEn: reloj.ahora(),
        }));
        const negocioId = Number((await db.query(`INSERT INTO negocios (nombre, slug, email_contacto)
          VALUES ('Pendiente', 'pendiente-correo', 'pending@example.test')`)).insertId);
        const altaId = Number((await db.query(`INSERT INTO altas_administrador (negocio_id, correo)
          VALUES (?, 'destino@example.test')`, [negocioId])).insertId);
        let codigoUtilizable = '';
        const envio = await db.transaction(async (manager) => {
          const codigo = await new CodigosService(new AuditoriaService(), derivador).emitir(manager,
            { negocioId, altaAdministradorId: altaId, emisorUsuarioId: superadmin.id,
              proposito: PropositoCodigoAcceso.ACTIVACION_ADMIN, ahora: reloj.ahora() });
          codigoUtilizable = codigo.codigo;
          const [fila] = await manager.query('SELECT id FROM codigos_acceso WHERE alta_administrador_id = ?', [altaId]);
          return new BandejaCorreoService().encolarCodigo(manager,
            { negocioId, codigoAccesoId: String(fila.id), ahora: reloj.ahora() });
        });
        const login = async (usuario: Usuario) => (await request(app.getHttpServer()).post('/auth/login')
          .send({ email: usuario.email, password: PASSWORD_T51_T60 }).expect(200)).body.accessToken as string;
        const ruta = `/negocios/${negocioId}/envios`;
        const retry = `/negocios/${negocioId}/reintentar-envio`;
        await request(app.getHttpServer()).get(ruta).expect(401);
        for (const cuenta of cuentas) {
          const token = await login(cuenta);
          await request(app.getHttpServer()).get(ruta).auth(token, { type: 'bearer' }).expect(403);
          await request(app.getHttpServer()).post(retry).auth(token, { type: 'bearer' })
            .send({ envioId: envio.id }).expect(403);
        }
        const token = await login(superadmin);
        const get = (url: string) => request(app.getHttpServer()).get(url).auth(token, { type: 'bearer' });
        const post = (url: string, body: object) => request(app.getHttpServer()).post(url)
          .auth(token, { type: 'bearer' }).send(body);
        const consulta = await get(ruta).expect(200);
        expect(consulta.body[0]).toMatchObject({ estado: 'pendiente', intentos: 0, confirmadoEn: null });
        expect(JSON.stringify(consulta.body)).not.toContain(codigoUtilizable);
        expect(Object.keys(consulta.body[0])).not.toEqual(expect.arrayContaining(['codigoHash', 'nonce', 'arrendamientoId']));
        await get('/negocios/4294967295/envios').expect(404);
        await post(`/negocios/${activo.negocioId}/reintentar-envio`, { envioId: envio.id }).expect(404);
        await post(retry, { envioId: envio.id, codigo: 'extra' }).expect(400);
        await post(retry, { envioId: '-1' }).expect(400);
        await db.query("UPDATE envios_correo SET estado = 'fallido', intentos = 1 WHERE id = ?", [envio.id]);
        const reintentado = await post(retry, { envioId: envio.id }).expect(200);
        expect(reintentado.body.estado).toBe('pendiente');
        await post(retry, { envioId: envio.id }).expect(200);
        expect(Number((await db.query("SELECT COUNT(*) AS total FROM eventos_auditoria WHERE accion = 'envio_reintento_solicitado'"))[0].total)).toBe(1);
        await procesador.procesarUno();
        await post(retry, { envioId: envio.id }).expect(409);
        expect(smtp.intentos).toHaveLength(1);
        expect(JSON.stringify((await get(ruta).expect(200)).body)).not.toContain(codigoUtilizable);
      } finally { await app.close(); }
    });
  });
});
