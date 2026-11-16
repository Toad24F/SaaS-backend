import { createServer } from '../../../frontend-saas/node_modules/vite/dist/node/index.js';
import { resolve } from 'node:path';

// Sin .env ni cachés en el repositorio hermano: el ejecutor entrega una API efímera.
const server = await createServer({
  root: resolve('../frontend-saas'), configFile: false, envFile: false,
  cacheDir: resolve('.tmp/vite-m4'),
  server: { host: '127.0.0.1', port: 0 },
});
await server.listen();
process.stdout.write(`M4_URL=${server.resolvedUrls.local[0]}\n`);
// Cierre ordenado por IPC, incluido un test fallido; no deja procesos de desarrollo abiertos.
process.on('message', async message => {
  if (message === 'cerrar') { await server.close(); process.exit(0); }
});
process.on('disconnect', async () => { await server.close(); process.exit(0); });
