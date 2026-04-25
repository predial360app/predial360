import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

import { LocationGateway } from './location.gateway';
import { PaymentsGateway } from './payments.gateway';
import { EtaController } from './eta.controller';
import { EtaService } from './eta.service';
import { NotificationsModule } from '../modules/notifications/notifications.module';

@Module({
  imports: [JwtModule.register({}), NotificationsModule],
  controllers: [EtaController],
  providers: [LocationGateway, PaymentsGateway, EtaService],
  exports: [EtaService, PaymentsGateway],
})
export class WebsocketModule {}
