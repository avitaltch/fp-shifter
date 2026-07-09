import { useState, useEffect, useCallback } from 'react';
import { Clock, User, CheckCircle, Calendar as CalendarIcon } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { listMyShifts, updateShiftStatus } from '../lib/api';
import { friendlyError } from '../lib/errors';
import { todayString, toTimeDisplay, formatHebrewDate } from '../lib/dates';
import PageContainer from '../components/PageContainer/PageContainer';
import EmptyState from '../components/EmptyState/EmptyState';
import LoadingSpinner from '../components/LoadingSpinner/LoadingSpinner';
import './MyShiftsPage.css';

// Scheduled -> In_Progress -> Done. Done is terminal (no accidental reset).
const NEXT_STATUS = { Scheduled: 'In_Progress', In_Progress: 'Done' };

const MyShiftsPage = () => {
  const { session, profile } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionError, setActionError] = useState(null);

  const fetchTasks = useCallback(async () => {
    if (!session) return;
    try {
      setLoading(true);
      setError(null);
      setTasks(await listMyShifts(session.user.id, todayString()));
    } catch (err) {
      console.error(err);
      setError('שגיאה בטעינת משמרות. יש לרענן.');
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  const advanceStatus = async (task) => {
    const nextStatus = NEXT_STATUS[task.status];
    if (!nextStatus) return;
    setActionError(null);
    try {
      await updateShiftStatus(task.id, session.user.id, nextStatus);
      setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: nextStatus } : t)));
    } catch (err) {
      console.error(err);
      setActionError(friendlyError(err, 'שגיאה בעדכון הסטטוס.'));
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
      <header className="page-header">
        <User size={32} className="header-icon" />
        <h1>המשמרות שלי{displayName ? ` - ${displayName}` : ''}</h1>
        <p>הטיפולים ששובצת אליהם מהיום והלאה</p>
      </header>

      <div className="tasks-list">
        {loading && <LoadingSpinner text="טוען משמרות..." />}
        {error && <p className="error-text">{error}</p>}
        {actionError && <p className="error-text">{actionError}</p>}
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
                        {task.status === 'Scheduled' && 'מתוכנן - לחץ להתחלה'}
                        {task.status === 'In_Progress' && 'בביצוע - לחץ לסיום'}
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
