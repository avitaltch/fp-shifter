import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
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
  BusinessHoursResponseDto,
  CreateLocationDto,
  CreateServiceDto,
  LocationResponseDto,
  ProviderResponseDto,
  ReplaceBusinessHoursDto,
  ReplaceProviderSkillsDto,
  ServiceResponseDto,
  UpdateLocationDto,
  UpdateServiceDto,
} from './dto/configuration.dto';

@ApiTags('operator configuration')
@ApiBearerAuth('access-token')
@Roles('Owner', 'Manager')
@Controller({ path: 'operator', version: '1' })
export class ConfigurationController {
  constructor(private readonly configuration: ConfigurationService) {}

  @Get('locations')
  @Roles('Owner', 'Manager', 'Provider')
  @ApiOperation({ summary: 'List locations for the authenticated business' })
  @ApiOkResponse({ type: [LocationResponseDto] })
  listLocations(@CurrentPrincipal() principal: AuthPrincipal) {
    return this.configuration.listLocations(principal);
  }

  @Post('locations')
  @ApiOperation({ summary: 'Create a location for the authenticated business' })
  @ApiCreatedResponse({ type: LocationResponseDto })
  createLocation(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Body() request: CreateLocationDto,
  ) {
    return this.configuration.createLocation(principal, request);
  }

  @Patch('locations/:locationId')
  @ApiOperation({ summary: 'Update a tenant-owned location' })
  @ApiOkResponse({ type: LocationResponseDto })
  @ApiNotFoundResponse({ description: 'Location was not found in this tenant' })
  @ApiConflictResponse({ description: 'Primary-location invariant was violated' })
  updateLocation(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Param('locationId', new ParseUUIDPipe({ version: '4' })) locationId: string,
    @Body() request: UpdateLocationDto,
  ) {
    return this.configuration.updateLocation(principal, locationId, request);
  }

  @Delete('locations/:locationId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete an unused non-primary location' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ description: 'Location was not found in this tenant' })
  @ApiConflictResponse({ description: 'Location is primary or in use' })
  deleteLocation(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Param('locationId', new ParseUUIDPipe({ version: '4' })) locationId: string,
  ) {
    return this.configuration.deleteLocation(principal, locationId);
  }

  @Get('services')
  @ApiOperation({ summary: 'List active and inactive tenant services' })
  @ApiOkResponse({ type: [ServiceResponseDto] })
  listServices(@CurrentPrincipal() principal: AuthPrincipal) {
    return this.configuration.listServices(principal);
  }

  @Post('services')
  @ApiOperation({ summary: 'Create a tenant service' })
  @ApiCreatedResponse({ type: ServiceResponseDto })
  @ApiConflictResponse({ description: 'Service name already exists' })
  createService(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Body() request: CreateServiceDto,
  ) {
    return this.configuration.createService(principal, request);
  }

  @Patch('services/:serviceId')
  @ApiOperation({ summary: 'Update a tenant service' })
  @ApiOkResponse({ type: ServiceResponseDto })
  @ApiNotFoundResponse({ description: 'Service was not found in this tenant' })
  updateService(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Param('serviceId', new ParseUUIDPipe({ version: '4' })) serviceId: string,
    @Body() request: UpdateServiceDto,
  ) {
    return this.configuration.updateService(principal, serviceId, request);
  }

  @Delete('services/:serviceId')
  @ApiOperation({ summary: 'Deactivate a tenant service without deleting history' })
  @ApiOkResponse({ type: ServiceResponseDto })
  @ApiNotFoundResponse({ description: 'Service was not found in this tenant' })
  deactivateService(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Param('serviceId', new ParseUUIDPipe({ version: '4' })) serviceId: string,
  ) {
    return this.configuration.deactivateService(principal, serviceId);
  }

  @Get('providers')
  @ApiOperation({ summary: 'List enabled staff and their service qualifications' })
  @ApiOkResponse({ type: [ProviderResponseDto] })
  listProviders(@CurrentPrincipal() principal: AuthPrincipal) {
    return this.configuration.listProviders(principal);
  }

  @Put('providers/:providerUserId/skills')
  @ApiOperation({ summary: 'Atomically replace provider service qualifications' })
  @ApiOkResponse({ type: ProviderResponseDto })
  @ApiNotFoundResponse({ description: 'Provider or service was not found in this tenant' })
  replaceProviderSkills(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Param('providerUserId', new ParseUUIDPipe({ version: '4' }))
    providerUserId: string,
    @Body() request: ReplaceProviderSkillsDto,
  ) {
    return this.configuration.replaceProviderSkills(principal, providerUserId, request);
  }

  @Get('locations/:locationId/hours')
  @ApiOperation({ summary: 'List weekly opening intervals for a location' })
  @ApiOkResponse({ type: [BusinessHoursResponseDto] })
  @ApiNotFoundResponse({ description: 'Location was not found in this tenant' })
  listBusinessHours(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Param('locationId', new ParseUUIDPipe({ version: '4' })) locationId: string,
  ) {
    return this.configuration.listBusinessHours(principal, locationId);
  }

  @Put('locations/:locationId/hours')
  @ApiOperation({ summary: 'Atomically replace weekly opening intervals' })
  @ApiOkResponse({ type: [BusinessHoursResponseDto] })
  @ApiNotFoundResponse({ description: 'Location was not found in this tenant' })
  replaceBusinessHours(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Param('locationId', new ParseUUIDPipe({ version: '4' })) locationId: string,
    @Body() request: ReplaceBusinessHoursDto,
  ) {
    return this.configuration.replaceBusinessHours(principal, locationId, request);
  }
}
