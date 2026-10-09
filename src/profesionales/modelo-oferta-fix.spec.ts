import { getMetadataArgsStorage } from 'typeorm';
import { Personal } from './entities/personal.entity';
import { PersonalServicio } from './entities/personal-servicio.entity';
import { PersonalSucursal } from './entities/personal-sucursal.entity';
import { PersonalServicioSucursal } from './entities/personal-servicio-sucursal.entity';
import { Servicio } from '../servicios/entities/servicio.entity';

describe('FIX-T006–T007: metadata del modelo individual', () => {
  it('describe perfil y catálogo sin duplicar la identidad de la cuenta', () => {
    const columnas = (tipo: Function) => getMetadataArgsStorage().columns
      .filter((columna) => columna.target === tipo)
      .map((columna) => ({ propiedad: columna.propertyName, ...columna.options }));
    expect(columnas(Personal)).toEqual(expect.arrayContaining([
      expect.objectContaining({ propiedad: 'especialidad', type: 'varchar', length: 150,
        nullable: true }),
    ]));
    expect(columnas(Personal).map((dato) => dato.propiedad))
      .not.toEqual(expect.arrayContaining(['nombre', 'correo', 'passwordHash']));
    expect(columnas(Servicio)).toEqual(expect.arrayContaining([
      expect.objectContaining({ propiedad: 'descripcion', type: 'text', nullable: true }),
      expect.objectContaining({ propiedad: 'creadorPersonalId', name: 'creador_personal_id',
        nullable: true }),
    ]));
  });

  it('describe los dos interruptores y la combinación con referencias compuestas', () => {
    const columnas = getMetadataArgsStorage().columns;
    for (const tipo of [PersonalServicio, PersonalSucursal, PersonalServicioSucursal]) {
      expect(columnas.find((dato) => dato.target === tipo && dato.propertyName === 'activo')?.options)
        .toMatchObject({ type: 'boolean', default: true });
    }
    const tabla = getMetadataArgsStorage().tables
      .find((dato) => dato.target === PersonalServicioSucursal);
    expect(tabla?.name).toBe('personal_servicios_sucursales');
    const primarias = columnas.filter((dato) => dato.target === PersonalServicioSucursal &&
      dato.mode === 'regular' && dato.options.primary).map((dato) => dato.propertyName);
    expect(primarias).toEqual(expect.arrayContaining([
      'negocioId', 'personalId', 'sucursalId', 'servicioId',
    ]));
    const uniones = getMetadataArgsStorage().joinColumns
      .filter((dato) => dato.target === PersonalServicioSucursal);
    expect(uniones.filter((dato) => dato.propertyName === 'asignacion').map((dato) => dato.name))
      .toEqual(['negocio_id', 'personal_id', 'sucursal_id']);
    expect(uniones.filter((dato) => dato.propertyName === 'seleccion').map((dato) => dato.name))
      .toEqual(['negocio_id', 'personal_id', 'servicio_id']);
  });
});
