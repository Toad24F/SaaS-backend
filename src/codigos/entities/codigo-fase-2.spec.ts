import { getMetadataArgsStorage } from 'typeorm';
import { CodigoAcceso } from './codigo-acceso.entity';

describe('M1-T020: destinos y versión de código', () => {
  it('representa invitación o cuenta y conserva solo hash y metadatos de derivación', () => {
    // Metadatos de entidad y SQL deben describir la misma exclusividad de titular.
    const columnas = getMetadataArgsStorage().columns.filter((fila) => fila.target === CodigoAcceso)
      .map((fila) => fila.propertyName);
    expect(columnas).toEqual(expect.arrayContaining([
      'altaAdministradorId', 'usuarioId', 'destinatarioVersion', 'emisionId',
      'nonce', 'claveVersion', 'codigoHash',
    ]));
    expect(columnas).not.toContain('codigo');
  });
});
