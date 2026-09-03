import { ApiProperty } from '@nestjs/swagger';

export class AuthUserDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'email' })
  email!: string;

  @ApiProperty()
  firstName!: string;

  @ApiProperty()
  lastName!: string;
}

export class AuthBusinessDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  slug!: string;

  @ApiProperty({ enum: ['Owner', 'Manager', 'Provider'] })
  role!: 'Owner' | 'Manager' | 'Provider';
}

export class AuthSessionResponseDto {
  @ApiProperty()
  accessToken!: string;

  @ApiProperty({ example: 900 })
  expiresInSeconds!: number;

  @ApiProperty({ type: AuthUserDto })
  user!: AuthUserDto;

  @ApiProperty({ type: AuthBusinessDto })
  business!: AuthBusinessDto;
}
