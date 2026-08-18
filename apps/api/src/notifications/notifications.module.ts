import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { FakeNotificationProvider } from './fake-notification.provider';
import { NotificationOutboxRepository } from './notification-outbox.repository';
import { NotificationRendererService } from './notification-renderer.service';
import { NotificationWorkerRepository } from './notification-worker.repository';
import { NotificationWorkerService } from './notification-worker.service';

@Module({
  imports: [DatabaseModule],
  providers: [
    NotificationOutboxRepository,
    NotificationRendererService,
    FakeNotificationProvider,
    NotificationWorkerRepository,
    NotificationWorkerService,
  ],
  exports: [NotificationOutboxRepository, NotificationWorkerService],
})
export class NotificationsModule {}
