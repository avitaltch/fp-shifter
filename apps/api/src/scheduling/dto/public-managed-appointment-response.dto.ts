import { ApiProperty } from '@nestjs/swagger';

export class PublicManagedAppointmentStepDto {
  @ApiProperty({ minimum: 1 })
  sequenceNumber!: number;

  @ApiProperty({ format: 'uuid' })
  serviceId!: string;

  @ApiProperty()
  serviceName!: string;

  @ApiProperty({ format: 'date-time' })
  startsAt!: string;

  @ApiProperty({ format: 'date-time' })
  endsAt!: string;
}

export class PublicManagedAppointmentResponseDto {
  @ApiProperty({ format: 'uuid' })
  appointmentId!: string;

  @ApiProperty({
    enum: ['Pending', 'Confirmed', 'Cancelled', 'Completed', 'RequiresAttention'],
  })
  status!:
    | 'Pending'
    | 'Confirmed'
    | 'Cancelled'
    | 'Completed'
    | 'RequiresAttention';

  @ApiProperty({ format: 'date-time' })
  startsAt!: string;

  @ApiProperty({ format: 'date-time' })
  endsAt!: string;

  @ApiProperty({ minimum: 0 })
  totalPriceMinor!: number;

  @ApiProperty({ example: 'ILS' })
  currency!: string;

  @ApiProperty({ example: 'Asia/Jerusalem' })
  timezone!: string;

  @ApiProperty()
  customerFirstName!: string;

  @ApiProperty({ type: [PublicManagedAppointmentStepDto] })
  steps!: PublicManagedAppointmentStepDto[];
}
