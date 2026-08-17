import { ApiProperty } from '@nestjs/swagger';

export class PublicBookingStepDto {
  @ApiProperty({ minimum: 1, maximum: 6 })
  sequenceNumber!: number;

  @ApiProperty({ format: 'uuid' })
  serviceId!: string;

  @ApiProperty({ format: 'date-time' })
  startsAt!: string;

  @ApiProperty({ format: 'date-time' })
  endsAt!: string;
}

export class PublicBookingResponseDto {
  @ApiProperty({ format: 'uuid' })
  appointmentId!: string;

  @ApiProperty({ enum: ['Confirmed'] })
  status!: 'Confirmed';

  @ApiProperty({ format: 'date-time' })
  startsAt!: string;

  @ApiProperty({ format: 'date-time' })
  endsAt!: string;

  @ApiProperty({ minimum: 0 })
  totalPriceMinor!: number;

  @ApiProperty({ example: 'ILS' })
  currency!: string;

  @ApiProperty({ type: [PublicBookingStepDto] })
  steps!: PublicBookingStepDto[];
}
