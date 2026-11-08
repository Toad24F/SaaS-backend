import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

// La búsqueda vuelve a enumerar todos los tests del repositorio al generar
// el manifiesto; ninguna lista escrita a mano puede omitir un archivo nuevo.
const salida = execFileSync('rg', ['--files', 'src', 'test',
  '-g', '*.spec.ts', '-g', '*.integration-spec.ts', '-g', '*.e2e-spec.ts'],
{ encoding: 'utf8' });
const archivos = [...new Set(salida.split(/\r?\n/).filter(Boolean)
  .map((ruta) => ruta.replaceAll('\\', '/')))].sort();
const grupos = {
  unitarias: archivos.filter((ruta) => ruta.endsWith('.spec.ts') &&
    !ruta.endsWith('.integration-spec.ts') && !ruta.endsWith('.e2e-spec.ts')),
  integracion: archivos.filter((ruta) => ruta.endsWith('.integration-spec.ts')),
  http: archivos.filter((ruta) => ruta.endsWith('.e2e-spec.ts')),
};
if (Object.values(grupos).reduce((total, grupo) => total + grupo.length, 0) !==
  archivos.length) throw new Error('Hay tests sin asignar o asignados dos veces.');
const limites = { unitarias: 20, integracion: 8, http: 8 };
const lotes = Object.entries(grupos).flatMap(([tipo, rutas]) => {
  const resultado = [];
  for (let i = 0; i < rutas.length; i += limites[tipo]) {
    const archivosLote = rutas.slice(i, i + limites[tipo]);
    resultado.push({ id: `${tipo}-${String(resultado.length + 1).padStart(2, '0')}`,
      tipo, archivos: archivosLote, minutosPrevistos: 15,
      comando: tipo === 'unitarias' ? 'npm test -- --runInBand' :
        tipo === 'integracion' ? 'npm run test:integration -- --runInBand' :
          'npm run test:e2e -- --runInBand' });
  }
  return resultado;
});
const manifiesto = { version: 1, archivosTotales: archivos.length,
  cantidades: Object.fromEntries(Object.entries(grupos).map(([tipo, rutas]) =>
    [tipo, rutas.length])), lotes };
const destino = join('docs', 'ajustes-licencias-administracion-agenda',
  'resultados-tareas', 'manifiesto-t146.json');
writeFileSync(destino, `${JSON.stringify(manifiesto, null, 2)}\n`, 'utf8');
process.stdout.write(`${JSON.stringify({ destino, cantidades: manifiesto.cantidades,
  lotes: lotes.length })}\n`);
