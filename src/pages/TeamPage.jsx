import { useState, useEffect, useCallback } from 'react';
import { Briefcase, ShieldCheck, UserRound } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { listStaffWithSkills, listServices, addSkill, removeSkill, setUserRole } from '../lib/api';
import { friendlyError } from '../lib/errors';
import PageContainer from '../components/PageContainer/PageContainer';
import EmptyState from '../components/EmptyState/EmptyState';
import LoadingSpinner from '../components/LoadingSpinner/LoadingSpinner';
import './TeamPage.css';

// Admin page: manage each staff member's role and skills (which services
// they can perform). Skills drive both the customer slot engine and the
// assignment page. New employees are invited from the Supabase dashboard.
const TeamPage = () => {
  const { session } = useAuth();
  const [staff, setStaff] = useState([]);
  const [skills, setSkills] = useState([]);
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);
  const [busyKey, setBusyKey] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [{ staff: staffData, skills: skillsData }, servicesData] = await Promise.all([
        listStaffWithSkills(),
        listServices(),
      ]);
      setStaff(staffData);
      setSkills(skillsData);
      setServices(servicesData);
    } catch (err) {
      console.error(err);
      setError('שגיאה בטעינת נתוני הצוות.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const toggleSkill = async (employee, service) => {
    const existing = skills.find(
      (s) => s.user_id === employee.id && s.service_type_id === service.id
    );
    const key = `${employee.id}:${service.id}`;
    setBusyKey(key);
    setMessage(null);
    try {
      if (existing) {
        await removeSkill(existing.id);
        setSkills((prev) => prev.filter((s) => s.id !== existing.id));
      } else {
        const created = await addSkill(employee.id, service.id);
        setSkills((prev) => [...prev, created]);
      }
    } catch (err) {
      console.error(err);
      setMessage({ type: 'error', text: friendlyError(err, 'שגיאה בעדכון המיומנות.') });
    } finally {
      setBusyKey(null);
    }
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
    setMessage(null);
    try {
      await setUserRole(employee.id, role);
      setStaff((prev) => prev.map((u) => (u.id === employee.id ? { ...u, role } : u)));
      setMessage({ type: 'success', text: 'התפקיד עודכן בהצלחה.' });
    } catch (err) {
      console.error(err);
      setMessage({ type: 'error', text: friendlyError(err, 'שגיאה בעדכון התפקיד.') });
    }
  };

  return (
    <PageContainer size="lg" className="team-page">
      <header className="page-header">
        <Briefcase size={32} className="header-icon" />
        <h1>ניהול צוות</h1>
        <p>
          ניהול תפקידים ומיומנויות. עובדים חדשים מצטרפים בהזמנה בלבד
          (Supabase → Authentication → Invite user).
        </p>
      </header>

      {loading && <LoadingSpinner text="טוען צוות..." />}
      {error && <p className="error-text">{error}</p>}
      {message && (
        <p className={message.type === 'error' ? 'error-text' : 'success-text'}>{message.text}</p>
      )}

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
