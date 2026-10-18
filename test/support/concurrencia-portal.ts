import type { DataSource, EntityManager } from 'typeorm';

/** Sincroniza pasos de dos conexiones sin dormir ni depender del planificador. */
export class BarreraPrueba {
  private abrirPaso!: () => void;
  private readonly paso = new Promise<void>((resolver) => { this.abrirPaso = resolver; });

  abrir(): void { this.abrirPaso(); }
  esperar(): Promise<void> { return this.paso; }
}

/** Inyecta un fallo justo antes del commit para verificar rollback íntegro. */
export function ejecutarConFalloAntesDeCommit(db: DataSource,
  escribir: (manager: EntityManager) => Promise<void>): Promise<void> {
  return db.transaction(async (manager) => {
    await escribir(manager);
    throw new Error('Fallo de prueba antes del commit');
  });
}
