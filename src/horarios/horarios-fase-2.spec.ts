import { BadRequestException } from '@nestjs/common';
import { getMetadataArgsStorage } from 'typeorm';
import { HorarioPersonal } from './entities/horario-personal.entity';
import { ExcepcionHorario } from './entities/excepcion-horario.entity';
import { FranjaExcepcionHorario } from './entities/franja-excepcion-horario.entity';
import { validarFranja } from './validar-franja';

const completa = { diaSemana: 1, orden: 0, sucursalId: 3, inicioMinutos: 9 * 60,
  finMinutos: 17 * 60, descansoInicioMinutos: null,
  descansoFinMinutos: null, activo: true };

function errores(datos: Record<string, unknown>): string {
  try { validarFranja(datos); }
  catch (error) {
    expect(error).toBeInstanceOf(BadRequestException);
    return JSON.stringify((error as BadRequestException).getResponse());
  }
  throw new Error('Se esperaba un error de validación.');
}

describe('M1-T083 y T086: entidad y validador de franjas', () => {
  it('declara identidad estable y campos incompletos solo en estado inactivo', () => {
    expect(getMetadataArgsStorage().tables.find((t) => t.target === HorarioPersonal)?.name)
      .toBe('horarios_personal');
    const columnas = getMetadataArgsStorage().columns.filter((c) => c.target === HorarioPersonal);
    const porNombre = Object.fromEntries(columnas.map((c) => [c.propertyName, c.options]));
    expect(porNombre.id).toBeDefined();
    expect(porNombre.negocioId.name).toBe('negocio_id');
    expect(porNombre.sucursalId.nullable).toBe(true);
    expect(porNombre.inicioMinutos.nullable).toBe(true);
    expect(porNombre.finMinutos.nullable).toBe(true);
    expect(porNombre.descansoInicioMinutos.nullable).toBe(true);
    expect(porNombre.descansoFinMinutos.nullable).toBe(true);
    expect(porNombre.activo.default).toBe(false);
  });

  it('distingue cabecera de excepción vacía de su ausencia', () => {
    expect(getMetadataArgsStorage().tables.find((t) => t.target === ExcepcionHorario)?.name)
      .toBe('excepciones_horario');
    expect(getMetadataArgsStorage().tables.find((t) => t.target === FranjaExcepcionHorario)?.name)
      .toBe('franjas_excepcion_horario');
    const indices = getMetadataArgsStorage().indices.filter((i) => i.target === ExcepcionHorario);
    expect(indices.some((i) => i.unique && JSON.stringify(i.columns)
      .includes('fechaLocal'))).toBe(true);
  });

  it('acepta borrador incompleto y no muta sus campos al rechazar activación', () => {
    const borrador = { diaSemana: 2, orden: 1, sucursalId: null,
      inicioMinutos: 540, finMinutos: null, descansoInicioMinutos: 720,
      descansoFinMinutos: null, activo: false };
    expect(validarFranja(borrador)).toEqual(borrador);
    expect(errores({ ...borrador, activo: true })).toMatch(/sucursalId|finMinutos/);
    expect(borrador.activo).toBe(false);
  });

  it.each([
    [{ ...completa, sucursalId: null }, 'sucursalId'],
    [{ ...completa, inicioMinutos: null }, 'inicioMinutos'],
    [{ ...completa, finMinutos: null }, 'finMinutos'],
    [{ ...completa, inicioMinutos: 1020, finMinutos: 540 }, 'finMinutos'],
    [{ ...completa, inicioMinutos: 600, finMinutos: 600 }, 'finMinutos'],
    [{ ...completa, descansoInicioMinutos: 720 }, 'descansoFinMinutos'],
    [{ ...completa, descansoInicioMinutos: 720, descansoFinMinutos: 700 }, 'descansoFinMinutos'],
    [{ ...completa, descansoInicioMinutos: 400, descansoFinMinutos: 700 }, 'descansoInicioMinutos'],
    [{ ...completa, descansoInicioMinutos: 700, descansoFinMinutos: 1100 }, 'descansoFinMinutos'],
    [{ ...completa, inicioMinutos: 1440 }, 'inicioMinutos'],
    [{ ...completa, finMinutos: 1441 }, 'finMinutos'],
    [{ ...completa, diaSemana: 7 }, 'diaSemana'],
    [{ ...completa, sucursalId: 0, activo: false }, 'sucursalId'],
  ])('identifica el campo inválido %s', (datos, campo) => {
    expect(errores(datos)).toContain(campo);
  });

  it('admite fin 24:00 y un descanso íntegro; 24:00 nunca es inicio', () => {
    const validada = validarFranja({ ...completa, inicioMinutos: 1320,
      finMinutos: 1440, descansoInicioMinutos: 1380, descansoFinMinutos: 1410 });
    expect(validada.finMinutos).toBe(1440);
    expect(errores({ ...completa, inicioMinutos: 1440, finMinutos: 1440 }))
      .toContain('inicioMinutos');
  });
});
