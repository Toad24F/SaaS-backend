import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { getMetadataArgsStorage } from 'typeorm';
import { Negocio } from '../src/negocios/entities/negocio.entity';
import { Usuario } from '../src/usuarios/entities/usuario.entity';
import { Personal } from '../src/profesionales/entities/personal.entity';
import { Servicio } from '../src/servicios/entities/servicio.entity';
import { Sucursal } from '../src/sucursales/entities/sucursal.entity';

const esquema = readFileSync(resolve(process.cwd(), 'db/schema.sql'), 'utf8');
const almacenamiento = getMetadataArgsStorage();

function columna(entidad: Function, propiedad: string) {
  return almacenamiento.columns.find((item) =>
    item.target === entidad && item.propertyName === propiedad);
}

describe('ALA-T008–T012: modelo propuesto de negocio e inhabilitación', () => {
  it('declara cupos y visibilidad con nombres y valores iniciales coherentes', () => {
    for (const [propiedad, nombre, valor] of [
      ['limiteProfesionalesActivos', 'limite_profesionales_activos', 5],
      ['limiteRecepcionistasActivos', 'limite_recepcionistas_activos', 3],
      ['mostrarPreciosPublicos', 'mostrar_precios_publicos', true],
    ] as const) {
      const metadato = columna(Negocio, propiedad);
      expect(metadato?.options.name).toBe(nombre);
      expect(metadato?.options.default).toBe(valor);
      expect(esquema).toContain(nombre);
    }
    expect(esquema).toContain('chk_negocios_limite_profesionales');
    expect(esquema).toContain('chk_negocios_limite_recepcionistas');
  });

  it('conserva la identidad de Personal en Usuario y marca inhabilitación anulable', () => {
    expect(columna(Usuario, 'inhabilitadoEn')?.options).toMatchObject({
      name: 'inhabilitado_en', nullable: true,
    });
    // El perfil no debe duplicar el estado de su cuenta.
    expect(columna(Personal, 'inhabilitadoEn')).toBeUndefined();
    expect(columna(Personal, 'activo')).toBeUndefined();
    expect(esquema).toContain('chk_usuarios_inhabilitado_inactivo');
  });

  it('declara la misma marca en servicio y sucursal sin retirar unicidad', () => {
    for (const [entidad, tabla] of [[Servicio, 'servicios'], [Sucursal, 'sucursales']] as const) {
      expect(columna(entidad, 'inhabilitadoEn')?.options).toMatchObject({
        name: 'inhabilitado_en', nullable: true,
      });
      expect(esquema).toContain(`chk_${tabla}_inhabilitado_inactivo`);
      expect(esquema).toContain(`uq_${tabla}_negocio_nombre`);
    }
  });
});
