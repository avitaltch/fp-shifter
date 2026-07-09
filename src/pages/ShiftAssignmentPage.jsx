import { useState, useEffect } from 'react';
import { Users, CheckCircle, Clock } from 'lucide-react';
import { supabase } from '../lib/supabase';
import PageContainer from '../components/PageContainer/PageContainer';
import EmptyState from '../components/EmptyState/EmptyState';
import LoadingSpinner from '../components/LoadingSpinner/LoadingSpinner';
import './ShiftAssignmentPage.css';

const ShiftAssignmentPage = () => {
  const [unassignedItems, setUnassignedItems] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [assigningId, setAssigningId] = useState(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      
      // Fetch unassigned items
      const { data: items, error: itemsError } = await supabase
        .from('appointment_items')
        .select(`
          id, start_time, end_time,
          appointments!inner (visit_date, customers (first_name, last_name)),
          service_types (name)
        `)
        .is('user_id', null)
        .order('start_time', { ascending: true });
        
      if (itemsError) throw itemsError;

      // Fetch employees
      const { data: emps, error: empsError } = await supabase
        .from('users')
        .select('id, first_name, last_name')
        .eq('role', 'Employee');
        
      if (empsError) throw empsError;

      setUnassignedItems(items || []);
      setEmployees(emps || []);
    } catch (err) {
      console.error(err);
      setError("שגיאה בטעינת הנתונים.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleAssign = async (itemId, userId) => {
    if (!userId) return;
    setAssigningId(itemId);
    
    try {
      const { error } = await supabase
        .from('appointment_items')
        .update({ user_id: userId })
        .eq('id', itemId);
        
      if (error) throw error;
      
      // Remove from list
      setUnassignedItems(prev => prev.filter(item => item.id !== itemId));
    } catch (err) {
      console.error(err);
      alert("שגיאה בשיבוץ העובד.");
    } finally {
      setAssigningId(null);
    }
  };

  return (
    <PageContainer size="md" className="assignment-page">
      <header className="page-header">
        <Users size={32} className="header-icon" />
        <h1>שיבוץ משמרות</h1>
        <p>הקצה עובדים למשמרות חסרות או נהל שיבוצים קיימים.</p>
      </header>
        
      {loading && <LoadingSpinner text="טוען נתונים..." />}
      {error && <p className="error-text">{error}</p>}
      
      {!loading && !error && unassignedItems.length === 0 && (
        <EmptyState 
          icon={CheckCircle}
          text="מעולה! כל הטיפולים שובצו בהצלחה." 
        />
      )}

      {!loading && !error && unassignedItems.length > 0 && (
        <div className="unassigned-list">
          {unassignedItems.map(item => (
            <div key={item.id} className="unassigned-card">
              <div className="unassigned-info">
                <h3>{item.service_types?.name}</h3>
                <p>
                  <strong>לקוח/ה:</strong> {item.appointments?.customers?.first_name} {item.appointments?.customers?.last_name}
                </p>
                <div className="time-badge">
                  <Clock size={14} />
                  <span>
                    {item.appointments?.visit_date} | {item.start_time.substring(0, 5)} - {item.end_time.substring(0, 5)}
                  </span>
                </div>
              </div>
              <div className="assign-action">
                <select 
                  onChange={(e) => handleAssign(item.id, e.target.value)}
                  defaultValue=""
                  disabled={assigningId === item.id}
                  className="employee-select"
                >
                  <option value="" disabled>
                    {assigningId === item.id ? 'משבץ...' : 'בחר/י עובד/ת לשיבוץ'}
                  </option>
                  {employees.map(emp => (
                    <option key={emp.id} value={emp.id}>
                      {emp.first_name} {emp.last_name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ))}
        </div>
      )}
    </PageContainer>
  );
};

export default ShiftAssignmentPage;
