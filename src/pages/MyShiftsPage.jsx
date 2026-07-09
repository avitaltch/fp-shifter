import { useState, useEffect } from 'react';
import { Clock, User, CheckCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import PageContainer from '../components/PageContainer/PageContainer';
import EmptyState from '../components/EmptyState/EmptyState';
import './MyShiftsPage.css';

const MyShiftsPage = () => {
  const [session, setSession] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });
  }, []);

  useEffect(() => {
    if (!session) return;

    const fetchTasks = async () => {
      try {
        setLoading(true);
        const today = new Date().toISOString().split('T')[0];
        
        const { data, error } = await supabase
          .from('appointment_items')
          .select(`
            id, start_time, end_time, status,
            appointments!inner ( id, visit_date, customers ( first_name, last_name ) ),
            service_types ( name )
          `)
          .eq('user_id', session.user.id)
          .eq('appointments.visit_date', today)
          .order('start_time', { ascending: true });

        if (error) throw error;
        setTasks(data || []);
      } catch (err) {
        console.error(err);
        setError("שגיאה בטעינת משמרות. יש לרענן.");
      } finally {
        setLoading(false);
      }
    };

    fetchTasks();
  }, [session]);

  const toggleStatus = async (taskId, currentStatus) => {
    const nextStatus = currentStatus === 'Scheduled' ? 'In_Progress' : currentStatus === 'In_Progress' ? 'Done' : 'Scheduled';
    try {
      const { error } = await supabase
        .from('appointment_items')
        .update({ status: nextStatus })
        .eq('id', taskId);
        
      if (error) throw error;
      
      // Update local state
      setTasks(tasks.map(t => t.id === taskId ? { ...t, status: nextStatus } : t));
    } catch (err) {
      alert("שגיאה בעדכון הסטטוס");
    }
  };

  if (!session) {
    return <PageContainer size="md" className="my-shifts-page"><p>יש להתחבר כדי לצפות במשמרות</p></PageContainer>;
  }

  return (
    <PageContainer size="md" className="my-shifts-page">
      <header className="page-header">
          <User size={32} className="header-icon" />
          <h1>המשמרות שלי - {session.user.user_metadata?.full_name}</h1>
          <p>הטיפולים ששובצת אליהם להיום ({new Date().toLocaleDateString('he-IL')})</p>
        </header>

        <div className="tasks-list">
          {loading && <p>טוען משמרות...</p>}
          {error && <p className="error-text">{error}</p>}
          {!loading && !error && tasks.length === 0 ? (
            <EmptyState text="אין טיפולים שנקבעו להיום. איזה כיף!" />
          ) : (
            tasks.map(task => {
              const customerName = task.appointments?.customers 
                ? `${task.appointments.customers.first_name} ${task.appointments.customers.last_name}` 
                : 'לקוח לא ידוע';
                
              return (
                <div key={task.id} className="task-card">
                  <div className="task-time">
                    <Clock size={16} />
                    <span>{task.start_time.substring(0, 5)} - {task.end_time.substring(0, 5)}</span>
                  </div>
                  <div className="task-details">
                    <h3>{task.service_types?.name}</h3>
                    <p>לקוח/ה: <strong>{customerName}</strong></p>
                    <button 
                      className={`status-btn ${task.status.toLowerCase()}`}
                      onClick={() => toggleStatus(task.id, task.status)}
                    >
                      {task.status === 'Scheduled' && 'מתוכנן - לחץ להתחלה'}
                      {task.status === 'In_Progress' && 'בביצוע - לחץ לסיום'}
                      {task.status === 'Done' && <><CheckCircle size={14} style={{marginLeft: '4px'}}/> הסתיים</>}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
    </PageContainer>
  );
};

export default MyShiftsPage;
