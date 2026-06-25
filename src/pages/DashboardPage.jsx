import { Users, AlertCircle, CheckCircle2 } from 'lucide-react';
import './DashboardPage.css';

const DashboardPage = () => {
  const stats = [
    { label: 'עובדים במשמרת היום', value: 12, icon: <Users /> },
    { label: 'משמרות חסרות', value: 2, icon: <AlertCircle />, type: 'danger' },
    { label: 'משמרות מאוישות', value: 34, icon: <CheckCircle2 />, type: 'success' },
  ];

  const upcomingShifts = [
    { id: 1, role: 'מלצר אחראי', time: '16:00 - 00:00', status: 'missing', employee: 'חסר עובד' },
    { id: 2, role: 'ברמן', time: '18:00 - 02:00', status: 'staffed', employee: 'דניאל כהן' },
    { id: 3, role: 'מארחת', time: '19:00 - 23:00', status: 'staffed', employee: 'נועה לוי' },
  ];

  return (
    <div className="dashboard-page container">
      <header className="page-header">
        <h1>לוח בקרה</h1>
        <p>מבט כללי על מצב המשמרות לשבוע הקרוב</p>
      </header>

      <section className="stats-grid">
        {stats.map((stat, idx) => (
          <div key={idx} className={`card stat-card ${stat.type ? `stat-${stat.type}` : ''}`}>
            <div className="stat-icon">{stat.icon}</div>
            <div className="stat-content">
              <span className="stat-value">{stat.value}</span>
              <span className="stat-label">{stat.label}</span>
            </div>
          </div>
        ))}
      </section>

      <section className="dashboard-content">
        <div className="card upcoming-shifts">
          <div className="card-header">
            <h2>משמרות קרובות</h2>
            <button className="btn-secondary btn-sm">הצג הכל</button>
          </div>
          <div className="shifts-list">
            {upcomingShifts.map(shift => (
              <div key={shift.id} className="shift-item">
                <div className="shift-info">
                  <span className="shift-role">{shift.role}</span>
                  <span className="shift-time">{shift.time}</span>
                </div>
                <div className="shift-status">
                  <span className={`status-badge ${shift.status === 'missing' ? 'badge-danger' : 'badge-success'}`}>
                    {shift.status === 'missing' ? <AlertCircle size={16}/> : <CheckCircle2 size={16}/>}
                    {shift.employee}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
};

export default DashboardPage;
