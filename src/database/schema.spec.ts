import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('SQL de referencia versionado (T19)', () => {
  const ruta = resolve(process.cwd(), 'db', 'schema.sql');
  const sql = readFileSync(ruta, 'utf8');

  it('contiene todas las tablas del modelo de autenticación vigente', () => {
    for (const tabla of [
      'negocios',
      'usuarios',
      'licencias',
      'codigos_acceso',
      'sesiones',
      'eventos_auditoria',
      'limites_intentos',
    ]) {
      expect(sql).toContain(`CREATE TABLE ${tabla}`);
    }
  });

  it('representa licencias anuales sin modalidad ni plan', () => {
    const licencia = /CREATE TABLE licencias[\s\S]*?\) ENGINE=InnoDB;/.exec(sql)?.[0];
    expect(licencia).toBeDefined();
    expect(licencia).toContain('habilitada_en');
    expect(licencia).toContain('vence_en');
    expect(licencia).toContain('suspendida_en');
    expect(licencia).not.toMatch(/\bmodalidad\b/);
    expect(licencia).not.toMatch(/\bplan\b/);
  });

  it('no conserva referencias históricas RF-39 o RF-40 en el bloque auth', () => {
    const bloqueAuth = sql.split('-- TABLAS ORIGINALES DE CITAS')[0];
    expect(bloqueAuth).not.toMatch(/RF-(?:39|40)/);
  });
});
