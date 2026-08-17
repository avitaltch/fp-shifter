import { ApiProperty } from '@nestjs/swagger';
import type { SchedulingDiagnosticCode } from '../domain/compound-scheduler.types';

export class PublicAvailabilitySlotDto {
  @ApiProperty({ format: 'date-time' })
  startsAt!: string;

  @ApiProperty({ format: 'date-time' })
  endsAt!: string;
}

export class PublicAvailabilityDiagnosticDto {
  @ApiProperty({
    enum: [
      'INVALID_TIMEZONE',
      'NO_BUSINESS_HOURS',
      'NO_QUALIFIED_PROVIDER',
      'PROVIDERS_UNAVAILABLE',
      'SEARCH_LIMIT_REACHED',
      'NO_VALID_PLAN',
    ],
  })
  code!: SchedulingDiagnosticCode;

  @ApiProperty({ required: false, minimum: 1 })
  serviceSequence?: number;
}

export class PublicAvailabilityResponseDto {
  @ApiProperty()
  businessSlug!: string;

  @ApiProperty()
  date!: string;

  @ApiProperty({ minimum: 1, maximum: 6 })
  serviceCount!: number;

  @ApiProperty({ minimum: 1 })
  totalDurationMinutes!: number;

  @ApiProperty({ minimum: 0 })
  totalPriceMinor!: number;

  @ApiProperty({ example: 'ILS' })
  currency!: string;

  @ApiProperty({ type: [PublicAvailabilitySlotDto] })
  slots!: PublicAvailabilitySlotDto[];

  @ApiProperty({ type: [PublicAvailabilityDiagnosticDto] })
  diagnostics!: PublicAvailabilityDiagnosticDto[];
}
