import { Controller, Get, Param } from '@nestjs/common';
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { BusinessSlugParamsDto } from './dto/business-slug-params.dto';
import { PublicCatalogResponseDto } from './dto/public-catalog-response.dto';
import { PublicCatalogService } from './public-catalog.service';

@ApiTags('public catalog')
@Controller({
  path: 'public/businesses/:businessSlug/catalog',
  version: '1',
})
export class PublicCatalogController {
  constructor(private readonly catalog: PublicCatalogService) {}

  @Get()
  @ApiOperation({ summary: 'Get the public business and service catalog' })
  @ApiParam({ name: 'businessSlug', example: 'happy-pets-demo' })
  @ApiOkResponse({ type: PublicCatalogResponseDto })
  @ApiNotFoundResponse({ description: 'Business was not found' })
  get(
    @Param() params: BusinessSlugParamsDto,
  ): Promise<PublicCatalogResponseDto> {
    return this.catalog.get(params.businessSlug);
  }
}
