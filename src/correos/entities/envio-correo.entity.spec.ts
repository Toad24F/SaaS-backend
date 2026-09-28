import 'reflect-metadata';
import { getMetadataArgsStorage } from 'typeorm';
import { EnvioCorreo, EstadoEnvioCorreo, TipoEnvioCorreo } from './envio-correo.entity';

describe('M1-T025: contrato de la bandeja', () => {
  it('declara deduplicación, estado, reintentos, arrendamiento y referencia de dominio', () => {
    const columnas = getMetadataArgsStorage().columns
      .filter((columna) => columna.target === EnvioCorreo)
      .map((columna) => columna.propertyName);
    expect(columnas).toEqual(expect.arrayContaining([
      'claveDedupe', 'tipo', 'estado', 'intentos', 'proximoIntentoEn',
      'arrendamientoId', 'arrendadoHasta', 'codigoAccesoId', 'licenciaId',
      'versionVencimiento', 'correoDestinatario', 'ultimoError',
    ]));
    // El mensaje puede contener el código al enviarse, pero jamás se guarda en la bandeja.
    expect(columnas).not.toEqual(expect.arrayContaining([
      'cuerpo', 'texto', 'html', 'codigo', 'password',
    ]));
    expect(Object.values(TipoEnvioCorreo)).toEqual(expect.arrayContaining([
      'activacion_admin', 'recuperacion', 'aviso_vencimiento',
    ]));
    expect(Object.values(EstadoEnvioCorreo)).toEqual(expect.arrayContaining([
      'pendiente', 'tomado', 'enviado', 'fallido', 'descartado',
    ]));
  });
});
