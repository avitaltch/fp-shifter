import { useCallback, useState } from 'react';
import {
  Briefcase,
  CheckCircle2,
  ShieldCheck,
  UserPlus,
  UserRound,
  UserX,
} from 'lucide-react';
import Alert from '../components/Alert/Alert';
import EmptyState from '../components/EmptyState/EmptyState';
import LoadingSpinner from '../components/LoadingSpinner/LoadingSpinner';
import PageContainer from '../components/PageContainer/PageContainer';
import PageHeader from '../components/PageHeader/PageHeader';
import { useAuth } from '../context/AuthContext';
import { useAction } from '../hooks/useAction';
import { useAsyncData } from '../hooks/useAsyncData';
import {
  createOperatorStaff,
  listOperatorServices,
  listOperatorStaff,
  replaceOperatorProviderSkills,
  setOperatorStaffActive,
  updateOperatorStaffRole,
} from '../lib/api';
import './TeamPage.css';

const EMPTY_LIST = [];
const EMPTY_STAFF_FORM = {
  email: '',
  firstName: '',
  lastName: '',
  phoneE164: '',
  role: 'Provider',
  temporaryPassword: '',
};
const ROLE_LABEL = {
  Owner: 'בעלים',
  Manager: 'מנהל/ת',
  Provider: 'נותן/ת שירות',
};

const TeamPage = () => {
  const { session } = useAuth();
  const [staffForm, setStaffForm] = useState(EMPTY_STAFF_FORM);
  const fetchTeam = useCallback(async () => {
    const [staff, services] = await Promise.all([
      listOperatorStaff(),
      listOperatorServices(),
    ]);
    return { staff, services: services.filter(({ active }) => active) };
  }, []);
  const { data, setData, loading, error } = useAsyncData(fetchTeam, {
    errorMessage: 'שגיאה בטעינת נתוני הצוות.',
  });
  const { isBusy, message, setMessage, run } = useAction();
  const staff = data?.staff ?? EMPTY_LIST;
  const services = data?.services ?? EMPTY_LIST;
  const isOwner = session?.business?.role === 'Owner';

  const updateForm = (field) => (event) => {
    setStaffForm((current) => ({ ...current, [field]: event.target.value }));
  };

  const createStaff = async (event) => {
    event.preventDefault();
    if (!staffForm.firstName.trim() || !staffForm.lastName.trim()) {
      setMessage({ type: 'error', text: 'נא להזין שם פרטי ושם משפחה.' });
      return;
    }
    const { ok, result } = await run(
      'create',
      () =>
        createOperatorStaff({
          email: staffForm.email.trim().toLowerCase(),
          firstName: staffForm.firstName.trim(),
          lastName: staffForm.lastName.trim(),
          ...(staffForm.phoneE164.trim()
            ? { phoneE164: staffForm.phoneE164.trim() }
            : {}),
          role: staffForm.role,
          temporaryPassword: staffForm.temporaryPassword,
        }),
      {
        success: 'החשבון נוצר. יש למסור לעובד/ת את הסיסמה הזמנית באופן מאובטח.',
        errorFallback: 'שגיאה ביצירת חשבון הצוות.',
      }
    );
    if (!ok) return;
    setData((current) => ({ ...current, staff: [...current.staff, result] }));
    setStaffForm(EMPTY_STAFF_FORM);
  };

  const toggleSkill = async (employee, serviceId) => {
    const key = `skill:${employee.userId}:${serviceId}`;
    const serviceIds = employee.serviceIds.includes(serviceId)
      ? employee.serviceIds.filter((id) => id !== serviceId)
      : [...employee.serviceIds, serviceId];
    const { ok, result } = await run(
      key,
      () => replaceOperatorProviderSkills(employee.userId, serviceIds),
      { errorFallback: 'שגיאה בעדכון המיומנות.' }
    );
    if (ok) replaceStaff(setData, result);
  };

  const changeRole = async (employee, role) => {
    if (role === employee.role) return;
    if (!window.confirm(`לשנות את התפקיד של ${employee.firstName} ל-${ROLE_LABEL[role]}?`)) {
      return;
    }
    const { ok, result } = await run(
      `role:${employee.userId}`,
      () => updateOperatorStaffRole(employee.userId, role),
      { success: 'התפקיד עודכן בהצלחה.', errorFallback: 'שגיאה בעדכון התפקיד.' }
    );
    if (ok) replaceStaff(setData, result);
  };

  const setActive = async (employee, active) => {
    if (!active && !window.confirm(`להשבית את ${employee.firstName} ${employee.lastName}?`)) {
      return;
    }
    const key = `active:${employee.userId}`;
    const { ok, result } = await run(
      key,
      () => setOperatorStaffActive(employee.userId, active),
      {
        success: active ? 'החשבון הופעל מחדש.' : 'החשבון הושבת והחיבורים שלו נותקו.',
        errorFallback: active ? 'שגיאה בהפעלת החשבון.' : 'שגיאה בהשבתת החשבון.',
      }
    );
    if (ok) replaceStaff(setData, result);
  };

  return (
    <PageContainer size="lg" className="team-page">
      <PageHeader
        icon={Briefcase}
        title="ניהול צוות"
        subtitle="חשבונות מקומיים, הרשאות ומיומנויות — ללא תלות בשירות חיצוני"
      />

      {loading && <LoadingSpinner text="טוען צוות..." />}
      <Alert type="error">{error}</Alert>
      <Alert type={message?.type}>{message?.text}</Alert>

      {!loading && !error && (
        <div className="card invite-card">
          <h3><UserPlus size={20} aria-hidden="true" />יצירת חשבון צוות</h3>
          <p className="invite-hint">
            החשבון יחייב החלפת סיסמה בכניסה הראשונה. המערכת אינה שולחת אותה באימייל.
          </p>
          <form className="invite-form" onSubmit={createStaff}>
            <input
              type="email"
              dir="ltr"
              aria-label="אימייל לעובד"
              placeholder="email@example.com"
              value={staffForm.email}
              onChange={updateForm('email')}
              required
            />
            <input
              aria-label="שם פרטי לעובד"
              placeholder="שם פרטי"
              value={staffForm.firstName}
              onChange={updateForm('firstName')}
              required
            />
            <input
              aria-label="שם משפחה לעובד"
              placeholder="שם משפחה"
              value={staffForm.lastName}
              onChange={updateForm('lastName')}
              required
            />
            <input
              type="tel"
              dir="ltr"
              aria-label="טלפון לעובד"
              placeholder="+972501234567"
              value={staffForm.phoneE164}
              onChange={updateForm('phoneE164')}
            />
            {isOwner && (
              <select aria-label="תפקיד לעובד" value={staffForm.role} onChange={updateForm('role')}>
                <option value="Provider">נותן/ת שירות</option>
                <option value="Manager">מנהל/ת</option>
              </select>
            )}
            <input
              type="password"
              dir="ltr"
              aria-label="סיסמה זמנית"
              placeholder="סיסמה זמנית — 12 תווים לפחות"
              value={staffForm.temporaryPassword}
              onChange={updateForm('temporaryPassword')}
              minLength={12}
              maxLength={128}
              autoComplete="new-password"
              required
            />
            <button type="submit" className="btn-primary" disabled={isBusy('create')}>
              {isBusy('create') ? 'יוצר...' : 'יצירת חשבון'}
            </button>
          </form>
        </div>
      )}

      {!loading && !error && staff.length === 0 && (
        <EmptyState text="אין עדיין חברי צוות. צרו את החשבון הראשון באמצעות הטופס למעלה." />
      )}

      {!loading && !error && staff.length > 0 && (
        <div className="team-list">
          {staff.map((employee) => {
            const active = !employee.disabledAt;
            const canManage =
              employee.userId !== session?.user?.id &&
              employee.role !== 'Owner' &&
              (isOwner || employee.role === 'Provider');
            return (
              <div key={employee.userId} className={`card team-card${active ? '' : ' is-disabled'}`}>
                <div className="team-member">
                  <div className="member-name">
                    {employee.role === 'Owner' || employee.role === 'Manager' ? (
                      <ShieldCheck size={20} aria-hidden="true" />
                    ) : (
                      <UserRound size={20} aria-hidden="true" />
                    )}
                    <div>
                      <h3>{employee.firstName} {employee.lastName}</h3>
                      <p className="member-email" dir="ltr">{employee.email}</p>
                    </div>
                    {!active && <span className="status-chip">מושבת/ת</span>}
                    {employee.mustChangePassword && active && (
                      <span className="status-chip pending">ממתין/ה להחלפת סיסמה</span>
                    )}
                  </div>
                  <div className="member-actions">
                    {isOwner ? (
                      <select
                        className="role-select"
                        value={employee.role}
                        onChange={(event) => changeRole(employee, event.target.value)}
                        disabled={!canManage || isBusy(`role:${employee.userId}`)}
                        aria-label={`תפקיד של ${employee.firstName}`}
                      >
                        {employee.role === 'Owner' && <option value="Owner">בעלים</option>}
                        <option value="Provider">נותן/ת שירות</option>
                        <option value="Manager">מנהל/ת</option>
                      </select>
                    ) : (
                      <span>{ROLE_LABEL[employee.role]}</span>
                    )}
                    {canManage && (
                      <button
                        type="button"
                        className={`icon-btn ${active ? 'deactivate' : 'reactivate'}`}
                        aria-label={`${active ? 'השבתת' : 'הפעלת'} ${employee.firstName} ${employee.lastName}`}
                        onClick={() => setActive(employee, !active)}
                        disabled={isBusy(`active:${employee.userId}`)}
                      >
                        {active ? <UserX size={18} /> : <CheckCircle2 size={18} />}
                      </button>
                    )}
                  </div>
                </div>

                <div className="skills-section">
                  <h4>שירותים שהעובד/ת מוסמך/ת לבצע:</h4>
                  {services.length === 0 ? (
                    <p className="hint">אין שירותים פעילים במערכת.</p>
                  ) : (
                    <div className="skills-grid">
                      {services.map((service) => {
                        const selected = employee.serviceIds.includes(service.id);
                        const key = `skill:${employee.userId}:${service.id}`;
                        return (
                          <button
                            key={service.id}
                            type="button"
                            className={`skill-chip ${selected ? 'active' : ''}`}
                            onClick={() => toggleSkill(employee, service.id)}
                            disabled={!active || isBusy(key)}
                          >
                            {service.name}
                          </button>
                        );
                      })}
                    </div>
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

function replaceStaff(setData, replacement) {
  setData((current) => ({
    ...current,
    staff: current.staff.map((staff) =>
      staff.userId === replacement.userId ? replacement : staff
    ),
  }));
}

export default TeamPage;
