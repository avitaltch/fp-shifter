import { useCallback } from 'react';
import { Users, Calendar, Clock, ArrowLeft, XCircle, Phone, CircleAlert, Sparkles } from 'lucide-react';
import { listOperatorAppointments, cancelOperatorAppointment } from '../lib/api';
import { useAsyncData } from '../hooks/useAsyncData';
import { useAction } from '../hooks/useAction';
import { todayString, addDaysString, toTimeDisplay, formatHebrewDate, dateInTimezone } from '../lib/dates';
import PageContainer from '../components/PageContainer/PageContainer';
import Alert from '../components/Alert/Alert';
import LoadingSpinner from '../components/LoadingSpinner/LoadingSpinner';
import EmptyState from '../components/EmptyState/EmptyState';
import './ManagerDashboardPage.css';

const STATUS_LABELS = {
  Pending: 'ממתין לשיבוץ',
  Confirmed: 'מאושר',
  Completed: 'הושלם',
  RequiresAttention: 'דורש תשומת לב',
};

const ManagerDashboardPage = () => {
  const fetchDashboard = useCallback(
    async () => (await listOperatorAppointments(todayString(), addDaysString(6))).filter(
      (appointment) => appointment.status !== 'Cancelled'
    ),
    []
  );
  const { data, setData, loading, error, refetch } = useAsyncData(fetchDashboard, {
    errorMessage: 'שגיאה בטעינת נתוני הדאשבורד.',
  });
  // A failed mutation usually means the list is stale — refetch on error.
  const { busyKeys, isBusy, message, run } = useAction({ onError: refetch });

  const appointments = data ?? [];

  const handleCancel = async (apt) => {
    const customerName = `${apt.customerFirstName || ''} ${apt.customerLastName || ''}`.trim();
    const visitDate = dateInTimezone(apt.startsAt, apt.timezone);
    const confirmed = window.confirm(
      `לבטל את התור של ${customerName || 'הלקוח/ה'} ב-${formatHebrewDate(visitDate)}? השעות ישוחררו להזמנות חדשות.`
    );
    if (!confirmed) return;

    const { ok } = await run(apt.id, () => cancelOperatorAppointment(apt.id), {
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
  const todayAppointments = appointments.filter(
    (appointment) => dateInTimezone(appointment.startsAt, appointment.timezone) === todayStr
  );
  const futureAppointments = appointments.filter(
    (appointment) => dateInTimezone(appointment.startsAt, appointment.timezone) !== todayStr
  );

  const todayItemsCount = todayAppointments.reduce(
    (acc, apt) => acc + (apt.steps?.length || 0), 0
  );

  // Unique employees working today (by id, not first name)
  const activeEmployees = new Set();
  let attentionToday = 0;
  todayAppointments.forEach((apt) => {
    apt.steps?.forEach((item) => activeEmployees.add(item.providerUserId));
    if (apt.status === 'RequiresAttention') attentionToday += 1;
  });

  return (
    <PageContainer size="lg" className="dashboard-page">
      <header className="dashboard-header">
        <div>
          <span className="dashboard-eyebrow"><Sparkles size={14} aria-hidden="true" /> תמונת מצב חיה</span>
          <h1>דאשבורד מנהל - תמונת מצב יומית</h1>
        </div>
        <p className="date-display">{formatHebrewDate(todayStr)}</p>
      </header>

      <Alert type={message?.type}>{message?.text}</Alert>

      <div className="stats-grid">
        <div className="stat-card stat-card--indigo" style={{ '--stat-delay': '0ms' }}>
          <div className="stat-icon"><Calendar /></div>
          <div className="stat-content">
            <h3>ביקורים היום</h3>
            <p className="stat-number">{todayAppointments.length}</p>
          </div>
        </div>
        <div className="stat-card stat-card--coral" style={{ '--stat-delay': '70ms' }}>
          <div className="stat-icon"><Clock /></div>
          <div className="stat-content">
            <h3>טיפולים היום</h3>
            <p className="stat-number">{todayItemsCount}</p>
          </div>
        </div>
        <div className="stat-card stat-card--mint" style={{ '--stat-delay': '140ms' }}>
          <div className="stat-icon"><Users /></div>
          <div className="stat-content">
            <h3>עובדים במשמרת</h3>
            <p className="stat-number">{activeEmployees.size}</p>
          </div>
        </div>
        <div className={`stat-card stat-card--amber ${attentionToday > 0 ? 'alert-card' : ''}`} style={{ '--stat-delay': '210ms' }}>
          <div className="stat-icon"><CircleAlert /></div>
          <div className="stat-content">
            <h3>דורשים תשומת לב</h3>
            <p className="stat-number">{attentionToday}</p>
          </div>
        </div>
      </div>

      <section className="timeline-section">
        <h2>פירוט טיפולים משורשרים להיום</h2>
        {todayAppointments.length === 0 ? (
          <EmptyState text="אין תורים שנקבעו להיום." />
        ) : (
          <div className="appointments-list">
            {todayAppointments.map((apt, appointmentIndex) => {
              const items = [...(apt.steps || [])].sort(
                (a, b) => a.sequenceNumber - b.sequenceNumber
              );
              return (
                <div key={apt.id} className="appointment-card" style={{ '--appointment-index': appointmentIndex }}>
                  <div className="apt-header">
                    <div className="apt-customer">
                      <h3>לקוח/ה: {apt.customerFirstName} {apt.customerLastName}</h3>
                      {apt.customerPhoneE164 && (
                        <a className="customer-phone" href={`tel:${apt.customerPhoneE164}`}>
                          <Phone size={14} />
                          {apt.customerPhoneE164}
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
                        disabled={busyKeys.size > 0}
                        aria-label={`ביטול התור של ${apt.customerFirstName || ''}`}
                      >
                        <XCircle size={16} />
                        {isBusy(apt.id) ? 'מבטל...' : 'ביטול תור'}
                      </button>
                    </div>
                  </div>

                  <div className="timeline-chain">
                    {items.map((item, index) => (
                      <div key={item.id} className="timeline-item">
                        <div className="time-block">
                          {toTimeDisplay(item.startsAt, apt.timezone)} - {toTimeDisplay(item.endsAt, apt.timezone)}
                        </div>
                        <div className="details-block">
                          <strong>{item.serviceName}</strong>
                          <span>ע"י {item.providerFirstName} {item.providerLastName}</span>
                        </div>
                        {index < items.length - 1 && (
                          <ArrowLeft className="chain-arrow" aria-hidden="true" />
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
            {futureAppointments.map((apt, appointmentIndex) => (
              <div key={apt.id} className="appointment-card compact-card" style={{ '--appointment-index': appointmentIndex }}>
                <div className="apt-header">
                  <h3>
                    {formatHebrewDate(dateInTimezone(apt.startsAt, apt.timezone))} | {apt.customerFirstName}{' '}
                    {apt.customerLastName}
                  </h3>
                  <div className="apt-header-actions">
                    <span className="compact-details">{apt.steps?.length || 0} טיפולים</span>
                    <button
                      type="button"
                      className="cancel-apt-btn"
                      onClick={() => handleCancel(apt)}
                      disabled={busyKeys.size > 0}
                      aria-label={`ביטול התור של ${apt.customerFirstName || ''}`}
                    >
                      <XCircle size={16} />
                      {isBusy(apt.id) ? 'מבטל...' : 'ביטול'}
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
