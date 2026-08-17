import { ApiProperty } from '@nestjs/swagger';
import { Matches } from 'class-validator';

export class BusinessSlugParamsDto {
  @ApiProperty({ example: 'happy-pets-demo' })
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  businessSlug!: string;
}
