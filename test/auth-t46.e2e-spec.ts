import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { RELOJ } from '../src/comun/reloj';
import { Usuario } from '../src/usuarios/entities/usuario.entity';
import { Negocio } from '../src/negocios/entities/negocio.entity';
import { Licencia } from '../src/licencias/entities/licencia.entity';
import { Sesion } from '../src/auth/entities/sesion.entity';
import { Rol } from '../src/auth/enums/rol.enum';
import { PoliticaContrasenasService } from '../src/auth/services/politica-contrasenas.service';
import { CredencialesService } from '../src/auth/services/credenciales.service';
import { CodigosService } from '../src/codigos/codigos.service';
import { CodigoAcceso, PropositoCodigoAcceso as Proposito } from '../src/codigos/entities/codigo-acceso.entity';
import { CalendarioLicenciasService } from '../src/licencias/services/calendario-licencias.service';
import { conBaseMigrada } from './support/mariadb';
import { RelojPrueba } from './support/reloj';

const password = 'password-anterior-t46';
const nuevaPassword = 'password-nueva-t46';
const rutas = [
  '/auth/activar-administrador',
  '/auth/activar-recepcionista',
  '/auth/recuperar-contrasena',
] as const;
type Ruta = typeof rutas[number];
type Destino = {
  usuario: Usuario; licencia: Licencia; codigo: string; expiraEn: Date; proposito: Proposito;
};
type Contexto = {
  app: INestApplication; db: DataSource; reloj: RelojPrueba;
  destinos: Record<Ruta, Destino>; emisor: Usuario;
};

// AppModule y sus Guards reales usan una base migrada desechable por caso.
async function conHttp(ejecutar: (ctx: Contexto) => Promise<void>) {
  await conBaseMigrada(async (db) => {
    const reloj = new RelojPrueba(new Date(Date.now() + 60000));
    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DataSource).useValue(db)
      .overrideProvider(RELOJ).useValue(reloj)
      .compile();
    const app = modulo.createNestApplication();
    // Equivale a main.ts: la lista permitida rechaza propiedades desconocidas.
    app.useGlobalPipes(new ValidationPipe({
      whitelist: true, forbidNonWhitelisted: true, transform: true,
    }));
    try {
      await app.init();
      const hash = await new PoliticaContrasenasService().generarHash(password);
      const emisor = await db.getRepository(Usuario).save({
        negocioId: null, nombre: 'Superadmin', email: 'superadmin@example.test',
        passwordHash: hash, rol: Rol.SUPERADMIN, activo: true, activadoEn: reloj.ahora(),
      });
      const destinos = {} as Record<Ruta, Destino>;
      // Cada propósito tiene su propia cuenta y negocio para detectar cambios ajenos.
      for (const [indice, ruta] of rutas.entries()) {
        const recuperacion = indice === 2;
        const negocio = await db.getRepository(Negocio).save({
          nombre: `Negocio ${indice}`, slug: `negocio-t46-${indice}`,
          emailContacto: `contacto${indice}@example.test`, telefonoContacto: null,
          activadoEn: indice === 0 ? null : reloj.ahora(),
        });
        const licencia = await db.getRepository(Licencia).save({
          negocioId: negocio.id, habilitadaEn: indice === 0 ? null : reloj.ahora(),
          venceEn: indice === 0 ? null : new Date(reloj.ahora().getTime() + 31536000000),
          suspendidaEn: null,
        });
        const usuario = await db.getRepository(Usuario).save({
          negocioId: negocio.id, email: `usuario${indice}@example.test`,
          nombre: recuperacion ? 'Admin existente' : null,
          passwordHash: recuperacion ? hash : null,
          rol: indice === 1 ? Rol.RECEPCIONISTA : Rol.ADMIN_NEGOCIO,
          activo: true, activadoEn: recuperacion ? reloj.ahora() : null,
        });
        const proposito = [Proposito.ACTIVACION_ADMIN, Proposito.ACTIVACION_RECEPCIONISTA, Proposito.RECUPERACION][indice];
        // La recuperación se autoriza por el servicio del superadmin; aún no se expone T49.
        const emitido = recuperacion
          ? await app.get(CredencialesService).autorizarRecuperacion({
            actorUsuarioId: emisor.id, administradorId: usuario.id, ahora: reloj.ahora(),
          })
          : await db.transaction((manager) => app.get(CodigosService).emitir(manager, {
            negocioId: negocio.id, usuarioId: usuario.id, emisorUsuarioId: emisor.id,
            proposito, ahora: reloj.ahora(),
          }));
        destinos[ruta] = { usuario, licencia, proposito, ...emitido };
      }
      await ejecutar({ app, db, reloj, destinos, emisor });
    } finally {
      await app.close();
    }
  });
}

function entrada(ruta: Ruta, codigo: string) {
  return { codigo, password: nuevaPassword,
    ...(ruta === rutas[2] ? {} : { nombre: '  Nombre activado  ' }) };
}

// Se compara el estado completo sensible para acreditar rechazos sin efectos parciales.
async function estado(db: DataSource) {
  return {
    usuarios: await db.getRepository(Usuario).find({ order: { id: 'ASC' } }),
    negocios: await db.getRepository(Negocio).find({ order: { id: 'ASC' } }),
    licencias: await db.getRepository(Licencia).find({ order: { id: 'ASC' } }),
    codigos: await db.getRepository(CodigoAcceso).find({ order: { id: 'ASC' } }),
    sesiones: await db.getRepository(Sesion).find({ order: { id: 'ASC' } }),
  };
}

describe('T46 — activación y recuperación HTTP', () => {
  it.each([rutas[0], rutas[1]])('%s activa solo la cuenta del código y no permite reutilizarlo', async (ruta) => {
    await conHttp(async ({ app, db, reloj, destinos }) => {
      const destino = destinos[ruta];
      const antes = await estado(db);
      const respuesta = await request(app.getHttpServer()).post(ruta)
        .send(entrada(ruta, destino.codigo)).expect(204);
      expect(respuesta.text).toBe('');
      const usuario = await db.getRepository(Usuario).findOneByOrFail({ id: destino.usuario.id });
      expect(usuario).toMatchObject({
        nombre: 'Nombre activado', activadoEn: reloj.ahora(),
        email: destino.usuario.email, rol: destino.usuario.rol, negocioId: destino.usuario.negocioId,
      });
      expect(await new PoliticaContrasenasService().comparar(nuevaPassword, usuario.passwordHash!)).toBe(true);
      const licencia = await db.getRepository(Licencia).findOneByOrFail({ id: destino.licencia.id });
      if (ruta === rutas[0]) {
        expect(licencia).toMatchObject({ habilitadaEn: reloj.ahora(),
          venceEn: new CalendarioLicenciasService().sumarAnios(reloj.ahora()) });
        expect((await db.getRepository(Negocio).findOneByOrFail({ id: usuario.negocioId! })).activadoEn).toEqual(reloj.ahora());
      } else {
        expect(licencia).toEqual(destino.licencia);
      }
      expect((await db.getRepository(CodigoAcceso).findOneByOrFail({ usuarioId: usuario.id })).consumidoEn).toEqual(reloj.ahora());
      const despues = await estado(db);
      expect(despues.usuarios.filter((fila) => fila.id !== usuario.id))
        .toEqual(antes.usuarios.filter((fila) => fila.id !== usuario.id));
      expect(despues.sesiones).toEqual([]);
      await request(app.getHttpServer()).post(ruta).send(entrada(ruta, destino.codigo)).expect(400);
      expect(await estado(db)).toEqual(despues);
    });
  });

  it.each([false, true])('recupera sin sesión, revoca todas las anteriores y conserva bloqueos=%s', async (bloqueada) => {
    await conHttp(async ({ app, db, reloj, destinos }) => {
      const destino = destinos[rutas[2]];
      const tokens: string[] = [];
      for (let i = 0; i < 2; i++) {
        const login = await request(app.getHttpServer()).post('/auth/login')
          .send({ email: destino.usuario.email, password }).expect(200);
        tokens.push(login.body.accessToken);
      }
      if (bloqueada) {
        await db.getRepository(Usuario).update(destino.usuario.id, { activo: false });
        await db.getRepository(Licencia).update(destino.licencia.id, { suspendidaEn: reloj.ahora() });
      }
      const antes = await estado(db);
      const respuesta = await request(app.getHttpServer()).post(rutas[2])
        .send(entrada(rutas[2], destino.codigo)).expect(204);
      expect(respuesta.text).toBe('');
      const despues = await estado(db);
      const usuario = despues.usuarios.find((fila) => fila.id === destino.usuario.id)!;
      expect(await new PoliticaContrasenasService().comparar(nuevaPassword, usuario.passwordHash!)).toBe(true);
      expect(await new PoliticaContrasenasService().comparar(password, usuario.passwordHash!)).toBe(false);
      expect({ ...usuario, passwordHash: destino.usuario.passwordHash })
        .toEqual(antes.usuarios.find((fila) => fila.id === usuario.id));
      expect(despues.licencias).toEqual(antes.licencias);
      expect(despues.negocios).toEqual(antes.negocios);
      expect(despues.sesiones).toHaveLength(2);
      expect(despues.sesiones.every((sesion) => sesion.revocadaEn?.getTime() === reloj.ahora().getTime())).toBe(true);
      expect(despues.codigos.find((codigo) => codigo.usuarioId === usuario.id)?.consumidoEn).toEqual(reloj.ahora());
      for (const token of tokens) {
        await request(app.getHttpServer()).get('/auth/profile').auth(token, { type: 'bearer' }).expect(401);
      }
      await request(app.getHttpServer()).post(rutas[2]).send(entrada(rutas[2], destino.codigo)).expect(400);
      expect(await estado(db)).toEqual(despues);
    });
  });

  it.each(rutas)('%s valida tipos, obligatorios, contraseña y prohíbe seleccionar destinatario', async (ruta) => {
    await conHttp(async ({ app, db, reloj, destinos }) => {
      const valido = entrada(ruta, destinos[ruta].codigo);
      const invalidos: object[] = [
        {}, { ...valido, codigo: null }, { ...valido, codigo: 123 }, { ...valido, codigo: '' },
        { ...valido, password: null }, { ...valido, password: 123 },
        { ...valido, password: 'corta' }, { ...valido, password: 'á'.repeat(37) },
      ];
      if (ruta !== rutas[2]) {
        invalidos.push({ codigo: valido.codigo, password: nuevaPassword },
          ...[null, 123, '   ', 'a'.repeat(151)].map((nombre) => ({ ...valido, nombre })));
      }
      const extras = ['email', 'rol', 'negocioId', 'negocio_id', 'usuarioId', 'destinatarioId', 'proposito', 'ahora'];
      if (ruta === rutas[2]) extras.push('nombre');
      const antes = await estado(db);
      for (const body of invalidos) {
        // Se avanza la ventana solo en esta matriz para probar validación, no el límite.
        reloj.avanzar(60000);
        await request(app.getHttpServer()).post(ruta).send(body).expect(400);
      }
      for (const campo of extras) {
        reloj.avanzar(60000);
        const respuesta = await request(app.getHttpServer()).post(ruta)
          .send({ ...valido, [campo]: 'valor-no-permitido' }).expect(400);
        expect(respuesta.body.message).toContain(`property ${campo} should not exist`);
      }
      expect(await estado(db)).toEqual(antes);
    });
  });

  it.each(rutas)('%s rechaza código incorrecto, de otro propósito y reemplazado', async (ruta) => {
    await conHttp(async ({ app, db, reloj, destinos, emisor }) => {
      const destino = destinos[ruta];
      const otro = destinos[rutas[(rutas.indexOf(ruta) + 1) % rutas.length]];
      const antes = await estado(db);
      for (const codigo of ['codigo-inexistente', otro.codigo]) {
        await request(app.getHttpServer()).post(ruta).send(entrada(ruta, codigo)).expect(400);
      }
      expect(await estado(db)).toEqual(antes);
      await app.get(CodigosService).reemplazar(db, {
        negocioId: destino.usuario.negocioId!, usuarioId: destino.usuario.id,
        emisorUsuarioId: emisor.id, proposito: destino.proposito, ahora: reloj.ahora(),
      });
      const reemplazado = await estado(db);
      await request(app.getHttpServer()).post(ruta).send(entrada(ruta, destino.codigo)).expect(400);
      expect(await estado(db)).toEqual(reemplazado);
    });
  });

  it.each(rutas)('%s rechaza el código al vencer exactamente sin consumirlo', async (ruta) => {
    await conHttp(async ({ app, db, reloj, destinos }) => {
      const destino = destinos[ruta];
      reloj.fijar(destino.expiraEn);
      const antes = await estado(db);
      await request(app.getHttpServer()).post(ruta).send(entrada(ruta, destino.codigo)).expect(400);
      expect(await estado(db)).toEqual(antes);
    });
  });

  it.each([
    [rutas[0], 'suspendida'], [rutas[1], 'suspendida'], [rutas[1], 'vencida'],
  ] as const)('%s respeta licencia %s y conserva el código', async (ruta, estadoLicencia) => {
    await conHttp(async ({ app, db, reloj, destinos }) => {
      const destino = destinos[ruta];
      reloj.avanzar(1000);
      await db.getRepository(Licencia).update(destino.licencia.id,
        estadoLicencia === 'suspendida' ? { suspendidaEn: reloj.ahora() } : { venceEn: reloj.ahora() });
      const antes = await estado(db);
      await request(app.getHttpServer()).post(ruta).send(entrada(ruta, destino.codigo)).expect(400);
      expect(await estado(db)).toEqual(antes);
    });
  });

  it.each(rutas)('%s comparte con login y las otras rutas los cinco intentos por IP', async (ruta) => {
    await conHttp(async ({ app, db, reloj, destinos }) => {
      await request(app.getHttpServer()).post('/auth/login')
        .send({ email: 'nadie@example.test', password }).expect(401);
      for (const otra of rutas) {
        await request(app.getHttpServer()).post(otra).send(entrada(otra, 'inexistente')).expect(400);
      }
      await request(app.getHttpServer()).post('/auth/login')
        .send({ email: 'nadie@example.test', password }).expect(401);
      const antes = await estado(db);
      const enviar = () => request(app.getHttpServer()).post(ruta).send(entrada(ruta, destinos[ruta].codigo));
      await enviar().expect(429);
      reloj.avanzar(59999);
      await enviar().expect(429);
      expect(await estado(db)).toEqual(antes);
      reloj.avanzar(1);
      await enviar().expect(204);
    });
  });
});
