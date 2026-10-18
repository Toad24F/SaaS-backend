import { MODULE_METADATA } from '@nestjs/common/constants';
import { ReservasPublicasModule } from './reservas-publicas.module';
import { ReservasPublicasHttpModule } from './reservas-publicas-http.module';
import type { SeleccionPublica, ResultadoReservaPublica } from './contratos';

describe('M3-T007: frontera de módulos públicos', () => {
  it('separa dominio y HTTP; solo registra la inicialización de sesión pública', () => {
    expect(Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, ReservasPublicasModule) ?? []).toEqual([]);
    expect(Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, ReservasPublicasHttpModule) ?? [])
      .toHaveLength(1);
    const seleccion: SeleccionPublica = {
      personalId: 1, sucursalId: 2, servicioId: 3,
      fechaLocal: '2026-10-20', horaInicio: '10:00',
    };
    const resultado: ResultadoReservaPublica = {
      folio: 'P-1', estado: 'pendiente', inicioUtc: '2026-10-20T16:00:00.000Z',
      finUtc: '2026-10-20T16:30:00.000Z', zonaHoraria: 'America/Chihuahua',
      costoAceptado: '100.00', nombreNegocio: 'Uno', nombreServicio: 'Corte',
      nombreSucursal: 'Centro', nombreProfesional: 'Ana',
    };
    expect(seleccion.servicioId).toBe(3);
    expect(resultado.estado).toBe('pendiente');
  });
});
