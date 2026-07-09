import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { listOpenShifts, claimShift } from '../lib/api';
import { friendlyError } from '../lib/errors';
import { todayString, toTimeDisplay, formatHebrewDate } from '../lib/dates';
import PageContainer from '../components/PageContainer/PageContainer';
import EmptyState from '../components/EmptyState/EmptyState';
import LoadingSpinner from '../components/LoadingSpinner/LoadingSpinner';
import { Star, Clock, Calendar as CalendarIcon, UserPlus } from 'lucide-react';
import './RecommendationsPage.css';

// Open (unassigned) upcoming shifts an employee can claim.
const RecommendationsPage = () => {
  const { session } = useAuth();
  const [openShifts, setOpenShifts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);
  const [claimingId, setClaimingId] = useState(null);

  const fetchOpenShifts = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      setOpenShifts(await listOpenShifts(todayString()));
    } catch (err) {
      console.error(err);
      setError('שגיאה בטעינת המשמרות הפתוחות.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOpenShifts();
  }, [fetchOpenShifts]);

  const handleVolunteer = async (taskId) => {
    if (!session) return;
    setMessage(null);
    setClaimingId(taskId);
    try {
      // claimShift verifies the row count — a lost race throws SHIFT_TAKEN
      // instead of silently reporting success.
      await claimShift(taskId, session.user.id);
      setOpenShifts((prev) => prev.filter((r) => r.id !== taskId));
      setMessage({ type: 'success', text: 'מעולה! המשמרת שובצה אליך בהצלחה.' });
    } catch (err) {
      console.error(err);
      setMessage({ type: 'error', text: friendlyError(err, 'שגיאה בשיבוץ למשמרת.') });
      fetchOpenShifts();
    } finally {
      setClaimingId(null);
    }
  };

  return (
    <PageContainer size="md" className="recommendations-page">
      <header className="page-header">
        <Star size={32} className="header-icon" />
        <h1>משמרות פתוחות</h1>
        <p>משמרות שממתינות לשיבוץ. קח/י יוזמה ושבצ/י את עצמך!</p>
      </header>

      {loading && <LoadingSpinner text="טוען משמרות..." />}
      {error && <p className="error-text">{error}</p>}
      {message && (
        <p className={message.type === 'error' ? 'error-text' : 'success-text'}>{message.text}</p>
      )}

      {!loading && !error && openShifts.length === 0 && (
        <EmptyState icon={Star} text="אין משמרות פתוחות כרגע. הכל מתוקתק!" />
      )}

      {!loading && openShifts.length > 0 && (
        <div className="recommendations-list">
          {openShifts.map((rec) => (
            <div key={rec.id} className="card recommendation-card">
              <div className="rec-details">
                <div className="rec-service">
                  <h3>{rec.service_types?.name || 'טיפול כללי'}</h3>
                </div>

                <div className="rec-meta">
                  <div className="meta-item">
                    <CalendarIcon size={16} />
                    <span>{formatHebrewDate(rec.work_date)}</span>
                  </div>
                  <div className="meta-item">
                    <Clock size={16} />
                    <span>{toTimeDisplay(rec.start_time)} - {toTimeDisplay(rec.end_time)}</span>
                  </div>
                  <div className="meta-item customer-name">
                    לקוח/ה: {rec.appointments?.customers?.first_name}{' '}
                    {rec.appointments?.customers?.last_name}
                  </div>
                </div>
              </div>

              <div className="rec-action">
                <button
                  className="btn-primary"
                  onClick={() => handleVolunteer(rec.id)}
                  disabled={claimingId !== null}
                >
                  <UserPlus size={18} />
                  {claimingId === rec.id ? 'משבץ...' : 'אני פנוי/ה'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </PageContainer>
  );
};

export default RecommendationsPage;
