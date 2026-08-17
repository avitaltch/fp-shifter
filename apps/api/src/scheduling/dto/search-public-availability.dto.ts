import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsUUID, Matches } from 'class-validator';

export class SearchPublicAvailabilityDto {
  @ApiProperty({
    example: '2030-01-07',
    description: 'Local calendar date in the business location timezone',
  })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date!: string;

  @ApiProperty({
    type: [String],
    minItems: 1,
    maxItems: 6,
    example: [
      '00000000-0000-4000-8000-000000000401',
      '00000000-0000-4000-8000-000000000402',
    ],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(6)
  @IsUUID('4', { each: true })
  serviceIds!: string[];
}
