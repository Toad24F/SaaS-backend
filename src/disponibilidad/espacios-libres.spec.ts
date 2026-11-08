import type { Ocupacion } from './contratos-internos';
import { ocupacionesQueSeEmpalman } from './ocupaciones.service';
import { cabeEnEspacioLibre, construirEspaciosLibres } from './espacios-libres';
import { proyectarAtencion } from './proyeccion-atencion';

const hora = (valor: string) => new Date(`2026-07-06T${valor}:00.000Z`);
const cita = (id: number, inicio: string, fin: string, protegido: string): Ocupacion => ({
  tipo: 'cita', id, negocioId: 1, personalId: 1, sucursalId: 2, servicioId: 3,
  inicioUtc: hora(inicio), finUtc: hora(fin), finOcupacionUtc: hora(protegido) });

describe('ALA-T090 y T093: ocupación y espacios libres', () => {
  it('separa el fin de atención del protegido y no añade el redondeo del siguiente inicio', () => {
    const ocupacion = cita(1, '09:00', '09:32', '09:42');
    expect(ocupacionesQueSeEmpalman([ocupacion], hora('09:41'), hora('09:45')))
      .toEqual([ocupacion]);
    expect(ocupacionesQueSeEmpalman([ocupacion], hora('09:42'), hora('09:45')))
      .toEqual([]);
    expect(ocupacion.finUtc).toEqual(hora('09:32'));
    expect(ocupacion.finOcupacionUtc).toEqual(hora('09:42'));
  });

  it('une atención contigua y resta bloqueos y protección de otra sucursal con extremos semiabiertos', () => {
    // La proyección real deja dos bloques contiguos y recorta el segundo por
    // un cierre; los espacios libres agregan la ocupación de otra sucursal.
    const atencion = proyectarAtencion('2026-07-06', 1, 'UTC', [
      { id: 1, sucursalId: 1, diaSemana: 1, inicioMinutos: 540,
        finMinutos: 600, descansoInicioMinutos: null, descansoFinMinutos: null },
      { id: 2, sucursalId: 1, diaSemana: 1, inicioMinutos: 600,
        finMinutos: 660, descansoInicioMinutos: null, descansoFinMinutos: null },
    ], [], [{ inicio: hora('10:30'), fin: hora('10:45') }]);
    const espacios = construirEspaciosLibres(atencion.tramos, 1, [
      cita(1, '09:30', '09:32', '09:42'),
      cita(2, '10:00', '10:05', '10:15'),
    ]);
    expect(espacios.map((x) => [x.inicio, x.fin])).toEqual([
      [hora('09:00'), hora('09:30')], [hora('09:42'), hora('10:00')],
      [hora('10:15'), hora('10:30')], [hora('10:45'), hora('11:00')],
    ]);
    expect(cabeEnEspacioLibre(espacios, hora('09:42'), hora('10:00'))).toBe(true);
    expect(cabeEnEspacioLibre(espacios, hora('10:15'), hora('10:30'))).toBe(true);
    expect(cabeEnEspacioLibre(espacios, hora('10:15'), hora('10:31'))).toBe(false);
    expect(cabeEnEspacioLibre(espacios, hora('10:30'), hora('10:45'))).toBe(false);
  });
});
