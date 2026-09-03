import { IsEnum, IsISO8601, IsOptional, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class OperatorRangeQueryDto {
  @ApiProperty({ format: 'date-time' })
  @IsISO8601({ strict: true })
  from!: string;

  @ApiProperty({ format: 'date-time' })
  @IsISO8601({ strict: true })
  to!: string;
}

export class UpdateStepStatusDto {
  @ApiProperty({ enum: ['InProgress', 'Completed'] })
  @IsEnum(['InProgress', 'Completed'])
  status!: 'InProgress' | 'Completed';
}

export class ReassignStepDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  providerUserId!: string;
}

export class AppointmentFilterQueryDto extends OperatorRangeQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  locationId?: string;
}
