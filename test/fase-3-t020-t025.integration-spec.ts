import { conBaseMigrada } from './support/mariadb';
import { ConfiguracionAgendaService } from '../src/disponibilidad/configuracion-agenda.service';
import { AuditoriaService } from '../src/auditoria/auditoria.service';
import type { DataSource } from 'typeorm';

const inicial = { modo: 'ventana_libre', intervaloMinutos: 15,
  anticipacionMinutos: 15, diasFuturos: 60 } as const;
const nueva = { modo: 'agenda_compacta', intervaloMinutos: 5,
  anticipacionMinutos: 0, diasFuturos: 0 } as const;

function servicio(db: DataSource, auditoria = new AuditoriaService()) {
  return new ConfiguracionAgendaService(db, auditoria);
}

async function actores(db: DataSource) {
  const ids: { negocio: number; admin: number; recepcion: number; ajeno: number }[] = [];
  for (const n of [1, 2]) {
    const negocio = await db.query(`INSERT INTO negocios (nombre,slug,email_contacto)
      VALUES (?,?,?)`, [`Agenda ${n}`, `agenda-${n}`, `agenda-${n}@example.test`]);
    const negocioId = Number(negocio.insertId);
    const altas: number[] = [];
    for (const rol of ['admin_negocio', 'recepcionista']) {
      const cuenta = await db.query(`INSERT INTO usuarios
        (negocio_id,nombre,email,password_hash,rol,activo,activado_en)
        VALUES (?,'Actor',?,'hash',?,1,CURRENT_TIMESTAMP(6))`,
      [negocioId, `agenda-${rol}-${n}@example.test`, rol]);
      altas.push(Number(cuenta.insertId));
    }
    ids.push({ negocio: negocioId, admin: altas[0], recepcion: altas[1], ajeno: 0 });
  }
  ids[0].ajeno = ids[1].admin;
  return ids;
}

describe('M2-T021–T025: configuración íntegra por negocio', () => {
  it('lee valores efectivos sin fila ni evento y aísla la escritura', async () => {
    await conBaseMigrada(async (db) => {
      const [a, b] = await actores(db);
      expect(await servicio(db).consultar(a.admin)).toEqual(inicial);
      expect(await db.query('SELECT COUNT(*) total FROM configuracion_agenda'))
        .toEqual([{ total: '0' }]);
      expect(await db.query('SELECT COUNT(*) total FROM eventos_auditoria'))
        .toEqual([{ total: '0' }]);
      await expect(servicio(db).guardar(a.recepcion, nueva)).rejects.toThrow();
      await expect(servicio(db).guardar(a.admin, { ...nueva, negocioId: b.negocio }))
        .rejects.toThrow();
      expect(await servicio(db).guardar(a.admin, nueva)).toEqual(nueva);
      expect(await servicio(db).consultar(a.admin)).toEqual(nueva);
      expect(await servicio(db).consultar(b.admin)).toEqual(inicial);
      const eventos = await db.query(`SELECT accion,valores_antes antes,valores_despues despues
        FROM eventos_auditoria WHERE negocio_id=?`, [a.negocio]);
      expect(eventos).toHaveLength(1);
      expect(eventos[0].accion).toBe('configuracion_agenda_modificada');
      // El driver puede deserializar JSON antes de devolverlo al test.
      const json = (valor: unknown) => typeof valor === 'string' ? JSON.parse(valor) : valor;
      expect(json(eventos[0].antes)).toEqual(inicial);
      expect(json(eventos[0].despues)).toEqual(nueva);
      await servicio(db).guardar(a.admin, nueva);
      expect(await db.query('SELECT COUNT(*) total FROM eventos_auditoria WHERE negocio_id=?',
        [a.negocio])).toEqual([{ total: '1' }]);
    });
  });

  it('revierte configuración y evento ante conjunto inválido o fallo de auditoría', async () => {
    await conBaseMigrada(async (db) => {
      const [a] = await actores(db);
      await servicio(db).guardar(a.admin, nueva);
      await expect(servicio(db).guardar(a.admin, { ...inicial, anticipacionMinutos: 7 }))
        .rejects.toThrow();
      const auditoria = new AuditoriaService();
      jest.spyOn(auditoria, 'registrar').mockRejectedValueOnce(new Error('auditoría fallida'));
      await expect(servicio(db, auditoria).guardar(a.admin, inicial))
        .rejects.toThrow('auditoría fallida');
      expect(await servicio(db).consultar(a.admin)).toEqual(nueva);
      expect(await db.query('SELECT COUNT(*) total FROM eventos_auditoria WHERE negocio_id=?',
        [a.negocio])).toEqual([{ total: '1' }]);
    });
  });

  it('serializa primeras escrituras desde conexiones independientes', async () => {
    await conBaseMigrada(async (primera, segunda) => {
      const [a] = await actores(primera);
      // Dos administradores lógicos comparten la misma identidad, pero no la conexión.
      const [x, y] = await Promise.all([
        servicio(primera).guardar(a.admin, nueva),
        servicio(segunda).guardar(a.admin, nueva),
      ]);
      expect(x).toEqual(nueva);
      expect(y).toEqual(nueva);
      expect(await primera.query('SELECT COUNT(*) total FROM configuracion_agenda'))
        .toEqual([{ total: '1' }]);
      expect(await primera.query('SELECT COUNT(*) total FROM eventos_auditoria WHERE negocio_id=?',
        [a.negocio])).toEqual([{ total: '1' }]);
      const otro = { ...inicial, intervaloMinutos: 30 };
      await Promise.all([
        servicio(primera).guardar(a.admin, otro),
        servicio(segunda).guardar(a.admin, otro),
      ]);
      expect(await servicio(primera).consultar(a.admin)).toEqual(otro);
      expect(await primera.query('SELECT COUNT(*) total FROM eventos_auditoria WHERE negocio_id=?',
        [a.negocio])).toEqual([{ total: '2' }]);
    });
  });
});
