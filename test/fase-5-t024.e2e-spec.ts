import { Controller, Get, Param, Post, UseFilters, UseGuards, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { DataSource, QueryFailedError } from 'typeorm';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { CitasModule } from '../src/citas/citas.module';
import { AccesoOperativoService } from '../src/citas/acceso-operativo.service';
import { ErroresOperativosFilter } from '../src/citas/errores-operativos.filter';
import { Cita } from '../src/disponibilidad/entities/cita.entity';
import { Cliente } from '../src/disponibilidad/entities/cliente.entity';
import { CurrentUser } from '../src/auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard';
import { AuthModule } from '../src/auth/auth.module';
import { Rol } from '../src/auth/enums/rol.enum';
import { Permiso } from '../src/auth/services/autorizacion.service';
import type { JwtPayload } from '../src/auth/interfaces/jwt-payload.interface';
import { RELOJ } from '../src/comun/reloj';
import { conBaseOperativa } from './support/operacion-fase-5';
import { crearAccesoOperativo } from './support/acceso-operativo';

// Controlador exclusivo de pruebas: no incorpora rutas ni un escritor manual al producto.
@Controller('_prueba_m4_operativo')
@UseGuards(JwtAuthGuard)
@UseFilters(ErroresOperativosFilter)
class SondaOperativaController {
  constructor(private readonly acceso: AccesoOperativoService) {}

  @Get('citas')
  leer(@CurrentUser() actor: JwtPayload) {
    return this.acceso.ejecutar(actor, 'consultar_citas' as Permiso,
      async (ctx) => ctx.manager.getRepository(Cita).findBy(this.acceso.alcanceCitas(ctx)));
  }

  @Get('citas/:id')
  detalle(@CurrentUser() actor: JwtPayload, @Param('id') id: string) {
    return this.acceso.ejecutar(actor, 'consultar_citas' as Permiso, async (ctx) => {
      const cita = await ctx.manager.getRepository(Cita).findOneBy({ ...this.acceso.alcanceCitas(ctx), id: Number(id) });
      if (!cita) throw new NotFoundException('Detalle privado que no debe salir');
      return cita;
    });
  }

  @Get('clientes')
  clientes(@CurrentUser() actor: JwtPayload) {
    return this.acceso.ejecutar(actor, 'consultar_clientes' as Permiso,
      async (ctx) => ctx.manager.getRepository(Cliente).findBy(this.acceso.alcanceClientes(ctx)));
  }

  @Post('gestion')
  gestionar(@CurrentUser() actor: JwtPayload) {
    return this.acceso.ejecutar(actor, 'cambiar_estado_cita' as Permiso, async () => ({ autorizado: true }));
  }
}

async function conSonda(ejecutar: (f: Awaited<ReturnType<typeof crearAccesoOperativo>> & {
  http: ReturnType<import('@nestjs/common').INestApplication['getHttpServer']>; db: DataSource; tokens: Map<number, string>;
}) => Promise<void>) {
  await conBaseOperativa(async (db) => {
    const f = await crearAccesoOperativo(db);
    // El módulo anfitrión del controlador importa Auth para resolver Passport y sus guardas reales.
    const modulo = await Test.createTestingModule({ imports: [AppModule, CitasModule, AuthModule], controllers: [SondaOperativaController] })
      .overrideProvider(DataSource).useValue(db).overrideProvider(RELOJ).useValue(f.reloj).compile();
    const app = modulo.createNestApplication();
    try {
      await app.init();
      const jwt = modulo.get(JwtService);
      // Claims falsos de rol/negocio no sustituyen a la sesión ni a las filas vigentes.
      const tokens = new Map(f.actores.map((u) => [u.id, jwt.sign({ sub: u.id, sesionId: u.sesionId,
        rol: Rol.SUPERADMIN, negocioId: 999999, nombre: 'Anterior', email: 'anterior@example.test' })]));
      await ejecutar({ ...f, db, http: app.getHttpServer(), tokens });
    } finally { await app.close(); }
  });
}

describe('M4-T024: frontera HTTP de autorización operativa', () => {
  it('revalida JWT y permisos: gestores del negocio, Profesional lectura propia y Superadmin sin acceso', async () => {
    await conSonda(async (f) => {
      for (const u of f.actores) {
        const auth = `Bearer ${f.tokens.get(u.id)}`;
        const citas = await request(f.http).get('/_prueba_m4_operativo/citas').set('Authorization', auth)
          .expect(u.rol === Rol.SUPERADMIN ? 403 : 200);
        if (u.rol !== Rol.SUPERADMIN) {
          expect(citas.body.every((c: { negocioId: number }) => c.negocioId === u.negocioId)).toBe(true);
          if (u.rol === Rol.PROFESIONAL) expect(citas.body.every((c: { personalId: number }) => c.personalId === u.id)).toBe(true);
        }
        const gestor = u.rol === Rol.ADMIN_NEGOCIO || u.rol === Rol.RECEPCIONISTA;
        await request(f.http).get('/_prueba_m4_operativo/clientes').set('Authorization', auth).expect(gestor ? 200 : 403);
        await request(f.http).post('/_prueba_m4_operativo/gestion').set('Authorization', auth).expect(gestor ? 201 : 403);
      }
      const anonimo = await request(f.http).get('/_prueba_m4_operativo/citas').expect(401);
      expect(anonimo.headers['cache-control']).toBe('no-store');
      expect(anonimo.body.message).toBe('Sesión no válida o acceso actual no disponible.');
    });
  });

  it('ajeno e inexistente producen el mismo 404 sin datos privados', async () => {
    await conSonda(async (f) => {
      const u = f.actores.find((u) => u.rol === Rol.ADMIN_NEGOCIO)!;
      const get = (id: number) => request(f.http).get(`/_prueba_m4_operativo/citas/${id}`).set('Authorization', `Bearer ${f.tokens.get(u.id)}`);
      const ajena = await get(f.negocios[1].ocupaciones[0]).expect(404);
      const ausente = await get(2147483647).expect(404);
      expect(ajena.body).toEqual(ausente.body);
      expect(ajena.body.message).toBe('Recurso no disponible.');
      expect(ajena.headers['cache-control']).toBe('no-store');
    });
  });

  it.each([['ER_LOCK_WAIT_TIMEOUT', 503], ['DESCONOCIDO', 500]] as const)
    ('un fallo %s no se presenta como agenda vacía ni revela SQL', async (code, estado) => {
      await conSonda(async (f) => {
        const u = f.actores.find((u) => u.rol === Rol.ADMIN_NEGOCIO)!;
        const secreto = 'SQL secreto teléfono 6149999999 password token';
        const espia = jest.spyOn(f.db, 'transaction').mockRejectedValueOnce(
          new QueryFailedError(secreto, [secreto], Object.assign(new Error(secreto), { code })));
        try {
          const respuesta = await request(f.http).get('/_prueba_m4_operativo/citas')
            .set('Authorization', `Bearer ${f.tokens.get(u.id)}`).expect(estado);
          expect(respuesta.headers['cache-control']).toBe('no-store');
          expect(Array.isArray(respuesta.body)).toBe(false);
          expect(JSON.stringify(respuesta.body)).not.toContain(secreto);
        } finally { espia.mockRestore(); }
      });
    });
});
