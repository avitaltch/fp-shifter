import { useState, useEffect } from 'react';
import { useNavigate, Link, useParams } from 'react-router-dom';
import {
  listServices,
  getAvailableSlots,
  bookAppointment,
  loadPublicBookingCatalog,
  loadPublicBookingSlots,
  submitPublicBooking,
} from '../lib/api';
import { friendlyError } from '../lib/errors';
import { toIsraeliE164 } from '../lib/phone';
import { Check, Clock, Calendar as CalendarIcon, User, Scissors, Sparkles } from 'lucide-react';
import { jerusalemTodayString, jerusalemAddDaysString, toTimeDisplay, formatDuration, formatHebrewDate } from '../lib/dates';
import PageContainer from '../components/PageContainer/PageContainer';
import EmptyState from '../components/EmptyState/EmptyState';
import LoadingSpinner from '../components/LoadingSpinner/LoadingSpinner';
import { BOOKING_CONFIRMATION_KEY } from './BookingSuccessPage';
import './CustomerBookingPage.css';

const CustomerBookingPage = () => {
  const navigate = useNavigate();
  const { businessSlug } = useParams();
  const [serviceTypes, setServiceTypes] = useState([]);
  const [business, setBusiness] = useState(null);
  const [location, setLocation] = useState(null);
  const [selectedServices, setSelectedServices] = useState([]);
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTime, setSelectedTime] = useState('');
  const [slots, setSlots] = useState([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsError, setSlotsError] = useState(null);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [submitError, setSubmitError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const fetchServices = async () => {
      try {
        setLoading(true);
        setError(null);
        setServiceTypes([]);
        setSelectedServices([]);
        setSelectedDate('');
        setSelectedTime('');
        if (businessSlug) {
          const catalog = await loadPublicBookingCatalog(businessSlug, {
            signal: controller.signal,
          });
          if (cancelled) return;
          setBusiness(catalog.business);
          setLocation(catalog.location);
          setServiceTypes(catalog.services);
        } else {
          const services = await listServices();
          if (cancelled) return;
          setBusiness(null);
          setLocation(null);
          setServiceTypes(services);
        }
      } catch (err) {
        if (cancelled || err?.name === 'AbortError') return;
        setError(
          friendlyError(err, 'שגיאה בטעינת השירותים. יש לנסות שוב מאוחר יותר.')
        );
        console.error('Error fetching services:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchServices();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [businessSlug]);

  // Real availability: slots are computed server-side from employee
  // availability, skills, and existing bookings.
  useEffect(() => {
    if (!selectedDate || selectedServices.length === 0) {
      setSlots([]);
      setSelectedTime('');
      setSlotsError(null);
      return;
    }
    let cancelled = false;
    const controller = new AbortController();
    const fetchSlots = async () => {
      try {
        setSlotsLoading(true);
        setSlotsError(null);
        const data = businessSlug
          ? await loadPublicBookingSlots(
              businessSlug,
              selectedDate,
              selectedServices,
              { signal: controller.signal }
            )
          : await getAvailableSlots(selectedDate, selectedServices);
        if (!cancelled) {
          setSlots(data || []);
          setSelectedTime('');
        }
      } catch (err) {
        if (err?.name === 'AbortError') return;
        if (!cancelled) {
          setSlots([]);
          setSelectedTime('');
          setSlotsError(friendlyError(err, 'שגיאה בטעינת השעות הפנויות.'));
        }
        console.error('Error fetching slots:', err);
      } finally {
        if (!cancelled) setSlotsLoading(false);
      }
    };
    fetchSlots();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [businessSlug, selectedDate, selectedServices]);

  const toggleService = (id) => {
    setSelectedServices((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
  };

  const handleBooking = async (e) => {
    e.preventDefault();
    setSubmitError(null);

    const phoneE164 = toIsraeliE164(phone);
    if (!phoneE164) {
      setSubmitError('מספר הטלפון אינו תקין.');
      return;
    }

    setIsSubmitting(true);
    try {
      const booking = businessSlug
        ? await submitPublicBooking(businessSlug, {
            firstName: firstName.trim(),
            lastName: lastName.trim(),
            phoneE164,
            visitDate: selectedDate,
            startsAt: selectedTime,
            serviceIds: selectedServices,
          })
        : await bookAppointment({
            firstName: firstName.trim(),
            lastName: lastName.trim(),
            phone: phone.trim(),
            visitDate: selectedDate,
            startTime: selectedTime,
            serviceIds: selectedServices,
          });

      const confirmation = {
        booking,
        serviceNames: serviceTypes
          .filter((s) => selectedServices.includes(s.id))
          .map((s) => s.name),
        customerName: `${firstName.trim()} ${lastName.trim()}`,
        phone: phone.trim(),
        ...(businessSlug
          ? {
              bookingPath: `/book/${businessSlug}`,
              timezone: location?.timezone,
            }
          : {}),
      };

      // Keep a copy so the success page survives a refresh / direct visit.
      try {
        sessionStorage.setItem(BOOKING_CONFIRMATION_KEY, JSON.stringify(confirmation));
      } catch {
        /* storage unavailable — router state still works */
      }

      navigate(
        businessSlug ? `/book/${businessSlug}/success` : '/book/success',
        { state: confirmation }
      );
    } catch (err) {
      console.error(err);
      setSubmitError(friendlyError(err, 'שגיאת תקשורת, יש לנסות שוב.'));
      // The chosen slot may be gone (taken by someone else or now in the
      // past) — clear the selection and refresh the list
      const code = err?.code || err?.message || '';
      if (
        ['SLOT_TAKEN', 'SLOT_IN_PAST', 'PLAN_NO_LONGER_AVAILABLE'].some((value) =>
          code.includes(value)
        )
      ) {
        setSelectedTime('');
        try {
          const refreshed = businessSlug
            ? await loadPublicBookingSlots(
                businessSlug,
                selectedDate,
                selectedServices
              )
            : await getAvailableSlots(selectedDate, selectedServices);
          setSlots(refreshed || []);
        } catch {
          setSlots([]);
        }
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const calculateTotal = () => {
    let total = 0;
    let time = 0;
    selectedServices.forEach((id) => {
      const s = serviceTypes.find((srv) => srv.id === id);
      if (s) {
        total += s.base_price;
        time += s.default_duration;
      }
    });
    return { total, time };
  };

  const { total, time } = calculateTotal();
  const progressStep =
    selectedServices.length === 0 ? 1 : !selectedDate || !selectedTime ? 2 : 3;

  return (
    <PageContainer size="md" className="booking-page">
      <div className="booking-header">
        <span className="booking-kicker"><Sparkles size={15} aria-hidden="true" /> מסלול ביקור חכם</span>
        <h1>{business ? `הזמנת תור אצל ${business.name}` : 'הזמנת תור חדש'}</h1>
        {location?.name && <p className="booking-location">{location.name}</p>}
        <p className="subtitle">בוחרים את השירותים לפי הסדר — אנחנו נמצא את הצוות והזמן שמתאימים לכולם.</p>
        {!businessSlug && (
          <p className="manage-entry">
            יש לכם תור?{' '}
            <Link to="/book/manage">לניהול תור קיים</Link>
          </p>
        )}
        <ol className="booking-progress" aria-label={`שלב ${progressStep} מתוך 3`}>
          {['שירותים', 'מועד', 'פרטים'].map((label, index) => {
            const step = index + 1;
            const state = step < progressStep ? 'done' : step === progressStep ? 'active' : '';
            return (
              <li key={label} className={state} aria-current={state === 'active' ? 'step' : undefined}>
                <span>{state === 'done' ? <Check size={14} aria-hidden="true" /> : step}</span>
                {label}
              </li>
            );
          })}
        </ol>
      </div>

      <form onSubmit={handleBooking} className="booking-form">
        <section className="form-section">
          <h2><span className="step-badge">1</span><Scissors size={20} /> בחירת שירותים</h2>

          {loading && <LoadingSpinner text="טוען שירותים..." />}
          {error && <div className="error-state">{error}</div>}

          {!loading && !error && serviceTypes.length === 0 && (
            <EmptyState text="לא נמצאו שירותים זמינים כרגע." />
          )}

          {!loading && !error && serviceTypes.length > 0 && (
            <div className="services-grid">
              {serviceTypes.map((service) => {
                const selected = selectedServices.includes(service.id);
                return (
                  <button
                    type="button"
                    key={service.id}
                    className={`service-card ${selected ? 'selected' : ''}`}
                    onClick={() => toggleService(service.id)}
                    aria-pressed={selected}
                  >
                    {selected && (
                      <span className="service-order" aria-label={`שירות מספר ${selectedServices.indexOf(service.id) + 1}`}>
                        {selectedServices.indexOf(service.id) + 1}
                      </span>
                    )}
                    <div className="service-info">
                      <h3>{service.name}</h3>
                      <div className="service-meta">
                        <span className="price">₪{service.base_price}</span>
                        <span className="duration">
                          <Clock size={13} /> {formatDuration(service.default_duration)}
                        </span>
                      </div>
                    </div>
                    <div className="check-icon" aria-hidden="true">
                      {selected && <Check size={20} />}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {selectedServices.length > 0 && (
          <>
            <section className="form-section fade-in">
              <h2><span className="step-badge">2</span><CalendarIcon size={20} /> תאריך ושעה</h2>
              <div className="datetime-selection">
                <div className="input-group">
                  <label htmlFor="visitDate">תאריך הביקור</label>
                  <input
                    id="visitDate"
                    type="date"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    onClick={(e) => {
                      try {
                        e.currentTarget.showPicker?.();
                      } catch {
                        /* already open or unsupported */
                      }
                    }}
                    min={jerusalemTodayString()}
                    max={jerusalemAddDaysString(60)}
                  />
                </div>
              </div>
              {selectedDate && (
                <div className="slots-area fade-in" role="group" aria-label="שעות פנויות">
                  <span className="slots-label">שעות פנויות</span>
                  {slotsLoading ? (
                    <LoadingSpinner text="בודק זמינות..." inline={true} />
                  ) : slotsError ? (
                    <p className="error-state" role="alert">{slotsError}</p>
                  ) : slots.length === 0 ? (
                    <p className="no-slots">אין שעות פנויות בתאריך זה. יש לבחור תאריך אחר.</p>
                  ) : (
                    <div className="slots-grid">
                      {slots.map((slot) => (
                        <button
                          type="button"
                          key={slot.slot_start}
                          className={`slot-chip ${selectedTime === slot.slot_start ? 'selected' : ''}`}
                          onClick={() => setSelectedTime(slot.slot_start)}
                          aria-pressed={selectedTime === slot.slot_start}
                        >
                          {toTimeDisplay(slot.slot_start, location?.timezone)}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </section>

            <section className="form-section fade-in">
              <h2><span className="step-badge">3</span><User size={20} /> פרטים אישיים</h2>
              <div className="customer-details">
                <div className="input-group">
                  <label htmlFor="firstName">שם פרטי</label>
                  <input
                    id="firstName"
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    required
                  />
                </div>
                <div className="input-group">
                  <label htmlFor="lastName">שם משפחה</label>
                  <input
                    id="lastName"
                    type="text"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    required
                  />
                </div>
                <div className="input-group">
                  <label htmlFor="phone">טלפון</label>
                  <input
                    id="phone"
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="050-1234567"
                    required
                  />
                </div>
              </div>
            </section>
          </>
        )}

        {submitError && <div className="error-state" role="alert">{submitError}</div>}

        <div className="booking-summary" aria-live="polite">
          <div className="summary-details">
            <span><Clock size={16} /> זמן מוערך: <strong>{formatDuration(time)}</strong></span>
            <span>סך הכל: <strong>₪{total}</strong></span>
            {selectedDate && selectedTime && (
              <span className="summary-when">
                <CalendarIcon size={16} /> {formatHebrewDate(selectedDate)}, {toTimeDisplay(selectedTime, location?.timezone)}
              </span>
            )}
          </div>
          <button
            type="submit"
            className="submit-btn"
            disabled={
              isSubmitting ||
              selectedServices.length === 0 ||
              !selectedDate ||
              !selectedTime ||
              !firstName.trim() ||
              !lastName.trim() ||
              !phone.trim()
            }
          >
            {isSubmitting ? 'מעבד...' : 'אישור הזמנה'}
          </button>
        </div>
      </form>
    </PageContainer>
  );
};

export default CustomerBookingPage;
