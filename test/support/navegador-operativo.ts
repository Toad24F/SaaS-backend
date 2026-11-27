import { fork } from 'node:child_process';
import { resolve } from 'node:path';
import type { Page } from '../../../frontend-saas/node_modules/playwright-core';
import { Rol } from '../../src/auth/enums/rol.enum';
import { conAgendaHttp } from './agenda-http';
import { prepararManual, type EscenarioManualHttp } from './cita-manual';

// Se reutiliza la instalación de Playwright del frontend sin añadir otra dependencia o copiar UI.
const { chromium, expect: ver } = require('../../../frontend-saas/node_modules/@playwright/test');
type NavegadorOperativo = EscenarioManualHttp & {
  page: Page; ver: typeof ver; url: string; errores: string[];
  manual: Awaited<ReturnType<typeof prepararManual>>; rol: Rol;
};

/** La BD nace antes que Nest/Vite/Edge y se destruye después de cerrar los tres, incluso con fallo. */
export async function conNavegadorOperativo(rol: Rol, ejecutar: (f: NavegadorOperativo) => Promise<void>) {
  const previo = process.env.CITAS_MANUALES_HMAC_SECRET;
  process.env.CITAS_MANUALES_HMAC_SECRET = 'secreto-exclusivo-browser-m4-104-109';
  try {
    await conAgendaHttp(async f => {
      const manual = await prepararManual(f, rol === Rol.PROFESIONAL ? Rol.ADMIN_NEGOCIO : rol);
      if (rol === Rol.PROFESIONAL) {
        // Tres citas visibles por fecha: propia, otro Profesional y otro negocio.
        // El navegador debe recibir exclusivamente la primera desde la API.
        const [{ id: otra }] = await f.db.query('SELECT MAX(id) id FROM citas');
        await f.db.query(`UPDATE citas SET inicio_utc='2026-11-09 18:00:00',fin_utc='2026-11-09 18:30:00',
          fin_ocupacion_utc='2026-11-09 18:30:00' WHERE id IN (?,?,?)`,
        [f.negocios[0].ocupaciones[0], f.negocios[1].ocupaciones[0], otra]);
      }
      await f.app.listen(0, '127.0.0.1');
      const apiUrl = await f.app.getUrl();
      const vite = fork(resolve('test/support/vite-operativo.mjs'), [], {
        silent: true, env: { ...process.env, VITE_API_URL: apiUrl },
      });
      let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
      try {
        const url = await new Promise<string>((resolver, rechazar) => {
          const timer = setTimeout(() => rechazar(new Error('Vite no inició en 20 segundos.')), 20000);
          vite.once('exit', code => { clearTimeout(timer); rechazar(new Error(`Vite terminó: ${code}`)); });
          vite.stderr!.on('data', () => { /* Vite puede emitir avisos; nunca imprimir entorno. */ });
          vite.stdout!.on('data', data => {
            const match = String(data).match(/M4_URL=(\S+)/);
            if (match) { clearTimeout(timer); resolver(match[1].replace(/\/$/, '')); }
          });
        });
        browser = await chromium.launch({ channel: 'msedge', headless: true });
        const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
        const page: Page = await context.newPage();
        page.setDefaultTimeout(7000);
        const errores: string[] = []; page.on('pageerror', error => errores.push(error.message));
        const actor = f.actor(rol);
        const token = f.token(actor.id);
        await page.addInitScript(token => { sessionStorage.setItem('cita-session', token); }, token);
        // Solo se fija Date del navegador; el backend sigue usando su reloj inyectado independiente.
        await page.clock.setFixedTime(new Date('2026-11-09T12:00:00Z'));
        await page.goto(`${url}/admin/agenda`);
        try { await ver(page.getByRole('heading', { name: 'Agenda', exact: true })).toBeVisible(); }
        catch { throw new Error(`Agenda no inició: ${page.url()} ${errores.join(' | ')} ${(await page.locator('body').innerText()).slice(0, 1500)}`); }
        await ejecutar({ ...f, page, ver, url, errores, manual, rol });
      } finally {
        try { if (browser) await browser.close(); }
        finally {
          if (vite.exitCode === null) {
            await new Promise<void>(resolver => {
              const timer = setTimeout(() => { vite.kill(); }, 5000);
              vite.once('exit', () => { clearTimeout(timer); resolver(); });
              if (vite.connected) vite.send('cerrar'); else vite.kill();
            });
          }
        }
      }
    });
  } finally {
    if (previo === undefined) delete process.env.CITAS_MANUALES_HMAC_SECRET;
    else process.env.CITAS_MANUALES_HMAC_SECRET = previo;
  }
}

/** Completa controles reales y elige únicamente un horario devuelto por el motor manual. */
export async function completarManual(f: NavegadorOperativo, nuevo: boolean) {
  const { page, manual: { seleccion: s }, rol } = f;
  try { await page.getByRole('button', { name: 'Nueva cita', exact: true }).click(); }
  catch { throw new Error(`No hay alta manual: ${(await page.locator('body').innerText()).slice(0, 1800)} ${f.errores.join(' | ')}`); }
  const dialog = page.getByRole('dialog');
  for (const campo of ['servicioId', 'sucursalId', 'personalId'] as const) {
    const control = dialog.locator(`[name="${campo}"]`);
    if (rol === Rol.RECEPCIONISTA) await control.fill(String(s[campo]));
    else await control.selectOption(String(s[campo]));
  }
  await dialog.getByLabel('Fecha', { exact: true }).fill(s.fechaLocal);
  await dialog.getByRole('button', { name: 'Consultar horarios', exact: true }).click();
  await f.ver(dialog.locator('[name="horario"] option').nth(1)).toBeAttached();
  await dialog.locator('[name="horario"]').selectOption('0');
  if (nuevo) {
    await dialog.getByLabel('Nombre completo', { exact: true }).fill('Persona navegador <segura>');
    await dialog.getByLabel('Teléfono', { exact: true }).fill('+52 614-123-4567');
  } else {
    await dialog.getByLabel('Cliente existente', { exact: true }).check();
    await dialog.getByRole('button', { name: 'Buscar clientes', exact: true }).click();
    await dialog.locator(`[name="clienteId"][value="${s.clienteId}"]`).check();
  }
  return dialog;
}
