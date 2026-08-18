import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsISO8601,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { PublicBookingCustomerDto } from './create-public-booking.dto';

export class CreatePublicWaitlistEntryDto {
  @ApiProperty({ format: 'date-time', example: '2030-01-07T07:00:00.000Z' })
  @IsISO8601({ strict: true, strictSeparator: true })
  windowStartsAt!: string;

  @ApiProperty({ format: 'date-time', example: '2030-01-07T15:00:00.000Z' })
  @IsISO8601({ strict: true, strictSeparator: true })
  windowEndsAt!: string;

  @ApiProperty({ type: [String], minItems: 1, maxItems: 6 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(6)
  @IsUUID('4', { each: true })
  serviceIds!: string[];

  @ApiProperty({ type: PublicBookingCustomerDto })
  @ValidateNested()
  @Type(() => PublicBookingCustomerDto)
  customer!: PublicBookingCustomerDto;
}
