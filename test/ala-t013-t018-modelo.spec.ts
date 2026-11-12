import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { getMetadataArgsStorage } from 'typeorm';
import { Licencia } from '../src/licencias/entities/licencia.entity';
import { EnvioCorreo, TipoEnvioCorreo } from '../src/correos/entities/envio-correo.entity';
import { OperacionLicencia } from '../src/licencias/entities/operacion-licencia.entity';

const sql = readFileSync(resolve(process.cwd(), 'db/schema.sql'), 'utf8');
const columnas = getMetadataArgsStorage().columns;
const columna = (entidad: Function, propiedad: string) => columnas.find((fila) =>
  fila.target === entidad && fila.propertyName === propiedad);

describe('ALA-T013–T018: metadatos de licencia, operación y correo', () => {
  it('declara plazo 0–30 y ciclo propio, conservando remanente y vencimiento', () => {
    expect(columna(Licencia, 'plazoSuspensionDias')?.options).toMatchObject({
      name: 'plazo_suspension_dias', nullable: true,
    });
    expect(columna(Licencia, 'versionSuspension')?.options).toMatchObject({
      name: 'version_suspension', default: 0,
    });
    expect(columna(Licencia, 'remanenteMs')).toBeDefined();
    expect(columna(Licencia, 'versionVencimiento')).toBeDefined();
    expect(sql).toContain('chk_licencias_plazo_suspension');
  });

  it('representa clave, actor, acción, huella y resultado reducido por licencia', () => {
    for (const propiedad of ['negocioId', 'licenciaId', 'actorId', 'clave',
      'accion', 'parametrosHash', 'resultadoReducido']) {
      expect(columna(OperacionLicencia, propiedad)).toBeDefined();
    }
    expect(sql).toContain('CREATE TABLE operaciones_licencia');
    expect(sql).toContain('uq_operaciones_licencia_clave');
    expect(sql).toContain('fk_operaciones_licencia_licencia');
    expect(columna(OperacionLicencia, 'password')).toBeUndefined();
  });

  it('amplía tipos y referencias sin almacenar cuerpo ni credenciales', () => {
    for (const propiedad of ['umbralDias', 'versionSuspension', 'operacionLicenciaId']) {
      expect(columna(EnvioCorreo, propiedad)).toBeDefined();
    }
    for (const tipo of ['aviso_preventivo', 'licencia_vencida', 'suspension_programada',
      'suspension_efectiva', 'suspension_inmediata', 'suspension_revocada',
      'licencia_reactivada', 'licencia_renovada']) {
      expect(Object.values(TipoEnvioCorreo)).toContain(tipo);
    }
    expect(sql).toContain('chk_envios_referencia');
    expect(columna(EnvioCorreo, 'cuerpo')).toBeUndefined();
    expect(columna(EnvioCorreo, 'password')).toBeUndefined();
  });
});
