import { requestAuthenticatedNestApi } from './auth';

export function listOperatorLocations(options) {
  return requestAuthenticatedNestApi('operator/locations', options);
}

export function listOperatorServices(options) {
  return requestAuthenticatedNestApi('operator/services', options);
}

export function createOperatorService(service, options = {}) {
  return requestAuthenticatedNestApi('operator/services', {
    ...options,
    method: 'POST',
    body: service,
  });
}

export function updateOperatorService(serviceId, service, options = {}) {
  return requestAuthenticatedNestApi(`operator/services/${encodeURIComponent(serviceId)}`, {
    ...options,
    method: 'PATCH',
    body: service,
  });
}

export function deactivateOperatorService(serviceId, options = {}) {
  return requestAuthenticatedNestApi(`operator/services/${encodeURIComponent(serviceId)}`, {
    ...options,
    method: 'DELETE',
  });
}

export function listOperatorProviders(options) {
  return requestAuthenticatedNestApi('operator/providers', options);
}

export function replaceOperatorProviderSkills(providerUserId, serviceIds, options = {}) {
  return requestAuthenticatedNestApi(
    `operator/providers/${encodeURIComponent(providerUserId)}/skills`,
    { ...options, method: 'PUT', body: { serviceIds } }
  );
}

export function listOperatorAvailability({ from, to, providerUserId }, options = {}) {
  const query = new URLSearchParams({ from, to });
  if (providerUserId) query.set('providerUserId', providerUserId);
  return requestAuthenticatedNestApi(`operator/availability?${query}`, options);
}

export function createOperatorAvailability(intervals, providerUserId, options = {}) {
  return requestAuthenticatedNestApi('operator/availability', {
    ...options,
    method: 'POST',
    body: { ...(providerUserId ? { providerUserId } : {}), intervals },
  });
}

export function deleteOperatorAvailability(availabilityId, options = {}) {
  return requestAuthenticatedNestApi(
    `operator/availability/${encodeURIComponent(availabilityId)}`,
    { ...options, method: 'DELETE' }
  );
}
