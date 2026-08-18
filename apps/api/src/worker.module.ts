import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnvironment } from './config/environment';
import { NotificationsModule } from './notifications/notifications.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnvironment,
    }),
    NotificationsModule,
  ],
})
export class WorkerModule {}
