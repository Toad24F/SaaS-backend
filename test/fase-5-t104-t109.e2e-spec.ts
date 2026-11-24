import { conNavegadorOperativo, completarManual } from './support/navegador-operativo';
import { Rol } from '../src/auth/enums/rol.enum';
import { filasManuales } from './support/cita-manual';
import { createConnection } from 'mysql2/promise';
import { getDatabaseOptions } from '../src/config/database.config';
import { situarSesion } from './support/acceso-operativo';

/** Aceptación conectada: solo se corta una respuesta después de que Nest confirmó el commit. */
describe('M4-T104–T109: navegador con API y MariaDB desechable', () => {
  it('T104 elimina la base propia y cierra el navegador aunque falle el recorrido', async () => {
    let nombre = '';
    await expect(conNavegadorOperativo(Rol.RECEPCIONISTA, async f => {
      nombre = String(f.db.options.database);
      expect(nombre).toMatch(/^citas_m4_test_[a-f0-9]{32}$/);
      throw new Error('Fallo controlado del recorrido de navegador');
    })).rejects.toThrow('Fallo controlado del recorrido de navegador');
    const opciones = getDatabaseOptions() as { host: string; port: number; username: string; password: string };
    const admin = await createConnection({ host: opciones.host, port: opciones.port, user: opciones.username, password: opciones.password });
    try {
      const [bases] = await admin.query('SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME=?', [nombre]);
      expect(bases).toEqual([]);
    } finally { await admin.end(); }
  }, 120000);
  it.each([Rol.ADMIN_NEGOCIO, Rol.RECEPCIONISTA])('T105/T106 %s registra ficha existente y nueva con costo real', async rol => {
    await conNavegadorOperativo(rol, async f => {
      const antes = await filasManuales(f.db);
      for (const nuevo of [false, true]) {
        const dialog = await completarManual(f, nuevo);
        await dialog.getByRole('button', { name: 'Confirmar cita', exact: true }).click();
        await f.ver(dialog).toContainText('Cita registrada');
        await f.ver(dialog).toContainText('100.00');
        await dialog.getByRole('button', { name: 'Volver a la agenda', exact: true }).click();
      }
      const despues = await filasManuales(f.db);
      const nuevas = despues.citas.filter(c => !antes.citas.some(a => a.id === c.id));
      expect(nuevas).toHaveLength(2);
      expect(new Set(nuevas.map(c => c.id)).size).toBe(2);
      for (const c of nuevas) {
        expect(c).toMatchObject({ estado: 'confirmada', costoAceptado: '100.00' });
        await f.ver(f.page.locator(`[data-agenda-cita="${c.id}"]`)).toBeVisible();
      }
      expect(despues.clientes).toHaveLength(antes.clientes.length + 1);
      await f.page.goto(`${f.url}/admin/clientes`);
      await f.page.getByRole('button', { name: 'Nuevo cliente', exact: true }).click();
      const ficha = f.page.getByRole('dialog');
      await ficha.getByLabel('Nombre completo', { exact: true }).fill('Ficha navegador independiente');
      await ficha.getByLabel('Teléfono', { exact: true }).fill('6141234567');
      await ficha.getByRole('button', { name: 'Guardar ficha', exact: true }).click();
      await f.ver(ficha.getByRole('button', { name: 'Corregir ficha', exact: true })).toBeVisible();
      await ficha.getByRole('button', { name: 'Corregir ficha', exact: true }).click();
      await ficha.getByLabel('Nombre completo', { exact: true }).fill('Ficha corregida navegador');
      await ficha.getByRole('button', { name: 'Guardar ficha', exact: true }).click();
      await f.ver(ficha).toContainText('Ficha corregida navegador');
      const finales = await filasManuales(f.db);
      expect(finales.clientes.at(-1)).toMatchObject({ nombreCompleto: 'Ficha corregida navegador', version: 2 });
      expect(finales.citas).toEqual(despues.citas);
    });
  }, 120000);

  it('T105 Profesional consulta solo lo propio, gestiona su cita y carece de directorio', async () => {
    await conNavegadorOperativo(Rol.PROFESIONAL, async f => {
      // M5 amplía permisos sobre citas propias, manteniendo vedado el directorio completo.
      await f.ver(f.page.getByRole('button', { name: 'Nueva cita', exact: true })).toBeVisible();
      await f.ver(f.page.locator(`[data-agenda-cita="${f.negocios[0].ocupaciones[0]}"]`)).toBeVisible();
      await f.ver(f.page.locator('[data-agenda-cita]')).toHaveCount(1);
      await f.page.locator('[data-agenda-cita]').click();
      await f.ver(f.page.getByRole('dialog')).toContainText('Nota propia');
      await f.ver(f.page.getByLabel('Estado de la cita', { exact: true })).toBeVisible();
      await f.ver(f.page.getByRole('button', { name: 'Guardar horario', exact: true })).toBeVisible();
      await f.page.goto(`${f.url}/admin/clientes`);
      await f.ver(f.page).toHaveURL(/\/admin\/agenda/);
      expect(f.errores).toEqual([]);
    });
  }, 120000);

  it('T107 doble clic, commit sin respuesta y recarga recuperan una única cita', async () => {
    await conNavegadorOperativo(Rol.RECEPCIONISTA, async f => {
      const antes = await filasManuales(f.db);
      let registros = 0;
      await f.page.route('**/citas/manuales/intentos/*/registrar', async route => {
        registros++;
        const respuesta = await route.fetch();
        expect(respuesta.status()).toBe(201);
        await route.abort('failed');
      });
      const dialog = await completarManual(f, true);
      await dialog.getByRole('button', { name: 'Confirmar cita', exact: true }).evaluate(b => { (b as HTMLButtonElement).click(); (b as HTMLButtonElement).click(); });
      await f.ver(dialog).toContainText('pendiente de comprobar');
      await f.page.reload();
      await f.page.getByRole('button', { name: 'Comprobar envío pendiente', exact: true }).click();
      const despues = await filasManuales(f.db);
      const cita = despues.citas.find(c => !antes.citas.some(a => a.id === c.id))!;
      await f.ver(f.page.getByRole('dialog')).toContainText('Cita registrada');
      expect(registros).toBe(1);
      expect(despues.citas).toHaveLength(antes.citas.length + 1);
      expect(despues.eventos).toHaveLength(antes.eventos.length + 1);
      expect(despues.intentos.at(-1)).toMatchObject({ estado: 'registrado', citaId: cita.id });
    });
  }, 120000);

  it.each([390, 1366])('T108/T109 %ipx: teclado, cancelación, reactivación y movimiento conservan la cita e historial', async ancho => {
    await conNavegadorOperativo(Rol.ADMIN_NEGOCIO, async f => {
      await f.page.setViewportSize({ width: ancho, height: 900 });
      const dialog = await completarManual(f, true);
      await dialog.getByRole('button', { name: 'Confirmar cita', exact: true }).focus();
      await f.page.keyboard.press('Enter');
      await f.ver(dialog).toContainText('Cita registrada');
      const cita = (await filasManuales(f.db)).citas.at(-1)!;
      await dialog.getByRole('button', { name: 'Volver a la agenda', exact: true }).click();
      const card = f.page.locator(`[data-agenda-cita="${cita.id}"]`);
      await card.focus(); await f.page.keyboard.press('Enter');
      const detalle = f.page.locator('#dialogo-app');
      for (const estado of ['cancelada', 'confirmada', 'pendiente', 'confirmada']) {
        const anterior = await detalle.locator('.agenda-editor-estado').first().elementHandle();
        await detalle.getByLabel('Estado de la cita', { exact: true }).selectOption(estado);
        await detalle.getByRole('button', { name: 'Guardar estado', exact: true }).click();
        if (estado === 'cancelada') await f.page.getByRole('button', { name: 'Sí, cancelar cita', exact: true }).click();
        // Esperar el nuevo detalle evita confundir la selección local con un cambio confirmado.
        await f.ver.poll(() => anterior!.evaluate(n => n.isConnected)).toBe(false);
        await f.ver(detalle.getByLabel('Estado de la cita', { exact: true })).toHaveValue(estado);
      }
      await detalle.getByLabel('Nueva fecha', { exact: true }).fill('2026-11-09');
      await detalle.getByLabel('Nueva hora', { exact: true }).fill('11:00');
      await detalle.getByRole('button', { name: 'Guardar horario', exact: true }).click();
      await f.ver(detalle).toContainText('11:00');
      await f.ver(detalle).toContainText('11:00');
      const despues = await filasManuales(f.db);
      expect(despues.citas.find(c => c.id === cita.id)).toMatchObject({ id: cita.id, version: 6, inicioUtc: new Date('2026-11-09T17:00:00Z') });
      expect(despues.eventos.filter(e => e.citaId === cita.id).map(e => e.accion)).toEqual(['alta', 'cancelacion', 'reactivacion', 'cambio_estado', 'cambio_estado', 'cambio_horario']);
      // El reloj inyectado llega al fin exacto para corregir estados finales desde la UI real.
      const fin = new Date('2026-11-09T17:30:00Z');
      await situarSesion(f.db, f.manual.actor, fin); f.reloj.fijar(fin);
      await f.page.clock.setFixedTime(fin);
      for (const estado of ['completada', 'no_asistio']) {
        const anterior = await detalle.locator('.agenda-editor-estado').first().elementHandle();
        await detalle.getByLabel('Estado de la cita', { exact: true }).selectOption(estado);
        await detalle.getByRole('button', { name: 'Guardar estado', exact: true }).click();
        await f.ver.poll(() => anterior!.evaluate(n => n.isConnected)).toBe(false);
      }
      const corregida = await filasManuales(f.db);
      expect(corregida.citas.find(c => c.id === cita.id)).toMatchObject({ id: cita.id, version: 8, estado: 'no_asistio' });
      expect(corregida.eventos.filter(e => e.citaId === cita.id)).toHaveLength(8);
      expect(await f.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await f.page.keyboard.press('Escape'); await f.ver(card).toBeFocused();
      await f.page.goto(`${f.url}/admin/clientes`);
      await f.page.getByRole('button', { name: 'Nuevo cliente', exact: true }).focus();
      await f.page.keyboard.press('Enter');
      const ficha = f.page.getByRole('dialog');
      await ficha.getByLabel('Nombre completo', { exact: true }).focus();
      await f.page.keyboard.type('Ficha teclado movil'); await f.page.keyboard.press('Tab');
      await f.ver(ficha.getByLabel('Teléfono', { exact: true })).toBeFocused();
      await f.page.keyboard.type('6145559999');
      const guardar = ficha.getByRole('button', { name: 'Guardar ficha', exact: true });
      await guardar.focus(); await f.ver(guardar).toBeInViewport();
      await f.page.keyboard.press('Enter');
      await f.ver(ficha.getByRole('button', { name: 'Corregir ficha', exact: true })).toBeVisible();
      expect(await f.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect(f.errores).toEqual([]);
    });
  }, 120000);
});
