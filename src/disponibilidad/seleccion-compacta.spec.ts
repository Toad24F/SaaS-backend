import type { BloqueOriginal, Ocupacion, TramoEfectivo } from './contratos-internos';
import { seleccionarCompactas } from './seleccion-compacta';

const h = (hora: string) => new Date(`2026-07-06T${hora}:00.000Z`);
const bloque = (id: number, inicio: string, fin: string): BloqueOriginal => ({
  id, origen: 'semanal', fechaLocal: '2026-07-06', sucursalId: 1,
  zonaHoraria: 'UTC', inicioUtc: h(inicio), finUtc: h(fin),
});
const tramo = (b: BloqueOriginal, inicio: string, fin: string): TramoEfectivo =>
  ({ bloque: b, inicioUtc: h(inicio), finUtc: h(fin) });
const ocupacion = (id: number, inicio: string, fin: string): Ocupacion => ({
  tipo: 'cita', id, negocioId: 1, personalId: 1, sucursalId: 2,
  servicioId: 3, inicioUtc: h(inicio), finUtc: h(fin), estado: 'confirmada',
});
const candidato = (inicio: string, fin: string) =>
  ({ inicioUtc: h(inicio), finUtc: h(fin) });

describe('M2-T050–T051: referencias compactas', () => {
  it('ajusta a la secuencia a ambos lados de una duración no múltiplo del paso', () => {
    const b = bloque(1, '09:00', '13:00');
    const validos = [candidato('09:45', '10:05'),
      candidato('10:45', '11:05'), candidato('11:00', '11:20')];
    expect(seleccionarCompactas([tramo(b, '09:00', '13:00')],
      [ocupacion(1, '10:07', '10:37')], validos, 15, 20))
      .toEqual(validos.slice(0, 2));
  });

  it('conserva extremos reales de una cita que cruza dos bloques contiguos', () => {
    const primero = bloque(1, '09:00', '11:00');
    const segundo = bloque(2, '11:00', '13:00');
    const validos = [candidato('10:00', '10:30'),
      candidato('11:30', '12:00'), candidato('11:45', '12:15')];
    expect(seleccionarCompactas([tramo(primero, '09:00', '11:00'),
      tramo(segundo, '11:00', '13:00')],
    [ocupacion(1, '10:30', '11:30')], validos, 15, 30))
      .toEqual(validos.slice(0, 2));
  });

  it('abre otro grupo si los dos candidatos próximos fallan y no exige llenar otro tramo', () => {
    const primero = bloque(1, '09:00', '13:00');
    const segundo = bloque(2, '14:00', '16:00');
    const validos = [candidato('11:15', '11:45'), candidato('14:00', '14:30')];
    expect(seleccionarCompactas([tramo(primero, '09:00', '13:00'),
      tramo(segundo, '14:00', '16:00')],
    [ocupacion(1, '10:00', '10:30')], validos, 15, 30))
      .toEqual(validos);
  });
});
