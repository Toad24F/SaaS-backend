import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { DataSource, QueryFailedError } from 'typeorm';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { RELOJ } from '../src/comun/reloj';
import { Rol } from '../src/auth/enums/rol.enum';
import { SesionesService } from '../src/auth/services/sesiones.service';
import { crearDatosOcupaciones } from './support/ocupaciones-fase-3';
import { conBaseMigrada } from './support/mariadb';
import { RelojPrueba } from './support/reloj';
import { CitasAfectadasService } from '../src/disponibilidad/citas-afectadas.service';

const ahora = new Date('2026-07-06T16:07:00Z');

describe('M2-T067–T073: causas vigentes de citas afectadas', () => {
  it('recalcula causas sin mutar citas y limita la lectura HTTP por sesión, rol y negocio', async () => {
    await conBaseMigrada(async (db: DataSource) => {
      const reloj = new RelojPrueba(ahora);
      const [a, b] = (await crearDatosOcupaciones(db, reloj)).negocios;
      for (const negocio of [a, b]) {
        await db.query('UPDATE negocios SET activado_en=creado_en WHERE id=?', [negocio.id]);
        await db.query(`INSERT INTO licencias
          (negocio_id,creado_en,habilitada_en,vence_en)
          VALUES (?,'2026-01-01','2026-01-01','2027-01-01')`, [negocio.id]);
      }
      // El intervalo persistido es de 30 minutos; luego cambiaremos el catálogo.
      await db.query(`UPDATE citas SET inicio_utc='2026-07-06 18:00:00',
        fin_utc='2026-07-06 18:30:00',estado='confirmada' WHERE id=?`, [a.citas[0]]);
      await db.query("UPDATE citas SET estado='cancelada' WHERE id=?", [a.citas[1]]);
      const horario = await db.query(`INSERT INTO horarios_personal
        (negocio_id,personal_id,sucursal_id,dia_semana,orden,
        inicio_minutos,fin_minutos,descanso_inicio_minutos,
        descanso_fin_minutos,activo) VALUES (?,?,?,1,0,540,840,735,765,1)`,
      [a.id, a.personalId, a.sucursales[0]]);
      const modulo = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(DataSource).useValue(db)
        .overrideProvider(RELOJ).useValue(reloj).compile();
      const app: INestApplication = modulo.createNestApplication();
      app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true,
        forbidNonWhitelisted: true }));
      try {
        await app.init();
        const alta = async (negocioId: number | null, rol: Rol, nombre: string) => {
          const fila = await db.query(`INSERT INTO usuarios
            (negocio_id,nombre,email,password_hash,rol,activo,activado_en)
            VALUES (?,?,?,'hash',?,1,CURRENT_TIMESTAMP(6))`,
          [negocioId, nombre, `${nombre}@afectadas.test`, rol]);
          return Number(fila.insertId);
        };
        const token = async (id: number, rol: Rol, negocioId: number | null) => {
          const sesion = await app.get(SesionesService).crear(id, ahora);
          return app.get(JwtService).sign({ sub: id, sesionId: sesion.id,
            rol, negocioId });
        };
        const adminId = await alta(a.id, Rol.ADMIN_NEGOCIO, 'admin-afectadas');
        const admin = await token(adminId, Rol.ADMIN_NEGOCIO, a.id);
        const recepcion = await token(await alta(a.id, Rol.RECEPCIONISTA,
          'recepcion-afectadas'), Rol.RECEPCIONISTA, a.id);
        const profesional = await token(a.personalId, Rol.PROFESIONAL, a.id);
        const otroPerfil = await alta(a.id, Rol.PROFESIONAL, 'otro-afectadas');
        await db.query('INSERT INTO personal (id,negocio_id) VALUES (?,?)',
          [otroPerfil, a.id]);
        const otro = await token(otroPerfil, Rol.PROFESIONAL, a.id);
        const ajeno = await token(await alta(b.id, Rol.ADMIN_NEGOCIO,
          'admin-b-afectadas'), Rol.ADMIN_NEGOCIO, b.id);
        const superadmin = await token(await alta(null, Rol.SUPERADMIN,
          'super-afectadas'), Rol.SUPERADMIN, null);
        const http = app.getHttpServer();
        const ruta = '/disponibilidad/citas-afectadas';
        const filtros = { desde: '2026-07-06', hasta: '2026-07-06',
          personalId: a.personalId, sucursalId: a.sucursales[0] };
        const leer = (credencial: string, query: Record<string, unknown> = filtros) =>
          request(http).get(ruta).auth(credencial, { type: 'bearer' }).query(query);
        const causas = async () => (await leer(admin).expect(200)).body.citas[0]?.causas;

        await request(http).get(ruta).query(filtros).expect(401);
        await leer(superadmin).expect(403);
        await leer(ajeno).expect(404);
        await leer(otro).expect(403);
        await leer(profesional).expect(200);
        await leer(recepcion).expect(200);
        await leer(admin, { ...filtros, hasta: '2026-08-06' }).expect(400);
        await leer(admin, { ...filtros, negocioId: b.id }).expect(400);
        await leer(admin, { ...filtros, sucursalId: b.sucursales[0] }).expect(404);
        expect((await leer(admin, { desde: '2026-07-06',
          hasta: '2026-07-06' }).expect(200)).body.citas
          .map((fila: { citaId: number }) => fila.citaId)).toContain(a.citas[0]);
        // El mismo instante UTC cae en fechas civiles distintas según la sede.
        await db.query(`UPDATE sucursales SET zona_horaria='America/New_York'
          WHERE id=?`, [a.sucursales[1]]);
        await db.query(`UPDATE citas SET estado='confirmada',
          inicio_utc='2026-07-07 04:30:00',fin_utc='2026-07-07 05:00:00'
          WHERE id=?`, [a.citas[1]]);
        expect((await leer(admin, { desde: '2026-07-06',
          hasta: '2026-07-06' }).expect(200)).body.citas
          .map((fila: { citaId: number }) => fila.citaId)).not.toContain(a.citas[1]);
        expect((await leer(admin, { desde: '2026-07-07',
          hasta: '2026-07-07' }).expect(200)).body.citas
          .map((fila: { citaId: number }) => fila.citaId)).toContain(a.citas[1]);
        await db.query("UPDATE citas SET estado='cancelada' WHERE id=?", [a.citas[1]]);

        const bloqueo = async (motivo: string, inicio: number, fin: number) => {
          const fila = await db.query(`INSERT INTO bloqueos_horario
            (negocio_id,personal_id,sucursal_id,creador_usuario_id,tipo,motivo,
            fecha_inicio,fecha_fin,inicio_minutos,fin_minutos)
            VALUES (?,?,?,?,'emergencia',?,'2026-07-06','2026-07-06',?,?)`,
          [a.id, a.personalId, a.sucursales[0], adminId, motivo, inicio, fin]);
          return Number(fila.insertId);
        };
        const uno = await bloqueo('Primero', 710, 740);
        const dos = await bloqueo('Segundo', 730, 760);
        const primera = await leer(admin).expect(200);
        expect(primera.body.citas).toHaveLength(1);
        expect(primera.body.citas[0]).toMatchObject({ citaId: a.citas[0],
          personalId: a.personalId, sucursalId: a.sucursales[0],
          inicioUtc: '2026-07-06T18:00:00.000Z',
          finUtc: '2026-07-06T18:30:00.000Z' });
        expect(primera.body.citas[0].causas).toEqual(expect.arrayContaining([
          { codigo: 'descanso', referenciaTipo: 'horario',
            referenciaId: Number(horario.insertId) },
          { codigo: 'bloqueo', referenciaTipo: 'bloqueo', referenciaId: uno },
          { codigo: 'bloqueo', referenciaTipo: 'bloqueo', referenciaId: dos },
        ]));
        expect(JSON.stringify(primera.body)).not.toMatch(/clienteId|telefono|email|motivoConsulta/);
        await db.query('DELETE FROM bloqueos_horario WHERE id=?', [uno]);
        expect(await causas()).toEqual(expect.arrayContaining([
          { codigo: 'bloqueo', referenciaTipo: 'bloqueo', referenciaId: dos }]));
        expect(await causas()).not.toEqual(expect.arrayContaining([
          { codigo: 'bloqueo', referenciaTipo: 'bloqueo', referenciaId: uno }]));
        await db.query('DELETE FROM bloqueos_horario WHERE id=?', [dos]);
        await db.query(`UPDATE horarios_personal SET descanso_inicio_minutos=NULL,
          descanso_fin_minutos=NULL WHERE id=?`, [horario.insertId]);
        expect((await leer(admin).expect(200)).body.citas).toEqual([]);
        const horarioRuta = `/profesionales/${a.personalId}/horario`;
        const guardarHorario = (finMinutos: number) => request(http).put(horarioRuta)
          .auth(admin, { type: 'bearer' }).send({ franjas: [{ diaSemana: 1,
            orden: 0, sucursalId: a.sucursales[0], inicioMinutos: 540,
            finMinutos, descansoInicioMinutos: null,
            descansoFinMinutos: null, activo: true }] }).expect(200);
        await guardarHorario(660);
        expect((await causas()).map((c: { codigo: string }) => c.codigo))
          .toContain('horario_insuficiente');
        await guardarHorario(840);

        // Cada interruptor de oferta se prueba por separado y se reactiva antes del siguiente.
        for (const [tabla, filtro, codigo] of [
          ['sucursales', 'id', 'sucursal_inactiva'],
          ['usuarios', 'id', 'cuenta_inactiva'],
          ['servicios', 'id', 'servicio_inactivo'],
          ['personal_sucursales', 'personal_id', 'atencion_inactiva'],
          ['personal_servicios', 'personal_id', 'servicio_no_seleccionado'],
          ['personal_servicios_sucursales', 'personal_id', 'servicio_no_ofrecido_en_sucursal'],
        ] as const) {
          const id = tabla === 'sucursales' ? a.sucursales[0] :
            tabla === 'servicios' ? a.servicios[0] : a.personalId;
          await db.query(`UPDATE ${tabla} SET activo=0 WHERE negocio_id=? AND ${filtro}=?`,
            [a.id, id]);
          expect((await causas()).map((c: { codigo: string }) => c.codigo))
            .toContain(codigo);
          await db.query(`UPDATE ${tabla} SET activo=1 WHERE negocio_id=? AND ${filtro}=?`,
            [a.id, id]);
          expect((await leer(admin).expect(200)).body.citas).toEqual([]);
        }
        // Retirar relaciones preserva la cita y expone la ausencia de asignación.
        await db.query(`DELETE FROM personal_servicios_sucursales
          WHERE negocio_id=? AND personal_id=? AND sucursal_id=? AND servicio_id=?`,
        [a.id, a.personalId, a.sucursales[0], a.servicios[0]]);
        expect((await causas()).map((c: { codigo: string }) => c.codigo))
          .toContain('servicio_no_ofrecido_en_sucursal');
        await db.query(`DELETE FROM personal_servicios
          WHERE negocio_id=? AND personal_id=? AND servicio_id=?`,
        [a.id, a.personalId, a.servicios[0]]);
        expect((await causas()).map((c: { codigo: string }) => c.codigo))
          .toContain('servicio_no_seleccionado');
        await db.query(`INSERT INTO personal_servicios
          (negocio_id,personal_id,servicio_id) VALUES (?,?,?)`,
        [a.id, a.personalId, a.servicios[0]]);
        await db.query('DELETE FROM horarios_personal WHERE negocio_id=? AND personal_id=?',
          [a.id, a.personalId]);
        await db.query(`DELETE FROM personal_sucursales
          WHERE negocio_id=? AND personal_id=? AND sucursal_id=?`,
        [a.id, a.personalId, a.sucursales[0]]);
        expect((await causas()).map((c: { codigo: string }) => c.codigo))
          .toContain('sucursal_no_asignada');
        await db.query(`INSERT INTO personal_sucursales
          (negocio_id,personal_id,sucursal_id) VALUES (?,?,?)`,
        [a.id, a.personalId, a.sucursales[0]]);
        await db.query(`INSERT INTO personal_servicios_sucursales
          (negocio_id,personal_id,sucursal_id,servicio_id) VALUES (?,?,?,?)`,
        [a.id, a.personalId, a.sucursales[0], a.servicios[0]]);
        await guardarHorario(840);
        expect((await leer(admin).expect(200)).body.citas).toEqual([]);
        const persistida = (await db.query(`SELECT estado,inicio_utc,fin_utc
          FROM citas WHERE id=?`, [a.citas[0]]))[0];
        expect(persistida.estado).toBe('confirmada');
        expect(new Date(persistida.inicio_utc).toISOString()).toBe('2026-07-06T18:00:00.000Z');
        expect(new Date(persistida.fin_utc).toISOString()).toBe('2026-07-06T18:30:00.000Z');
        const lector = app.get(CitasAfectadasService);
        const falloBd = new QueryFailedError('SELECT dato_privado', [],
          Object.assign(new Error('fuente temporal'), { code: 'ECONNRESET' }));
        const temporal = jest.spyOn(lector, 'consultar').mockRejectedValueOnce(falloBd);
        expect(JSON.stringify((await leer(admin).expect(503)).body))
          .not.toMatch(/dato_privado|citas|stack/);
        temporal.mockRestore();
        const inesperado = jest.spyOn(lector, 'consultar')
          .mockRejectedValueOnce(new Error('detalle interno'));
        expect(JSON.stringify((await leer(admin).expect(500)).body))
          .not.toMatch(/detalle interno|citas|stack/);
        inesperado.mockRestore();
        expect((await leer(admin).expect(200)).body.citas).toEqual([]);
        await db.query(`UPDATE citas SET inicio_utc='2026-07-06 15:00:00',
          fin_utc='2026-07-06 15:30:00' WHERE id=?`, [a.citas[0]]);
        await db.query('UPDATE servicios SET activo=0 WHERE id=?', [a.servicios[0]]);
        // Una desactivación de oferta no marca retrospectivamente una cita pasada.
        expect((await leer(admin).expect(200)).body.citas).toEqual([]);
        await db.query('UPDATE servicios SET activo=1 WHERE id=?', [a.servicios[0]]);
        await db.query(`UPDATE citas SET inicio_utc='2026-07-06 18:00:00',
          fin_utc='2026-07-06 18:30:00' WHERE id=?`, [a.citas[0]]);
        // Reglas comerciales y duración actual no cambian el intervalo histórico.
        await request(http).put('/disponibilidad/configuracion')
          .auth(admin, { type: 'bearer' }).send({ modo: 'agenda_compacta',
            intervaloMinutos: 10, anticipacionMinutos: 120, diasFuturos: 0 })
          .expect(200);
        await db.query('UPDATE servicios SET duracion_minutos=90 WHERE id=?',
          [a.servicios[0]]);
        expect((await leer(admin).expect(200)).body.citas).toEqual([]);
        await db.query('UPDATE sucursales SET activo=0 WHERE id=?', [a.sucursales[0]]);
        await db.query("UPDATE citas SET estado='cancelada' WHERE id=?", [a.citas[0]]);
        expect((await leer(admin).expect(200)).body.citas).toEqual([]);
        expect((await db.query('SELECT inicio_utc,fin_utc,estado FROM citas WHERE id=?',
          [a.citas[0]]))[0]).toMatchObject({ estado: 'cancelada' });
      } finally { await app.close(); }
    });
  });
});
