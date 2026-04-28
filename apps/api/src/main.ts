import { ValidationPipe, VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';

import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    logger: ['log', 'error', 'warn', 'debug'],
  });

  const configService = app.get(ConfigService);
  const nodeEnv = configService.get<string>('NODE_ENV', 'development');
  const port = configService.get<number>('APP_PORT', 3000);
  const frontendUrl = configService.get<string>('FRONTEND_URL', 'http://localhost:3001');

  // ── Segurança ────────────────────────────────────────────────────────────────
  app.use(helmet({
    contentSecurityPolicy: nodeEnv === 'production',
    crossOriginEmbedderPolicy: nodeEnv === 'production',
  }));

  app.enableCors({
    origin: nodeEnv === 'production'
      ? [frontendUrl]
      : ['http://localhost:3001', 'http://localhost:19006', 'exp://localhost:8081'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  // ── Middleware ───────────────────────────────────────────────────────────────
  app.use(compression());
  app.use(cookieParser());

  // ── Versionamento ────────────────────────────────────────────────────────────
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  // ── Prefixo global ───────────────────────────────────────────────────────────
  app.setGlobalPrefix('api', { exclude: ['/health', '/'] });

  // ── Pipes globais ────────────────────────────────────────────────────────────
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // ── Filtros e interceptores globais ─────────────────────────────────────────
  app.useGlobalFilters(new GlobalExceptionFilter());
  app.useGlobalInterceptors(new LoggingInterceptor());

  // ── Swagger / OpenAPI 3.1 ────────────────────────────────────────────────────
  if (nodeEnv !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Predial360 API')
      .setDescription(
        `## Predial360 — Plataforma de manutenção predial com IA

### Normas ABNT suportadas
- **NBR 5674** — Gestão e periodicidades de manutenção
- **NBR 16747** — Inspeção predial e laudos técnicos
- **NBR 14037** — Manual de uso e manutenção
- **NBR 15575** — Desempenho mínimo por sistema construtivo
- **NBR 16280** — Reformas e intervenções
- **NBR 9077** — Saídas de emergência

### Autenticação
Use o endpoint \`POST /api/v1/auth/login\` para obter o JWT.
Envie como \`Authorization: Bearer <token>\`.`,
      )
      .setVersion('1.0')
      .addBearerAuth(
        { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', in: 'header' },
        'JWT',
      )
      .addTag('auth', 'Autenticação e autorização')
      .addTag('users', 'Gerenciamento de usuários')
      .addTag('properties', 'Imóveis e endereços')
      .addTag('assets', 'Equipamentos e sistemas')
      .addTag('service-orders', 'Ordens de serviço')
      .addTag('checklists', 'Checklists ABNT')
      .addTag('reports', 'Laudos técnicos')
      .addTag('contracts', 'Contratos e planos')
      .addTag('payments', 'Pagamentos via Asaas')
      .addTag('notifications', 'Notificações push')
      .addTag('ai', 'Análise IA (Claude)')
      .addTag('iot', 'Sensores IoT (MQTT)')
      .addTag('storage', 'Upload de arquivos (S3)')
      .addServer('http://localhost:3000', 'Desenvolvimento local')
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document, {
      swaggerOptions: {
        persistAuthorization: true,
        tagsSorter: 'alpha',
        operationsSorter: 'alpha',
      },
    });
  }

  await app.listen(port);
  console.warn(`🚀 Predial360 API rodando em: http://localhost:${port}/api/v1`);
  console.warn(`📚 Swagger disponível em: http://localhost:${port}/api/docs`);
}

void bootstrap();
