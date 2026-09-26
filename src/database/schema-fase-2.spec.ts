import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('M1-T013: SQL de entrega de identidad pendiente', () => {
  const sql = readFileSync(resolve(process.cwd(), 'db/schema.sql'), 'utf8');

  it('incluye el tramo incremental de negocios e invitaciones', () => {
    // El script autónomo debe reflejar el resultado de la migración nueva.
    expect(sql).toContain('ALTER TABLE negocios');
    for (const nombre of ['rfc', 'correo_administrador', 'limite_sucursales_activas']) {
      expect(sql).toContain(`ADD COLUMN ${nombre}`);
    }
    expect(sql).toContain('CREATE TABLE altas_administrador');
    expect(sql).toContain('CREATE TABLE correos_acceso');
  });

  it('declara cupo y titular exclusivo también en el SQL autónomo', () => {
    expect(sql).toContain('chk_negocios_cupo');
    expect(sql).toContain('uq_correos_acceso_correo');
    expect(sql).toContain('chk_correos_acceso_titular');
  });

  it('sitúa roles, correos vinculados y destinos tras la identidad pendiente', () => {
    // El orden del script debe respetar las dependencias de las claves foráneas.
    expect(sql.indexOf('CREATE TABLE correos_acceso')).toBeLessThan(
      sql.indexOf('ADD CONSTRAINT fk_correos_acceso_usuario_correo'),
    );
    expect(sql).toContain("'profesional'");
    expect(sql).toContain('ADD COLUMN alta_administrador_id');
    expect(sql).toContain('chk_auditoria_recurso');
  });
});
