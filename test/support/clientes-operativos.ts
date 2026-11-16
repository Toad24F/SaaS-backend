import type { DataSource } from 'typeorm';
import { Rol } from '../../src/auth/enums/rol.enum';
import { AutorizacionService } from '../../src/auth/services/autorizacion.service';
import { PoliticaAccesoLicenciaService } from '../../src/licencias/services/politica-acceso-licencia.service';
import { AccesoOperativoService } from '../../src/citas/acceso-operativo.service';
import { AuditoriaService } from '../../src/auditoria/auditoria.service';
import { ClientesService } from '../../src/clientes/clientes.service';
import { crearAccesoOperativo } from './acceso-operativo';

/** Construye servicios reales para dos conexiones de la misma base test efímera. */
export async function crearClientesOperativos(db: DataSource, segunda: DataSource) {
  const f = await crearAccesoOperativo(db);
  const auditoria = new AuditoriaService();
  const crear = (conexion: DataSource, audit: AuditoriaService) => {
    const acceso = new AccesoOperativoService(conexion, new AutorizacionService(), new PoliticaAccesoLicenciaService(), f.reloj);
    return { acceso, servicio: new ClientesService(acceso, audit) };
  };
  const primera = crear(db, auditoria);
  const identidad = (rol: Rol, negocio = 0) => {
    const actor = f.actores.find((u) => u.rol === rol && u.negocioId === f.negocios[negocio].id)!;
    return { sub: actor.id, sesionId: actor.sesionId };
  };
  return { ...f, auditoria, acceso: primera.acceso, clientes: primera.servicio, clientesOtra: crear(segunda, new AuditoriaService()).servicio, identidad };
}
