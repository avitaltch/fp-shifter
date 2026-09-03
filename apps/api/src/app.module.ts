import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnvironment } from './config/environment';
import { HealthModule } from './health/health.module';
import { ObservabilityModule } from './observability/observability.module';
import { NotificationsModule } from './notifications/notifications.module';
import { SchedulingModule } from './scheduling/scheduling.module';
import { AuthModule } from './auth/auth.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnvironment,
    }),
    ObservabilityModule,
    AuthModule,
    HealthModule,
    NotificationsModule,
    SchedulingModule,
  ],
})
export class AppModule {}
