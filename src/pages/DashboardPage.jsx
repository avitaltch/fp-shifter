import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { dashboardStats, upcomingShifts } from '../data/mockData';
import './DashboardPage.css';

const StatCard = ({ stat }) => (
  <div className={`card stat-card ${stat.type ? `stat-${stat.type}` : ''}`}>
    <div className="stat-icon">{stat.icon}</div>
    <div className="stat-content">
      <span className="stat-value">{stat.value}</span>
      <span className="stat-label">{stat.label}</span>
    </div>
  </div>
);

const UpcomingShift = ({ shift }) => (
  <div className="shift-item">
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
);

const DashboardPage = () => {
  return (
    <div className="dashboard-page container">
      <header className="page-header">
        <h1>לוח בקרה</h1>
        <p>מבט כללי על מצב המשמרות לשבוע הקרוב</p>
      </header>

      <section className="stats-grid">
        {dashboardStats.map((stat, idx) => (
          <StatCard key={idx} stat={stat} />
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
              <UpcomingShift key={shift.id} shift={shift} />
            ))}
          </div>
        </div>
      </section>
    </div>
  );
};

export default DashboardPage;
