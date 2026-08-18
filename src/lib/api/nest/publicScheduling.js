import { requestNestApi } from './client';

function businessPath(businessSlug, suffix) {
  return `public/businesses/${encodeURIComponent(businessSlug)}/${suffix}`;
}

export function getPublicCatalog(businessSlug, options) {
  return requestNestApi(businessPath(businessSlug, 'catalog'), options);
}

export function searchPublicAvailability(businessSlug, request, options = {}) {
  return requestNestApi(businessPath(businessSlug, 'availability/search'), {
    ...options,
    method: 'POST',
    body: request,
  });
}

export function createPublicBooking(businessSlug, request, options = {}) {
  return requestNestApi(businessPath(businessSlug, 'bookings'), {
    ...options,
    method: 'POST',
    body: request,
  });
}
