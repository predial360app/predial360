import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';

import { appConfig, appConfigSchema } from './config/app.config';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { PropertiesModule } from './modules/properties/properties.module';
import { AssetsModule } from './modules/assets/assets.module';
import { ServiceOrdersModule } from './modules/service-orders/service-orders.module';
import { ChecklistsModule } from './modules/checklists/checklists.module';
import { ReportsModule } from './modules/reports/reports.module';
import { ContractsModule } from './modules/contracts/contracts.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { AiModule } from './modules/ai/ai.module';
import { IoTModule } from './modules/iot/iot.module';
import { StorageModule } from './modules/storage/storage.module';
import { BodycamModule } from './modules/bodycam/bodycam.module';
import { HealthModule } from './modules/health/health.module';
import { WebsocketModule } from './websocket/websocket.module';

@Module({
  imports: [
    // ── Config global ─────────────────────────────────────────────────────────
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig],
      validationSchema: appConfigSchema,
      validationOptions: { abortEarly: false },
    }),

    // ── Rate limiting global ──────────────────────────────────────────────────
    ThrottlerModule.forRoot([
      { name: 'short', ttl: 1000, limit: 10 },     // 10 req/s
      { name: 'medium', ttl: 60000, limit: 200 },   // 200 req/min
      { name: 'long', ttl: 3600000, limit: 2000 },  // 2000 req/h
    ]),

    // ── Agendamentos (manutenções preventivas) ────────────────────────────────
    ScheduleModule.forRoot(),

    // ── Infraestrutura ────────────────────────────────────────────────────────
    DatabaseModule,
    StorageModule,
    BodycamModule,
    AiModule,
    IoTModule,
    WebsocketModule,

    // ── Domínio ───────────────────────────────────────────────────────────────
    AuthModule,
    UsersModule,
    PropertiesModule,
    AssetsModule,
    ServiceOrdersModule,
    ChecklistsModule,
    ReportsModule,
    ContractsModule,
    PaymentsModule,
    NotificationsModule,
    HealthModule,
  ],
})
export class AppModule {}
