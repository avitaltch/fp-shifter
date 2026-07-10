import { useCallback } from 'react';
import { Briefcase, ShieldCheck, UserRound } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { listStaffWithSkills, listServices, addSkill, removeSkill, setUserRole } from '../lib/api';
import { useAsyncData } from '../hooks/useAsyncData';
import { useAction } from '../hooks/useAction';
import PageContainer from '../components/PageContainer/PageContainer';
import PageHeader from '../components/PageHeader/PageHeader';
import Alert from '../components/Alert/Alert';
import EmptyState from '../components/EmptyState/EmptyState';
import LoadingSpinner from '../components/LoadingSpinner/LoadingSpinner';
import './TeamPage.css';

// Admin page: manage each staff member's role and skills (which services
// they can perform). Skills drive both the customer slot engine and the
// assignment page. New employees are invited from the Supabase dashboard.
const TeamPage = () => {
  const { session } = useAuth();

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
        subtitle="ניהול תפקידים ומיומנויות. עובדים חדשים מצטרפים בהזמנה בלבד (Supabase → Authentication → Invite user)."
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
                <div className="member-name">
                  {employee.role === 'Admin' ? <ShieldCheck size={20} /> : <UserRound size={20} />}
                  <h3>{employee.first_name} {employee.last_name}</h3>
                </div>
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
