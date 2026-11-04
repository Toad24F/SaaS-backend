import { spawnSync, execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const carpeta = join('docs', 'ajustes-licencias-administracion-agenda', 'resultados-tareas');
const manifiesto = JSON.parse(readFileSync(join(carpeta, 'manifiesto-t146.json'), 'utf8'));
const tipoSolicitado = process.argv[2] ?? 'todos';
if (!['todos', 'unitarias', 'integracion', 'http'].includes(tipoSolicitado)) {
  throw new Error('Tipo de suite inválido.');
}
// Abortamos antes de ejecutar si se añadió o quitó un archivo desde T146.
const actuales = execFileSync('rg', ['--files', 'src', 'test', '-g', '*.spec.ts',
  '-g', '*.integration-spec.ts', '-g', '*.e2e-spec.ts'], { encoding: 'utf8' })
  .split(/\r?\n/).filter(Boolean).map((ruta) => ruta.replaceAll('\\', '/')).sort();
const esperados = manifiesto.lotes.flatMap((lote) => lote.archivos).sort();
if (JSON.stringify(actuales) !== JSON.stringify(esperados)) {
  throw new Error('El manifiesto no coincide con los archivos de pruebas vigentes.');
}
const lotes = manifiesto.lotes.filter((lote) => tipoSolicitado === 'todos' ||
  lote.tipo === tipoSolicitado);
const revision = execFileSync('git', ['rev-parse', '--short', 'HEAD'],
  { encoding: 'utf8' }).trim();
const resultados = [];
for (const lote of lotes) {
  // Los argumentos son nombres de archivo del propio repositorio, validados
  // por el inventario. Cada lote tiene un límite propio menor de 30 minutos.
  const prefijo = lote.tipo === 'unitarias' ? ['test'] :
    ['run', lote.tipo === 'integracion' ? 'test:integration' : 'test:e2e'];
  const args = [...prefijo, '--', '--runInBand', ...lote.archivos];
  const inicio = Date.now();
  const proceso = spawnSync('npm.cmd', args, { shell: true, encoding: 'utf8',
    timeout: 25 * 60 * 1000, maxBuffer: 50 * 1024 * 1024 });
  const salida = `${proceso.stdout ?? ''}\n${proceso.stderr ?? ''}`;
  const resumen = salida.split(/\r?\n/).filter((linea) =>
    /^(Test Suites:|Tests:|Time:)/.test(linea));
  const fallos = salida.split(/\r?\n/).filter((linea) =>
    /^(FAIL |  ● )/.test(linea)).map((linea) => linea.trim());
  const resultado = { lote: lote.id, tipo: lote.tipo,
    archivos: lote.archivos, revision, codigo: proceso.status ?? 1,
    duracionSegundos: Math.round((Date.now() - inicio) / 1000), resumen,
    fallos, errorEjecucion: proceso.error?.message ?? null };
  resultados.push(resultado);
  process.stdout.write(`${lote.id}: código ${resultado.codigo}; ${resumen.join(' | ') ||
    resultado.errorEjecucion || 'sin resumen'}\n`);
  if (fallos.length) process.stdout.write(`${fallos.slice(0, 12).join('\n')}\n`);
}
const destino = join(carpeta, `ejecucion-${tipoSolicitado}-t149-t151.json`);
writeFileSync(destino, `${JSON.stringify({ revision, tipo: tipoSolicitado,
  lotes: resultados }, null, 2)}\n`, 'utf8');
process.stdout.write(`Evidencia: ${destino}\n`);
if (resultados.some((resultado) => resultado.codigo !== 0)) process.exitCode = 1;
