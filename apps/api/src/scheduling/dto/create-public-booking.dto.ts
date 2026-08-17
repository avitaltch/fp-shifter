import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class PublicBookingCustomerDto {
  @ApiProperty({ example: 'Ari', minLength: 1, maxLength: 80 })
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  firstName!: string;

  @ApiProperty({ example: 'Cohen', minLength: 1, maxLength: 80 })
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  lastName!: string;

  @ApiPropertyOptional({ example: 'ari@example.com' })
  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  email?: string;

  @ApiProperty({ example: '+972501234567' })
  @Matches(/^\+[1-9][0-9]{7,14}$/)
  phoneE164!: string;
}

export class CreatePublicBookingDto {
  @ApiProperty({ example: '2030-01-07' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date!: string;

  @ApiProperty({ example: '2030-01-07T08:00:00.000Z', format: 'date-time' })
  @IsISO8601({ strict: true, strictSeparator: true })
  startsAt!: string;

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

  @ApiPropertyOptional({ maxLength: 2_000 })
  @IsOptional()
  @IsString()
  @MaxLength(2_000)
  notes?: string;
}
