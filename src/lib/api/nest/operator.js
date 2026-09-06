import { requestAuthenticatedNestApi } from './auth';

function dateAtLocalMidnight(dateString, dayOffset = 0) {
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, month - 1, day + dayOffset).toISOString();
}

function rangeQuery(fromDate, throughDate, extra = {}) {
  const search = new URLSearchParams({
    from: dateAtLocalMidnight(fromDate),
    to: dateAtLocalMidnight(throughDate, 1),
    ...extra,
  });
  return search.toString();
}

export function listOperatorAppointments(fromDate, throughDate, options = {}) {
  const { locationId, ...requestOptions } = options;
  return requestAuthenticatedNestApi(
    `operator/appointments?${rangeQuery(fromDate, throughDate, locationId ? { locationId } : {})}`,
    requestOptions
  );
}

export function listMyOperatorSteps(fromDate, throughDate, options) {
  return requestAuthenticatedNestApi(
    `operator/me/steps?${rangeQuery(fromDate, throughDate)}`,
    options
  );
}

export function updateOperatorStepStatus(stepId, status, options = {}) {
  return requestAuthenticatedNestApi(`operator/steps/${encodeURIComponent(stepId)}/status`, {
    ...options,
    method: 'PATCH',
    body: { status },
  });
}

export function listOperatorReassignmentOptions(stepId, options) {
  return requestAuthenticatedNestApi(
    `operator/steps/${encodeURIComponent(stepId)}/reassignment-options`,
    options
  );
}

export function reassignOperatorStep(stepId, providerUserId, options = {}) {
  return requestAuthenticatedNestApi(`operator/steps/${encodeURIComponent(stepId)}/reassign`, {
    ...options,
    method: 'POST',
    body: { providerUserId },
  });
}

export function cancelOperatorAppointment(appointmentId, options = {}) {
  return requestAuthenticatedNestApi(
    `operator/appointments/${encodeURIComponent(appointmentId)}/cancel`,
    { ...options, method: 'POST' }
  );
}
