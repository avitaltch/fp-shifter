import { useState, useEffect } from 'react';
import { Calendar, Clock, CheckCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import PageContainer from '../components/PageContainer/PageContainer';
import LoadingSpinner from '../components/LoadingSpinner/LoadingSpinner';
import './EmployeeAvailabilityPage.css';

const EmployeeAvailabilityPage = () => {
  const [selectedDate, setSelectedDate] = useState('');
  const [startTime, setStartTime] = useState('08:00');
  const [endTime, setEndTime] = useState('16:00');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [session, setSession] = useState(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedDate) {
      alert("יש לבחור תאריך");
      return;
    }
    if (!session) {
      alert("יש להתחבר כדי להזין זמינות");
      return;
    }

    setIsSubmitting(true);
    try {
      const { error } = await supabase.from('availabilities').insert({
        user_id: session.user.id,
        available_date: selectedDate,
        start_time: startTime,
        end_time: endTime
      });

      if (error) throw error;
      
      alert(`זמינות נשמרה בהצלחה לתאריך ${selectedDate} בין השעות ${startTime}-${endTime}`);
      setSelectedDate('');
    } catch (err) {
      console.error(err);
      alert("שגיאה בשמירת הזמינות. יש לנסות שוב.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <PageContainer size="sm" className="availability-page">
      <header className="page-header">
          <CheckCircle size={32} className="header-icon" />
          <h1>הזנת זמינות - אזור אישי</h1>
          <p>כאן ניתן לעדכן את צוות הניהול לגבי זמינות לקבלת לקוחות.</p>
        </header>

        <form onSubmit={handleSubmit} className="availability-form">
          <div className="input-group">
            <label htmlFor="date-input"><Calendar size={18} /> תאריך</label>
            <input 
              id="date-input"
              type="date" 
              value={selectedDate} 
              onChange={e => setSelectedDate(e.target.value)} 
              min={new Date().toISOString().split('T')[0]}
            />
          </div>

          <div className="time-inputs">
            <div className="input-group">
              <label><Clock size={18} /> משעה</label>
              <select value={startTime} onChange={e => setStartTime(e.target.value)}>
                <option value="08:00">08:00</option>
                <option value="09:00">09:00</option>
                <option value="10:00">10:00</option>
                <option value="12:00">12:00</option>
                <option value="14:00">14:00</option>
              </select>
            </div>
            
            <div className="input-group">
              <label><Clock size={18} /> עד שעה</label>
              <select value={endTime} onChange={e => setEndTime(e.target.value)}>
                <option value="14:00">14:00</option>
                <option value="16:00">16:00</option>
                <option value="18:00">18:00</option>
                <option value="20:00">20:00</option>
              </select>
            </div>
          </div>

          <button type="submit" className="submit-btn" disabled={isSubmitting || !selectedDate}>
            {isSubmitting ? <LoadingSpinner text="מעדכן..." inline={true} /> : (
              <>
                <CheckCircle size={18} />
                שמור זמינות
              </>
            )}
          </button>
        </form>
    </PageContainer>
  );
};

export default EmployeeAvailabilityPage;
