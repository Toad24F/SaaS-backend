import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module';
import { ConsultaAgendaService } from '../../src/citas/consulta-agenda.service';
import { CitasAfectadasService } from '../../src/disponibilidad/citas-afectadas.service';
import { Rol } from '../../src/auth/enums/rol.enum';
import { RELOJ } from '../../src/comun/reloj';
import { crearAccesoOperativo } from './acceso-operativo';
import { conBaseOperativa } from './operacion-fase-5';

/** App real y JWT firmado; toda escritura queda en una base test efímera con finally de limpieza. */
export async function conAgendaHttp(ejecutar: (f: Awaited<ReturnType<typeof preparar>>) => Promise<void>) {
  await conBaseOperativa(async (db, segunda) => {
    const f = await preparar(db, segunda);
    try { await ejecutar(f); } finally { await f.app.close(); }
  });
}

async function preparar(db: DataSource, segunda: DataSource) {
  const f = await crearAccesoOperativo(db);
  const modulo = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(DataSource).useValue(db).overrideProvider(RELOJ).useValue(f.reloj).compile();
  const app = modulo.createNestApplication();
  try {
    await app.init();
    const jwt = modulo.get(JwtService);
    // Los claims incorrectos prueban que el servidor vuelve a leer rol y negocio persistidos.
    const token = (id: number) => {
      const u = f.actores.find((a) => a.id === id)!;
      return jwt.sign({ sub: id, sesionId: u.sesionId, rol: Rol.SUPERADMIN, negocioId: 999999 });
    };
    const actor = (rol: Rol, indice = 0) => f.actores.find((u) => u.rol === rol && u.negocioId === f.negocios[indice].id)!;
    return { ...f, app, db, segunda, token, actor, http: app.getHttpServer(),
      agenda: modulo.get(ConsultaAgendaService), afectadas: modulo.get(CitasAfectadasService) };
  } catch (error) { await app.close(); throw error; }
}
