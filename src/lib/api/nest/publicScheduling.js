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

/**
 * Adapt the public NestJS contracts to the stable shape consumed by the
 * existing booking UI. Keeping this translation at the boundary lets the
 * page move transports without spreading API-specific field names through
 * the component.
 */
export async function loadPublicBookingCatalog(businessSlug, options) {
  const catalog = await getPublicCatalog(businessSlug, options);
  return {
    business: catalog.business,
    location: catalog.location,
    services: catalog.services.map((service) => ({
      id: service.id,
      name: service.name,
      description: service.description,
      base_price: service.priceMinor / 100,
      default_duration: service.durationMinutes,
      currency: service.currency,
    })),
  };
}

export async function loadPublicBookingSlots(
  businessSlug,
  date,
  serviceIds,
  options
) {
  const availability = await searchPublicAvailability(
    businessSlug,
    { date, serviceIds },
    options
  );
  return availability.slots.map((slot) => ({
    slot_start: slot.startsAt,
    slot_end: slot.endsAt,
  }));
}

export async function submitPublicBooking(
  businessSlug,
  { firstName, lastName, phoneE164, visitDate, startsAt, serviceIds },
  options
) {
  const booking = await createPublicBooking(
    businessSlug,
    {
      date: visitDate,
      startsAt,
      serviceIds,
      customer: { firstName, lastName, phoneE164 },
    },
    options
  );
  return {
    ...booking,
    appointment_id: booking.appointmentId,
    visit_date: visitDate,
    start_time: booking.startsAt,
    end_time: booking.endsAt,
    total_duration: Math.round(
      (new Date(booking.endsAt).getTime() - new Date(booking.startsAt).getTime()) /
        60_000
    ),
    total_price: booking.totalPriceMinor / 100,
  };
}
