import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ValidationPipe } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { RELOJ } from '../src/comun/reloj';
import { Rol } from '../src/auth/enums/rol.enum';
import { SesionesService } from '../src/auth/services/sesiones.service';
import { Usuario } from '../src/usuarios/entities/usuario.entity';
import { conBaseMigrada } from './support/mariadb';
import { crearEscenarioPortal } from './support/escenario-portal';
import { RelojPrueba } from './support/reloj';

const origen = 'https://citas.example.test';
const ruta = '/publico/negocios/portal-prueba-1';
const contacto = { nombre: 'Ana Pérez', telefono: '6141234567' };

describe('ALA-T078–T081: visibilidad vigente del precio en el portal real', () => {
  it('proyecta cada respuesta, conserva historia y aísla la recuperación', async () => {
    await conBaseMigrada(async (db) => {
      const reloj = new RelojPrueba(new Date('2026-10-20T12:00:00Z'));
      const { negocios: [a, b] } = await crearEscenarioPortal(db, reloj);
      for (const negocio of [a, b]) {
        await db.query(`INSERT INTO licencias (negocio_id,creado_en,habilitada_en,vence_en)
          VALUES (?,'2026-01-01','2026-01-01','2027-01-01')`, [negocio.id]);
      }
      await db.query(`INSERT INTO horarios_personal (negocio_id,personal_id,sucursal_id,
        dia_semana,orden,inicio_minutos,fin_minutos,activo) VALUES (?,?,?,2,0,480,720,1)`,
      [a.id, a.profesionales[0], a.sucursales[0].id]);
      const servicioId = Number((await db.query('SELECT id FROM servicios WHERE negocio_id=? AND activo=1', [a.id]))[0].id);
      const variables = { PORTAL_PUBLICO_ORIGEN: origen,
        PORTAL_CSRF_SECRET: 'secreto-csrf-precios-1234567890123456',
        PORTAL_FORMULARIO_HMAC_SECRET: 'secreto-formulario-precios-1234567890123456' };
      const anteriores = Object.fromEntries(Object.keys(variables).map((k) => [k, process.env[k]]));
      Object.assign(process.env, variables);
      const modulo = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(DataSource).useValue(db).overrideProvider(RELOJ).useValue(reloj).compile();
      const app = modulo.createNestApplication();
      app.useGlobalPipes(new ValidationPipe({ whitelist: true,
        forbidNonWhitelisted: true, transform: true }));
      try {
        await app.init();
        const http = app.getHttpServer();
        const admin = await db.getRepository(Usuario).save({ negocioId: a.id,
          nombre: 'Admin Precios', email: 'admin-precios@example.test', passwordHash: 'hash',
          rol: Rol.ADMIN_NEGOCIO, activo: true, creadoEn: reloj.ahora(), activadoEn: reloj.ahora() });
        const sesionAdmin = await app.get(SesionesService).crear(admin.id, reloj.ahora());
        const token = app.get(JwtService).sign({ sub: admin.id, sesionId: sesionAdmin.id,
          rol: admin.rol, negocioId: a.id, email: admin.email, nombre: admin.nombre });
        const visibilidad = (mostrarPreciosPublicos: boolean) => request(http)
          .patch('/negocios/publicacion-catalogo').auth(token, { type: 'bearer' })
          .send({ mostrarPreciosPublicos }).expect(200);
        const catalogo = () => request(http).get(`${ruta}/catalogo`).expect(200);
        const propia = await request(http).post(`${ruta}/sesion`).set('Origin', origen)
          .set('X-Portal-Inicializacion', '1').expect(201);
        const ajena = await request(http).post(`${ruta}/sesion`).set('Origin', origen)
          .set('X-Portal-Inicializacion', '1').expect(201);
        const identidad = (respuesta: typeof propia) => ({
          cookie: respuesta.headers['set-cookie'][0].split(';')[0], csrf: respuesta.body.csrfToken });
        const duena = identidad(propia);
        const otra = identidad(ajena);
        const post = (camino: string, cuerpo: object, quien = duena) =>
          request(http).post(`${ruta}${camino}`).set('Origin', origen)
            .set('Cookie', quien.cookie).set('X-CSRF-Token', quien.csrf).send(cuerpo);
        const apartado = async (clave: string, horaInicio: string) => post('/apartados', {
          clave, servicioId, personalId: a.profesionales[0], sucursalId: a.sucursales[0].id,
          fechaLocal: '2026-10-20', horaInicio });
        const sinPrecio = (respuesta: { body: unknown; headers: Record<string, string> }) => {
          expect(respuesta.headers['cache-control']).toBe('no-store');
          expect(JSON.stringify(respuesta.body)).not.toMatch(/costo|precio|importe|monto/i);
        };

        // Visible al principio: una reserva posterior conserva el costo de esta concesión.
        const visible = await catalogo();
        expect(visible.body.servicios[0].costo).toBe('100.00');
        expect(visible.headers['cache-control']).toBe('no-store');
        const primero = await apartado('operacion_precio_visible_123456', '08:00');
        expect(primero.status).toBe(201);
        expect(primero.body.costo).toBe('100.00');
        expect(primero.body).not.toHaveProperty('costoAceptado');
        const id = primero.body.apartadoId as number;
        await visibilidad(false);
        sinPrecio(await catalogo());
        sinPrecio(await request(http).get(`${ruta}/apartados/${id}`)
          .set('Cookie', duena.cookie).expect(200));
        const repetido = await apartado('operacion_precio_visible_123456', '08:00');
        expect(repetido.status).toBe(200);
        sinPrecio(repetido);
        expect((await db.query('SELECT costo_aceptado FROM bloqueos_temporales WHERE id=?', [id]))[0].costo_aceptado).toBe('100.00');

        const clave = 'intento_precio_1234567890';
        await post('/intentos', { clave, apartadoId: id }).expect(201);
        const registrado = await post(`/intentos/${clave}/reservar`, contacto).expect(201);
        sinPrecio(registrado);
        expect(registrado.body).toMatchObject({ estado: 'pendiente', folio: expect.any(String) });
        sinPrecio(await post(`/intentos/${clave}/reservar`, contacto).expect(200));
        const resuelto = await post(`/intentos/${clave}/resolver`, { apartadoId: id }).expect(200);
        sinPrecio(resuelto);
        expect(resuelto.body.resultado.folio).toBe(registrado.body.folio);
        expect((await db.query('SELECT costo_aceptado FROM citas WHERE folio=?',
          [registrado.body.folio]))[0].costo_aceptado).toBe('100.00');
        await post(`/intentos/${clave}/resolver`, { apartadoId: id }, otra).expect(404);

        // Este segundo apartado nace oculto: mostrarlo después jamás debe
        // convertir el costo histórico en una afirmación de aceptación.
        const ocultoApartado = await apartado('operacion_precio_oculto_1234567', '09:00');
        expect(ocultoApartado.status).toBe(201);
        sinPrecio(ocultoApartado);
        const otraClave = 'intento_precio_oculto_12345';
        await post('/intentos', { clave: otraClave,
          apartadoId: ocultoApartado.body.apartadoId }).expect(201);
        // El precio interno no desaparece: la siguiente representación usa el valor vigente.
        await visibilidad(true);
        const mostrado = await post(`/intentos/${clave}/resolver`, { apartadoId: id }).expect(200);
        expect(mostrado.body.resultado.costo).toBe('100.00');
        expect(mostrado.body.resultado).not.toHaveProperty('costoAceptado');
        const desdeOculto = await post(`/intentos/${otraClave}/reservar`, contacto).expect(201);
        expect(desdeOculto.body.costo).toBe('100.00');
        expect(desdeOculto.body).not.toHaveProperty('costoAceptado');
        expect((await db.query('SELECT costo_aceptado FROM citas WHERE folio=?',
          [desdeOculto.body.folio]))[0].costo_aceptado).toBe('100.00');
        expect((await request(http).get('/servicios').auth(token, { type: 'bearer' }).expect(200))
          .body.some((servicio: { costo: string }) => servicio.costo === '100.00')).toBe(true);
        await db.query('UPDATE licencias SET vence_en=? WHERE negocio_id=?', [reloj.ahora(), a.id]);
        const trasLicencia = await post(`/intentos/${clave}/resolver`, { apartadoId: id }).expect(200);
        expect(trasLicencia.body.resultado).toEqual(mostrado.body.resultado);
        // Un cierre de licencia revoca la sesión administrativa. Simular aquí
        // el cambio global persistido permite probar la lectura de recuperación.
        await db.query('UPDATE negocios SET mostrar_precios_publicos=0 WHERE id=?', [a.id]);
        sinPrecio(await post(`/intentos/${clave}/resolver`, { apartadoId: id }).expect(200));
        await post(`/intentos/${clave}/resolver`, { apartadoId: id }, otra).expect(404);
      } finally {
        await app.close();
        for (const [k, valor] of Object.entries(anteriores)) {
          if (valor === undefined) delete process.env[k]; else process.env[k] = valor;
        }
      }
    });
  }, 120000);
});
