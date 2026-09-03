import { Controller, Get } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import { HealthStatusDto } from './dto/health-status.dto';
import { HealthService } from './health.service';
import { Public } from '../auth/auth.decorators';

@ApiTags('health')
@Public()
@Controller({ path: 'health', version: '1' })
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get('live')
  @ApiOperation({ summary: 'Report whether the API process is alive' })
  @ApiOkResponse({ type: HealthStatusDto })
  liveness(): HealthStatusDto {
    return this.healthService.liveness();
  }

  @Get('ready')
  @ApiOperation({ summary: 'Report whether the API and database are ready' })
  @ApiOkResponse({ type: HealthStatusDto })
  @ApiServiceUnavailableResponse({
    description: 'The database dependency is not ready',
    type: HealthStatusDto,
  })
  readiness(): Promise<HealthStatusDto> {
    return this.healthService.readiness();
  }
}
