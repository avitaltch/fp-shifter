import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class HealthChecksDto {
  @ApiProperty({ example: 'up', enum: ['up', 'down'] })
  database!: 'up' | 'down';
}

export class HealthStatusDto {
  @ApiProperty({ example: 'ok', enum: ['ok', 'error'] })
  status!: 'ok' | 'error';

  @ApiProperty({ example: 'shiftsync-api' })
  service!: string;

  @ApiProperty({ example: '2026-08-16T10:00:00.000Z' })
  timestamp!: string;

  @ApiPropertyOptional({ type: HealthChecksDto })
  checks?: HealthChecksDto;
}
