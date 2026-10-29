import { BadRequestException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { validarFechaLocal } from '../horarios/calendario';

export interface SolicitudApartado {
  clave: string;
  personalId: number;
  sucursalId: number;
  servicioId: number;
  fechaLocal: string;
  horaInicio: string;
  seleccionHash: string;
}

/** La identidad, el costo, el fin y la generación nunca provienen del navegador. */
export function validarSolicitudApartado(entrada: unknown): SolicitudApartado {
  const campos = ['clave', 'personalId', 'sucursalId', 'servicioId',
    'fechaLocal', 'horaInicio'];
  if (!entrada || typeof entrada !== 'object' || Array.isArray(entrada) ||
    Object.keys(entrada).some((campo) => !campos.includes(campo))) {
    throw new BadRequestException('Selección de apartado inválida.');
  }
  const datos = entrada as Record<string, unknown>;
  if (typeof datos.clave !== 'string' || !/^[A-Za-z0-9_-]{16,64}$/.test(datos.clave) ||
    [datos.personalId, datos.sucursalId, datos.servicioId].some((valor) =>
      !Number.isSafeInteger(valor) || Number(valor) < 1) ||
    typeof datos.fechaLocal !== 'string' || typeof datos.horaInicio !== 'string' ||
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(datos.horaInicio)) {
    throw new BadRequestException('Selección de apartado inválida.');
  }
  validarFechaLocal(datos.fechaLocal);
  const personalId = datos.personalId as number;
  const sucursalId = datos.sucursalId as number;
  const servicioId = datos.servicioId as number;
  const fechaLocal = datos.fechaLocal;
  const horaInicio = datos.horaInicio;
  // La huella excluye la clave: una clave repetida debe conservar esta selección.
  const seleccionHash = createHash('sha256').update(JSON.stringify([
    personalId, sucursalId, servicioId, fechaLocal, horaInicio])).digest('hex');
  return { clave: datos.clave, personalId, sucursalId, servicioId,
    fechaLocal, horaInicio, seleccionHash };
}
