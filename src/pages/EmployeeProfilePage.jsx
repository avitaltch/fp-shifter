import { useState, useEffect } from 'react';
import { UserRound } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { updateStaffProfile } from '../lib/api';
import { useAction } from '../hooks/useAction';
import PageContainer from '../components/PageContainer/PageContainer';
import PageHeader from '../components/PageHeader/PageHeader';
import Alert from '../components/Alert/Alert';
import LoadingSpinner from '../components/LoadingSpinner/LoadingSpinner';
import './EmployeeProfilePage.css';

const ROLE_LABEL = { Admin: 'מנהל/ת', Employee: 'עובד/ת' };

const EmployeeProfilePage = () => {
  const { session, profile, retryProfile } = useAuth();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const { busyKey, message, setMessage, run } = useAction();

  useEffect(() => {
    if (!profile) return;
    setFirstName(profile.first_name === 'New' ? '' : profile.first_name || '');
    setLastName(profile.last_name === 'User' ? '' : profile.last_name || '');
    setPhone(profile.phone || '');
  }, [profile?.id, profile?.first_name, profile?.last_name, profile?.phone]);

  const saveProfile = async (e) => {
    e.preventDefault();
    const first = firstName.trim();
    const last = lastName.trim();
    if (!first || !last) {
      setMessage({ type: 'error', text: 'נא להזין שם פרטי ושם משפחה.' });
      return;
    }

    const { ok } = await run(
      'profile',
      () =>
        updateStaffProfile(session.user.id, {
          first_name: first,
          last_name: last,
          phone: phone.trim() || null,
        }),
      {
        success: 'הפרופיל עודכן בהצלחה.',
        errorFallback: 'שגיאה בעדכון הפרופיל.',
      }
    );
    if (ok) retryProfile?.();
  };

  const savePassword = async (e) => {
    e.preventDefault();
    setMessage(null);
    if (newPassword.length < 6) {
      setMessage({ type: 'error', text: 'הסיסמה חייבת להכיל לפחות 6 תווים.' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setMessage({ type: 'error', text: 'הסיסמאות אינן תואמות.' });
      return;
    }

    const { ok } = await run(
      'password',
      async () => {
        const { error } = await supabase.auth.updateUser({ password: newPassword });
        if (error) throw error;
      },
      {
        success: 'הסיסמה עודכנה בהצלחה.',
        errorFallback: 'שגיאה בעדכון הסיסמה.',
      }
    );
    if (ok) {
      setNewPassword('');
      setConfirmPassword('');
    }
  };

  if (!session || !profile) {
    return (
      <PageContainer size="sm" className="profile-page">
        <LoadingSpinner text="טוען פרופיל..." />
      </PageContainer>
    );
  }

  return (
    <PageContainer size="sm" className="profile-page">
      <PageHeader
        icon={UserRound}
        title="הפרופיל שלי"
        subtitle="עדכנו שם, טלפון וסיסמה"
      />

      <Alert type={message?.type}>{message?.text}</Alert>

      <form onSubmit={saveProfile} className="profile-form card">
        <h2 className="profile-section-title">פרטים אישיים</h2>

        <div className="input-group">
          <label htmlFor="profile-email">אימייל</label>
          <input
            id="profile-email"
            type="email"
            value={session.user.email || ''}
            disabled
            readOnly
          />
        </div>

        <div className="input-group">
          <label htmlFor="profile-role">תפקיד</label>
          <input
            id="profile-role"
            type="text"
            value={ROLE_LABEL[profile.role] || profile.role}
            disabled
            readOnly
          />
        </div>

        <div className="input-group">
          <label htmlFor="profile-first-name">שם פרטי</label>
          <input
            id="profile-first-name"
            type="text"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            autoComplete="given-name"
          />
        </div>

        <div className="input-group">
          <label htmlFor="profile-last-name">שם משפחה</label>
          <input
            id="profile-last-name"
            type="text"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            autoComplete="family-name"
          />
        </div>

        <div className="input-group">
          <label htmlFor="profile-phone">טלפון</label>
          <input
            id="profile-phone"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="050-0000000"
            autoComplete="tel"
          />
        </div>

        <button type="submit" className="submit-btn" disabled={busyKey === 'profile'}>
          {busyKey === 'profile' ? (
            <LoadingSpinner text="שומר..." inline={true} />
          ) : (
            'שמור פרטים'
          )}
        </button>
      </form>

      <form onSubmit={savePassword} className="profile-form card">
        <h2 className="profile-section-title">שינוי סיסמה</h2>

        <div className="input-group">
          <label htmlFor="profile-new-password">סיסמה חדשה</label>
          <input
            id="profile-new-password"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="לפחות 6 תווים"
            minLength={6}
            autoComplete="new-password"
          />
        </div>

        <div className="input-group">
          <label htmlFor="profile-confirm-password">אימות סיסמה</label>
          <input
            id="profile-confirm-password"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="הקלידו שוב"
            minLength={6}
            autoComplete="new-password"
          />
        </div>

        <button type="submit" className="submit-btn" disabled={busyKey === 'password'}>
          {busyKey === 'password' ? (
            <LoadingSpinner text="שומר..." inline={true} />
          ) : (
            'עדכן סיסמה'
          )}
        </button>
      </form>
    </PageContainer>
  );
};

export default EmployeeProfilePage;
