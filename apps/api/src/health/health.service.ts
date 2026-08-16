import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import type { HealthStatusDto } from './dto/health-status.dto';

@Injectable()
export class HealthService {
  constructor(private readonly databaseService: DatabaseService) {}

  liveness(): HealthStatusDto {
    return {
      status: 'ok',
      service: 'shiftsync-api',
      timestamp: new Date().toISOString(),
    };
  }

  async readiness(): Promise<HealthStatusDto> {
    try {
      await this.databaseService.ping();
    } catch {
      throw new ServiceUnavailableException({
        status: 'error',
        service: 'shiftsync-api',
        timestamp: new Date().toISOString(),
        checks: { database: 'down' },
      });
    }

    return {
      status: 'ok',
      service: 'shiftsync-api',
      timestamp: new Date().toISOString(),
      checks: { database: 'up' },
    };
  }
}
