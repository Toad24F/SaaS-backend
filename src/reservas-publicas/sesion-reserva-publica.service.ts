import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { createHash, randomBytes } from 'node:crypto';
import { DataSource } from 'typeorm';
import { SesionReservaPublica } from './entities/sesion-reserva-publica.entity';

export interface SesionIniciada {
  credencial: string;
  nueva: boolean;
}

/** Identidad anónima por negocio: la credencial solo sale en cookie. */
@Injectable()
export class SesionReservaPublicaService {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  async iniciar(negocioId: number, recibida: string | null): Promise<SesionIniciada> {
    const credencial = recibida ?? randomBytes(32).toString('base64url');
    const titularHash = createHash('sha256').update(credencial).digest('hex');
    const repositorio = this.db.getRepository(SesionReservaPublica);
    const existente = await repositorio.findOneBy({ negocioId, titularHash });
    if (existente) return { credencial, nueva: false };
    if (recibida) throw new UnauthorizedException('Reinicie la sesión pública.');
    // La unicidad negocio+hash resuelve incluso una coincidencia concurrente.
    await repositorio.insert({ negocioId, titularHash, generacion: '0',
      apartadoActualId: null });
    return { credencial, nueva: true };
  }
}
