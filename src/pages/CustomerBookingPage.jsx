import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Check, Clock, Calendar as CalendarIcon, User, Scissors } from 'lucide-react';
import PageContainer from '../components/PageContainer/PageContainer';
import EmptyState from '../components/EmptyState/EmptyState';
import './CustomerBookingPage.css';

const CustomerBookingPage = () => {
  const navigate = useNavigate();
  const { businessId } = useParams();
  const [serviceTypes, setServiceTypes] = useState([]);
  const [selectedServices, setSelectedServices] = useState([]);
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTime, setSelectedTime] = useState('');
  
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const fetchServices = async () => {
      try {
        setLoading(true);
        const { data, error } = await supabase.from('service_types').select('*');
        if (error) throw error;
        setServiceTypes(data || []);
      } catch (err) {
        setError("שגיאה בטעינת השירותים. דיווח נשלח, יש לנסות מאוחר יותר.");
        console.error("Error fetching services:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchServices();
  }, []);

  const toggleService = (id) => {
    setSelectedServices(prev => 
      prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]
    );
  };

  const handleBooking = async (e) => {
    e.preventDefault();
    if (selectedServices.length === 0 || !selectedDate || !selectedTime || !firstName || !lastName || !phone) {
      alert("נא למלא את כל השדות ולבחור שירותים, תאריך ושעה");
      return;
    }
    
    setIsSubmitting(true);
    try {
      // 1. Create or get Customer
      let customerId;
      const { data: existingCustomer } = await supabase
        .from('customers')
        .select('id')
        .eq('phone', phone)
        .maybeSingle();
        
      if (existingCustomer) {
        customerId = existingCustomer.id;
      } else {
        const { data: newCustomer, error: customerError } = await supabase
          .from('customers')
          .insert({ first_name: firstName, last_name: lastName, phone })
          .select()
          .single();
        if (customerError) throw customerError;
        customerId = newCustomer.id;
      }

      // 2. Create Appointment
      const { total } = calculateTotal();
      const { data: appointment, error: aptError } = await supabase
        .from('appointments')
        .insert({
          customer_id: customerId,
          visit_date: selectedDate,
          total_price: total
        })
        .select()
        .single();
      if (aptError) throw aptError;

      // 3. Auto Assign Logic & Create Items
      // For simplicity in this demo, we'll try to find any available employee for the date.
      // A full algorithm would check exact times, skills, and existing bookings.
      const { data: availabilities } = await supabase
        .from('availabilities')
        .select('user_id, start_time, end_time')
        .eq('available_date', selectedDate);
        
      let currentStartTime = selectedTime;
      const appointmentItems = [];
      
      for (const serviceId of selectedServices) {
        const service = serviceTypes.find(s => s.id === serviceId);
        if (!service) continue;
        
        // Calculate end time
        const [hours, minutes] = currentStartTime.split(':').map(Number);
        const totalMinutes = hours * 60 + minutes + (service.default_duration || 30);
        const endHours = Math.floor(totalMinutes / 60).toString().padStart(2, '0');
        const endMinutes = (totalMinutes % 60).toString().padStart(2, '0');
        const currentEndTime = `${endHours}:${endMinutes}`;
        
        // Auto assign: find first employee who is available during this window
        // (basic check: availability start <= start_time and availability end >= end_time)
        let assignedUserId = null;
        if (availabilities && availabilities.length > 0) {
          const availableEmp = availabilities.find(a => 
            a.start_time.substring(0, 5) <= currentStartTime && 
            a.end_time.substring(0, 5) >= currentEndTime
          );
          if (availableEmp) {
            assignedUserId = availableEmp.user_id;
          }
        }
        
        appointmentItems.push({
          appointment_id: appointment.id,
          service_type_id: serviceId,
          user_id: assignedUserId,
          start_time: currentStartTime,
          end_time: currentEndTime
        });
        
        currentStartTime = currentEndTime; // Next service starts when this one ends
      }
      
      const { error: itemsError } = await supabase
        .from('appointment_items')
        .insert(appointmentItems);
        
      if (itemsError) throw itemsError;

      navigate(`/book/${businessId || 1}/success`);
    } catch (err) {
      console.error(err);
      alert("שגיאת תקשורת, יש לנסות שוב");
    } finally {
      setIsSubmitting(false);
    }
  };

  const calculateTotal = () => {
    let total = 0;
    let time = 0;
    selectedServices.forEach(id => {
      const s = serviceTypes.find(srv => srv.id === id);
      if (s) {
        total += s.base_price;
        // DRY: Use the actual default_duration from DB instead of hardcoding
        time += s.default_duration || 30;
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
            <h2><Scissors size={20}/> בחירת שירותים</h2>
            
            {loading && <div className="loading-state">טוען שירותים...</div>}
            {error && <div className="error-state">{error}</div>}
            {!loading && !error && serviceTypes.length === 0 && (
              <EmptyState text="לא נמצאו שירותים זמינים כרגע." />
            )}
            
            {!loading && !error && serviceTypes.length > 0 && (
              <div className="services-grid">
                {serviceTypes.map(service => (
                <div 
                  key={service.id} 
                  className={`service-card ${selectedServices.includes(service.id) ? 'selected' : ''}`}
                  onClick={() => toggleService(service.id)}
                >
                  <div className="service-info">
                    <h3>{service.name}</h3>
                    <span className="price">₪{service.base_price}</span>
                  </div>
                  <div className="check-icon">
                    {selectedServices.includes(service.id) && <Check size={20} />}
                  </div>
                </div>
              ))}
            </div>
            )}
          </section>

          {selectedServices.length > 0 && (
            <>
              <section className="form-section fade-in">
                <h2><CalendarIcon size={20}/> תאריך ושעה</h2>
                <div className="datetime-selection">
                  <div className="input-group">
                    <label htmlFor="visitDate">תאריך הביקור</label>
                    <input 
                      id="visitDate"
                      type="date" 
                      value={selectedDate} 
                      onChange={e => setSelectedDate(e.target.value)} 
                      min={new Date().toISOString().split('T')[0]}
                    />
                  </div>
                  {selectedDate && (
                    <div className="input-group fade-in">
                      <label htmlFor="visitTime">זמן פנוי למסלול הטיפולים</label>
                      <select id="visitTime" value={selectedTime} onChange={e => setSelectedTime(e.target.value)}>
                        <option value="">יש לבחור שעה פנויה</option>
                        <option value="09:00">09:00</option>
                        <option value="10:00">10:00</option>
                        <option value="11:30">11:30</option>
                        <option value="12:30">12:30</option>
                        <option value="14:00">14:00</option>
                        <option value="15:30">15:30</option>
                      </select>
                    </div>
                  )}
                </div>
              </section>
              
              <section className="form-section fade-in">
                <h2><User size={20}/> פרטים אישיים</h2>
                <div className="customer-details">
                  <div className="input-group">
                    <label htmlFor="firstName">שם פרטי</label>
                    <input 
                      id="firstName"
                      type="text" 
                      value={firstName} 
                      onChange={e => setFirstName(e.target.value)} 
                    />
                  </div>
                  <div className="input-group">
                    <label htmlFor="lastName">שם משפחה</label>
                    <input 
                      id="lastName"
                      type="text" 
                      value={lastName} 
                      onChange={e => setLastName(e.target.value)} 
                    />
                  </div>
                  <div className="input-group">
                    <label htmlFor="phone">טלפון</label>
                    <input 
                      id="phone"
                      type="tel" 
                      value={phone} 
                      onChange={e => setPhone(e.target.value)} 
                    />
                  </div>
                </div>
              </section>
            </>
          )}

          <div className="booking-summary">
            <div className="summary-details">
              <span><Clock size={16}/> זמן מוערך: <strong>{time} דקות</strong></span>
              <span>סך הכל: <strong>₪{total}</strong></span>
            </div>
              <button 
              type="submit" 
              className="submit-btn" 
              disabled={isSubmitting || selectedServices.length === 0 || !selectedDate || !selectedTime || !firstName || !lastName || !phone}
            >
              {isSubmitting ? 'מעבד...' : 'אישור הזמנה'}
            </button>
          </div>
        </form>
    </PageContainer>
  );
};

export default CustomerBookingPage;
