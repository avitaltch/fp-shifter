import { supabase } from '../supabase';
import { unwrap } from './unwrap';

// Security definer RPCs — work for anonymous customers.

export async function getAvailableSlots(date, serviceIds) {
  return unwrap(
    await supabase.rpc('get_available_slots', {
      p_date: date,
      p_service_ids: serviceIds,
    })
  );
}

export async function bookAppointment({ firstName, lastName, phone, email, visitDate, startTime, serviceIds, notes }) {
  return unwrap(
    await supabase.rpc('book_appointment', {
      p_first_name: firstName,
      p_last_name: lastName,
      p_phone: phone,
      p_email: email || null,
      p_visit_date: visitDate,
      p_start_time: startTime,
      p_service_ids: serviceIds,
      p_notes: notes || null,
    })
  );
}

// Cancel an appointment (admin RPC): sets the status AND soft-deletes the
// items atomically so the booked span is actually freed for re-booking.
export async function cancelAppointment(appointmentId) {
  return unwrap(await supabase.rpc('cancel_appointment', { p_appointment_id: appointmentId }));
}

// Customer self-service lookup — requires appointment id + phone together.
export async function customerGetAppointment(appointmentId, phone) {
  return unwrap(
    await supabase.rpc('customer_get_appointment', {
      p_appointment_id: appointmentId,
      p_phone: phone,
    })
  );
}

// Customer self-service cancel — same phone gate; frees the slot like admin cancel.
export async function customerCancelAppointment(appointmentId, phone) {
  return unwrap(
    await supabase.rpc('customer_cancel_appointment', {
      p_appointment_id: appointmentId,
      p_phone: phone,
    })
  );
}
