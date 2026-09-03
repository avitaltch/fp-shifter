import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, Length, Matches } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'owner@example.com', maxLength: 254 })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @Length(3, 254)
  email!: string;

  @ApiProperty({ minLength: 1, maxLength: 256 })
  @IsString()
  @Length(1, 256)
  password!: string;

  @ApiPropertyOptional({ example: 'happy-pets-demo' })
  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  businessSlug?: string;
}
