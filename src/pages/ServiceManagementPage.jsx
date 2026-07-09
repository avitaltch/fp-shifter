import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import PageContainer from '../components/PageContainer/PageContainer';
import EmptyState from '../components/EmptyState/EmptyState';
import { Settings, Plus, Trash2, Edit2, Check, X } from 'lucide-react';
import './ServiceManagementPage.css';

const ServiceManagementPage = () => {
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState(null);
  
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    base_price: '',
    default_duration: ''
  });

  useEffect(() => {
    fetchServices();
  }, []);

  const fetchServices = async () => {
    try {
      setLoading(true);
      const { data, error: fetchError } = await supabase
        .from('service_types')
        .select('*')
        .is('deleted_at', null)
        .order('name');
      
      if (fetchError) throw fetchError;
      setServices(data || []);
    } catch (err) {
      setError('שגיאה בטעינת השירותים.');
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
  };

  const resetForm = () => {
    setFormData({ name: '', description: '', base_price: '', default_duration: '' });
    setIsAdding(false);
    setEditingId(null);
  };

  const handleSave = async () => {
    if (!formData.name || !formData.base_price || !formData.default_duration) {
      alert('נא למלא את כל שדות החובה.');
      return;
    }

    try {
      const payload = {
        name: formData.name,
        description: formData.description,
        base_price: parseFloat(formData.base_price),
        default_duration: parseInt(formData.default_duration, 10)
      };

      if (editingId) {
        const { error: updateError } = await supabase
          .from('service_types')
          .update(payload)
          .eq('id', editingId);
        if (updateError) throw updateError;
      } else {
        const { error: insertError } = await supabase
          .from('service_types')
          .insert([payload]);
        if (insertError) throw insertError;
      }
      
      resetForm();
      fetchServices();
    } catch (err) {
      alert('שגיאה בשמירת השירות.');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('האם אתה בטוח שברצונך למחוק שירות זה?')) return;
    
    try {
      // Soft delete
      const { error: deleteError } = await supabase
        .from('service_types')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id);
        
      if (deleteError) throw deleteError;
      fetchServices();
    } catch (err) {
      alert('שגיאה במחיקת השירות.');
    }
  };

  const startEdit = (service) => {
    setFormData({
      name: service.name,
      description: service.description || '',
      base_price: service.base_price.toString(),
      default_duration: service.default_duration.toString()
    });
    setEditingId(service.id);
    setIsAdding(false);
  };

  return (
    <PageContainer size="md" className="service-management-page">
      <header className="page-header">
        <Settings size={32} className="header-icon" />
        <h1>ניהול שירותים</h1>
        <p>הוסף, ערוך ומחק את סוגי הטיפולים שהעסק מציע</p>
      </header>

      <div className="actions-bar">
        {!isAdding && !editingId && (
          <button className="btn-primary" onClick={() => setIsAdding(true)}>
            <Plus size={18} /> הוסף שירות חדש
          </button>
        )}
      </div>

      {(isAdding || editingId) && (
        <div className="card service-form">
          <h3>{editingId ? 'עריכת שירות' : 'שירות חדש'}</h3>
          <div className="form-grid">
            <div className="form-group">
              <label>שם השירות *</label>
              <input type="text" name="name" value={formData.name} onChange={handleInputChange} placeholder="לדוגמה: תספורת" />
            </div>
            <div className="form-group">
              <label>מחיר בסיסי (₪) *</label>
              <input type="number" name="base_price" value={formData.base_price} onChange={handleInputChange} placeholder="לדוגמה: 150" />
            </div>
            <div className="form-group">
              <label>משך זמן בדקות *</label>
              <input type="number" name="default_duration" value={formData.default_duration} onChange={handleInputChange} placeholder="לדוגמה: 45" />
            </div>
            <div className="form-group full-width">
              <label>תיאור</label>
              <textarea name="description" value={formData.description} onChange={handleInputChange} placeholder="תיאור קצר של הטיפול..." />
            </div>
          </div>
          <div className="form-actions">
            <button className="btn-primary" onClick={handleSave}>
              <Check size={18} /> שמור
            </button>
            <button className="btn-secondary" onClick={resetForm}>
              <X size={18} /> ביטול
            </button>
          </div>
        </div>
      )}

      {loading && <p>טוען שירותים...</p>}
      {error && <p className="error-text">{error}</p>}
      
      {!loading && !error && services.length === 0 && !isAdding && (
        <EmptyState icon={Settings} text="לא נמצאו שירותים. הוסף את השירות הראשון שלך!" />
      )}

      {!loading && services.length > 0 && (
        <div className="services-list">
          {services.map(service => (
            <div key={service.id} className="card service-card">
              <div className="service-info">
                <h3>{service.name}</h3>
                <p className="service-desc">{service.description || 'ללא תיאור'}</p>
                <div className="service-meta">
                  <span className="badge">₪{service.base_price}</span>
                  <span className="badge">{service.default_duration} דק'</span>
                </div>
              </div>
              <div className="service-actions">
                <button className="icon-btn edit" onClick={() => startEdit(service)} title="ערוך" disabled={isAdding || editingId}>
                  <Edit2 size={18} />
                </button>
                <button className="icon-btn delete" onClick={() => handleDelete(service.id)} title="מחק" disabled={isAdding || editingId}>
                  <Trash2 size={18} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </PageContainer>
  );
};

export default ServiceManagementPage;
