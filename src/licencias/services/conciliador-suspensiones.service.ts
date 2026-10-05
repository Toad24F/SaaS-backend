import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Licencia } from '../entities/licencia.entity';
import { LicenciasService } from '../licencias.service';

/** Materializa solicitudes vencidas; el acceso ya se niega por fecha sin este ciclo. */
@Injectable()
export class ConciliadorSuspensionesService {
  constructor(private readonly db: DataSource,
    private readonly licencias: LicenciasService) {}

  async conciliar(ahora: Date): Promise<number> {
    const candidatas = await this.db.getRepository(Licencia).createQueryBuilder('licencia')
      .select('licencia.id', 'id')
      .where('licencia.suspensionSolicitadaEn IS NOT NULL')
      .andWhere('licencia.bloqueoProgramadoEn <= :ahora', { ahora })
      .andWhere('licencia.congeladaEn IS NULL')
      .orderBy('licencia.id', 'ASC').getRawMany<{ id: number }>();
    let materializadas = 0;
    for (const candidata of candidatas) {
      // El evento de solicitud identifica al superadmin responsable de la transición.
      const [origen] = await this.db.query(`SELECT actor_usuario_id actorId
        FROM eventos_auditoria WHERE licencia_id=? AND accion='licencia_suspendida'
        ORDER BY id DESC LIMIT 1`, [candidata.id]) as { actorId: number }[];
      if (!origen) continue;
      await this.licencias.materializarSuspension(Number(origen.actorId),
        Number(candidata.id), ahora);
      const actual = await this.db.getRepository(Licencia).findOneBy({ id: candidata.id });
      if (actual?.congeladaEn) materializadas++;
    }
    return materializadas;
  }
}
