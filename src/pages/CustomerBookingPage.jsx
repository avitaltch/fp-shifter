import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Check, Clock, Calendar as CalendarIcon, User, Scissors } from 'lucide-react';
import './CustomerBookingPage.css';

const CustomerBookingPage = () => {
  const navigate = useNavigate();
  const [serviceTypes, setServiceTypes] = useState([]);
  const [selectedServices, setSelectedServices] = useState([]);
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTime, setSelectedTime] = useState('');

  useEffect(() => {
    const fetchServices = async () => {
      const { data, error } = await supabase.from('service_types').select('*');
      if (data) setServiceTypes(data);
      if (error) console.error("Error fetching services:", error);
    };
    fetchServices();
  }, []);

  const toggleService = (id) => {
    setSelectedServices(prev => 
      prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]
    );
  };

  const handleBooking = (e) => {
    e.preventDefault();
    if (selectedServices.length === 0 || !selectedDate || !selectedTime) {
      alert("נא לבחור שירותים, תאריך ושעה");
      return;
    }
    navigate('/booking/success');
  };

  const calculateTotal = () => {
    let total = 0;
    let time = 0;
    selectedServices.forEach(id => {
      const s = serviceTypes.find(srv => srv.id === id);
      if (s) {
        total += s.base_price;
        // Mock default duration for display
        time += s.id === 's1' ? 45 : (s.id === 's2' ? 120 : (s.id === 's3' ? 60 : 20));
      }
    });
    return { total, time };
  };

  const { total, time } = calculateTotal();

  return (
    <div className="booking-page fade-in">
      <div className="booking-container">
        <h1>הזמנת תור חדש</h1>
        <p className="subtitle">בחרי את הטיפולים שתרצי לשלב בביקור הקרוב שלך.</p>
        
        <form onSubmit={handleBooking} className="booking-form">
          <section className="form-section">
            <h2><Scissors size={20}/> בחירת שירותים</h2>
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
          </section>

          {selectedServices.length > 0 && (
            <section className="form-section fade-in">
              <h2><CalendarIcon size={20}/> תאריך ושעה</h2>
              <div className="datetime-selection">
                <div className="input-group">
                  <label>תאריך הביקור</label>
                  <input 
                    type="date" 
                    value={selectedDate} 
                    onChange={e => setSelectedDate(e.target.value)} 
                    min={new Date().toISOString().split('T')[0]}
                  />
                </div>
                {selectedDate && (
                  <div className="input-group fade-in">
                    <label>זמן פנוי למסלול הטיפולים</label>
                    <select value={selectedTime} onChange={e => setSelectedTime(e.target.value)}>
                      <option value="">בחרי שעה פנויה</option>
                      <option value="10:00">10:00</option>
                      <option value="12:30">12:30</option>
                      <option value="14:00">14:00</option>
                    </select>
                  </div>
                )}
              </div>
            </section>
          )}

          <div className="booking-summary">
            <div className="summary-details">
              <span><Clock size={16}/> זמן מוערך: <strong>{time} דקות</strong></span>
              <span>סך הכל: <strong>₪{total}</strong></span>
            </div>
            <button type="submit" className="submit-btn" disabled={selectedServices.length === 0 || !selectedDate || !selectedTime}>
              אשרי הזמנה
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CustomerBookingPage;
