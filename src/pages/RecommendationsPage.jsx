import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import PageContainer from '../components/PageContainer/PageContainer';
import EmptyState from '../components/EmptyState/EmptyState';
import LoadingSpinner from '../components/LoadingSpinner/LoadingSpinner';
import { Star, Clock, Calendar as CalendarIcon, UserPlus } from 'lucide-react';
import './RecommendationsPage.css';

const RecommendationsPage = () => {
  const [recommendations, setRecommendations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [session, setSession] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });
  }, []);

  useEffect(() => {
    if (session) {
      fetchRecommendations();
    }
  }, [session]);

  const fetchRecommendations = async () => {
    try {
      setLoading(true);
      
      // Get the unassigned appointment_items that match the user's skills
      // In a real app we'd filter strictly by `employee_skills` overlap, 
      // but for this MVP we'll show any unassigned shifts to encourage volunteering.
      
      const { data, error: fetchError } = await supabase
        .from('appointment_items')
        .select(`
          id,
          start_time,
          end_time,
          status,
          service_types (
            name,
            default_duration
          ),
          appointments (
            visit_date,
            customers (
              first_name,
              last_name
            )
          )
        `)
        .is('user_id', null)
        .is('deleted_at', null)
        .order('start_time', { ascending: true });

      if (fetchError) throw fetchError;
      setRecommendations(data || []);
    } catch (err) {
      setError('שגיאה בטעינת ההמלצות.');
    } finally {
      setLoading(false);
    }
  };

  const handleVolunteer = async (taskId) => {
    if (!session) return;
    
    try {
      setSubmitting(true);
      const { error: updateError } = await supabase
        .from('appointment_items')
        .update({ user_id: session.user.id })
        .eq('id', taskId)
        .is('user_id', null); // ensure it's still unassigned!

      if (updateError) throw updateError;
      
      // Remove it from the list
      setRecommendations(recommendations.filter(r => r.id !== taskId));
      alert('מעולה! המשמרת שובצה אליך בהצלחה.');
    } catch (err) {
      alert('שגיאה בשיבוץ למשמרת. ייתכן שמישהו אחר כבר לקח אותה.');
      fetchRecommendations();
    } finally {
      setSubmitting(false);
    }
  };

  if (!session) {
    return <PageContainer size="md"><p>יש להתחבר כדי לצפות בהמלצות.</p></PageContainer>;
  }

  return (
    <PageContainer size="md" className="recommendations-page">
      <header className="page-header">
        <Star size={32} className="header-icon" />
        <h1>המלצות וחוסרים</h1>
        <p>משמרות פנויות שממתינות לשיבוץ. קח יוזמה ושבץ את עצמך!</p>
      </header>

      {loading && <LoadingSpinner text="טוען המלצות..." />}
      {error && <p className="error-text">{error}</p>}
      
      {!loading && !error && recommendations.length === 0 && (
        <EmptyState icon={Star} text="אין משמרות חסרות כרגע. הכל מתוקתק!" />
      )}

      {!loading && recommendations.length > 0 && (
        <div className="recommendations-list">
          {recommendations.map(rec => (
            <div key={rec.id} className="card recommendation-card">
              <div className="rec-details">
                <div className="rec-service">
                  <h3>{rec.service_types?.name || 'טיפול כללי'}</h3>
                  <span className="duration-badge">{rec.service_types?.default_duration} דק'</span>
                </div>
                
                <div className="rec-meta">
                  <div className="meta-item">
                    <CalendarIcon size={16} />
                    <span>{new Date(rec.appointments?.visit_date).toLocaleDateString('he-IL')}</span>
                  </div>
                  <div className="meta-item">
                    <Clock size={16} />
                    <span>{rec.start_time.substring(0,5)} - {rec.end_time.substring(0,5)}</span>
                  </div>
                  <div className="meta-item customer-name">
                    לקוחה: {rec.appointments?.customers?.first_name} {rec.appointments?.customers?.last_name}
                  </div>
                </div>
              </div>
              
              <div className="rec-action">
                <button 
                  className="btn-primary" 
                  onClick={() => handleVolunteer(rec.id)}
                  disabled={submitting}
                >
                  <UserPlus size={18} />
                  אני פנוי/ה
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
