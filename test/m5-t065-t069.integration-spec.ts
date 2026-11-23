import { EfectoInicialService } from '../src/automatizaciones/efecto-inicial.service';
import { Cita } from '../src/disponibilidad/entities/cita.entity';
import { conBaseOperativa, crearEscenarioOperativo } from './support/operacion-fase-5';
import { RelojPrueba } from './support/reloj';
import { Test } from '@nestjs/testing';
import { CitasModule } from '../src/citas/citas.module';
import { RELOJ } from '../src/comun/reloj';
import { crearAccesoOperativo } from './support/acceso-operativo';
import { Rol } from '../src/auth/enums/rol.enum';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IntentosCitaManualService } from '../src/citas/intentos-cita-manual.service';
import { RegistroCitaManualService } from '../src/citas/registro-cita-manual.service';

const ahora = new Date('2026-11-22T12:00:00.000Z');

describe('M5-T067: efecto durable en el manager del escritor', () => {
  it('guarda condición y un solo envío, y revierte ambos si cae la transacción', async () => {
    await conBaseOperativa(async (db) => {
      const { negocios: [negocio] } = await crearEscenarioOperativo(db, new RelojPrueba(ahora));
      await db.query(`INSERT INTO canales_whatsapp
        (negocio_id,remitente_externo_id,secreto_ref,habilitado) VALUES (?,?,?,1)`,
      [negocio.id, 'phone-t067', 'secret://whatsapp/test']);
      const cita = await db.getRepository(Cita).findOneByOrFail({ id: negocio.ocupaciones[0] });
      cita.estado = 'pendiente';
      cita.origen = 'portal_publico';
      cita.inicioUtc = new Date(ahora.getTime() + 8 * 3_600_000);
      cita.finUtc = new Date(cita.inicioUtc.getTime() + 30 * 60_000);
      cita.finOcupacionUtc = new Date(cita.finUtc.getTime() + cita.separacionMinutos * 60_000);
      cita.telefonoContacto = '6141234567';
      await db.getRepository(Cita).save(cita);
      const efecto = new EfectoInicialService();
      await expect(db.transaction(async (manager) => {
        await efecto.preparar(manager, cita, ahora);
        throw new Error('fallo controlado');
      })).rejects.toThrow('fallo controlado');
      expect(await db.query('SELECT id FROM condiciones_confirmacion_cita WHERE cita_id=?', [cita.id])).toHaveLength(0);
      expect(await db.query('SELECT id FROM envios_whatsapp WHERE cita_id=?', [cita.id])).toHaveLength(0);
      await db.transaction((manager) => efecto.preparar(manager, cita, ahora));
      const condiciones = await db.query('SELECT * FROM condiciones_confirmacion_cita WHERE cita_id=?', [cita.id]);
      const envios = await db.query('SELECT * FROM envios_whatsapp WHERE cita_id=?', [cita.id]);
      expect(condiciones).toHaveLength(1);
      expect(envios).toHaveLength(1);
      expect(envios[0]).toMatchObject({ tipo: 'inicial_pendiente', estado: 'pendiente' });
      await db.transaction((manager) => efecto.preparar(manager, cita, ahora));
      expect(await db.query('SELECT id FROM envios_whatsapp WHERE cita_id=?', [cita.id])).toHaveLength(1);
    });
  });

  it('sin canal habilitado conserva la cita en seguimiento manual y no simula envío', async () => {
    await conBaseOperativa(async (db) => {
      const { negocios: [negocio] } = await crearEscenarioOperativo(db, new RelojPrueba(ahora));
      const cita = await db.getRepository(Cita).findOneByOrFail({ id: negocio.ocupaciones[0] });
      cita.estado = 'pendiente';
      cita.origen = 'portal_publico';
      cita.inicioUtc = new Date(ahora.getTime() + 8 * 3_600_000);
      cita.finUtc = new Date(cita.inicioUtc.getTime() + 30 * 60_000);
      cita.finOcupacionUtc = new Date(cita.finUtc.getTime() + cita.separacionMinutos * 60_000);
      await db.getRepository(Cita).save(cita);
      await db.transaction((manager) => new EfectoInicialService().preparar(manager, cita, ahora));
      const [condicion] = await db.query('SELECT * FROM condiciones_confirmacion_cita WHERE cita_id=?', [cita.id]);
      expect(condicion).toMatchObject({ estado_politica: 'seguimiento_manual', vencimiento_utc: null });
      expect(await db.query('SELECT id FROM envios_whatsapp WHERE cita_id=?', [cita.id])).toHaveLength(0);
    });
  });
});

describe('M5-T069: alta manual real', () => {
  const secretoPrevio = process.env.CITAS_MANUALES_HMAC_SECRET;
  beforeAll(() => { process.env.CITAS_MANUALES_HMAC_SECRET = 'secreto-fijo-t069-de-prueba-interna'; });
  afterAll(() => {
    if (secretoPrevio === undefined) delete process.env.CITAS_MANUALES_HMAC_SECRET;
    else process.env.CITAS_MANUALES_HMAC_SECRET = secretoPrevio;
  });
  it('crea inicial confirmado y recordatorio futuro sin vencimiento de cancelación', async () => {
    await conBaseOperativa(async (db) => {
      const f = await crearAccesoOperativo(db);
      const referencia = await db.getRepository(Cita).findOneByOrFail({ id: f.negocios[0].ocupaciones[0] });
      await db.query(`INSERT INTO horarios_personal
        (negocio_id,personal_id,dia_semana,orden,sucursal_id,inicio_minutos,fin_minutos,activo)
        VALUES(?,?,1,0,?,480,720,1)`, [referencia.negocioId, referencia.personalId, referencia.sucursalId]);
      await db.query(`INSERT INTO configuracion_agenda
        (negocio_id,modo,tiempo_entre_citas_minutos,anticipacion_minutos,dias_futuros)
        VALUES(?,'agenda_compacta',10,10000,0)`, [referencia.negocioId]);
      const actor = f.actores.find((usuario) => usuario.rol === Rol.ADMIN_NEGOCIO && usuario.negocioId === referencia.negocioId)!;
      const identidad = { sub: actor.id, sesionId: actor.sesionId };
      const seleccion = { clienteId: referencia.clienteId, sucursalId: referencia.sucursalId,
        personalId: referencia.personalId, servicioId: referencia.servicioId,
        fechaLocal: '2026-11-09', horaInicio: '09:17', notas: 'Nota de aceptación manual' };
      await db.query(`INSERT INTO canales_whatsapp
        (negocio_id,remitente_externo_id,secreto_ref,habilitado) VALUES (?,?,?,1)`,
      [f.negocios[0].id, 'phone-t069', 'secret://whatsapp/test']);
      await db.query(`INSERT INTO configuracion_automatizaciones
        (negocio_id,version,plazo_confirmacion_horas,recordatorio_horas) VALUES (?,1,12,12)`, [f.negocios[0].id]);
      const modulo = await Test.createTestingModule({ imports: [
        TypeOrmModule.forRoot({ ...db.options, autoLoadEntities: true }), CitasModule,
      ] }).overrideProvider(RELOJ).useValue(f.reloj).compile();
      try {
      const clave = 'm5-t069-manual-001';
      await modulo.get(IntentosCitaManualService).preparar(identidad, clave, seleccion);
      const registro = modulo.get(RegistroCitaManualService);
      const cita = await registro.registrar(identidad, clave, seleccion);
      expect(cita.estado).toBe('confirmada');
      const [condicion] = await db.query('SELECT * FROM condiciones_confirmacion_cita WHERE cita_id=?', [cita.id]);
      expect(condicion).toMatchObject({ estado_politica: 'confirmada', vencimiento_utc: null, origen_confirmacion: 'personal' });
      const envios = await db.query('SELECT tipo FROM envios_whatsapp WHERE cita_id=? ORDER BY tipo', [cita.id]);
      expect(envios.map((envio: { tipo: string }) => envio.tipo).sort()).toEqual(['inicial_confirmada', 'recordatorio']);
      expect(await registro.registrar(identidad, clave, seleccion)).toEqual(cita);
      expect(await db.query('SELECT id FROM envios_whatsapp WHERE cita_id=?', [cita.id])).toHaveLength(2);
      } finally { await modulo.close(); }
    });
  });
});
