import { useEffect, useState } from 'react';
import { KeyRound, UserRound } from 'lucide-react';
import Alert from '../components/Alert/Alert';
import LoadingSpinner from '../components/LoadingSpinner/LoadingSpinner';
import PageContainer from '../components/PageContainer/PageContainer';
import PageHeader from '../components/PageHeader/PageHeader';
import { useAuth } from '../context/AuthContext';
import { useAction } from '../hooks/useAction';
import { changeStaffPassword, updateMyOperatorProfile } from '../lib/api';
import './EmployeeProfilePage.css';

const ROLE_LABEL = {
  Owner: 'בעלים',
  Manager: 'מנהל/ת',
  Provider: 'נותן/ת שירות',
};

const EmployeeProfilePage = () => {
  const { session, profile, retryProfile } = useAuth();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const { isBusy, message, setMessage, run } = useAction();

  useEffect(() => {
    if (!profile?.id) return;
    setFirstName(profile.first_name || '');
    setLastName(profile.last_name || '');
    setPhone(profile.phone || '');
  }, [profile?.first_name, profile?.id, profile?.last_name, profile?.phone]);

  const saveProfile = async (event) => {
    event.preventDefault();
    const first = firstName.trim();
    const last = lastName.trim();
    if (!first || !last) {
      setMessage({ type: 'error', text: 'נא להזין שם פרטי ושם משפחה.' });
      return;
    }
    const { ok, result } = await run(
      'profile',
      () =>
        updateMyOperatorProfile({
          firstName: first,
          lastName: last,
          phoneE164: phone.trim() || null,
        }),
      { success: 'הפרופיל עודכן בהצלחה.', errorFallback: 'שגיאה בעדכון הפרופיל.' }
    );
    if (!ok) return;
    setFirstName(result.firstName);
    setLastName(result.lastName);
    setPhone(result.phoneE164 || '');
    await retryProfile?.();
  };

  const savePassword = async (event) => {
    event.preventDefault();
    setMessage(null);
    if (newPassword.length < 12) {
      setMessage({ type: 'error', text: 'הסיסמה החדשה חייבת להכיל לפחות 12 תווים.' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setMessage({ type: 'error', text: 'הסיסמאות אינן תואמות.' });
      return;
    }
    const { ok } = await run(
      'password',
      () => changeStaffPassword(currentPassword, newPassword),
      { success: 'הסיסמה עודכנה בהצלחה.', errorFallback: 'שגיאה בעדכון הסיסמה.' }
    );
    if (!ok) return;
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    await retryProfile?.();
  };

  if (!session || !profile) {
    return (
      <PageContainer size="sm" className="profile-page">
        <LoadingSpinner text="טוען פרופיל..." />
      </PageContainer>
    );
  }

  const mustChangePassword = session.user.mustChangePassword;

  return (
    <PageContainer size="sm" className="profile-page">
      <PageHeader icon={UserRound} title="הפרופיל שלי" subtitle="פרטים אישיים ואבטחת החשבון" />

      {mustChangePassword && (
        <Alert type="warning">
          זו הכניסה הראשונה שלך. יש להחליף את הסיסמה הזמנית לפני המשך השימוש במערכת.
        </Alert>
      )}
      <Alert type={message?.type}>{message?.text}</Alert>

      {!mustChangePassword && (
        <form onSubmit={saveProfile} className="profile-form card">
          <h2 className="profile-section-title">פרטים אישיים</h2>
          <ProfileInput label="אימייל" type="email" value={session.user.email || ''} disabled />
          <ProfileInput
            label="תפקיד"
            value={ROLE_LABEL[profile.membership_role] || profile.membership_role}
            disabled
          />
          <ProfileInput
            label="שם פרטי"
            value={firstName}
            onChange={setFirstName}
            autoComplete="given-name"
          />
          <ProfileInput
            label="שם משפחה"
            value={lastName}
            onChange={setLastName}
            autoComplete="family-name"
          />
          <ProfileInput
            label="טלפון"
            type="tel"
            dir="ltr"
            value={phone}
            onChange={setPhone}
            placeholder="+972501234567"
            autoComplete="tel"
          />
          <button type="submit" className="submit-btn" disabled={isBusy('profile')}>
            {isBusy('profile') ? <LoadingSpinner text="שומר..." inline /> : 'שמור פרטים'}
          </button>
        </form>
      )}

      <form onSubmit={savePassword} className="profile-form card">
        <h2 className="profile-section-title"><KeyRound size={19} aria-hidden="true" />שינוי סיסמה</h2>
        <ProfileInput
          label={mustChangePassword ? 'סיסמה זמנית' : 'סיסמה נוכחית'}
          type="password"
          value={currentPassword}
          onChange={setCurrentPassword}
          autoComplete="current-password"
        />
        <ProfileInput
          label="סיסמה חדשה"
          type="password"
          value={newPassword}
          onChange={setNewPassword}
          placeholder="12 תווים לפחות"
          minLength={12}
          maxLength={128}
          autoComplete="new-password"
        />
        <ProfileInput
          label="אימות סיסמה"
          type="password"
          value={confirmPassword}
          onChange={setConfirmPassword}
          minLength={12}
          maxLength={128}
          autoComplete="new-password"
        />
        <button type="submit" className="submit-btn" disabled={isBusy('password')}>
          {isBusy('password') ? <LoadingSpinner text="שומר..." inline /> : 'עדכן סיסמה'}
        </button>
      </form>
    </PageContainer>
  );
};

function ProfileInput({ label, onChange, disabled = false, ...props }) {
  const id = `profile-${label}`;
  return (
    <div className="input-group">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        {...props}
        disabled={disabled}
        readOnly={disabled}
        onChange={onChange ? (event) => onChange(event.target.value) : undefined}
      />
    </div>
  );
}

export default EmployeeProfilePage;
