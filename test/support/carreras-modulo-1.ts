import { QueryRunner } from 'typeorm';
import { conBaseMigrada } from './mariadb';

/** Sin temporizadores: ambos participantes avanzan solo al llegar a la barrera. */
export class BarreraDos {
  private llegadas = 0;
  private liberar!: () => void;
  private rechazar!: (error: unknown) => void;
  private readonly paso = new Promise<void>((resolve, reject) => {
    this.liberar = resolve;
    this.rechazar = reject;
  });

  esperar(): Promise<void> {
    this.llegadas += 1;
    if (this.llegadas === 2) this.liberar();
    return this.paso;
  }

  cancelar(error: unknown): void {
    this.rechazar(error);
  }
}

/** Ejecuta dos trabajos en conexiones distintas de una base migrada desechable. */
export async function conCarreraTemporal<T>(
  trabajo: (runner: QueryRunner, barrera: BarreraDos, indice: 0 | 1) => Promise<T>,
): Promise<[T, T]> {
  return conBaseMigrada(async (primera, segunda) => {
    const corredores = [primera.createQueryRunner(), segunda.createQueryRunner()];
    const barrera = new BarreraDos();
    let valores: [T, T] | undefined;
    let errorTrabajo: unknown;
    try {
      await Promise.all(corredores.map((runner) => runner.connect()));
      // Un fallo antes de la barrera despierta al otro trabajo para poder cerrar todo.
      const resultados = await Promise.allSettled(corredores.map(async (runner, indice) => {
        try {
          return await trabajo(runner, barrera, indice as 0 | 1);
        } catch (error) {
          barrera.cancelar(error);
          throw error;
        }
      }));
      const fallo = resultados.find((resultado) => resultado.status === 'rejected');
      if (fallo?.status === 'rejected') throw fallo.reason;
      valores = resultados.map((resultado) =>
        (resultado as PromiseFulfilledResult<T>).value) as [T, T];
    } catch (error) {
      errorTrabajo = error;
    }
    // Cierra ambos corredores y conserva por separado los errores de trabajo y cierre.
    const cierres = await Promise.allSettled(corredores
      .filter((runner) => !runner.isReleased)
      .map((runner) => runner.release()));
    const falloCierre = cierres.find((cierre) => cierre.status === 'rejected');
    if (errorTrabajo && falloCierre?.status === 'rejected') {
      throw new AggregateError([errorTrabajo, falloCierre.reason], 'Falló la carrera y su cierre.');
    }
    if (errorTrabajo) throw errorTrabajo;
    if (falloCierre?.status === 'rejected') throw falloCierre.reason;
    return valores!;
  });
}
