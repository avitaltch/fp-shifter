import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsISO8601,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  ApiProperty,
  ApiPropertyOptional,
  PartialType,
} from '@nestjs/swagger';
import type {
  AvailabilityConfiguration,
  BusinessHoursConfiguration,
  LocationConfiguration,
  ProviderConfiguration,
  ServiceConfiguration,
} from '../configuration.types';

const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const CURRENCY_PATTERN = /^[A-Z]{3}$/;

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

const trimNullable = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  const normalized = value.trim();
  return normalized || null;
};

export class CreateLocationDto {
  @ApiProperty({ maxLength: 120 })
  @Transform(trim)
  @IsString()
  @Length(1, 120)
  name!: string;

  @ApiProperty({ example: 'Asia/Jerusalem', maxLength: 64 })
  @Transform(trim)
  @IsString()
  @Length(1, 64)
  timezone!: string;

  @ApiPropertyOptional({ maxLength: 500, nullable: true })
  @Transform(trimNullable)
  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string | null;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}

export class UpdateLocationDto extends PartialType(CreateLocationDto) {}

export class CreateServiceDto {
  @ApiProperty({ maxLength: 120 })
  @Transform(trim)
  @IsString()
  @Length(1, 120)
  name!: string;

  @ApiPropertyOptional({ maxLength: 1_000, nullable: true })
  @Transform(trimNullable)
  @IsOptional()
  @IsString()
  @MaxLength(1_000)
  description?: string | null;

  @ApiProperty({ minimum: 1, maximum: 1_440 })
  @IsInt()
  @Min(1)
  @Max(1_440)
  durationMinutes!: number;

  @ApiProperty({ minimum: 0, maximum: 100_000_000 })
  @IsInt()
  @Min(0)
  @Max(100_000_000)
  priceMinor!: number;

  @ApiPropertyOptional({ example: 'ILS', default: 'ILS' })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsOptional()
  @Matches(CURRENCY_PATTERN)
  currency?: string;
}

export class UpdateServiceDto extends PartialType(CreateServiceDto) {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class ReplaceProviderSkillsDto {
  @ApiProperty({ type: [String], format: 'uuid', maxItems: 100 })
  @IsArray()
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  serviceIds!: string[];
}

export class BusinessHoursIntervalDto {
  @ApiProperty({ minimum: 1, maximum: 7 })
  @IsInt()
  @Min(1)
  @Max(7)
  isoWeekday!: number;

  @ApiProperty({ example: '08:00' })
  @Matches(TIME_PATTERN)
  startsAt!: string;

  @ApiProperty({ example: '17:00' })
  @Matches(TIME_PATTERN)
  endsAt!: string;
}

export class ReplaceBusinessHoursDto {
  @ApiProperty({ type: [BusinessHoursIntervalDto], maxItems: 28 })
  @IsArray()
  @ArrayMaxSize(28)
  @ValidateNested({ each: true })
  @Type(() => BusinessHoursIntervalDto)
  intervals!: BusinessHoursIntervalDto[];
}

export class AvailabilityIntervalDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  locationId!: string;

  @ApiProperty({ enum: ['Available', 'Unavailable'] })
  @IsEnum(['Available', 'Unavailable'])
  kind!: 'Available' | 'Unavailable';

  @ApiProperty({ format: 'date-time' })
  @IsISO8601({ strict: true })
  startsAt!: string;

  @ApiProperty({ format: 'date-time' })
  @IsISO8601({ strict: true })
  endsAt!: string;

  @ApiPropertyOptional({ maxLength: 500, nullable: true })
  @Transform(trimNullable)
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string | null;
}

export class CreateAvailabilityBatchDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  providerUserId?: string;

  @ApiProperty({ type: [AvailabilityIntervalDto], minItems: 1, maxItems: 62 })
  @IsArray()
  @ArrayMaxSize(62)
  @ValidateNested({ each: true })
  @Type(() => AvailabilityIntervalDto)
  intervals!: AvailabilityIntervalDto[];
}

export class AvailabilityQueryDto {
  @ApiProperty({ format: 'date-time' })
  @IsISO8601({ strict: true })
  from!: string;

  @ApiProperty({ format: 'date-time' })
  @IsISO8601({ strict: true })
  to!: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  providerUserId?: string;
}

export class LocationResponseDto implements LocationConfiguration {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() timezone!: string;
  @ApiProperty({ nullable: true }) address!: string | null;
  @ApiProperty() isPrimary!: boolean;
}

export class ServiceResponseDto implements ServiceConfiguration {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ nullable: true }) description!: string | null;
  @ApiProperty() durationMinutes!: number;
  @ApiProperty() priceMinor!: number;
  @ApiProperty() currency!: string;
  @ApiProperty() active!: boolean;
}

export class ProviderResponseDto implements Omit<ProviderConfiguration, 'disabledAt'> {
  @ApiProperty({ format: 'uuid' }) userId!: string;
  @ApiProperty() firstName!: string;
  @ApiProperty() lastName!: string;
  @ApiProperty() email!: string;
  @ApiProperty({ enum: ['Owner', 'Manager', 'Provider'] })
  role!: ProviderConfiguration['role'];
  @ApiProperty({ type: [String], format: 'uuid' }) serviceIds!: string[];
}

export class BusinessHoursResponseDto implements BusinessHoursConfiguration {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() isoWeekday!: number;
  @ApiProperty() startsAt!: string;
  @ApiProperty() endsAt!: string;
}

export class AvailabilityResponseDto implements AvailabilityConfiguration {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) locationId!: string;
  @ApiProperty({ format: 'uuid' }) providerUserId!: string;
  @ApiProperty({ enum: ['Available', 'Unavailable'] })
  kind!: AvailabilityConfiguration['kind'];
  @ApiProperty({ format: 'date-time' }) startsAt!: Date;
  @ApiProperty({ format: 'date-time' }) endsAt!: Date;
  @ApiProperty({ nullable: true }) notes!: string | null;
}
