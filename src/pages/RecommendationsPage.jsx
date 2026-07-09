import { useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { getClaimableShifts, claimShift } from '../lib/api';
import { useAsyncData } from '../hooks/useAsyncData';
import { useAction } from '../hooks/useAction';
import { todayString, toTimeDisplay, formatHebrewDate } from '../lib/dates';
import PageContainer from '../components/PageContainer/PageContainer';
import PageHeader from '../components/PageHeader/PageHeader';
import Alert from '../components/Alert/Alert';
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

  const fetchShifts = useCallback(() => getClaimableShifts(userId, todayString()), [userId]);
  const { data, setData, loading, error, refetch } = useAsyncData(fetchShifts, {
    enabled: Boolean(userId),
    errorMessage: 'שגיאה בטעינת המשמרות הפתוחות.',
  });
  // A failed claim usually means the list is stale — refetch on error.
  const { busyKey: claimingId, message, run } = useAction({ onError: refetch });

  const openShifts = data ?? [];

  const handleVolunteer = async (taskId) => {
    const { ok } = await run(taskId, () => claimShift(taskId), {
      success: 'מעולה! המשמרת שובצה אליך בהצלחה.',
      errorFallback: 'שגיאה בשיבוץ למשמרת.',
    });
    if (ok) setData((prev) => prev.filter((r) => r.id !== taskId));
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
      <PageHeader
        icon={Star}
        title="משמרות פתוחות"
        subtitle="משמרות שממתינות לשיבוץ. קח/י יוזמה ושבצ/י את עצמך!"
      />

      {loading && <LoadingSpinner text="טוען משמרות..." />}
      <Alert type="error">{error}</Alert>
      <Alert type={message?.type}>{message?.text}</Alert>

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
