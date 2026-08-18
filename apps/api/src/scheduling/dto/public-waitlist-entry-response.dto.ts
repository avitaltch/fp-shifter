import { ApiProperty } from '@nestjs/swagger';

export class PublicWaitlistEntryResponseDto {
  @ApiProperty({ format: 'uuid' })
  waitlistEntryId!: string;

  @ApiProperty({ enum: ['Active'] })
  status!: 'Active';

  @ApiProperty({ format: 'date-time' })
  windowStartsAt!: string;

  @ApiProperty({ format: 'date-time' })
  windowEndsAt!: string;

  @ApiProperty({ type: [String], format: 'uuid' })
  serviceIds!: string[];
}
