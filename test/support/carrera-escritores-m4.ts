import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module';
import { RELOJ } from '../../src/comun/reloj';
import type { EscenarioManualHttp } from './cita-manual';
import { esperarBloqueoManual } from './cita-manual';

/** Ejecuta escritores completos: la instrumentación solo retiene el bloqueo SQL ya adquirido.
 * Ambos pools conservan sus transacciones y consultas; la espera rival se observa en MariaDB.
 */
export async function enfrentarEscritores<A, B>(f: EscenarioManualHttp,
  primero: () => Promise<A>, segundo: (app: typeof f.app) => Promise<B>,
  opciones: { tablaEspera?: string; comprobar?: (app: typeof f.app) => Promise<void> } = {}) {
  const modulo = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(DataSource).useValue(f.segunda).overrideProvider(RELOJ).useValue(f.reloj).compile();
  const app = modulo.createNestApplication();
  const espias: jest.SpyInstance[] = []; const trazas: jest.SpyInstance[] = [];
  let abrir!: () => void; let retenido!: () => void; let pausa = false;
  const barrera = new Promise<void>(r => { abrir = r; });
  const bloqueado = new Promise<void>(r => { retenido = r; });
  let conexionA = 0; let conexionB = 0;
  let a: Promise<PromiseSettledResult<A>> | undefined;
  let b: Promise<PromiseSettledResult<B>> | undefined;
  const resultado = <T>(p: Promise<T>): Promise<PromiseSettledResult<T>> => p.then(value => ({ status: 'fulfilled', value }), reason => ({ status: 'rejected', reason }));
  try {
    await app.init();
    for (const [db, esA] of [[f.db, true], [f.segunda, false]] as const) {
      const crear = db.createQueryRunner.bind(db);
      espias.push(jest.spyOn(db, 'createQueryRunner').mockImplementation((...args) => {
        const runner = crear(...args); const ejecutar = runner.query.bind(runner);
        trazas.push(jest.spyOn(runner, 'query').mockImplementation(async (...consulta) => {
          if (consulta[0].includes('FOR UPDATE')) {
            const id = Number((await ejecutar('SELECT CONNECTION_ID() id'))[0].id);
            if (esA) conexionA = id; else conexionB = id;
          }
          const filas = await ejecutar(...consulta);
          if (esA && !pausa && /FROM [`]?personal[`]?\s/.test(consulta[0]) && consulta[0].includes('FOR UPDATE')) {
            pausa = true; retenido(); await barrera;
          }
          return filas;
        }));
        return runner;
      }));
    }
    a = resultado(primero());
    await Promise.race([bloqueado, a.then(() => { throw new Error('El primer escritor no alcanzó la barrera de personal.'); })]);
    b = resultado(segundo(app));
    // Con profesionales distintos, el rival espera el negocio y no la cuenta del Profesional.
    await esperarBloqueoManual(f.db, () => conexionB, opciones.tablaEspera ?? 'usuarios');
    expect(conexionA).toBeGreaterThan(0); expect(conexionB).toBeGreaterThan(0); expect(conexionA).not.toBe(conexionB);
    abrir();
    const resultados = { primero: await a, segundo: await b };
    // Passport comparte la estrategia JWT entre aplicaciones. Los reintentos HTTP
    // deben terminar antes de cerrar la segunda aplicación y su conexión.
    await opciones.comprobar?.(app);
    return resultados;
  } finally {
    abrir(); await Promise.allSettled([a, b].filter(p => p !== undefined));
    for (const espia of espias) espia.mockRestore();
    for (const traza of trazas) traza.mockRestore();
    await app.close();
  }
}
