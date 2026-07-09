import { useCallback } from 'react';
import { Clock, User, CheckCircle, Calendar as CalendarIcon } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { listMyShifts, updateShiftStatus } from '../lib/api';
import { useAsyncData } from '../hooks/useAsyncData';
import { useAction } from '../hooks/useAction';
import { todayString, toTimeDisplay, formatHebrewDate } from '../lib/dates';
import PageContainer from '../components/PageContainer/PageContainer';
import PageHeader from '../components/PageHeader/PageHeader';
import Alert from '../components/Alert/Alert';
import EmptyState from '../components/EmptyState/EmptyState';
import LoadingSpinner from '../components/LoadingSpinner/LoadingSpinner';
import './MyShiftsPage.css';

// Scheduled -> In_Progress -> Done. Done is terminal (no accidental reset).
const NEXT_STATUS = { Scheduled: 'In_Progress', In_Progress: 'Done' };

const STATUS_LABELS = {
  Scheduled: 'מתוכנן - לחץ להתחלה',
  In_Progress: 'בביצוע - לחץ לסיום',
};

const MyShiftsPage = () => {
  const { session, profile } = useAuth();
  const userId = session?.user?.id;

  const fetchShifts = useCallback(() => listMyShifts(userId, todayString()), [userId]);
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
      () => updateShiftStatus(task.id, userId, nextStatus),
      { errorFallback: 'שגיאה בעדכון הסטטוס.' }
    );
    if (ok) {
      setData((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: nextStatus } : t)));
    }
  };

  const displayName = profile ? `${profile.first_name} ${profile.last_name}` : '';

  // Group by work date so upcoming days are visible, not just today
  const byDate = tasks.reduce((acc, task) => {
    (acc[task.work_date] = acc[task.work_date] || []).push(task);
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
                const customer = task.appointments?.customers;
                const customerName = customer
                  ? `${customer.first_name} ${customer.last_name}`
                  : 'לקוח לא ידוע';

                return (
                  <div key={task.id} className="task-card">
                    <div className="task-time">
                      <Clock size={16} />
                      <span>{toTimeDisplay(task.start_time)} - {toTimeDisplay(task.end_time)}</span>
                    </div>
                    <div className="task-details">
                      <h3>{task.service_types?.name}</h3>
                      <p>לקוח/ה: <strong>{customerName}</strong></p>
                      <button
                        className={`status-btn ${task.status.toLowerCase()}`}
                        onClick={() => advanceStatus(task)}
                        disabled={task.status === 'Done'}
                      >
                        {STATUS_LABELS[task.status]}
                        {task.status === 'Done' && (
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
