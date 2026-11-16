import type { DataSource } from 'typeorm';
import type { Reloj } from '../../src/comun/reloj';
import { AutorizacionService } from '../../src/auth/services/autorizacion.service';
import { PoliticaAccesoLicenciaService } from '../../src/licencias/services/politica-acceso-licencia.service';
import { ContextoDisponibilidadService } from '../../src/disponibilidad/contexto-disponibilidad.service';
import { CitasAfectadasService } from '../../src/disponibilidad/citas-afectadas.service';
import { OfertaEfectivaService } from '../../src/disponibilidad/oferta-efectiva.service';
import { AtencionInternaService } from '../../src/disponibilidad/atencion-interna.service';
import { BloqueosAplicablesService } from '../../src/disponibilidad/bloqueos-aplicables.service';

/** Compone fuentes reales para la regresión del servicio, sin stub de causas ni app HTTP. */
export function crearCausasOperativas(db: DataSource, reloj: Reloj) {
  const autorizacion = new AutorizacionService();
  const bloqueos = new BloqueosAplicablesService();
  return new CitasAfectadasService(db, reloj,
    new ContextoDisponibilidadService(autorizacion, new PoliticaAccesoLicenciaService()),
    new OfertaEfectivaService(autorizacion), new AtencionInternaService(bloqueos), bloqueos);
}
