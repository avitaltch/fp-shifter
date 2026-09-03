import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentPrincipal, Roles } from '../auth/auth.decorators';
import type { AuthPrincipal } from '../auth/auth.types';
import { ConfigurationService } from './configuration.service';
import {
  AvailabilityQueryDto,
  AvailabilityResponseDto,
  CreateAvailabilityBatchDto,
} from './dto/configuration.dto';

@ApiTags('provider availability')
@ApiBearerAuth('access-token')
@Roles('Owner', 'Manager', 'Provider')
@Controller({ path: 'operator/availability', version: '1' })
export class AvailabilityController {
  constructor(private readonly configuration: ConfigurationService) {}

  @Get()
  @ApiOperation({ summary: 'List availability in a bounded time range' })
  @ApiOkResponse({ type: [AvailabilityResponseDto] })
  @ApiNotFoundResponse({ description: 'Provider was not found in this tenant' })
  list(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Query() query: AvailabilityQueryDto,
  ) {
    return this.configuration.listAvailability(principal, query);
  }

  @Post()
  @ApiOperation({ summary: 'Create one or more provider availability intervals' })
  @ApiCreatedResponse({ type: [AvailabilityResponseDto] })
  @ApiNotFoundResponse({ description: 'Provider or location was not found in this tenant' })
  create(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Body() request: CreateAvailabilityBatchDto,
  ) {
    return this.configuration.createAvailability(principal, request);
  }

  @Delete(':availabilityId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete an allowed availability interval' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ description: 'Availability was not found in this tenant/scope' })
  @ApiConflictResponse({ description: 'Interval covers scheduled work' })
  remove(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Param('availabilityId', new ParseUUIDPipe({ version: '4' }))
    availabilityId: string,
  ) {
    return this.configuration.deleteAvailability(principal, availabilityId);
  }
}
