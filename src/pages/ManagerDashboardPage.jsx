import { useCallback } from 'react';
import { Users, Calendar, Clock, ArrowLeft, XCircle } from 'lucide-react';
import { getDashboardData, cancelAppointment } from '../lib/api';
import { useAsyncData } from '../hooks/useAsyncData';
import { useAction } from '../hooks/useAction';
import { todayString, addDaysString, toTimeDisplay, formatHebrewDate } from '../lib/dates';
import PageContainer from '../components/PageContainer/PageContainer';
import Alert from '../components/Alert/Alert';
import LoadingSpinner from '../components/LoadingSpinner/LoadingSpinner';
import EmptyState from '../components/EmptyState/EmptyState';
import './ManagerDashboardPage.css';

const STATUS_LABELS = {
  Pending: 'ממתין לשיבוץ',
  Confirmed: 'מאושר',
  Completed: 'הושלם',
};

const ManagerDashboardPage = () => {
  // Cancelled appointments are filtered out in the query
  const fetchDashboard = useCallback(
    async () => (await getDashboardData(todayString(), addDaysString(6))).appointments || [],
    []
  );
  const { data, setData, loading, error, refetch } = useAsyncData(fetchDashboard, {
    errorMessage: 'שגיאה בטעינת נתוני הדאשבורד.',
  });
  // A failed cancel usually means the list is stale — refetch on error.
  const { busyKey: cancellingId, message, run } = useAction({ onError: refetch });

  const appointments = data ?? [];

  const handleCancel = async (apt) => {
    const customerName = `${apt.customers?.first_name || ''} ${apt.customers?.last_name || ''}`.trim();
    const confirmed = window.confirm(
      `לבטל את התור של ${customerName || 'הלקוח/ה'} ב-${formatHebrewDate(apt.visit_date)}? השעות ישוחררו להזמנות חדשות.`
    );
    if (!confirmed) return;

    // cancel_appointment RPC: status + item soft-delete in one transaction,
    // so the booked span is actually freed for new bookings.
    const { ok } = await run(apt.id, () => cancelAppointment(apt.id), {
      success: 'התור בוטל והשעות שוחררו.',
      errorFallback: 'שגיאה בביטול התור.',
    });
    if (ok) setData((prev) => prev.filter((a) => a.id !== apt.id));
  };

  if (loading) return (
    <PageContainer size="lg" className="dashboard-page">
      <LoadingSpinner text="טוען נתונים..." fullScreen={true} />
    </PageContainer>
  );
  if (error) return <PageContainer size="lg" className="dashboard-page"><p className="error-text">{error}</p></PageContainer>;

  const todayStr = todayString();
  const todayAppointments = appointments.filter((a) => a.visit_date === todayStr);
  const futureAppointments = appointments.filter((a) => a.visit_date !== todayStr);

  const todayItemsCount = todayAppointments.reduce(
    (acc, apt) => acc + (apt.appointment_items?.length || 0), 0
  );

  // Unique employees working today (by id, not first name)
  const activeEmployees = new Set();
  let unassignedToday = 0;
  todayAppointments.forEach((apt) => {
    apt.appointment_items?.forEach((item) => {
      if (item.user_id) activeEmployees.add(item.user_id);
      else unassignedToday += 1;
    });
  });

  return (
    <PageContainer size="lg" className="dashboard-page">
      <header className="dashboard-header">
        <h1>דאשבורד מנהל - תמונת מצב יומית</h1>
        <p className="date-display">{formatHebrewDate(todayStr)}</p>
      </header>

      <Alert type={message?.type}>{message?.text}</Alert>

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
            <h3>טיפולים היום</h3>
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
        <div className={`stat-card ${unassignedToday > 0 ? 'alert-card' : ''}`}>
          <div className="stat-icon"><Users /></div>
          <div className="stat-content">
            <h3>ממתינים לשיבוץ</h3>
            <p className="stat-number">{unassignedToday}</p>
          </div>
        </div>
      </div>

      <section className="timeline-section">
        <h2>פירוט טיפולים משורשרים להיום</h2>
        {todayAppointments.length === 0 ? (
          <EmptyState text="אין תורים שנקבעו להיום." />
        ) : (
          <div className="appointments-list">
            {todayAppointments.map((apt) => {
              const items = [...(apt.appointment_items || [])].sort((a, b) =>
                a.start_time.localeCompare(b.start_time)
              );
              return (
                <div key={apt.id} className="appointment-card">
                  <div className="apt-header">
                    <h3>לקוח/ה: {apt.customers?.first_name} {apt.customers?.last_name}</h3>
                    <div className="apt-header-actions">
                      <span className={`status-badge ${(apt.status || 'Pending').toLowerCase()}`}>
                        {STATUS_LABELS[apt.status] || apt.status}
                      </span>
                      <button
                        type="button"
                        className="cancel-apt-btn"
                        onClick={() => handleCancel(apt)}
                        disabled={cancellingId !== null}
                        aria-label={`ביטול התור של ${apt.customers?.first_name || ''}`}
                      >
                        <XCircle size={16} />
                        {cancellingId === apt.id ? 'מבטל...' : 'ביטול תור'}
                      </button>
                    </div>
                  </div>

                  <div className="timeline-chain">
                    {items.map((item, index) => (
                      <div key={item.id} className="timeline-item">
                        <div className="time-block">
                          {toTimeDisplay(item.start_time)} - {toTimeDisplay(item.end_time)}
                        </div>
                        <div className="details-block">
                          <strong>{item.service_types?.name}</strong>
                          <span>
                            {item.users?.first_name
                              ? `ע"י ${item.users.first_name}`
                              : 'טרם שובץ'}
                          </span>
                        </div>
                        {index < items.length - 1 && (
                          <ArrowLeft className="chain-arrow" />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {futureAppointments.length > 0 && (
        <section className="timeline-section future-section">
          <h2>הימים הקרובים</h2>
          <div className="appointments-list compact">
            {futureAppointments.map((apt) => (
              <div key={apt.id} className="appointment-card compact-card">
                <div className="apt-header">
                  <h3>
                    {formatHebrewDate(apt.visit_date)} | {apt.customers?.first_name}{' '}
                    {apt.customers?.last_name}
                  </h3>
                  <div className="apt-header-actions">
                    <span className="compact-details">{apt.appointment_items?.length || 0} טיפולים</span>
                    <button
                      type="button"
                      className="cancel-apt-btn"
                      onClick={() => handleCancel(apt)}
                      disabled={cancellingId !== null}
                      aria-label={`ביטול התור של ${apt.customers?.first_name || ''}`}
                    >
                      <XCircle size={16} />
                      {cancellingId === apt.id ? 'מבטל...' : 'ביטול'}
                    </button>
                  </div>
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
