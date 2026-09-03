import { Body, Controller, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { BusinessSlugParamsDto } from './dto/business-slug-params.dto';
import { PublicAvailabilityResponseDto } from './dto/public-availability-response.dto';
import { SearchPublicAvailabilityDto } from './dto/search-public-availability.dto';
import { PublicAvailabilityService } from './public-availability.service';
import { Public } from '../auth/auth.decorators';

@ApiTags('public availability')
@Public()
@Controller({
  path: 'public/businesses/:businessSlug/availability',
  version: '1',
})
export class PublicAvailabilityController {
  constructor(private readonly availability: PublicAvailabilityService) {}

  @Post('search')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Find valid start times for an ordered service sequence',
  })
  @ApiParam({
    name: 'businessSlug',
    example: 'happy-pets-demo',
  })
  @ApiOkResponse({ type: PublicAvailabilityResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid date or service selection' })
  @ApiNotFoundResponse({ description: 'Business was not found' })
  search(
    @Param() params: BusinessSlugParamsDto,
    @Body() request: SearchPublicAvailabilityDto,
  ): Promise<PublicAvailabilityResponseDto> {
    return this.availability.search(params.businessSlug, request);
  }
}
