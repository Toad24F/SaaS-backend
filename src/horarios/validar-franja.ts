import { BadRequestException } from '@nestjs/common';

export interface DatosFranja {
  diaSemana: number;
  orden: number;
  sucursalId?: number | null;
  inicioMinutos?: number | null;
  finMinutos?: number | null;
  descansoInicioMinutos?: number | null;
  descansoFinMinutos?: number | null;
  activo: boolean;
}

/** Valida una franja sin mutarla; la persistencia decide cuándo confirmar el conjunto. */
export function validarFranja<T extends DatosFranja>(franja: T): T {
  const errores = new Set<string>();
  const entero = (valor: unknown, minimo: number, maximo: number) =>
    Number.isInteger(valor) && (valor as number) >= minimo && (valor as number) <= maximo;
  const presente = (valor: unknown) => valor !== null && valor !== undefined;

  if (!entero(franja.diaSemana, 0, 6)) errores.add('diaSemana: debe estar entre 0 y 6.');
  if (!entero(franja.orden, 0, 4294967295)) errores.add('orden: debe ser entero no negativo.');
  if (typeof franja.activo !== 'boolean') errores.add('activo: debe ser booleano.');
  if (presente(franja.sucursalId) && !entero(franja.sucursalId, 1, 4294967295)) {
    errores.add('sucursalId: debe ser entero positivo.');
  }

  // 1440 representa exclusivamente el final de un día, nunca su inicio.
  const limites = [
    ['inicioMinutos', franja.inicioMinutos, 0, 1439],
    ['finMinutos', franja.finMinutos, 1, 1440],
    ['descansoInicioMinutos', franja.descansoInicioMinutos, 0, 1439],
    ['descansoFinMinutos', franja.descansoFinMinutos, 1, 1440],
  ] as const;
  for (const [campo, valor, minimo, maximo] of limites) {
    if (presente(valor) && !entero(valor, minimo, maximo)) {
      errores.add(`${campo}: debe ser un minuto entero entre ${minimo} y ${maximo}.`);
    }
  }

  if (franja.activo) {
    if (!presente(franja.sucursalId)) errores.add('sucursalId: obligatorio al activar.');
    if (!presente(franja.inicioMinutos)) errores.add('inicioMinutos: obligatorio al activar.');
    if (!presente(franja.finMinutos)) errores.add('finMinutos: obligatorio al activar.');
    if (presente(franja.descansoInicioMinutos) !== presente(franja.descansoFinMinutos)) {
      errores.add(presente(franja.descansoInicioMinutos)
        ? 'descansoFinMinutos: falta el fin del descanso.'
        : 'descansoInicioMinutos: falta el inicio del descanso.');
    }
  }

  // Un borrador puede estar incompleto, pero los pares informados han de ser coherentes.
  if (entero(franja.inicioMinutos, 0, 1439) && entero(franja.finMinutos, 1, 1440) &&
    franja.finMinutos! <= franja.inicioMinutos!) {
    errores.add('finMinutos: debe ser posterior a inicioMinutos.');
  }
  if (entero(franja.descansoInicioMinutos, 0, 1439) &&
    entero(franja.descansoFinMinutos, 1, 1440)) {
    if (franja.descansoFinMinutos! <= franja.descansoInicioMinutos!) {
      errores.add('descansoFinMinutos: debe ser posterior a descansoInicioMinutos.');
    }
    if (entero(franja.inicioMinutos, 0, 1439) &&
      franja.descansoInicioMinutos! < franja.inicioMinutos!) {
      errores.add('descansoInicioMinutos: debe quedar dentro de la franja.');
    }
    if (entero(franja.finMinutos, 1, 1440) &&
      franja.descansoFinMinutos! > franja.finMinutos!) {
      errores.add('descansoFinMinutos: debe quedar dentro de la franja.');
    }
  }

  if (errores.size) throw new BadRequestException([...errores]);
  return franja;
}
