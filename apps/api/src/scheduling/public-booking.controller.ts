import { Body, Controller, Param, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { BusinessSlugParamsDto } from './dto/business-slug-params.dto';
import { CreatePublicBookingDto } from './dto/create-public-booking.dto';
import { PublicBookingResponseDto } from './dto/public-booking-response.dto';
import { PublicBookingService } from './public-booking.service';

@ApiTags('public bookings')
@Controller({ path: 'public/businesses/:businessSlug/bookings', version: '1' })
export class PublicBookingController {
  constructor(private readonly bookings: PublicBookingService) {}

  @Post()
  @ApiOperation({ summary: 'Atomically create a compound appointment' })
  @ApiCreatedResponse({ type: PublicBookingResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid booking request' })
  @ApiNotFoundResponse({ description: 'Business was not found' })
  @ApiConflictResponse({ description: 'Selected plan is no longer available' })
  create(
    @Param() params: BusinessSlugParamsDto,
    @Body() request: CreatePublicBookingDto,
  ): Promise<PublicBookingResponseDto> {
    return this.bookings.create(params.businessSlug, request);
  }
}
