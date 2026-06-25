import { Calendar, UserPlus } from 'lucide-react';
import './SchedulePage.css';

const SchedulePage = () => {
  const days = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
  
  // Dummy data for a weekly schedule
  const schedule = {
    'ראשון': [
      { id: 1, role: 'בוקר', time: '08:00 - 16:00', employee: 'דנה ר.' },
      { id: 2, role: 'ערב', time: '16:00 - 00:00', employee: 'אבי כ.' },
    ],
    'שני': [
      { id: 3, role: 'בוקר', time: '08:00 - 16:00', employee: 'רועי ל.' },
      { id: 4, role: 'ערב', time: '16:00 - 00:00', employee: 'פנוי', missing: true },
    ],
    'שלישי': [
      { id: 5, role: 'בוקר', time: '08:00 - 16:00', employee: 'שירה א.' },
    ],
  };

  return (
    <div className="schedule-page container">
      <header className="page-header schedule-header">
        <div>
          <h1>סידור עבודה</h1>
          <p>שבוע נוכחי: 14 - 20 באוקטובר</p>
        </div>
        <button className="btn-primary flex-btn">
          <UserPlus size={18} />
          הוסף משמרת
        </button>
      </header>

      <div className="schedule-grid">
        {days.map(day => (
          <div key={day} className="day-column">
            <h3 className="day-title">{day}</h3>
            <div className="day-shifts">
              {schedule[day] ? (
                schedule[day].map(shift => (
                  <div key={shift.id} className={`shift-card ${shift.missing ? 'shift-missing' : ''}`}>
                    <div className="shift-card-header">
                      <span className="shift-role">{shift.role}</span>
                      <span className="shift-time">{shift.time}</span>
                    </div>
                    <div className="shift-employee">
                      {shift.employee}
                    </div>
                  </div>
                ))
              ) : (
                <div className="empty-day">אין משמרות</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default SchedulePage;
