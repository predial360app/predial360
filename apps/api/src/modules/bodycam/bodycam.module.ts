import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { BodycamController } from './bodycam.controller';
import { BodycamService } from './bodycam.service';

@Module({
  imports: [ConfigModule],
  controllers: [BodycamController],
  providers: [BodycamService],
  exports: [BodycamService],
})
export class BodycamModule {}
