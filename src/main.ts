import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { AppModule } from './app.module';
import { instalarLimiteCuerpoPublico } from './reservas-publicas/limite-cuerpo-publico';
import { exigirCompatibilidadAla } from './operacion/compatibilidad-ala';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Protege los 32 KiB originales del portal, incluso con JSON espaciado.
  instalarLimiteCuerpoPublico(app);

  // El portal se sirve en el mismo origen; CORS administrativo no admite cookies.
  app.enableCors({ credentials: false });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Producción solo abre el puerto con escrituras expresamente habilitadas
  // después de verificar apartados y horarios legados. Con datos incompatibles
  // el arranque falla; cerrar el interruptor permite recuperar lecturas.
  if (process.env.NODE_ENV === 'production' &&
    process.env.PORTAL_PUBLICO_ESCRITURAS === 'habilitadas') {
    await exigirCompatibilidadAla(app.get(DataSource), new Date());
  }

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
