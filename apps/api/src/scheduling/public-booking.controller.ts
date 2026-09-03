import { Body, Controller, Headers, Ip, Param, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { BusinessSlugParamsDto } from './dto/business-slug-params.dto';
import { CreatePublicBookingDto } from './dto/create-public-booking.dto';
import { PublicBookingResponseDto } from './dto/public-booking-response.dto';
import { PublicBookingService } from './public-booking.service';
import { Public } from '../auth/auth.decorators';

@ApiTags('public bookings')
@Public()
@Controller({ path: 'public/businesses/:businessSlug/bookings', version: '1' })
export class PublicBookingController {
  constructor(private readonly bookings: PublicBookingService) {}

  @Post()
  @ApiOperation({ summary: 'Atomically create a compound appointment' })
  @ApiHeader({
    name: 'Idempotency-Key',
    description: 'A UUID v4 reused only when retrying the same booking request',
    required: true,
  })
  @ApiCreatedResponse({ type: PublicBookingResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid booking request' })
  @ApiNotFoundResponse({ description: 'Business was not found' })
  @ApiConflictResponse({ description: 'Selected plan is no longer available' })
  create(
    @Param() params: BusinessSlugParamsDto,
    @Body() request: CreatePublicBookingDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Ip() clientAddress: string,
  ): Promise<PublicBookingResponseDto> {
    return this.bookings.create(
      params.businessSlug,
      request,
      idempotencyKey,
      clientAddress,
    );
  }
}
