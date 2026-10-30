import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { getMetadataArgsStorage } from 'typeorm';
import { ConfiguracionAgenda } from '../src/disponibilidad/entities/configuracion-agenda.entity';
import { Cita } from '../src/disponibilidad/entities/cita.entity';
import { BloqueoTemporal } from '../src/disponibilidad/entities/bloqueo-temporal.entity';

const esquema = readFileSync(resolve(process.cwd(), 'db/schema.sql'), 'utf8');
const columnas = getMetadataArgsStorage().columns;
const columna = (entidad: Function, propiedad: string) => columnas.find((item) =>
  item.target === entidad && item.propertyName === propiedad);

describe('ALA-T019–T022: modelo de separación y fin protegido', () => {
  it('declara separación nueva con valor cero sin derivarla del intervalo heredado', () => {
    expect(columna(ConfiguracionAgenda, 'tiempoEntreCitasMinutos')?.options).toMatchObject({
      name: 'tiempo_entre_citas_minutos', default: 0,
    });
    expect(columna(ConfiguracionAgenda, 'intervaloMinutos')).toBeDefined();
    expect(esquema).toContain('chk_agenda_tiempo_entre_citas');
    expect(esquema).toContain('tiempo_entre_citas_minutos INT UNSIGNED NOT NULL DEFAULT 0');
  });

  it('distingue fin de atención, fin protegido y separación histórica en citas', () => {
    for (const propiedad of ['finUtc', 'finOcupacionUtc', 'separacionMinutos']) {
      expect(columna(Cita, propiedad)).toBeDefined();
    }
    expect(columna(Cita, 'finOcupacionUtc')?.options.name).toBe('fin_ocupacion_utc');
    expect(esquema).toContain('chk_citas_fin_ocupacion');
  });

  it('guarda contexto de concesión anulable en apartados anteriores', () => {
    for (const propiedad of ['finOcupacionUtc', 'separacionMinutos',
      'modoConcesion', 'versionReglas']) {
      expect(columna(BloqueoTemporal, propiedad)?.options.nullable).toBe(true);
    }
    expect(esquema).toContain('chk_bt_contexto_protegido');
    expect(esquema).toContain('chk_bt_fin_ocupacion');
  });
});
