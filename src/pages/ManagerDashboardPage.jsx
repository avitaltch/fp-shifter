import { useCallback } from 'react';
import { Users, Calendar, Clock, ArrowLeft, XCircle, Phone, UserX } from 'lucide-react';
import { getDashboardData, cancelAppointment, unassignShift } from '../lib/api';
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
  // A failed cancel/unassign usually means the list is stale — refetch on error.
  const { busyKey, message, run } = useAction({ onError: refetch });

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

  const handleUnassign = async (apt, item) => {
    const employeeName = item.users?.first_name || 'העובד/ת';
    const confirmed = window.confirm(
      `לבטל את השיבוץ של ${employeeName} לטיפול "${item.service_types?.name || ''}"? הטיפול יחזור לרשימת הממתינים לשיבוץ.`
    );
    if (!confirmed) return;

    // unassign_shift RPC: admin-only, blocks past items server-side.
    const { ok } = await run(`unassign:${item.id}`, () => unassignShift(item.id), {
      success: 'השיבוץ בוטל והטיפול ממתין לשיבוץ מחדש.',
      errorFallback: 'שגיאה בביטול השיבוץ.',
    });
    if (ok) {
      setData((prev) =>
        prev.map((a) =>
          a.id === apt.id
            ? {
                ...a,
                appointment_items: a.appointment_items.map((i) =>
                  i.id === item.id ? { ...i, user_id: null, users: null } : i
                ),
              }
            : a
        )
      );
    }
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
                    <div className="apt-customer">
                      <h3>לקוח/ה: {apt.customers?.first_name} {apt.customers?.last_name}</h3>
                      {apt.customers?.phone && (
                        <a className="customer-phone" href={`tel:${apt.customers.phone}`}>
                          <Phone size={14} />
                          {apt.customers.phone}
                        </a>
                      )}
                    </div>
                    <div className="apt-header-actions">
                      <span className={`status-badge ${(apt.status || 'Pending').toLowerCase()}`}>
                        {STATUS_LABELS[apt.status] || apt.status}
                      </span>
                      <button
                        type="button"
                        className="cancel-apt-btn"
                        onClick={() => handleCancel(apt)}
                        disabled={busyKey !== null}
                        aria-label={`ביטול התור של ${apt.customers?.first_name || ''}`}
                      >
                        <XCircle size={16} />
                        {busyKey === apt.id ? 'מבטל...' : 'ביטול תור'}
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
                          {item.user_id && (
                            <button
                              type="button"
                              className="unassign-btn"
                              onClick={() => handleUnassign(apt, item)}
                              disabled={busyKey !== null}
                              aria-label={`ביטול שיבוץ של ${item.users?.first_name || ''} לטיפול ${item.service_types?.name || ''}`}
                            >
                              <UserX size={14} />
                              {busyKey === `unassign:${item.id}` ? 'מבטל שיבוץ...' : 'ביטול שיבוץ'}
                            </button>
                          )}
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
                      disabled={busyKey !== null}
                      aria-label={`ביטול התור של ${apt.customers?.first_name || ''}`}
                    >
                      <XCircle size={16} />
                      {busyKey === apt.id ? 'מבטל...' : 'ביטול'}
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
