import { ValidationPipe } from '@nestjs/common';
import { getMetadataArgsStorage } from 'typeorm';
import type { QueryRunner } from 'typeorm';
import { Servicios1760000011000 } from '../database/migrations/1760000011000-Servicios';
import { CrearServicioDto, EditarServicioDto } from './dto/servicio.dto';
import { Servicio } from './entities/servicio.entity';

const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });
const validar = (datos: object, metatype: typeof CrearServicioDto | typeof EditarServicioDto) =>
  pipe.transform(datos, { type: 'body', metatype });

describe('M1-T067–T070: contrato local del catálogo', () => {
  it('declara una tarifa decimal y duración globales ligadas al negocio', () => {
    const tabla = getMetadataArgsStorage().tables.find((dato) => dato.target === Servicio);
    expect(tabla?.name).toBe('servicios');
    const columnas = getMetadataArgsStorage().columns.filter((dato) => dato.target === Servicio);
    const porNombre = Object.fromEntries(columnas.map((dato) => [dato.propertyName, dato.options]));
    expect(porNombre.negocioId).toMatchObject({ name: 'negocio_id' });
    expect(porNombre.negocioId.nullable).not.toBe(true);
    expect(porNombre.costo).toMatchObject({ type: 'decimal', precision: 10, scale: 2 });
    expect(porNombre.duracionMinutos).toMatchObject({ name: 'duracion_minutos', type: 'int' });
    expect(porNombre.activo).toMatchObject({ default: true });
    expect(columnas.some((dato) => /sucursal|profesional/i.test(dato.propertyName))).toBe(false);
  });

  it('genera DDL con restricciones y reversión del catálogo', async () => {
    const consultas: string[] = [];
    const runner = { query: async (sql: string) => { consultas.push(sql); } } as QueryRunner;
    const migracion = new Servicios1760000011000();
    await migracion.up(runner);
    expect(consultas[0]).toContain('costo DECIMAL(10,2) NOT NULL');
    expect(consultas[0]).toContain('CHECK (costo >= 0)');
    expect(consultas[0]).toContain('CHECK (duracion_minutos > 0)');
    expect(consultas[0]).toContain('UNIQUE KEY uq_servicios_negocio_id (negocio_id, id)');
    await migracion.down(runner);
    expect(consultas[1]).toBe('DROP TABLE servicios');
  });

  it('acepta costo cero y un costo de dos decimales con duración entera positiva', async () => {
    await expect(validar({ nombre: ' Consulta ', costo: 0, duracionMinutos: 1 },
      CrearServicioDto)).resolves.toMatchObject({ nombre: 'Consulta', costo: '0', duracionMinutos: 1 });
    await expect(validar({ nombre: 'Consulta', costo: '12345678.91', duracionMinutos: 60 },
      CrearServicioDto)).resolves.toMatchObject({ costo: '12345678.91' });
    await expect(validar({ costo: '12.34' }, EditarServicioDto))
      .resolves.toMatchObject({ costo: '12.34' });
  });

  it.each([
    { nombre: 'Consulta', costo: '-0.01', duracionMinutos: 30 },
    { nombre: 'Consulta', costo: '1.001', duracionMinutos: 30 },
    { nombre: 'Consulta', costo: '999999999.00', duracionMinutos: 30 },
    { nombre: 'Consulta', costo: '1.00', duracionMinutos: 0 },
    { nombre: 'Consulta', costo: '1.00', duracionMinutos: 1.5 },
    { nombre: 'Consulta', costo: '1.00', duracionMinutos: 30, negocioId: 7 },
    { nombre: 'Consulta', costo: '1.00', duracionMinutos: 30, activo: false },
  ])('rechaza datos inválidos y campos reservados: %o', async (datos) => {
    await expect(validar(datos, CrearServicioDto)).rejects.toThrow();
  });

  it('rechaza valores nulos y estado global en la edición parcial', async () => {
    for (const datos of [{ nombre: null }, { costo: null }, { duracionMinutos: null },
      { activo: false }, { negocioId: 1 }]) {
      await expect(validar(datos, EditarServicioDto)).rejects.toThrow();
    }
  });
});
