import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { listServices, getAvailableSlots, bookAppointment } from '../lib/api';
import { friendlyError } from '../lib/errors';
import { Check, Clock, Calendar as CalendarIcon, User, Scissors } from 'lucide-react';
import { todayString, addDaysString, toTimeDisplay, formatDuration, formatHebrewDate } from '../lib/dates';
import PageContainer from '../components/PageContainer/PageContainer';
import EmptyState from '../components/EmptyState/EmptyState';
import LoadingSpinner from '../components/LoadingSpinner/LoadingSpinner';
import './CustomerBookingPage.css';

const PHONE_PATTERN = /^[0-9+\-\s]{7,15}$/;

const CustomerBookingPage = () => {
  const navigate = useNavigate();
  const [serviceTypes, setServiceTypes] = useState([]);
  const [selectedServices, setSelectedServices] = useState([]);
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTime, setSelectedTime] = useState('');
  const [slots, setSlots] = useState([]);
  const [slotsLoading, setSlotsLoading] = useState(false);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [submitError, setSubmitError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const fetchServices = async () => {
      try {
        setLoading(true);
        setError(null);
        setServiceTypes(await listServices());
      } catch (err) {
        setError('שגיאה בטעינת השירותים. יש לנסות שוב מאוחר יותר.');
        console.error('Error fetching services:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchServices();
  }, []);

  // Real availability: slots are computed server-side from employee
  // availability, skills, and existing bookings.
  useEffect(() => {
    if (!selectedDate || selectedServices.length === 0) {
      setSlots([]);
      setSelectedTime('');
      return;
    }
    let cancelled = false;
    const fetchSlots = async () => {
      try {
        setSlotsLoading(true);
        const data = await getAvailableSlots(selectedDate, selectedServices);
        if (!cancelled) {
          setSlots(data || []);
          setSelectedTime('');
        }
      } catch (err) {
        if (!cancelled) {
          setSlots([]);
          setSubmitError(friendlyError(err, 'שגיאה בטעינת השעות הפנויות.'));
        }
        console.error('Error fetching slots:', err);
      } finally {
        if (!cancelled) setSlotsLoading(false);
      }
    };
    fetchSlots();
    return () => {
      cancelled = true;
    };
  }, [selectedDate, selectedServices]);

  const toggleService = (id) => {
    setSelectedServices((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
  };

  const handleBooking = async (e) => {
    e.preventDefault();
    setSubmitError(null);

    if (!PHONE_PATTERN.test(phone.trim())) {
      setSubmitError('מספר הטלפון אינו תקין.');
      return;
    }

    setIsSubmitting(true);
    try {
      const booking = await bookAppointment({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone: phone.trim(),
        visitDate: selectedDate,
        startTime: selectedTime,
        serviceIds: selectedServices,
      });

      navigate('/book/success', {
        state: {
          booking,
          serviceNames: serviceTypes
            .filter((s) => selectedServices.includes(s.id))
            .map((s) => s.name),
        },
      });
    } catch (err) {
      console.error(err);
      setSubmitError(friendlyError(err, 'שגיאת תקשורת, יש לנסות שוב.'));
      // The chosen slot may be gone — refresh the list
      if ((err?.message || '').includes('SLOT_TAKEN')) {
        setSelectedTime('');
        try {
          setSlots((await getAvailableSlots(selectedDate, selectedServices)) || []);
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

  return (
    <PageContainer size="md" className="booking-page">
      <div className="booking-header">
        <h1>הזמנת תור חדש</h1>
        <p className="subtitle">יש לבחור את הטיפולים לשילוב בביקור הקרוב.</p>
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
                    <div className="service-info">
                      <h3>{service.name}</h3>
                      <div className="service-meta">
                        <span className="price">₪{service.base_price}</span>
                        <span className="duration">
                          <Clock size={13} /> {formatDuration(service.default_duration)}
                        </span>
                      </div>
                    </div>
                    <div className="check-icon">
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
                    min={todayString()}
                    max={addDaysString(60)}
                  />
                </div>
              </div>
              {selectedDate && (
                <div className="slots-area fade-in" role="group" aria-label="שעות פנויות">
                  <span className="slots-label">שעות פנויות</span>
                  {slotsLoading ? (
                    <LoadingSpinner text="בודק זמינות..." inline={true} />
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
                          {toTimeDisplay(slot.slot_start)}
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

        <div className="booking-summary">
          <div className="summary-details">
            <span><Clock size={16} /> זמן מוערך: <strong>{formatDuration(time)}</strong></span>
            <span>סך הכל: <strong>₪{total}</strong></span>
            {selectedDate && selectedTime && (
              <span className="summary-when">
                <CalendarIcon size={16} /> {formatHebrewDate(selectedDate)}, {toTimeDisplay(selectedTime)}
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
