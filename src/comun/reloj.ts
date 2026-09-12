import { Injectable } from '@nestjs/common';

export const RELOJ = Symbol('RELOJ');

/** Contrato mínimo para que los límites temporales sean deterministas en pruebas. */
export interface Reloj {
  ahora(): Date;
}

@Injectable()
export class RelojSistema implements Reloj {
  ahora(): Date {
    return new Date();
  }
}
