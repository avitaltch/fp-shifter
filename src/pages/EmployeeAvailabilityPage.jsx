import { useState } from 'react';
import { Calendar, Clock, CheckCircle } from 'lucide-react';
import './EmployeeAvailabilityPage.css';

const EmployeeAvailabilityPage = () => {
  const [selectedDate, setSelectedDate] = useState('');
  const [startTime, setStartTime] = useState('08:00');
  const [endTime, setEndTime] = useState('16:00');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!selectedDate) {
      alert("יש לבחור תאריך");
      return;
    }
    alert(`זמינות נשמרה בהצלחה לתאריך ${selectedDate} בין השעות ${startTime}-${endTime}`);
    setSelectedDate('');
  };

  return (
    <div className="availability-page fade-in">
      <div className="availability-container">
        <header className="page-header">
          <CheckCircle size={32} className="header-icon" />
          <h1>הזנת זמינות - אזור אישי</h1>
          <p>כאן תוכלי לעדכן את המנהלת מתי את פנויה לקבל לקוחות.</p>
        </header>

        <form onSubmit={handleSubmit} className="availability-form">
          <div className="input-group">
            <label><Calendar size={18} /> תאריך</label>
            <input 
              type="date" 
              value={selectedDate} 
              onChange={e => setSelectedDate(e.target.value)} 
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

          <button type="submit" className="submit-btn">
            שמירת זמינות
          </button>
        </form>
      </div>
    </div>
  );
};

export default EmployeeAvailabilityPage;
