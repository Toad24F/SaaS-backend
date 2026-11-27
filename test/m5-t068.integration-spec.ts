import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { RELOJ } from '../src/comun/reloj';
import { ApartadosService } from '../src/reservas-publicas/apartados.service';
import { IntentosReservaPublicaService } from '../src/reservas-publicas/intentos-reserva-publica.service';
import { RegistroReservaPublicaService } from '../src/reservas-publicas/registro-reserva-publica.service';
import { conBaseOperativa } from './support/operacion-fase-5';
import { crearEscenarioPortal } from './support/escenario-portal';
import { RelojPrueba } from './support/reloj';

// El decodificador de logos no participa en la reserva; evita cargar su binario en esta prueba de dominio.
jest.mock('sharp', () => ({ __esModule: true, default: () => ({}) }), { virtual: true });

describe('M5-T068: reserva pública y efecto inicial', () => {
  it.each([true, false])('comparte commit y recupera el resultado con autorización %s', async (autorizaWhatsapp) => {
    await conBaseOperativa(async (db) => {
      const reloj = new RelojPrueba(new Date('2026-10-20T12:00:00.000Z'));
      const { negocios: [negocio] } = await crearEscenarioPortal(db, reloj);
      await db.query(`INSERT INTO licencias(negocio_id,creado_en,habilitada_en,vence_en)
        VALUES(?,'2026-01-01','2026-01-01','2027-01-01')`, [negocio.id]);
      await db.query(`INSERT INTO horarios_personal(negocio_id,personal_id,sucursal_id,
        dia_semana,orden,inicio_minutos,fin_minutos,activo) VALUES(?,?,?,2,0,480,720,1)`,
      [negocio.id, negocio.profesionales[0], negocio.sucursales[0].id]);
      const [servicio] = await db.query('SELECT id FROM servicios WHERE negocio_id=? AND activo=1', [negocio.id]);
      await db.query(`INSERT INTO canales_whatsapp
        (negocio_id,remitente_externo_id,secreto_ref,habilitado) VALUES (?,?,?,1)`,
      [negocio.id, 'phone-t068', 'secret://whatsapp/test']);
      const secretoPrevio = process.env.PORTAL_FORMULARIO_HMAC_SECRET;
      process.env.PORTAL_FORMULARIO_HMAC_SECRET = 'secreto-fijo-t068-portal-de-prueba';
      const modulo = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(DataSource).useValue(db).overrideProvider(RELOJ).useValue(reloj).compile();
      try {
        const titular = 'b'.repeat(64);
        await db.query('INSERT INTO sesiones_reserva_publica(negocio_id,titular_hash) VALUES(?,?)', [negocio.id, titular]);
        const apartado = await modulo.get(ApartadosService).solicitar(negocio.id, titular, {
          clave: 'operacion_m5_068_0001', personalId: negocio.profesionales[0],
          sucursalId: negocio.sucursales[0].id, servicioId: servicio.id,
          fechaLocal: '2026-10-20', horaInicio: '08:00' });
        expect(apartado.estado).toBe('concedida');
        const clave = 'intento_m5_068_0001';
        await modulo.get(IntentosReservaPublicaService).preparar(negocio.id, titular,
          { clave, apartadoId: apartado.apartadoId! });
        const registro = modulo.get(RegistroReservaPublicaService);
        const contacto = { nombre: 'Persona pública', telefono: '6147778899', notas: 'Nota privada', autorizaWhatsapp };
        const primero = await registro.registrar(negocio.id, titular, clave, contacto);
        expect(primero.estado).toBe('pendiente');
        expect(primero).toMatchObject({ seguimientoManual: !autorizaWhatsapp });
        if (autorizaWhatsapp) expect(primero.vencimientoConfirmacionUtc).toMatch(/Z$/);
        else expect(primero.vencimientoConfirmacionUtc).toBeNull();
        const [cita] = await db.query('SELECT * FROM citas WHERE negocio_id=? AND apartado_origen_id=?', [negocio.id, apartado.apartadoId]);
        const [condicion] = await db.query('SELECT * FROM condiciones_confirmacion_cita WHERE cita_id=?', [cita.id]);
        expect(condicion).toMatchObject({ estado_politica: autorizaWhatsapp ? 'pendiente' : 'seguimiento_manual', categoria: 'proxima' });
        expect(condicion.contacto_autorizado).toBe(autorizaWhatsapp ? 1 : 0);
        if (autorizaWhatsapp) expect(condicion.vencimiento_utc).toBeInstanceOf(Date);
        else expect(condicion.vencimiento_utc).toBeNull();
        const envios = await db.query('SELECT * FROM envios_whatsapp WHERE cita_id=?', [cita.id]);
        expect(envios).toHaveLength(autorizaWhatsapp ? 1 : 0);
        if (autorizaWhatsapp) expect(envios[0]).toMatchObject({ tipo: 'inicial_pendiente', estado: 'pendiente' });
        expect(await registro.registrar(negocio.id, titular, clave, contacto)).toEqual(primero);
        expect(await db.query('SELECT id FROM envios_whatsapp WHERE cita_id=?', [cita.id])).toHaveLength(autorizaWhatsapp ? 1 : 0);
        // T102 · Con la operación comercial bloqueada, la sesión titular aún recupera su resultado durable.
        await db.query('UPDATE licencias SET vence_en=? WHERE negocio_id=?', [reloj.ahora(), negocio.id]);
        await db.query('UPDATE canales_whatsapp SET habilitado=0 WHERE negocio_id=?', [negocio.id]);
        const intentos = modulo.get(IntentosReservaPublicaService);
        expect(await intentos.reconocerResultado(negocio.id, titular, clave, contacto)).toEqual(primero);
        const otraSesion = 'c'.repeat(64);
        await db.query('INSERT INTO sesiones_reserva_publica(negocio_id,titular_hash) VALUES(?,?)', [negocio.id, otraSesion]);
        await expect(intentos.reconocerResultado(negocio.id, otraSesion, clave, contacto)).rejects.toMatchObject({ status: 404 });
        expect(await db.query('SELECT id FROM citas WHERE negocio_id=? AND apartado_origen_id=?', [negocio.id, apartado.apartadoId])).toHaveLength(1);
      } finally {
        await modulo.close();
        if (secretoPrevio === undefined) delete process.env.PORTAL_FORMULARIO_HMAC_SECRET;
        else process.env.PORTAL_FORMULARIO_HMAC_SECRET = secretoPrevio;
      }
    });
  });
});
