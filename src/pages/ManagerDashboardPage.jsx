import { useState, useEffect } from 'react';
import { Users, Calendar, Clock, ArrowLeft } from 'lucide-react';
import { supabase } from '../lib/supabase';
import PageContainer from '../components/PageContainer/PageContainer';
import EmptyState from '../components/EmptyState/EmptyState';
import './ManagerDashboardPage.css';

const ManagerDashboardPage = () => {
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        setLoading(true);
        const today = new Date();
        const todayStr = today.toISOString().split('T')[0];
        
        const endOfWeek = new Date(today);
        endOfWeek.setDate(today.getDate() + 6);
        const endOfWeekStr = endOfWeek.toISOString().split('T')[0];

        const { data, error } = await supabase
          .from('appointments')
          .select(`
            id, visit_date, status, total_price,
            customers (first_name, last_name),
            appointment_items (
              id, start_time, end_time, status,
              service_types (name),
              users (first_name, last_name)
            )
          `)
          .gte('visit_date', todayStr)
          .lte('visit_date', endOfWeekStr)
          .order('visit_date', { ascending: true });

        if (error) throw error;
        setAppointments(data || []);
      } catch (err) {
        console.error(err);
        setError("שגיאה בטעינת נתוני הדאשבורד.");
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, []);

  if (loading) return <PageContainer size="lg" className="dashboard-page"><p>טוען נתונים...</p></PageContainer>;
  if (error) return <PageContainer size="lg" className="dashboard-page"><p className="error-text">{error}</p></PageContainer>;

  const todayStr = new Date().toISOString().split('T')[0];
  const todayAppointments = appointments.filter(a => a.visit_date === todayStr);
  const futureAppointments = appointments.filter(a => a.visit_date !== todayStr);

  const todayItemsCount = todayAppointments.reduce((acc, apt) => acc + (apt.appointment_items?.length || 0), 0);
  
  // Calculate unique employees working today
  const activeEmployees = new Set();
  todayAppointments.forEach(apt => {
    apt.appointment_items?.forEach(item => {
      if (item.users?.first_name) {
        activeEmployees.add(item.users.first_name);
      }
    });
  });

  return (
    <PageContainer size="lg" className="dashboard-page">
      <header className="dashboard-header">
        <h1>דאשבורד מנהל - תמונת מצב יומית</h1>
        <p className="date-display">{new Date().toLocaleDateString('he-IL', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
      </header>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon"><Calendar /></div>
          <div className="stat-content">
            <h3>ביקורים היום</h3>
            <p className="stat-number">{todayAppointments.length}</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon"><Clock /></div>
          <div className="stat-content">
            <h3>תתי-טיפולים</h3>
            <p className="stat-number">{todayItemsCount}</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon"><Users /></div>
          <div className="stat-content">
            <h3>עובדים במשמרת</h3>
            <p className="stat-number">{activeEmployees.size}</p>
          </div>
        </div>
      </div>

      <section className="timeline-section">
        <h2>פירוט טיפולים משורשרים להיום</h2>
        {todayAppointments.length === 0 ? (
          <EmptyState text="אין תורים שנקבעו להיום." />
        ) : (
          <div className="appointments-list">
            {todayAppointments.map(apt => (
              <div key={apt.id} className="appointment-card">
                <div className="apt-header">
                  <h3>לקוח/ה: {apt.customers?.first_name} {apt.customers?.last_name}</h3>
                  <span className={`status-badge ${apt.status.toLowerCase()}`}>{apt.status}</span>
                </div>
                
                <div className="timeline-chain">
                  {apt.appointment_items?.sort((a,b) => a.start_time.localeCompare(b.start_time)).map((item, index) => (
                    <div key={item.id} className="timeline-item">
                      <div className="time-block">
                        {item.start_time.substring(0, 5)} - {item.end_time.substring(0, 5)}
                      </div>
                      <div className="details-block">
                        <strong>{item.service_types?.name}</strong>
                        <span>ע"י {item.users?.first_name}</span>
                      </div>
                      {index < apt.appointment_items.length - 1 && (
                        <ArrowLeft className="chain-arrow" />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {futureAppointments.length > 0 && (
        <section className="timeline-section future-section">
          <h2>המשך השבוע</h2>
          <div className="appointments-list compact">
            {futureAppointments.map(apt => (
              <div key={apt.id} className="appointment-card compact-card">
                <div className="apt-header">
                  <h3>{new Date(apt.visit_date).toLocaleDateString('he-IL', { weekday: 'short', day: 'numeric', month: 'numeric' })} | {apt.customers?.first_name} {apt.customers?.last_name}</h3>
                  <span className="compact-details">{apt.appointment_items?.length || 0} טיפולים</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </PageContainer>
  );
};

export default ManagerDashboardPage;
