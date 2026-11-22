import { ConflictException } from '@nestjs/common';

export type DestinoClienteCoincidente = { id: number; nombreCompleto: string; version: number };

/** Se construye únicamente tras verificar permiso y pertenencia del destino activo. */
export class ClienteCoincidenteException extends ConflictException {
  readonly destino: DestinoClienteCoincidente;

  constructor({ id, nombreCompleto, version }: DestinoClienteCoincidente) {
    super('La edición coincide con otra ficha activa. Revise el destino para confirmar la unión.');
    this.destino = { id, nombreCompleto, version };
  }
}
