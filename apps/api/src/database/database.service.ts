import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import type { Pool } from 'pg';
import { DATABASE_POOL } from './database.constants';

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private readonly handlePoolError = (error: Error & { code?: string }) => {
    this.logger.error({
      event: 'database_pool_error',
      errorName: error.name,
      errorMessage: error.message,
      errorCode: error.code,
    });
  };

  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  onModuleInit(): void {
    this.pool.on('error', this.handlePoolError);
  }

  async ping(): Promise<void> {
    await this.pool.query('select 1');
  }

  async onModuleDestroy(): Promise<void> {
    this.pool.off('error', this.handlePoolError);
    await this.pool.end();
  }
}
