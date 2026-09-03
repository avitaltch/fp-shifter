import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentPrincipal, Roles } from '../auth/auth.decorators';
import type { AuthPrincipal } from '../auth/auth.types';
import {
  AppointmentFilterQueryDto,
  OperatorRangeQueryDto,
  ReassignStepDto,
  UpdateStepStatusDto,
} from './dto/operations.dto';
import { OperationsService } from './operations.service';

@ApiTags('operator scheduling')
@ApiBearerAuth('access-token')
@Controller({ path: 'operator', version: '1' })
export class OperationsController {
  constructor(private readonly operations: OperationsService) {}

  @Get('appointments')
  @Roles('Owner', 'Manager')
  @ApiOperation({ summary: 'List appointments and ordered handoffs in a bounded range' })
  @ApiOkResponse({ description: 'Tenant-scoped appointment calendar' })
  listAppointments(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Query() query: AppointmentFilterQueryDto,
  ) {
    return this.operations.listAppointments(principal, query);
  }

  @Get('me/steps')
  @Roles('Owner', 'Manager', 'Provider')
  @ApiOperation({ summary: 'List the authenticated provider schedule' })
  @ApiOkResponse({ description: 'Only steps assigned to the authenticated user' })
  listMySteps(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Query() query: OperatorRangeQueryDto,
  ) {
    return this.operations.listMySteps(principal, query);
  }

  @Patch('steps/:stepId/status')
  @Roles('Owner', 'Manager', 'Provider')
  @ApiOperation({ summary: 'Advance a step to in-progress or completed' })
  @ApiOkResponse({ description: 'Updated step' })
  @ApiNotFoundResponse({ description: 'Step was not found in the allowed scope' })
  @ApiConflictResponse({ description: 'Invalid lifecycle transition' })
  updateStepStatus(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Param('stepId', new ParseUUIDPipe({ version: '4' })) stepId: string,
    @Body() request: UpdateStepStatusDto,
  ) {
    return this.operations.updateStepStatus(principal, stepId, request.status);
  }

  @Get('steps/:stepId/reassignment-options')
  @Roles('Owner', 'Manager')
  @ApiOperation({ summary: 'Explain provider eligibility for a scheduled step' })
  @ApiOkResponse({ description: 'All active staff with deterministic eligibility reasons' })
  @ApiNotFoundResponse({ description: 'Step was not found in this tenant' })
  listReassignmentOptions(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Param('stepId', new ParseUUIDPipe({ version: '4' })) stepId: string,
  ) {
    return this.operations.listReassignmentOptions(principal, stepId);
  }

  @Post('steps/:stepId/reassign')
  @Roles('Owner', 'Manager')
  @ApiOperation({ summary: 'Atomically reassign a future scheduled step' })
  @ApiOkResponse({ description: 'Updated step' })
  @ApiNotFoundResponse({ description: 'Step was not found in this tenant' })
  @ApiConflictResponse({ description: 'Provider is unavailable, unqualified, or busy' })
  reassignStep(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Param('stepId', new ParseUUIDPipe({ version: '4' })) stepId: string,
    @Body() request: ReassignStepDto,
  ) {
    return this.operations.reassignStep(principal, stepId, request.providerUserId);
  }

  @Post('appointments/:appointmentId/cancel')
  @Roles('Owner', 'Manager')
  @ApiOperation({ summary: 'Cancel a future appointment and trigger backfill processing' })
  @ApiOkResponse({ description: 'Cancelled appointment' })
  @ApiNotFoundResponse({ description: 'Appointment was not found in this tenant' })
  @ApiConflictResponse({ description: 'Appointment has started or completed' })
  cancelAppointment(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Param('appointmentId', new ParseUUIDPipe({ version: '4' })) appointmentId: string,
  ) {
    return this.operations.cancelAppointment(principal, appointmentId);
  }
}
