import { useCallback, useState } from 'react';
import { Users, CheckCircle, Clock, RefreshCw } from 'lucide-react';
import {
  listOperatorAppointments,
  listOperatorReassignmentOptions,
  reassignOperatorStep,
} from '../lib/api';
import { useAsyncData } from '../hooks/useAsyncData';
import { useAction } from '../hooks/useAction';
import {
  addDaysString,
  dateInTimezone,
  formatHebrewDate,
  todayString,
  toTimeDisplay,
} from '../lib/dates';
import PageContainer from '../components/PageContainer/PageContainer';
import PageHeader from '../components/PageHeader/PageHeader';
import Alert from '../components/Alert/Alert';
import EmptyState from '../components/EmptyState/EmptyState';
import LoadingSpinner from '../components/LoadingSpinner/LoadingSpinner';
import './ShiftAssignmentPage.css';

const REASON_LABELS = {
  NOT_QUALIFIED: 'ללא מיומנות מתאימה',
  NO_COVERING_AVAILABILITY: 'אין חלון זמינות מלא',
  MARKED_UNAVAILABLE: 'סומן/ה כלא זמין/ה',
  SCHEDULE_CONFLICT: 'קיים שיבוץ חופף',
};

function flattenScheduledSteps(appointments) {
  return appointments.flatMap((appointment) =>
    appointment.steps
      .filter((step) => step.status === 'Scheduled')
      .map((step) => ({
        ...step,
        appointmentId: appointment.id,
        customerFirstName: appointment.customerFirstName,
        customerLastName: appointment.customerLastName,
        timezone: appointment.timezone,
      }))
  );
}

const ShiftAssignmentPage = () => {
  const [optionsByStep, setOptionsByStep] = useState({});
  const fetchData = useCallback(
    async () => flattenScheduledSteps(
      await listOperatorAppointments(todayString(), addDaysString(13))
    ),
    []
  );
  const { data, setData, loading, error, refetch } = useAsyncData(fetchData, {
    errorMessage: 'שגיאה בטעינת הנתונים.',
  });
  const { isBusy, message, run } = useAction({ onError: refetch });

  const steps = data ?? [];

  const loadOptions = async (stepId) => {
    const { ok, result } = await run(
      `options:${stepId}`,
      () => listOperatorReassignmentOptions(stepId),
      { errorFallback: 'שגיאה בבדיקת חלופות השיבוץ.' }
    );
    if (ok) setOptionsByStep((current) => ({ ...current, [stepId]: result }));
  };

  const handleReassign = async (step, providerUserId) => {
    if (!providerUserId) return;
    const provider = optionsByStep[step.id]?.find(
      (option) => option.providerUserId === providerUserId
    );
    if (!provider) return;
    const visitDate = dateInTimezone(step.startsAt, step.timezone);
    const confirmed = window.confirm(
      `לשבץ את ${provider.firstName} ${provider.lastName} לטיפול ב-${formatHebrewDate(visitDate)} בשעה ${toTimeDisplay(step.startsAt, step.timezone)}?`
    );
    if (!confirmed) return;

    const { ok, result } = await run(
      `reassign:${step.id}`,
      () => reassignOperatorStep(step.id, providerUserId),
      {
        success: 'השיבוץ עודכן בהצלחה.',
        errorFallback: 'שגיאה בעדכון השיבוץ.',
      }
    );
    if (ok) {
      setData((current) =>
        current.map((entry) => (entry.id === step.id ? { ...entry, ...result } : entry))
      );
      setOptionsByStep((current) => {
        const next = { ...current };
        delete next[step.id];
        return next;
      });
    }
  };

  return (
    <PageContainer size="md" className="assignment-page">
      <PageHeader
        icon={Users}
        title="ניהול שיבוצים"
        subtitle="בדיקת חלופות ושינוי ספק שירות בלי לפגוע בזמינות או ליצור חפיפות."
      />

      {loading && <LoadingSpinner text="טוען נתונים..." />}
      <Alert type="error">{error}</Alert>
      <Alert type={message?.type}>{message?.text}</Alert>

      {!loading && !error && steps.length === 0 && (
        <EmptyState icon={CheckCircle} text="אין טיפולים עתידיים שממתינים לביצוע." />
      )}

      {!loading && !error && steps.length > 0 && (
        <div className="unassigned-list">
          {steps.map((step) => {
            const options = optionsByStep[step.id];
            const alternatives = options?.filter(
              (option) => option.eligible && option.providerUserId !== step.providerUserId
            );
            const ineligible = options?.filter((option) => !option.eligible) ?? [];
            return (
              <div key={step.id} className="unassigned-card">
                <div className="unassigned-info">
                  <h3>{step.serviceName}</h3>
                  <p>
                    <strong>לקוח/ה:</strong> {step.customerFirstName} {step.customerLastName}
                  </p>
                  <p>
                    <strong>משובץ/ת כעת:</strong> {step.providerFirstName} {step.providerLastName}
                  </p>
                  <div className="time-badge">
                    <Clock size={14} />
                    <span>
                      {formatHebrewDate(dateInTimezone(step.startsAt, step.timezone))} |{' '}
                      {toTimeDisplay(step.startsAt, step.timezone)} -{' '}
                      {toTimeDisplay(step.endsAt, step.timezone)}
                    </span>
                  </div>
                </div>
                <div className="assign-action">
                  {!options ? (
                    <button
                      type="button"
                      className="employee-select"
                      onClick={() => loadOptions(step.id)}
                      disabled={isBusy(`options:${step.id}`)}
                    >
                      <RefreshCw size={15} />
                      {isBusy(`options:${step.id}`) ? 'בודק חלופות...' : 'בדיקת חלופות'}
                    </button>
                  ) : alternatives.length === 0 ? (
                    <p className="no-eligible">אין ספק/ית חלופי/ת פנוי/ה לחלון זה</p>
                  ) : (
                    <select
                      onChange={(event) => handleReassign(step, event.target.value)}
                      value=""
                      disabled={isBusy(`reassign:${step.id}`)}
                      className="employee-select"
                      aria-label={`שינוי שיבוץ עבור ${step.serviceName}`}
                    >
                      <option value="" disabled>
                        {isBusy(`reassign:${step.id}`) ? 'מעדכן...' : 'בחר/י ספק/ית חלופי/ת'}
                      </option>
                      {alternatives.map((provider) => (
                        <option key={provider.providerUserId} value={provider.providerUserId}>
                          {provider.firstName} {provider.lastName}
                        </option>
                      ))}
                    </select>
                  )}
                  {ineligible.length > 0 && (
                    <details className="assignment-diagnostics">
                      <summary>למה אחרים לא זמינים?</summary>
                      <ul>
                        {ineligible.map((provider) => (
                          <li key={provider.providerUserId}>
                            {provider.firstName} {provider.lastName}: {' '}
                            {provider.reasons.map((reason) => REASON_LABELS[reason]).join(', ')}
                          </li>
                        ))}
                      </ul>
                    </details>
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
