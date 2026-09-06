import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
const normalizeEmail = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;
const nullableTrim = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  return value.trim() || null;
};

export class CreateStaffDto {
  @ApiProperty({ format: 'email', maxLength: 254 })
  @Transform(normalizeEmail)
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @ApiProperty({ maxLength: 80 })
  @Transform(trim)
  @IsString()
  @Length(1, 80)
  firstName!: string;

  @ApiProperty({ maxLength: 80 })
  @Transform(trim)
  @IsString()
  @Length(1, 80)
  lastName!: string;

  @ApiPropertyOptional({ example: '+972501234567', nullable: true })
  @Transform(nullableTrim)
  @IsOptional()
  @Matches(/^\+[1-9][0-9]{7,14}$/)
  phoneE164?: string | null;

  @ApiProperty({ enum: ['Manager', 'Provider'] })
  @IsEnum(['Manager', 'Provider'])
  role!: 'Manager' | 'Provider';

  @ApiProperty({ minLength: 12, maxLength: 128 })
  @IsString()
  @Length(12, 128)
  temporaryPassword!: string;
}

export class UpdateMyProfileDto {
  @ApiProperty({ maxLength: 80 })
  @Transform(trim)
  @IsString()
  @Length(1, 80)
  firstName!: string;

  @ApiProperty({ maxLength: 80 })
  @Transform(trim)
  @IsString()
  @Length(1, 80)
  lastName!: string;

  @ApiPropertyOptional({ example: '+972501234567', nullable: true })
  @Transform(nullableTrim)
  @IsOptional()
  @Matches(/^\+[1-9][0-9]{7,14}$/)
  phoneE164?: string | null;
}

export class UpdateStaffRoleDto {
  @ApiProperty({ enum: ['Manager', 'Provider'] })
  @IsEnum(['Manager', 'Provider'])
  role!: 'Manager' | 'Provider';
}
