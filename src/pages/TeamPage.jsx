import { useState, useCallback } from 'react';
import { Briefcase, ShieldCheck, UserRound, Pencil, Check, X, UserX } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  listStaffWithSkills,
  listServices,
  addSkill,
  removeSkill,
  setUserRole,
  updateStaffProfile,
  deactivateStaff,
} from '../lib/api';
import { useAsyncData } from '../hooks/useAsyncData';
import { useAction } from '../hooks/useAction';
import PageContainer from '../components/PageContainer/PageContainer';
import PageHeader from '../components/PageHeader/PageHeader';
import Alert from '../components/Alert/Alert';
import EmptyState from '../components/EmptyState/EmptyState';
import LoadingSpinner from '../components/LoadingSpinner/LoadingSpinner';
import './TeamPage.css';

// Admin page: manage each staff member's name, role and skills.
// New employees are invited from the Supabase dashboard (default name "New User").
const TeamPage = () => {
  const { session, retryProfile } = useAuth();
  const [editingId, setEditingId] = useState(null);
  const [nameDraft, setNameDraft] = useState({ first_name: '', last_name: '', phone: '' });

  const fetchTeam = useCallback(async () => {
    const [{ staff, skills }, services] = await Promise.all([
      listStaffWithSkills(),
      listServices(),
    ]);
    return { staff, skills, services };
  }, []);
  const { data, setData, loading, error } = useAsyncData(fetchTeam, {
    errorMessage: 'שגיאה בטעינת נתוני הצוות.',
  });
  const { busyKey, message, setMessage, run } = useAction();

  const staff = data?.staff ?? [];
  const skills = data?.skills ?? [];
  const services = data?.services ?? [];

  const startEditName = (employee) => {
    setEditingId(employee.id);
    setNameDraft({
      first_name: employee.first_name === 'New' ? '' : employee.first_name,
      last_name: employee.last_name === 'User' ? '' : employee.last_name,
      phone: employee.phone || '',
    });
    setMessage(null);
  };

  const cancelEditName = () => {
    setEditingId(null);
    setNameDraft({ first_name: '', last_name: '', phone: '' });
  };

  const saveName = async (employee) => {
    const first = nameDraft.first_name.trim();
    const last = nameDraft.last_name.trim();
    const phone = nameDraft.phone.trim();
    if (!first || !last) {
      setMessage({ type: 'error', text: 'נא להזין שם פרטי ושם משפחה.' });
      return;
    }

    const { ok, result } = await run(
      `name:${employee.id}`,
      () =>
        updateStaffProfile(employee.id, {
          first_name: first,
          last_name: last,
          phone: phone || null,
        }),
      {
        success: 'הפרטים עודכנו בהצלחה.',
        errorFallback: 'שגיאה בעדכון הפרטים.',
      }
    );
    if (ok) {
      setData((prev) => ({
        ...prev,
        staff: prev.staff.map((u) =>
          u.id === employee.id
            ? { ...u, first_name: result.first_name, last_name: result.last_name, phone: result.phone }
            : u
        ),
      }));
      setEditingId(null);
      if (employee.id === session?.user?.id) retryProfile?.();
    }
  };

  const deactivate = async (employee) => {
    const confirmed = window.confirm(
      `להשבית את ${employee.first_name} ${employee.last_name}? כל השיבוצים העתידיים של העובד/ת יבוטלו ויחזרו לרשימת הממתינים לשיבוץ.`
    );
    if (!confirmed) return;

    // admin_deactivate_user RPC: soft-deletes the profile and frees the
    // employee's future assignments in one transaction.
    const { ok } = await run(
      `deactivate:${employee.id}`,
      () => deactivateStaff(employee.id),
      {
        success: 'העובד/ת הושבת/ה והשיבוצים העתידיים שוחררו.',
        errorFallback: 'שגיאה בהשבתת העובד/ת.',
      }
    );
    if (ok) {
      setData((prev) => ({
        ...prev,
        staff: prev.staff.filter((u) => u.id !== employee.id),
      }));
    }
  };

  const toggleSkill = async (employee, service) => {
    const existing = skills.find(
      (s) => s.user_id === employee.id && s.service_type_id === service.id
    );
    const key = `${employee.id}:${service.id}`;
    await run(
      key,
      async () => {
        if (existing) {
          await removeSkill(existing.id);
          setData((prev) => ({
            ...prev,
            skills: prev.skills.filter((s) => s.id !== existing.id),
          }));
        } else {
          const created = await addSkill(employee.id, service.id);
          setData((prev) => ({ ...prev, skills: [...prev.skills, created] }));
        }
      },
      { errorFallback: 'שגיאה בעדכון המיומנות.' }
    );
  };

  const changeRole = async (employee, role) => {
    if (role === employee.role) return;
    if (employee.id === session?.user?.id) {
      setMessage({ type: 'error', text: 'לא ניתן לשנות את התפקיד של עצמך.' });
      return;
    }
    if (!window.confirm(`לשנות את התפקיד של ${employee.first_name} ל-${role === 'Admin' ? 'מנהל' : 'עובד'}?`)) {
      return;
    }
    const { ok } = await run(employee.id, () => setUserRole(employee.id, role), {
      success: 'התפקיד עודכן בהצלחה.',
      errorFallback: 'שגיאה בעדכון התפקיד.',
    });
    if (ok) {
      setData((prev) => ({
        ...prev,
        staff: prev.staff.map((u) => (u.id === employee.id ? { ...u, role } : u)),
      }));
    }
  };

  return (
    <PageContainer size="lg" className="team-page">
      <PageHeader
        icon={Briefcase}
        title="ניהול צוות"
        subtitle="ניהול שמות, תפקידים ומיומנויות. עובדים חדשים מצטרפים בהזמנה בלבד (Supabase → Authentication → Invite user)."
      />

      {loading && <LoadingSpinner text="טוען צוות..." />}
      <Alert type="error">{error}</Alert>
      <Alert type={message?.type}>{message?.text}</Alert>

      {!loading && !error && staff.length === 0 && (
        <EmptyState text="אין עדיין חברי צוות. הזמינו עובדים דרך לוח הבקרה של Supabase." />
      )}

      {!loading && !error && staff.length > 0 && (
        <div className="team-list">
          {staff.map((employee) => (
            <div key={employee.id} className="card team-card">
              <div className="team-member">
                {editingId === employee.id ? (
                  <div className="name-edit">
                    <input
                      aria-label={`שם פרטי של ${employee.first_name}`}
                      value={nameDraft.first_name}
                      onChange={(e) => setNameDraft((d) => ({ ...d, first_name: e.target.value }))}
                      placeholder="שם פרטי"
                    />
                    <input
                      aria-label={`שם משפחה של ${employee.first_name}`}
                      value={nameDraft.last_name}
                      onChange={(e) => setNameDraft((d) => ({ ...d, last_name: e.target.value }))}
                      placeholder="שם משפחה"
                    />
                    <input
                      type="tel"
                      dir="ltr"
                      aria-label={`טלפון של ${employee.first_name}`}
                      value={nameDraft.phone}
                      onChange={(e) => setNameDraft((d) => ({ ...d, phone: e.target.value }))}
                      placeholder="טלפון"
                    />
                    <button
                      type="button"
                      className="icon-btn save"
                      aria-label="שמור שם"
                      onClick={() => saveName(employee)}
                      disabled={busyKey === `name:${employee.id}`}
                    >
                      <Check size={18} />
                    </button>
                    <button
                      type="button"
                      className="icon-btn cancel"
                      aria-label="בטל עריכת שם"
                      onClick={cancelEditName}
                      disabled={busyKey === `name:${employee.id}`}
                    >
                      <X size={18} />
                    </button>
                  </div>
                ) : (
                  <div className="member-name">
                    {employee.role === 'Admin' ? <ShieldCheck size={20} /> : <UserRound size={20} />}
                    <h3>{employee.first_name} {employee.last_name}</h3>
                    <button
                      type="button"
                      className="icon-btn edit-name"
                      aria-label={`ערוך שם של ${employee.first_name}`}
                      onClick={() => startEditName(employee)}
                    >
                      <Pencil size={16} />
                    </button>
                  </div>
                )}
                <div className="member-actions">
                  <select
                    className="role-select"
                    value={employee.role}
                    onChange={(e) => changeRole(employee, e.target.value)}
                    disabled={employee.id === session?.user?.id}
                    aria-label={`תפקיד של ${employee.first_name}`}
                  >
                    <option value="Employee">עובד/ת</option>
                    <option value="Admin">מנהל/ת</option>
                  </select>
                  {employee.id !== session?.user?.id && (
                    <button
                      type="button"
                      className="icon-btn deactivate"
                      aria-label={`השבתת ${employee.first_name} ${employee.last_name}`}
                      title="השבתת עובד/ת"
                      onClick={() => deactivate(employee)}
                      disabled={busyKey === `deactivate:${employee.id}`}
                    >
                      <UserX size={18} />
                    </button>
                  )}
                </div>
              </div>

              <div className="skills-section">
                <h4>מיומנויות (שירותים שהעובד/ת מבצע/ת):</h4>
                {services.length === 0 ? (
                  <p className="hint">אין שירותים במערכת — יש להוסיף שירותים תחילה.</p>
                ) : (
                  <div className="skills-grid">
                    {services.map((service) => {
                      const active = skills.some(
                        (s) => s.user_id === employee.id && s.service_type_id === service.id
                      );
                      const key = `${employee.id}:${service.id}`;
                      return (
                        <button
                          key={service.id}
                          type="button"
                          className={`skill-chip ${active ? 'active' : ''}`}
                          onClick={() => toggleSkill(employee, service)}
                          disabled={busyKey === key}
                        >
                          {service.name}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </PageContainer>
  );
};

export default TeamPage;
