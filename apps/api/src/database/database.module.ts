import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import { DATABASE_POOL } from './database.constants';
import { DatabaseService } from './database.service';

@Module({
  providers: [
    {
      provide: DATABASE_POOL,
      inject: [ConfigService],
      useFactory: (configService: ConfigService): Pool =>
        new Pool({
          connectionString: configService.getOrThrow<string>('DATABASE_URL'),
          max: 10,
          idleTimeoutMillis: 30_000,
          connectionTimeoutMillis: 5_000,
          application_name: 'shiftsync-api',
        }),
    },
    DatabaseService,
  ],
  exports: [DatabaseService],
})
export class DatabaseModule {}
