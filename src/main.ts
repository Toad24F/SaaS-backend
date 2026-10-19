import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { instalarLimiteCuerpoPublico } from './reservas-publicas/limite-cuerpo-publico';

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

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
