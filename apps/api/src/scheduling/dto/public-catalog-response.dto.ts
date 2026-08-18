import { ApiProperty } from '@nestjs/swagger';

export class PublicCatalogBusinessDto {
  @ApiProperty({ example: 'happy-pets-demo' })
  slug!: string;

  @ApiProperty({ example: 'Happy Pets Demo' })
  name!: string;

  @ApiProperty({ example: 'he-IL' })
  locale!: string;
}

export class PublicCatalogLocationDto {
  @ApiProperty({ example: 'Happy Pets — Tel Aviv' })
  name!: string;

  @ApiProperty({ example: 'Tel Aviv', nullable: true })
  address!: string | null;

  @ApiProperty({ example: 'Asia/Jerusalem' })
  timezone!: string;
}

export class PublicCatalogServiceDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Pet Trim' })
  name!: string;

  @ApiProperty({ example: 'Full pet grooming and trim', nullable: true })
  description!: string | null;

  @ApiProperty({ minimum: 1, maximum: 1440 })
  durationMinutes!: number;

  @ApiProperty({ minimum: 0 })
  priceMinor!: number;

  @ApiProperty({ example: 'ILS' })
  currency!: string;
}

export class PublicCatalogResponseDto {
  @ApiProperty({ type: PublicCatalogBusinessDto })
  business!: PublicCatalogBusinessDto;

  @ApiProperty({ type: PublicCatalogLocationDto })
  location!: PublicCatalogLocationDto;

  @ApiProperty({ type: [PublicCatalogServiceDto] })
  services!: PublicCatalogServiceDto[];
}
