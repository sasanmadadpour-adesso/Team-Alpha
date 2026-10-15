import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter({ bodyLimit: 1024 * 1024 }));
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: false }));
  if (process.env.SWAGGER_ENABLED !== 'false') SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, new DocumentBuilder().setTitle('VNB Producer Verification API').setVersion('1.0').build()));
  await app.listen(Number(process.env.PORT ?? 3000), '0.0.0.0');
}
void bootstrap();
