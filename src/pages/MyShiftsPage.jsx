import { useCallback } from 'react';
import { Clock, User, CheckCircle, Calendar as CalendarIcon } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { listMyOperatorSteps, updateOperatorStepStatus } from '../lib/api';
import { useAsyncData } from '../hooks/useAsyncData';
import { useAction } from '../hooks/useAction';
import { todayString, addDaysString, toTimeDisplay, formatHebrewDate, dateInTimezone } from '../lib/dates';
import PageContainer from '../components/PageContainer/PageContainer';
import PageHeader from '../components/PageHeader/PageHeader';
import Alert from '../components/Alert/Alert';
import EmptyState from '../components/EmptyState/EmptyState';
import LoadingSpinner from '../components/LoadingSpinner/LoadingSpinner';
import './MyShiftsPage.css';

// Scheduled -> InProgress -> Completed. Completed is terminal.
const NEXT_STATUS = { Scheduled: 'InProgress', InProgress: 'Completed' };

const STATUS_LABELS = {
  Scheduled: 'מתוכנן - לחץ להתחלה',
  InProgress: 'בביצוע - לחץ לסיום',
};

const MyShiftsPage = () => {
  const { session, profile } = useAuth();
  const userId = session?.user?.id;

  const fetchShifts = useCallback(
    () => listMyOperatorSteps(todayString(), addDaysString(30)),
    []
  );
  const { data, setData, loading, error } = useAsyncData(fetchShifts, {
    enabled: Boolean(userId),
    errorMessage: 'שגיאה בטעינת משמרות. יש לרענן.',
  });
  const { message: actionMessage, run } = useAction();

  const tasks = data ?? [];

  const advanceStatus = async (task) => {
    const nextStatus = NEXT_STATUS[task.status];
    if (!nextStatus) return;
    const { ok } = await run(
      task.id,
      () => updateOperatorStepStatus(task.id, nextStatus),
      { errorFallback: 'שגיאה בעדכון הסטטוס.' }
    );
    if (ok) {
      setData((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: nextStatus } : t)));
    }
  };

  const displayName = profile ? `${profile.first_name} ${profile.last_name}` : '';

  // Group by work date so upcoming days are visible, not just today
  const byDate = tasks.reduce((acc, task) => {
    const workDate = dateInTimezone(task.startsAt, task.timezone);
    (acc[workDate] = acc[workDate] || []).push(task);
    return acc;
  }, {});

  return (
    <PageContainer size="md" className="my-shifts-page">
      <PageHeader
        icon={User}
        title={`המשמרות שלי${displayName ? ` - ${displayName}` : ''}`}
        subtitle="הטיפולים ששובצת אליהם מהיום והלאה"
      />

      <div className="tasks-list">
        {loading && <LoadingSpinner text="טוען משמרות..." />}
        <Alert type="error">{error}</Alert>
        <Alert type={actionMessage?.type}>{actionMessage?.text}</Alert>
        {!loading && !error && tasks.length === 0 ? (
          <EmptyState text="אין טיפולים מתוכננים. איזה כיף!" />
        ) : (
          Object.entries(byDate).map(([date, dateTasks]) => (
            <section key={date} className="date-group">
              <h2 className="date-heading">
                <CalendarIcon size={18} /> {formatHebrewDate(date)}
              </h2>
              {dateTasks.map((task) => {
                const customerName =
                  `${task.customerFirstName || ''} ${task.customerLastName || ''}`.trim() ||
                  'לקוח לא ידוע';

                return (
                  <div key={task.id} className="task-card">
                    <div className="task-time">
                      <Clock size={16} />
                      <span>{toTimeDisplay(task.startsAt, task.timezone)} - {toTimeDisplay(task.endsAt, task.timezone)}</span>
                    </div>
                    <div className="task-details">
                      <h3>{task.serviceName}</h3>
                      <p>לקוח/ה: <strong>{customerName}</strong></p>
                      <button
                        className={`status-btn ${task.status.toLowerCase()}`}
                        onClick={() => advanceStatus(task)}
                        disabled={task.status === 'Completed'}
                      >
                        {STATUS_LABELS[task.status]}
                        {task.status === 'Completed' && (
                          <><CheckCircle size={14} style={{ marginLeft: '4px' }} /> הסתיים</>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </section>
          ))
        )}
      </div>
    </PageContainer>
  );
};

export default MyShiftsPage;
