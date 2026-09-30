import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { getMetadataArgsStorage } from 'typeorm';
import { CrearSucursalDto } from './dto/sucursal.dto';
import { Sucursal } from './entities/sucursal.entity';

// El contrato se prueba antes de habilitar rutas de alta o cupo.
describe('M1-T059 y T061: entidad y entradas de sucursal', () => {
  const validar = (valor: object) => new ValidationPipe({ transform: true,
    whitelist: true, forbidNonWhitelisted: true }).transform(valor,
    { type: 'body', metatype: CrearSucursalDto });
  const completa = { nombre: ' Centro ', direccion: ' Calle Uno 5 ', telefono: '+52 614 123 4567',
    zonaHoraria: 'America/Chihuahua', urlGoogleMaps: 'https://maps.app.goo.gl/abc123',
    notasLlegada: 'Entrada norte' };

  it('mapea pertenencia, zona, estado y campos aprobados con índices tenant', () => {
    const tabla = getMetadataArgsStorage().tables.find((dato) => dato.target === Sucursal);
    expect(tabla?.name).toBe('sucursales');
    const columnas = getMetadataArgsStorage().columns.filter((dato) => dato.target === Sucursal);
    expect(Object.fromEntries(columnas.map((dato) => [dato.propertyName, dato.options.name ?? dato.propertyName])))
      .toMatchObject({ negocioId: 'negocio_id', zonaHoraria: 'zona_horaria',
        urlGoogleMaps: 'url_google_maps', notasLlegada: 'notas_llegada', activo: 'activo' });
    expect(columnas.find((dato) => dato.propertyName === 'negocioId')?.options.nullable).not.toBe(true);
    expect(columnas.find((dato) => dato.propertyName === 'activo')?.options.default).toBe(true);
    expect(getMetadataArgsStorage().indices.some((dato) => dato.target === Sucursal &&
      JSON.stringify(dato.columns).includes('negocioId'))).toBe(true);
  });

  it('acepta opcionales ausentes y normaliza obligatorios', async () => {
    await expect(validar({ nombre: ' Centro ', direccion: ' Calle Uno 5 ',
      telefono: '+52 614 123 4567', zonaHoraria: 'America/Chihuahua' }))
      .resolves.toMatchObject({ nombre: 'Centro', direccion: 'Calle Uno 5',
        telefono: '+52 614 123 4567', zonaHoraria: 'America/Chihuahua' });
    await expect(validar(completa)).resolves.toMatchObject({ urlGoogleMaps: completa.urlGoogleMaps,
      notasLlegada: completa.notasLlegada });
  });

  it.each(['nombre', 'direccion', 'telefono', 'zonaHoraria'])('señala %s cuando falta o está vacío', async (campo) => {
    const ausente = { ...completa }; delete ausente[campo];
    for (const datos of [ausente, { ...completa, [campo]: '   ' }]) {
      await expect(validar(datos)).rejects.toMatchObject({ response: {
        message: expect.arrayContaining([expect.stringContaining(campo)]),
      } });
    }
  });

  it.each([
    ['telefono', 'abc'], ['telefono', '123'], ['telefono', '1----1----1'], ['telefono', '1'.repeat(21)],
    ['zonaHoraria', 'Mars/Phobos'], ['zonaHoraria', '+02:00'],
    ['urlGoogleMaps', 'http://maps.google.com/maps/place/x'],
    ['urlGoogleMaps', 'https://evil.example/maps'],
    ['urlGoogleMaps', 'https://google.evil/maps'],
    ['nombre', 17], ['direccion', 9], ['notasLlegada', 12],
    ['negocioId', 1], ['activo', false],
  ])('rechaza %s=%s con error de campo', async (campo, valor) => {
    await expect(validar({ ...completa, [campo]: valor })).rejects.toBeInstanceOf(BadRequestException);
    await expect(validar({ ...completa, [campo]: valor })).rejects.toMatchObject({ response: {
      message: expect.arrayContaining([expect.stringContaining(String(campo))]),
    } });
  });
});
