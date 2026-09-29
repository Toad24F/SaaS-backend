import { CalendarioLicenciasService } from '../src/licencias/services/calendario-licencias.service';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { conBaseMigrada } from './support/mariadb';
import { prepararInvitacion, serviciosInvitacion, reconstruirCodigo, estadoIdentidad } from './support/invitaciones-fase-2';

function puerta() {
  let abrir!: () => void;
  const esperar = new Promise<void>((resolve) => { abrir = resolve; });
  return { abrir, esperar };
}
describe('M1-T042–T043: carreras sobre una invitación real', () => {
  it('dos conexiones activan el mismo código: una sola cuenta, consumo, año y auditoría', async () => {
    await conBaseMigrada(async (db, segunda) => {
      const ctx = await prepararInvitacion(db);
      const resultados = await Promise.allSettled([ctx.activaciones.activarAdministrador(ctx.activar),
        serviciosInvitacion(segunda).activaciones.activarAdministrador(ctx.activar)]);
      expect(resultados.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect((resultados.find((r) => r.status === 'rejected') as PromiseRejectedResult).reason).toBeInstanceOf(BadRequestException);
      const filas = await estadoIdentidad(db);
      expect(filas.usuarios).toHaveLength(2);
      expect(filas.eventos_auditoria.filter((e: { accion: string }) => e.accion === 'administrador_activado')).toHaveLength(1);
      expect(filas.codigos_acceso[0].consumido_en).toEqual(ctx.activar.ahora);
      expect(filas.licencias[0].habilitada_en).toEqual(ctx.activar.ahora);
      expect(filas.licencias[0].vence_en).toEqual(new CalendarioLicenciasService().sumarAnios(ctx.activar.ahora));
    });
  });

  it.each([['corrección', 'activación'], ['corrección', 'reemplazo'], ['reemisión', 'activación'], ['reemisión', 'reemplazo']])(
    '%s frente a activación: gana %s por el bloqueo', async (operacion, ganador) => {
      await conBaseMigrada(async (db, segunda) => {
        const ctx = await prepararInvitacion(db);
        const otro = serviciosInvitacion(segunda);
        const llego = puerta();
        const continuar = puerta();
        // Detiene al ganador después de obtener el bloqueo de invitación, dentro de
        // la transacción real. El competidor usa otra conexión y no puede adelantarse.
        if (ganador === 'activación') {
          const consumir = ctx.codigos.consumir.bind(ctx.codigos);
          jest.spyOn(ctx.codigos, 'consumir').mockImplementation((conexion, datos, ejecutar) =>
            consumir(conexion, datos, async (manager, codigo) => {
              llego.abrir(); await continuar.esperar;
              return ejecutar(manager, codigo);
            }));
        } else {
          const emitir = ctx.codigos.emitirInvalidandoAnterior.bind(ctx.codigos);
          jest.spyOn(ctx.codigos, 'emitirInvalidandoAnterior').mockImplementation(async (manager, datos) => {
            llego.abrir(); await continuar.esperar;
            return emitir(manager, datos);
          });
        }
        const reemplazar = (servicio: typeof ctx.altas) => operacion === 'corrección'
          ? servicio.corregirCorreoInicial({ ...ctx.gestionar, nuevoCorreo: 'nuevo@example.test' })
          : servicio.reemitirCodigoInicial(ctx.gestionar);
        const primero = ganador === 'activación' ? ctx.activaciones.activarAdministrador(ctx.activar) : reemplazar(ctx.altas);
        try {
          // Propaga un fallo previo al bloqueo en vez de dejar la barrera esperando.
          await Promise.race([llego.esperar, primero.then(() => { throw new Error('No llegó al bloqueo esperado.'); })]);
          const segundo = ganador === 'activación' ? reemplazar(otro.altas) : otro.activaciones.activarAdministrador(ctx.activar);
          continuar.abrir();
          const resultados = await Promise.allSettled([primero, segundo]);
          expect(resultados[0].status).toBe('fulfilled');
          expect(resultados[1].status).toBe('rejected');
          expect((resultados[1] as PromiseRejectedResult).reason)
            .toBeInstanceOf(ganador === 'activación' ? ConflictException : BadRequestException);
          const filas = await estadoIdentidad(db);
          expect(filas.usuarios).toHaveLength(ganador === 'activación' ? 2 : 1);
          if (ganador === 'activación') {
            expect(filas.codigos_acceso).toHaveLength(1);
            expect(filas.altas_administrador[0].estado).toBe('activada');
          } else {
            expect(filas.codigos_acceso).toHaveLength(2);
            expect(filas.codigos_acceso[0].invalidado_en).toEqual(ctx.gestionar.ahora);
            expect(filas.licencias[0].habilitada_en).toBeNull();
            expect(filas.envios_correo.map((e: { estado: string }) => e.estado)).toEqual(['descartado', 'pendiente']);
            const vigente = await reconstruirCodigo(segunda);
            if (operacion === 'corrección') {
              // El código nuevo tampoco admite el correo sustituido ni deja consumo parcial.
              await expect(otro.activaciones.activarAdministrador({ ...ctx.activar, codigo: vigente })).rejects.toBeInstanceOf(BadRequestException);
              expect(await estadoIdentidad(db)).toEqual(filas);
            }
            await otro.activaciones.activarAdministrador({ ...ctx.activar, codigo: vigente,
              correo: operacion === 'corrección' ? 'nuevo@example.test' : ctx.activar.correo });
          }
          expect((await estadoIdentidad(db)).eventos_auditoria.filter((e: { accion: string }) => e.accion === 'administrador_activado')).toHaveLength(1);
        } finally { continuar.abrir(); await primero.catch(() => undefined); }
      });
    });
});
