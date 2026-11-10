import 'dotenv/config';
import { resolve } from 'path';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/http-exception.filter';
import { origensPermitidas } from './common/urls';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.set('trust proxy', 1);
  app.enableCors({
    origin: origensPermitidas(),
    allowedHeaders: 'Content-Type, Origin, X-Requested-With, Accept, Authorization',
    methods: 'GET,PUT,POST,PATCH,DELETE,OPTIONS,HEAD',
  });
  app.useGlobalPipes(new ValidationPipe({ errorHttpStatusCode: 422, transform: true, whitelist: true }));
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useStaticAssets(resolve(process.env.UPLOADS_DIR || 'uploads'), {
    prefix: '/files/',
    setHeaders: (res) => res.setHeader('X-Content-Type-Options', 'nosniff'),
  });

  const config = new DocumentBuilder()
    .setTitle('Salve Mais Um API')
    .setVersion('3.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('swagger', app, SwaggerModule.createDocument(app, config));

  const port = process.env.PORT || 3007;
  await app.listen(port, '0.0.0.0', () => console.log(`Salve Mais Um API na porta ${port}`));
}
bootstrap();
