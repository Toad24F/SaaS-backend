import { BadRequestException } from '@nestjs/common';
import { resolverInstanteLocal, validarFechaLocal } from '../horarios/calendario';

export interface ConsultaDisponibilidadEntrada {
  personalId: number;
  sucursalId: number;
  servicioId: number;
  desde: string;
  hasta: string;
  modalidad: 'publica' | 'manual';
}

export interface InicioPuntualEntrada {
  personalId: number;
  sucursalId: number;
  servicioId: number;
  fechaLocal: string;
  horaInicio: string;
  modalidad: 'publica' | 'manual';
}

export interface ConsultaCitasAfectadasEntrada {
  desde: string;
  hasta: string;
  personalId?: number;
  sucursalId?: number;
}

function objetoConCampos(entrada: unknown, permitidos: readonly string[],
  obligatorios: readonly string[]): Record<string, unknown> {
  if (entrada === null || typeof entrada !== 'object' || Array.isArray(entrada)) {
    throw new BadRequestException('Entrada de disponibilidad inválida.');
  }
  const datos = entrada as Record<string, unknown>;
  if (Object.keys(datos).some((campo) => !permitidos.includes(campo)) ||
    obligatorios.some((campo) => !Object.hasOwn(datos, campo))) {
    // Rechaza negocioId, apartadoId y cualquier identidad de exclusión arbitraria.
    throw new BadRequestException('Campos de disponibilidad inválidos.');
  }
  return datos;
}

function idQuery(valor: unknown): number {
  if (typeof valor !== 'string' || !/^[1-9]\d*$/.test(valor)) {
    throw new BadRequestException('ID de disponibilidad inválido.');
  }
  const id = Number(valor);
  if (!Number.isSafeInteger(id)) {
    throw new BadRequestException('ID de disponibilidad inválido.');
  }
  return id;
}

function idCuerpo(valor: unknown): number {
  if (typeof valor !== 'number' || !Number.isSafeInteger(valor) || valor <= 0) {
    throw new BadRequestException('ID de disponibilidad inválido.');
  }
  return valor;
}

function modalidad(valor: unknown): 'publica' | 'manual' {
  if (valor === undefined) return 'publica';
  if (valor === 'publica' || valor === 'manual') return valor;
  throw new BadRequestException('Modalidad de disponibilidad inválida.');
}

/** Valida el tamaño técnico inclusivo; nunca recorta el horizonte del negocio. */
export function validarConsultaDisponibilidad(entrada: unknown):
  ConsultaDisponibilidadEntrada {
  const datos = objetoConCampos(entrada,
    ['personalId', 'sucursalId', 'servicioId', 'desde', 'hasta', 'modalidad'],
    ['personalId', 'sucursalId', 'servicioId', 'desde', 'hasta']);
  const personalId = idQuery(datos.personalId);
  const sucursalId = idQuery(datos.sucursalId);
  const servicioId = idQuery(datos.servicioId);
  if (typeof datos.desde !== 'string' || typeof datos.hasta !== 'string') {
    throw new BadRequestException('Fechas de disponibilidad inválidas.');
  }
  validarFechaLocal(datos.desde);
  validarFechaLocal(datos.hasta);
  const dias = (Date.parse(`${datos.hasta}T00:00:00Z`) -
    Date.parse(`${datos.desde}T00:00:00Z`)) / 86400000;
  if (dias < 0 || dias >= 31) {
    throw new BadRequestException('Rango de disponibilidad inválido.');
  }
  return { personalId, sucursalId, servicioId,
    desde: datos.desde, hasta: datos.hasta, modalidad: modalidad(datos.modalidad) };
}

/** Prepara el contrato de validación puntual sin aceptar apartados del cliente. */
export function validarInicioPuntual(entrada: unknown, zonaHoraria?: string):
  InicioPuntualEntrada {
  const datos = objetoConCampos(entrada,
    ['personalId', 'sucursalId', 'servicioId', 'fechaLocal', 'horaInicio', 'modalidad'],
    ['personalId', 'sucursalId', 'servicioId', 'fechaLocal', 'horaInicio']);
  const personalId = idCuerpo(datos.personalId);
  const sucursalId = idCuerpo(datos.sucursalId);
  const servicioId = idCuerpo(datos.servicioId);
  if (typeof datos.fechaLocal !== 'string' ||
    typeof datos.horaInicio !== 'string' ||
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(datos.horaInicio)) {
    throw new BadRequestException('Fecha u hora de inicio inválida.');
  }
  validarFechaLocal(datos.fechaLocal);
  // La zona se conoce tras autorizar la combinación; entonces se rechaza DST ambiguo.
  if (zonaHoraria) {
    const [horas, minutos] = datos.horaInicio.split(':').map(Number);
    resolverInstanteLocal(datos.fechaLocal, horas * 60 + minutos, zonaHoraria);
  }
  return { personalId, sucursalId, servicioId,
    fechaLocal: datos.fechaLocal, horaInicio: datos.horaInicio,
    modalidad: modalidad(datos.modalidad) };
}

/** Comparte el límite de 31 fechas; ambos filtros son opcionales para el administrador. */
export function validarConsultaCitasAfectadas(entrada: unknown):
  ConsultaCitasAfectadasEntrada {
  const datos = objetoConCampos(entrada,
    ['desde', 'hasta', 'personalId', 'sucursalId'], ['desde', 'hasta']);
  if (typeof datos.desde !== 'string' || typeof datos.hasta !== 'string') {
    throw new BadRequestException('Fechas de citas afectadas inválidas.');
  }
  validarFechaLocal(datos.desde);
  validarFechaLocal(datos.hasta);
  const dias = (Date.parse(`${datos.hasta}T00:00:00Z`) -
    Date.parse(`${datos.desde}T00:00:00Z`)) / 86400000;
  if (dias < 0 || dias >= 31) {
    throw new BadRequestException('Rango de citas afectadas inválido.');
  }
  return { desde: datos.desde, hasta: datos.hasta,
    ...(datos.personalId === undefined ? {} : { personalId: idQuery(datos.personalId) }),
    ...(datos.sucursalId === undefined ? {} : { sucursalId: idQuery(datos.sucursalId) }) };
}
