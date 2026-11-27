import type { DataSource } from 'typeorm';
import { EfectoInicialService } from '../src/automatizaciones/efecto-inicial.service';
import { EnvioWhatsapp } from '../src/automatizaciones/entities/envio-whatsapp.entity';
import { ArrendamientoWhatsappService } from '../src/automatizaciones/arrendamiento-whatsapp.service';
import { ProcesadorWhatsappService } from '../src/automatizaciones/procesador-whatsapp.service';
import { TransporteWhatsappControlado } from '../src/automatizaciones/transporte-whatsapp';
import { PoliticaAccesoLicenciaService } from '../src/licencias/services/politica-acceso-licencia.service';
import { Cita } from '../src/disponibilidad/entities/cita.entity';
import { Sucursal } from '../src/sucursales/entities/sucursal.entity';
import { conBaseOperativa, crearEscenarioOperativo } from './support/operacion-fase-5';
import { RelojPrueba } from './support/reloj';

const ahora = new Date('2026-11-23T12:00:00Z');

async function preparar(db: DataSource, tipo: 'manual' | 'portal_publico' = 'manual') {
  const reloj = new RelojPrueba(ahora);
  const { negocios: [negocio] } = await crearEscenarioOperativo(db, reloj);
  await db.query(`INSERT INTO canales_whatsapp
    (negocio_id,remitente_externo_id,secreto_ref,habilitado) VALUES (?, '123456', 'secret://whatsapp/test', 1)`, [negocio.id]);
  const citas = db.getRepository(Cita);
  const cita = await citas.findOneByOrFail({ id: negocio.ocupaciones[0] });
  cita.origen = tipo;
  cita.estado = tipo === 'manual' ? 'confirmada' : 'pendiente';
  cita.inicioUtc = new Date(ahora.getTime() + 48 * 3_600_000);
  cita.finUtc = new Date(cita.inicioUtc.getTime() + 30 * 60_000);
  cita.finOcupacionUtc = new Date(cita.finUtc.getTime() + cita.separacionMinutos * 60_000);
  cita.nombreServicio = 'Servicio histórico';
  cita.motivoConsulta = 'nota sensible';
  cita.telefonoContacto = '6141234567';
  await citas.save(cita);
  await db.transaction((manager) => new EfectoInicialService().preparar(manager, cita, ahora, true));
  const envios = db.getRepository(EnvioWhatsapp);
  const inicial = await envios.findOneByOrFail({ citaId: cita.id,
    tipo: tipo === 'manual' ? 'inicial_confirmada' : 'inicial_pendiente' });
  return { cita, reloj, citas, envios, inicial };
}

describe('M5-T077–T078, exclusión y procesamiento durable', () => {
  it('dos conexiones compiten y un token vencido o sustituido no renueva ni finaliza', async () => {
    await conBaseOperativa(async (a, b) => {
      const { reloj, envios, inicial } = await preparar(a);
      const uno = new ArrendamientoWhatsappService(a, reloj);
      const dos = new ArrendamientoWhatsappService(b, reloj);
      // Las dos tomas empiezan juntas sobre conexiones independientes.
      const ganadores = (await Promise.all([uno.tomar(), dos.tomar()])).filter((toma) => toma !== null);
      expect(ganadores).toHaveLength(1);
      const [primera] = ganadores;
      expect(primera.id).toBe(inicial.id);
      reloj.avanzar(10_000);
      expect(await dos.renovar(primera)).toBe(true);
      reloj.avanzar(21_000);
      expect(await uno.tomar()).toBeNull();
      reloj.avanzar(9_000);
      expect(await uno.renovar(primera)).toBe(false);
      const vigente = (await dos.tomar())!;
      expect(vigente).toMatchObject({ id: primera.id });
      expect(vigente.token).not.toBe(primera.token);
      expect(await uno.finalizar(primera, { estado: 'aceptado', referencia: 'wamid.obsoleto' })).toBe(false);
      expect(await dos.finalizar(vigente, { estado: 'aceptado', referencia: 'wamid.vigente' })).toBe(true);
      expect(await envios.findOneByOrFail({ id: inicial.id })).toMatchObject({ estado: 'aceptado',
        referenciaExterna: 'wamid.vigente', arrendamientoId: null, arrendadoHasta: null });
    });
  });

  it('envía fuera de la transacción y guarda aceptación sin modificar la cita', async () => {
    await conBaseOperativa(async (a, b) => {
      const { reloj, cita, envios, inicial } = await preparar(a, 'portal_publico');
      const antes = await b.getRepository(Cita).findOneByOrFail({ id: cita.id });
      expect(inicial.parametrosPlantilla).toMatchObject({ nombreServicio: 'Servicio histórico' });
      expect(JSON.stringify(inicial.parametrosPlantilla)).not.toMatch(/folio|nota sensible/i);
      const arrendamientos = new ArrendamientoWhatsappService(a, reloj);
      const enviar = jest.fn(async () => {
        // El segundo escritor adquiere la fila mientras el proveedor todavía está ejecutándose.
        const runner = b.createQueryRunner();
        try {
          await runner.connect();
          await runner.query('SET SESSION innodb_lock_wait_timeout=2');
          await runner.startTransaction('READ COMMITTED');
          await runner.query('SELECT id FROM citas WHERE id=? FOR UPDATE', [cita.id]);
          const [envio] = await runner.query('SELECT estado, intentos FROM envios_whatsapp WHERE id=? FOR UPDATE', [inicial.id]);
          expect(envio).toMatchObject({ estado: 'en_proceso', intentos: 1 });
          await runner.commitTransaction();
        } finally {
          if (runner.isTransactionActive) await runner.rollbackTransaction();
          await runner.release();
        }
        return { estado: 'aceptado', referencia: 'wamid.integracion' } as const;
      });
      const sinAccion = new ProcesadorWhatsappService(a, reloj, arrendamientos,
        new PoliticaAccesoLicenciaService(), { enviar });
      expect(await sinAccion.ejecutarUna()).toBe(false);
      expect(enviar).not.toHaveBeenCalled();
      const procesador = new ProcesadorWhatsappService(a, reloj, arrendamientos,
        new PoliticaAccesoLicenciaService(), { enviar }, async () => 'acción-sintética');
      expect(await procesador.ejecutarUna()).toBe(true);
      expect(enviar).toHaveBeenCalledWith(expect.objectContaining({ plantilla: expect.objectContaining({
        respuestaRapida: 'acción-sintética', cuerpo: expect.arrayContaining(['Servicio histórico']),
      }) }));
      expect(await envios.findOneByOrFail({ id: inicial.id })).toMatchObject({ estado: 'aceptado',
        referenciaExterna: 'wamid.integracion', arrendamientoId: null, intentos: 1 });
      expect(await b.getRepository(Cita).findOneByOrFail({ id: cita.id })).toEqual(antes);
      expect(await procesador.ejecutarUna()).toBe(false);
    });
  });

  it('una toma vencida tras iniciar HTTP permanece fuera de la cola reclamable', async () => {
    await conBaseOperativa(async (a, b) => {
      const { reloj, cita, envios, inicial } = await preparar(a);
      const urlGoogleMaps = 'https://maps.app.goo.gl/sucursal-centro';
      await a.manager.update(Sucursal, { id: cita.sucursalId, negocioId: cita.negocioId }, { urlGoogleMaps });
      const otro = new ArrendamientoWhatsappService(b, reloj);
      const enviar = jest.fn(async () => {
        reloj.avanzar(30_000);
        expect(await otro.tomar()).toBeNull();
        return { estado: 'aceptado', referencia: 'wamid.tardio' } as const;
      });
      const procesador = new ProcesadorWhatsappService(a, reloj, new ArrendamientoWhatsappService(a, reloj),
        new PoliticaAccesoLicenciaService(), { enviar });
      expect(await procesador.ejecutarUna()).toBe(true);
      expect(enviar).toHaveBeenCalledWith(expect.objectContaining({ tipo: 'inicial_confirmada',
        plantilla: { cuerpo: [expect.any(String), 'Servicio histórico', expect.any(String), expect.any(String),
          expect.stringContaining(cita.zonaHorariaReserva), urlGoogleMaps] },
      }));
      expect(await envios.findOneByOrFail({ id: inicial.id })).toMatchObject({ estado: 'en_proceso',
        inicioTransporteEn: ahora, referenciaExterna: null, intentos: 1 });
    });
  });

  it.each(['generación', 'movimiento', 'límite', 'licencia', 'canal'])(
    'revalida %s antes del HTTP y conserva la cita', async (causa) => {
      await conBaseOperativa(async (db) => {
        const { reloj, cita, citas, envios, inicial } = await preparar(db);
        if (causa === 'generación') await citas.update(cita.id, { generacionAutomatizacion: null, condicionVigenteId: null });
        if (causa === 'movimiento') await citas.update(cita.id, { inicioUtc: new Date(cita.inicioUtc.getTime() + 60_000) });
        if (causa === 'licencia') {
          reloj.avanzar(1_000);
          await db.query('UPDATE licencias SET vence_en=? WHERE negocio_id=?', [reloj.ahora(), cita.negocioId]);
        }
        if (causa === 'canal') await db.query('UPDATE canales_whatsapp SET habilitado=0 WHERE negocio_id=?', [cita.negocioId]);
        if (causa === 'límite') reloj.fijar(inicial.utilHasta);
        const transporte = new TransporteWhatsappControlado();
        const procesador = new ProcesadorWhatsappService(db, reloj, new ArrendamientoWhatsappService(db, reloj),
          new PoliticaAccesoLicenciaService(), transporte);
        expect(await procesador.ejecutarUna()).toBe(true);
        expect(transporte.solicitudes).toHaveLength(0);
        expect(await envios.findOneByOrFail({ id: inicial.id })).toMatchObject({
          estado: ['licencia', 'canal'].includes(causa) ? 'fallido' : 'descartado', intentos: 0, arrendamientoId: null,
        });
        expect(await citas.findOneByOrFail({ id: cita.id })).toMatchObject({ estado: 'confirmada', version: cita.version });
      });
    });
});
