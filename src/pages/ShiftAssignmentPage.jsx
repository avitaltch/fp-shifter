import { useState, useEffect, useCallback } from 'react';
import { Users, CheckCircle, Clock } from 'lucide-react';
import { getAssignmentData, eligibleEmployeesFor, assignShift } from '../lib/api';
import { friendlyError } from '../lib/errors';
import { todayString, toTimeDisplay, formatHebrewDate } from '../lib/dates';
import PageContainer from '../components/PageContainer/PageContainer';
import EmptyState from '../components/EmptyState/EmptyState';
import LoadingSpinner from '../components/LoadingSpinner/LoadingSpinner';
import './ShiftAssignmentPage.css';

const ShiftAssignmentPage = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);
  const [assigningId, setAssigningId] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      setData(await getAssignmentData(todayString()));
    } catch (err) {
      console.error(err);
      setError('שגיאה בטעינת הנתונים.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleAssign = async (item, userId) => {
    if (!userId) return;
    const employee = data.staff.find((e) => e.id === userId);
    const confirmed = window.confirm(
      `לשבץ את ${employee?.first_name} ${employee?.last_name} לטיפול ב-${formatHebrewDate(item.work_date)} בשעה ${toTimeDisplay(item.start_time)}?`
    );
    if (!confirmed) return;

    setMessage(null);
    setAssigningId(item.id);
    try {
      // Guarded update: if an employee volunteered concurrently the update
      // matches 0 rows and throws SHIFT_TAKEN instead of overwriting.
      await assignShift(item.id, userId);
      setData((prev) => ({
        ...prev,
        unassigned: prev.unassigned.filter((i) => i.id !== item.id),
        assignments: [...prev.assignments, { ...item, user_id: userId }],
      }));
      setMessage({ type: 'success', text: 'השיבוץ בוצע בהצלחה.' });
    } catch (err) {
      console.error(err);
      setMessage({ type: 'error', text: friendlyError(err, 'שגיאה בשיבוץ העובד.') });
      fetchData();
    } finally {
      setAssigningId(null);
    }
  };

  const unassigned = data?.unassigned || [];

  return (
    <PageContainer size="md" className="assignment-page">
      <header className="page-header">
        <Users size={32} className="header-icon" />
        <h1>שיבוץ משמרות</h1>
        <p>הקצאת עובדים לטיפולים שממתינים לשיבוץ. מוצגים רק עובדים מיומנים, זמינים ופנויים.</p>
      </header>

      {loading && <LoadingSpinner text="טוען נתונים..." />}
      {error && <p className="error-text">{error}</p>}
      {message && (
        <p className={message.type === 'error' ? 'error-text' : 'success-text'}>{message.text}</p>
      )}

      {!loading && !error && unassigned.length === 0 && (
        <EmptyState
          icon={CheckCircle}
          text="מעולה! כל הטיפולים שובצו בהצלחה."
        />
      )}

      {!loading && !error && unassigned.length > 0 && (
        <div className="unassigned-list">
          {unassigned.map((item) => {
            const eligible = eligibleEmployeesFor(item, data);
            return (
              <div key={item.id} className="unassigned-card">
                <div className="unassigned-info">
                  <h3>{item.service_types?.name}</h3>
                  <p>
                    <strong>לקוח/ה:</strong> {item.appointments?.customers?.first_name}{' '}
                    {item.appointments?.customers?.last_name}
                  </p>
                  <div className="time-badge">
                    <Clock size={14} />
                    <span>
                      {formatHebrewDate(item.work_date)} | {toTimeDisplay(item.start_time)} -{' '}
                      {toTimeDisplay(item.end_time)}
                    </span>
                  </div>
                </div>
                <div className="assign-action">
                  {eligible.length === 0 ? (
                    <p className="no-eligible">אין עובד מיומן וזמין לחלון זה</p>
                  ) : (
                    <select
                      onChange={(e) => handleAssign(item, e.target.value)}
                      value=""
                      disabled={assigningId === item.id}
                      className="employee-select"
                    >
                      <option value="" disabled>
                        {assigningId === item.id ? 'משבץ...' : 'בחר/י עובד/ת לשיבוץ'}
                      </option>
                      {eligible.map((emp) => (
                        <option key={emp.id} value={emp.id}>
                          {emp.first_name} {emp.last_name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </PageContainer>
  );
};

export default ShiftAssignmentPage;
