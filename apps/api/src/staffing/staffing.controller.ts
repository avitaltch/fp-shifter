import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentPrincipal, Roles } from '../auth/auth.decorators';
import type { AuthPrincipal } from '../auth/auth.types';
import {
  CreateStaffDto,
  UpdateMyProfileDto,
  UpdateStaffRoleDto,
} from './dto/staffing.dto';
import { StaffingService } from './staffing.service';

@ApiTags('operator staffing')
@ApiBearerAuth('access-token')
@Controller({ path: 'operator', version: '1' })
export class StaffingController {
  constructor(private readonly staffing: StaffingService) {}

  @Get('staff')
  @Roles('Owner', 'Manager')
  @ApiOperation({ summary: 'List tenant staff and service qualifications' })
  @ApiOkResponse({ description: 'Tenant-scoped staff list' })
  list(@CurrentPrincipal() principal: AuthPrincipal) {
    return this.staffing.list(principal);
  }

  @Post('staff')
  @Roles('Owner', 'Manager')
  @ApiOperation({ summary: 'Create a local staff login with a temporary password' })
  @ApiCreatedResponse({ description: 'Staff account and membership created' })
  @ApiConflictResponse({ description: 'Email is already registered' })
  create(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Body() request: CreateStaffDto,
  ) {
    return this.staffing.create(principal, request);
  }

  @Patch('me/profile')
  @Roles('Owner', 'Manager', 'Provider')
  @ApiOperation({ summary: 'Update the authenticated staff profile' })
  @ApiOkResponse({ description: 'Updated staff profile' })
  updateMyProfile(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Body() request: UpdateMyProfileDto,
  ) {
    return this.staffing.updateMyProfile(principal, request);
  }

  @Patch('staff/:userId/role')
  @Roles('Owner')
  @ApiOperation({ summary: 'Change a non-owner staff role' })
  @ApiOkResponse({ description: 'Updated staff membership' })
  @ApiNotFoundResponse({ description: 'Staff member was not found' })
  updateRole(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Param('userId', new ParseUUIDPipe({ version: '4' })) userId: string,
    @Body() request: UpdateStaffRoleDto,
  ) {
    return this.staffing.updateRole(principal, userId, request);
  }

  @Post('staff/:userId/deactivate')
  @Roles('Owner', 'Manager')
  @ApiOperation({ summary: 'Deactivate a staff membership and revoke its sessions' })
  @ApiOkResponse({ description: 'Deactivated staff membership' })
  @ApiConflictResponse({ description: 'Future assignments must be reassigned first' })
  deactivate(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Param('userId', new ParseUUIDPipe({ version: '4' })) userId: string,
  ) {
    return this.staffing.setActive(principal, userId, false);
  }

  @Post('staff/:userId/reactivate')
  @Roles('Owner', 'Manager')
  @ApiOperation({ summary: 'Reactivate a staff membership' })
  @ApiOkResponse({ description: 'Reactivated staff membership' })
  reactivate(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Param('userId', new ParseUUIDPipe({ version: '4' })) userId: string,
  ) {
    return this.staffing.setActive(principal, userId, true);
  }
}
