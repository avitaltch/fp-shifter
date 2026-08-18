export class InvalidServiceSelectionError extends Error {}

export class InvalidBookingDateError extends Error {}

export class PlanNoLongerAvailableError extends Error {}

export class IdempotencyKeyReusedError extends Error {}

export class AppointmentManagementTokenInvalidError extends Error {}

export class AppointmentCancellationTooLateError extends Error {}

export class AppointmentCancellationNotAllowedError extends Error {}
