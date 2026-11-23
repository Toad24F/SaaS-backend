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

jest.mock('sharp', () => ({ __esModule: true, default: () => ({}) }), { virtual: true });

const disparadores = [
  { nombre: 'condicion', sql: `CREATE TRIGGER fallo_efecto AFTER INSERT ON condiciones_confirmacion_cita
    FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='fallo controlado'` },
  { nombre: 'vinculo', sql: `CREATE TRIGGER fallo_efecto BEFORE UPDATE ON citas FOR EACH ROW
    BEGIN IF NEW.condicion_vigente_id IS NOT NULL THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='fallo controlado'; END IF; END` },
  { nombre: 'envio', sql: `CREATE TRIGGER fallo_efecto AFTER INSERT ON envios_whatsapp
    FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='fallo controlado'` },
];

describe('M5-T071: rollback del escritor público al crear efectos', () => {
  it.each(disparadores)('revierte cliente, cita y efecto si falla $nombre', async ({ sql }) => {
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
      [negocio.id, 'phone-t071', 'secret://whatsapp/test']);
      const anterior = process.env.PORTAL_FORMULARIO_HMAC_SECRET;
      process.env.PORTAL_FORMULARIO_HMAC_SECRET = 'secreto-fijo-t071-portal-de-prueba';
      const modulo = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(DataSource).useValue(db).overrideProvider(RELOJ).useValue(reloj).compile();
      try {
        const titular = 'c'.repeat(64), clave = 'intento_m5_071_0001';
        await db.query('INSERT INTO sesiones_reserva_publica(negocio_id,titular_hash) VALUES(?,?)', [negocio.id, titular]);
        const apartado = await modulo.get(ApartadosService).solicitar(negocio.id, titular, {
          clave: 'operacion_m5_071_0001', personalId: negocio.profesionales[0],
          sucursalId: negocio.sucursales[0].id, servicioId: servicio.id,
          fechaLocal: '2026-10-20', horaInicio: '08:00' });
        expect(apartado.estado).toBe('concedida');
        await modulo.get(IntentosReservaPublicaService).preparar(negocio.id, titular,
          { clave, apartadoId: apartado.apartadoId! });
        const registro = modulo.get(RegistroReservaPublicaService);
        const contacto = { nombre: 'Paciente nuevo', telefono: '6147778899', autorizaWhatsapp: true };
        const tablas = ['clientes', 'citas', 'eventos_cita', 'condiciones_confirmacion_cita', 'envios_whatsapp'];
        const contar = async () => Promise.all(tablas.map(async tabla => Number((await db.query(`SELECT COUNT(*) total FROM ${tabla}`))[0].total)));
        const antes = await contar();
        await db.query(sql);
        try {
          await expect(registro.registrar(negocio.id, titular, clave, contacto)).rejects.toThrow();
        } finally { await db.query('DROP TRIGGER fallo_efecto'); }
        expect(await contar()).toEqual(antes);
        const [intento] = await db.query('SELECT estado,cita_id FROM intentos_reserva_publica WHERE clave=?', [clave]);
        expect(intento).toMatchObject({ estado: 'preparado', cita_id: null });
        // La misma clave puede completar una sola vez cuando desaparece el fallo transitorio.
        const resultado = await registro.registrar(negocio.id, titular, clave, contacto);
        expect(resultado.estado).toBe('pendiente');
        expect(await registro.registrar(negocio.id, titular, clave, contacto)).toEqual(resultado);
        expect((await contar()).slice(3)).toEqual([1, 1]);
      } finally {
        await modulo.close();
        if (anterior === undefined) delete process.env.PORTAL_FORMULARIO_HMAC_SECRET;
        else process.env.PORTAL_FORMULARIO_HMAC_SECRET = anterior;
      }
    });
  });
});
