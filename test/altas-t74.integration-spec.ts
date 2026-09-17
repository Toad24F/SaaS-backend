import { ConflictException } from '@nestjs/common';
import { EventoAuditoria } from '../src/auditoria/entities/evento-auditoria.entity';
import { CodigoAcceso } from '../src/codigos/entities/codigo-acceso.entity';
import { Licencia } from '../src/licencias/entities/licencia.entity';
import { Negocio } from '../src/negocios/entities/negocio.entity';
import { Usuario } from '../src/usuarios/entities/usuario.entity';
import { conBaseMigrada } from './support/mariadb';
import { crearSuperadmin, fechaSegura, servicios } from './support/escenarios-t51-t60';

describe('T74 — altas concurrentes con identidad duplicada', () => {
  it.each(['slug', 'correo'])('admite una sola alta con %s normalizado duplicado', async (identidad) => {
    await conBaseMigrada(async (primera, segunda) => {
      const ahora = fechaSegura();
      const actor = await crearSuperadmin(primera, ahora);
      const base = {
        actorUsuarioId: actor.id, nombre: 'Negocio concurrente', ahora,
        identificadorPublico: ' CLINICA-DUPLICADA ',
        emailAdministrador: ' ADMIN-DUPLICADO@EXAMPLE.TEST ',
      };
      const otro = identidad === 'slug'
        ? { ...base, identificadorPublico: 'clinica-duplicada',
          emailAdministrador: 'otro-admin@example.test' }
        : { ...base, identificadorPublico: 'otra-clinica',
          emailAdministrador: 'admin-duplicado@example.test' };

      // Cada alta tiene su propia conexión: la unicidad SQL decide el ganador.
      const resultados = await Promise.allSettled([
        servicios(primera).altas.crearNegocio(base),
        servicios(segunda).altas.crearNegocio(otro),
      ]);
      const exitos = resultados.filter((r) => r.status === 'fulfilled');
      const rechazos = resultados.filter((r) => r.status === 'rejected');
      expect(exitos).toHaveLength(1);
      expect(rechazos).toHaveLength(1);
      expect((rechazos[0] as PromiseRejectedResult).reason).toBeInstanceOf(ConflictException);
      const ganador = (exitos[0] as PromiseFulfilledResult<Awaited<ReturnType<ReturnType<typeof servicios>['altas']['crearNegocio']>>>).value;
      expect(await primera.getRepository(Negocio).count()).toBe(1);
      expect(await primera.getRepository(Licencia).count()).toBe(1);
      expect(await primera.getRepository(Usuario).count()).toBe(2); // Superadmin + único administrador pendiente.
      expect(await primera.getRepository(CodigoAcceso).count()).toBe(1);
      expect(await primera.getRepository(EventoAuditoria).countBy({ accion: 'negocio_creado' })).toBe(1);
      expect(await primera.getRepository(EventoAuditoria).countBy({ accion: 'codigo_emitido' })).toBe(1);
      expect(await primera.getRepository(Usuario).findOneByOrFail({ id: ganador.administradorId }))
        .toMatchObject({ negocioId: ganador.negocioId, activadoEn: null });
      expect(await primera.getRepository(Licencia).findOneByOrFail({ id: ganador.licenciaId }))
        .toMatchObject({ negocioId: ganador.negocioId, habilitadaEn: null, venceEn: null });
    });
  });
});
