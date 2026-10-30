import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { getMetadataArgsStorage } from 'typeorm';
import { Cita } from '../src/disponibilidad/entities/cita.entity';
import { BloqueoTemporal } from '../src/disponibilidad/entities/bloqueo-temporal.entity';
import { IntentoReservaPublica } from '../src/reservas-publicas/entities/intento-reserva-publica.entity';

const sql = readFileSync(resolve(process.cwd(), 'db/schema.sql'), 'utf8');
const meta = getMetadataArgsStorage();
// Contrasta el modelo TypeORM con el esquema canónico antes de probar las FKs reales.
const columna = (entidad: Function, propiedad: string) => meta.columns.find((fila) =>
  fila.target === entidad && fila.propertyName === propiedad);

describe('ALA-T023–T027: origen de cita y sucesión de intentos', () => {
  it('declara origen anulable único e índice de contacto por negocio y sucursal', () => {
    expect(columna(Cita, 'apartadoOrigenId')?.options).toMatchObject({
      name: 'apartado_origen_id', nullable: true,
    });
    const indices = meta.indices.filter((indice) => indice.target === Cita);
    expect(indices.some((indice) => indice.name === 'uq_citas_apartado_origen' && indice.unique)).toBe(true);
    expect(indices.some((indice) => indice.name === 'idx_citas_contacto_sucursal_inicio')).toBe(true);
    expect(sql).toContain('fk_citas_apartado_origen');
  });

  it('representa predecesor y puntero sin estado dependiente de proceso vivo', () => {
    expect(columna(IntentoReservaPublica, 'intentoAnteriorId')?.options).toMatchObject({
      name: 'intento_anterior_id', nullable: true,
    });
    expect(columna(BloqueoTemporal, 'intentoActualId')?.options).toMatchObject({
      name: 'intento_actual_id', nullable: true,
    });
    expect(sql).toContain('uq_irp_intento_anterior');
    expect(sql).toContain('fk_irp_intento_anterior');
    expect(sql).toContain('fk_bt_intento_actual');
    expect(meta.columns.filter((fila) => fila.target === IntentoReservaPublica &&
      fila.propertyName === 'estado')[0].options.enum).toEqual(
      ['preparado', 'registrado', 'no_registrado'],
    );
  });
});
