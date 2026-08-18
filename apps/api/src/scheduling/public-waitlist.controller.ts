import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Ip,
  Param,
  Post,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiOkResponse,
  ApiHeader,
  ApiTags,
} from '@nestjs/swagger';
import { BusinessSlugParamsDto } from './dto/business-slug-params.dto';
import { CreatePublicWaitlistEntryDto } from './dto/create-public-waitlist-entry.dto';
import { PublicWaitlistEntryResponseDto } from './dto/public-waitlist-entry-response.dto';
import { PublicWaitlistService } from './public-waitlist.service';
import { PublicBookingResponseDto } from './dto/public-booking-response.dto';

@ApiTags('public waitlist')
@Controller({ path: 'public/businesses/:businessSlug/waitlist', version: '1' })
export class PublicWaitlistController {
  constructor(private readonly waitlist: PublicWaitlistService) {}

  @Post()
  @ApiOperation({ summary: 'Join the waitlist for an ordered service sequence' })
  @ApiCreatedResponse({ type: PublicWaitlistEntryResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid waitlist request' })
  @ApiNotFoundResponse({ description: 'Business was not found' })
  @ApiConflictResponse({ description: 'Duplicate active waitlist request' })
  create(
    @Param() params: BusinessSlugParamsDto,
    @Body() request: CreatePublicWaitlistEntryDto,
    @Ip() clientAddress: string,
  ): Promise<PublicWaitlistEntryResponseDto> {
    return this.waitlist.create(params.businessSlug, request, clientAddress);
  }

  @Post('offers/accept')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Accept an active waitlist offer atomically' })
  @ApiHeader({ name: 'Authorization', required: true })
  @ApiOkResponse({ type: PublicBookingResponseDto })
  @ApiNotFoundResponse({ description: 'Offer or token was not found' })
  @ApiConflictResponse({ description: 'Offer has expired' })
  accept(
    @Param() params: BusinessSlugParamsDto,
    @Headers('authorization') authorization: string | undefined,
  ): Promise<PublicBookingResponseDto> {
    return this.waitlist.accept(params.businessSlug, authorization);
  }

  @Post('offers/reject')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Reject an active waitlist offer' })
  @ApiHeader({ name: 'Authorization', required: true })
  @ApiNotFoundResponse({ description: 'Offer or token was not found' })
  reject(
    @Param() params: BusinessSlugParamsDto,
    @Headers('authorization') authorization: string | undefined,
  ): Promise<void> {
    return this.waitlist.reject(params.businessSlug, authorization);
  }
}
