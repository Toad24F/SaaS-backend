import { BadRequestException, Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';

const CARACTERES_MINIMOS = 12;
const BYTES_MAXIMOS_BCRYPT = 72;

/** Centraliza límites y operaciones bcrypt para evitar criterios divergentes. */
@Injectable()
export class PoliticaContrasenasService {
  validarNueva(password: string): void {
    if (password.length < CARACTERES_MINIMOS) {
      throw new BadRequestException(
        `La contraseña debe tener al menos ${CARACTERES_MINIMOS} caracteres.`,
      );
    }
    // bcrypt ignora silenciosamente los bytes posteriores al 72; se rechazan.
    if (Buffer.byteLength(password, 'utf8') > BYTES_MAXIMOS_BCRYPT) {
      throw new BadRequestException(
        'La contraseña no puede superar 72 bytes en UTF-8.',
      );
    }
  }

  async generarHash(password: string): Promise<string> {
    this.validarNueva(password);
    return bcrypt.hash(password, 12);
  }

  async comparar(password: string, hash: string): Promise<boolean> {
    if (Buffer.byteLength(password, 'utf8') > BYTES_MAXIMOS_BCRYPT) {
      return false;
    }
    return bcrypt.compare(password, hash);
  }
}
