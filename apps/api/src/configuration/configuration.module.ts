import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { AvailabilityController } from './availability.controller';
import { ConfigurationController } from './configuration.controller';
import { ConfigurationRepository } from './configuration.repository';
import { ConfigurationService } from './configuration.service';

@Module({
  imports: [DatabaseModule],
  controllers: [ConfigurationController, AvailabilityController],
  providers: [ConfigurationRepository, ConfigurationService],
  exports: [ConfigurationService],
})
export class ConfigurationModule {}
