import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { RateLimiterService } from './rate-limiter.service';

@Module({
  imports: [DatabaseModule],
  providers: [RateLimiterService],
  exports: [RateLimiterService],
})
export class SecurityModule {}
