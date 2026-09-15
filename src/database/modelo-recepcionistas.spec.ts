import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { getMetadataArgsStorage } from 'typeorm';
import { Usuario } from '../usuarios/entities/usuario.entity';
import { PropositoCodigoAcceso } from '../codigos/entities/codigo-acceso.entity';

// T80 verifica el contrato de instalación nueva en SQL, migraciones y entidades.
describe('Modelo objetivo de recepcionistas (T80)', () => {
  const leer = (ruta: string) => readFileSync(resolve(process.cwd(), ruta), 'utf8');

  it('solo admite activación inicial del administrador y recuperación por código', () => {
    expect(Object.values(PropositoCodigoAcceso)).toEqual([
      'activacion_admin', 'recuperacion',
    ]);
    expect(leer('db/schema.sql')).not.toContain('activacion_recepcionista');
    expect(leer('src/database/migrations/1760000002000-CrearCodigosSesiones.ts'))
      .not.toContain('activacion_recepcionista');
  });

  it('reserva los campos nulos solo para el administrador pendiente', () => {
    const restriccion = getMetadataArgsStorage().checks.find(
      (metadata) => metadata.target === Usuario && metadata.name === 'chk_usuarios_activacion',
    )?.expression;
    for (const contrato of [
      restriccion,
      leer('db/schema.sql'),
      leer('src/database/migrations/1760000000000-CrearNegociosUsuarios.ts'),
    ]) {
      expect(contrato).toMatch(/rol\s*=\s*'admin_negocio'[^)]*activado_en IS NULL/s);
      expect(contrato).toContain('nombre IS NOT NULL');
      expect(contrato).toContain('password_hash IS NOT NULL');
      expect(contrato).toContain('activado_en IS NOT NULL');
    }
  });
});
