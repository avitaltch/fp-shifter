import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { getClaimableShifts, claimShift } from '../lib/api';
import { friendlyError } from '../lib/errors';
import { todayString, toTimeDisplay, formatHebrewDate } from '../lib/dates';
import PageContainer from '../components/PageContainer/PageContainer';
import EmptyState from '../components/EmptyState/EmptyState';
import LoadingSpinner from '../components/LoadingSpinner/LoadingSpinner';
import { Star, Clock, Calendar as CalendarIcon, UserPlus, Ban } from 'lucide-react';
import './RecommendationsPage.css';

// Why a shift cannot be claimed, in plain language (mirrors claim_shift RPC).
const INELIGIBLE_HINTS = {
  NOT_QUALIFIED: 'דורש מיומנות שאינה משויכת אליך',
  NOT_AVAILABLE: 'מחוץ לחלונות הזמינות שלך',
  SHIFT_CONFLICT: 'חופף לשיבוץ קיים שלך',
};

// Open (unassigned) upcoming shifts an employee can claim.
const RecommendationsPage = () => {
  const { session } = useAuth();
  const userId = session?.user?.id;
  const [openShifts, setOpenShifts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);
  const [claimingId, setClaimingId] = useState(null);

  const fetchOpenShifts = useCallback(async () => {
    if (!userId) return;
    try {
      setLoading(true);
      setError(null);
      setOpenShifts(await getClaimableShifts(userId, todayString()));
    } catch (err) {
      console.error(err);
      setError('שגיאה בטעינת המשמרות הפתוחות.');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchOpenShifts();
  }, [fetchOpenShifts]);

  const handleVolunteer = async (taskId) => {
    if (!session) return;
    setMessage(null);
    setClaimingId(taskId);
    try {
      // The claim_shift RPC re-checks skills/availability/conflicts and
      // throws SHIFT_TAKEN on a lost race — never a silent false success.
      await claimShift(taskId);
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

  const claimable = openShifts.filter((s) => s.eligible);
  const others = openShifts.filter((s) => !s.eligible);

  const renderCard = (rec) => (
    <div key={rec.id} className={`card recommendation-card ${rec.eligible ? '' : 'ineligible'}`}>
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
        {rec.eligible ? (
          <button
            className="btn-primary"
            onClick={() => handleVolunteer(rec.id)}
            disabled={claimingId !== null}
          >
            <UserPlus size={18} />
            {claimingId === rec.id ? 'משבץ...' : 'אני פנוי/ה'}
          </button>
        ) : (
          <span className="ineligible-hint">
            <Ban size={14} />
            {INELIGIBLE_HINTS[rec.reason] || 'לא ניתן לשיבוץ'}
          </span>
        )}
      </div>
    </div>
  );

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

      {!loading && !error && claimable.length > 0 && (
        <div className="recommendations-list">{claimable.map(renderCard)}</div>
      )}

      {!loading && !error && others.length > 0 && (
        <section className="ineligible-section">
          <h2>משמרות פתוחות נוספות (לא זמינות לך)</h2>
          <div className="recommendations-list">{others.map(renderCard)}</div>
        </section>
      )}
    </PageContainer>
  );
};

export default RecommendationsPage;
