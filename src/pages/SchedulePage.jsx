import { UserPlus } from 'lucide-react';
import { weeklySchedule, scheduleDays } from '../data/mockData';
import './SchedulePage.css';

const ShiftCard = ({ shift }) => (
  <div className={`shift-card ${shift.missing ? 'shift-missing' : ''}`}>
    <div className="shift-card-header">
      <span className="shift-role">{shift.role}</span>
      <span className="shift-time">{shift.time}</span>
    </div>
    <div className="shift-employee">
      {shift.employee}
    </div>
  </div>
);

const DayColumn = ({ day, shifts }) => (
  <div className="day-column">
    <h3 className="day-title">{day}</h3>
    <div className="day-shifts">
      {shifts && shifts.length > 0 ? (
        shifts.map(shift => <ShiftCard key={shift.id} shift={shift} />)
      ) : (
        <div className="empty-day">אין משמרות</div>
      )}
    </div>
  </div>
);

const SchedulePage = () => {
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
        {scheduleDays.map(day => (
          <DayColumn key={day} day={day} shifts={weeklySchedule[day]} />
        ))}
      </div>
    </div>
  );
};

export default SchedulePage;
