import { useCallback } from 'react';
import { Users, CheckCircle, Clock } from 'lucide-react';
import { getAssignmentData, eligibleEmployeesFor, assignShift } from '../lib/api';
import { useAsyncData } from '../hooks/useAsyncData';
import { useAction } from '../hooks/useAction';
import { todayString, toTimeDisplay, formatHebrewDate } from '../lib/dates';
import PageContainer from '../components/PageContainer/PageContainer';
import PageHeader from '../components/PageHeader/PageHeader';
import Alert from '../components/Alert/Alert';
import EmptyState from '../components/EmptyState/EmptyState';
import LoadingSpinner from '../components/LoadingSpinner/LoadingSpinner';
import './ShiftAssignmentPage.css';

const ShiftAssignmentPage = () => {
  const fetchData = useCallback(() => getAssignmentData(todayString()), []);
  const { data, setData, loading, error, refetch } = useAsyncData(fetchData, {
    errorMessage: 'שגיאה בטעינת הנתונים.',
  });
  // A failed assignment usually means the list is stale — refetch on error.
  const { busyKey: assigningId, message, run } = useAction({ onError: refetch });

  const handleAssign = async (item, userId) => {
    if (!userId) return;
    const employee = data.staff.find((e) => e.id === userId);
    const confirmed = window.confirm(
      `לשבץ את ${employee?.first_name} ${employee?.last_name} לטיפול ב-${formatHebrewDate(item.work_date)} בשעה ${toTimeDisplay(item.start_time)}?`
    );
    if (!confirmed) return;

    // assign_shift RPC: re-checks skill/availability/conflicts server-side
    // and throws SHIFT_TAKEN if an employee volunteered concurrently.
    const { ok } = await run(item.id, () => assignShift(item.id, userId), {
      success: 'השיבוץ בוצע בהצלחה.',
      errorFallback: 'שגיאה בשיבוץ העובד.',
    });
    if (ok) {
      setData((prev) => ({
        ...prev,
        unassigned: prev.unassigned.filter((i) => i.id !== item.id),
        assignments: [...prev.assignments, { ...item, user_id: userId }],
      }));
    }
  };

  const unassigned = data?.unassigned || [];

  return (
    <PageContainer size="md" className="assignment-page">
      <PageHeader
        icon={Users}
        title="שיבוץ משמרות"
        subtitle="הקצאת עובדים לטיפולים שממתינים לשיבוץ. מוצגים רק עובדים מיומנים, זמינים ופנויים."
      />

      {loading && <LoadingSpinner text="טוען נתונים..." />}
      <Alert type="error">{error}</Alert>
      <Alert type={message?.type}>{message?.text}</Alert>

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
