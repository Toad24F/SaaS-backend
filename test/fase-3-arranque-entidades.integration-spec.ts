import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { ConfiguracionAgenda } from '../src/disponibilidad/entities/configuracion-agenda.entity';
import { Cliente } from '../src/disponibilidad/entities/cliente.entity';
import { Cita } from '../src/disponibilidad/entities/cita.entity';
import { BloqueoTemporal } from '../src/disponibilidad/entities/bloqueo-temporal.entity';
import { conBaseMigrada } from './support/mariadb';

describe('Fase 3: arranque real del DataSource con autoLoadEntities', () => {
  it('carga los metadatos de las cuatro entidades sin sustituir la conexión de Nest', async () => {
    await conBaseMigrada(async (baseTemporal) => {
      const anteriorNombre = process.env.TEST_DB_NAME;
      const anteriorConfirmacion = process.env.TEST_DB_CONFIRMED;
      const nombre = baseTemporal.options.database;
      if (typeof nombre !== 'string') throw new Error('Base temporal sin nombre.');
      process.env.TEST_DB_NAME = nombre;
      process.env.TEST_DB_CONFIRMED = nombre;
      try {
        // Esta conexión sigue la misma ruta de configuración que el servidor, a diferencia
        // de los casos HTTP que inyectan una conexión con entidades explícitas.
        const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
        try {
          const conexion = modulo.get(DataSource);
          for (const entidad of [ConfiguracionAgenda, Cliente, Cita, BloqueoTemporal]) {
            expect(conexion.hasMetadata(entidad)).toBe(true);
          }
        } finally { await modulo.close(); }
      } finally {
        if (anteriorNombre === undefined) delete process.env.TEST_DB_NAME;
        else process.env.TEST_DB_NAME = anteriorNombre;
        if (anteriorConfirmacion === undefined) delete process.env.TEST_DB_CONFIRMED;
        else process.env.TEST_DB_CONFIRMED = anteriorConfirmacion;
      }
    });
  });
});
