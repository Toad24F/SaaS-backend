import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';

// No cargar .env: las conexiones de tests requieren su propia configuración.
const archivo = resolve(__dirname, '..', '.env.test.local');
if (existsSync(archivo)) {
  const valores = parseEnv(readFileSync(archivo, 'utf8'));
  for (const [clave, valor] of Object.entries(valores)) {
    if (clave.startsWith('TEST_DB_') && process.env[clave] === undefined) {
      process.env[clave] = valor;
    }
  }
}
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'clave-aislada-exclusivamente-para-tests';
process.env.JWT_EXPIRES_IN = '1h';
