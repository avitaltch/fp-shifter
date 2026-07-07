import { Users, Calendar, Clock, ArrowLeft } from 'lucide-react';
import { appointments, appointmentItems, users, serviceTypes } from '../data/mockData';
import './ManagerDashboardPage.css';

const ManagerDashboardPage = () => {
  return (
    <div className="dashboard-page fade-in">
      <header className="dashboard-header">
        <h1>דאשבורד מנהל - תמונת מצב יומית</h1>
        <p className="date-display">15 באוקטובר 2023</p>
      </header>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon"><Calendar /></div>
          <div className="stat-content">
            <h3>ביקורים היום</h3>
            <p className="stat-number">{appointments.length}</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon"><Clock /></div>
          <div className="stat-content">
            <h3>תתי-טיפולים</h3>
            <p className="stat-number">{appointmentItems.length}</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon"><Users /></div>
          <div className="stat-content">
            <h3>עובדים במשמרת</h3>
            <p className="stat-number">2</p>
          </div>
        </div>
      </div>

      <section className="timeline-section">
        <h2>פירוט טיפולים משורשרים להיום</h2>
        <div className="appointments-list">
          {appointments.map(apt => (
            <div key={apt.id} className="appointment-card">
              <div className="apt-header">
                <h3>לקוחה: נועה לוי</h3>
                <span className={`status-badge ${apt.status.toLowerCase()}`}>{apt.status}</span>
              </div>
              
              <div className="timeline-chain">
                {appointmentItems.filter(item => item.appointment_id === apt.id).map((item, index) => {
                  const service = serviceTypes.find(s => s.id === item.service_type_id);
                  const employee = users.find(u => u.id === item.user_id);
                  return (
                    <div key={item.id} className="timeline-item">
                      <div className="time-block">
                        {item.start_time} - {item.end_time}
                      </div>
                      <div className="details-block">
                        <strong>{service?.name}</strong>
                        <span>ע"י {employee?.first_name}</span>
                      </div>
                      {index < appointmentItems.length - 1 && (
                        <ArrowLeft className="chain-arrow" />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};

export default ManagerDashboardPage;
