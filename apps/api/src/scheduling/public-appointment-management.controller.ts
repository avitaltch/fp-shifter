import {
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { BusinessSlugParamsDto } from './dto/business-slug-params.dto';
import { PublicManagedAppointmentResponseDto } from './dto/public-managed-appointment-response.dto';
import { PublicAppointmentManagementService } from './public-appointment-management.service';

@ApiTags('public appointment management')
@ApiHeader({
  name: 'Authorization',
  description: 'Bearer management token returned when the booking was created',
  required: true,
})
@Controller({
  path: 'public/businesses/:businessSlug/appointments/manage',
  version: '1',
})
export class PublicAppointmentManagementController {
  constructor(
    private readonly appointments: PublicAppointmentManagementService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'View an appointment using its management token' })
  @ApiOkResponse({ type: PublicManagedAppointmentResponseDto })
  @ApiNotFoundResponse({ description: 'Appointment or token was not found' })
  get(
    @Param() params: BusinessSlugParamsDto,
    @Headers('authorization') authorization: string | undefined,
  ): Promise<PublicManagedAppointmentResponseDto> {
    return this.appointments.get(params.businessSlug, authorization);
  }

  @Post('cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel an appointment using its management token' })
  @ApiOkResponse({ type: PublicManagedAppointmentResponseDto })
  @ApiNotFoundResponse({ description: 'Appointment or token was not found' })
  @ApiConflictResponse({ description: 'Appointment can no longer be cancelled' })
  cancel(
    @Param() params: BusinessSlugParamsDto,
    @Headers('authorization') authorization: string | undefined,
  ): Promise<PublicManagedAppointmentResponseDto> {
    return this.appointments.cancel(params.businessSlug, authorization);
  }
}
