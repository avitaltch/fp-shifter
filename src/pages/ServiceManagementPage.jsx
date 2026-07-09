import { useState, useEffect } from 'react';
import { listServices, createService, updateService, deleteService } from '../lib/api';
import { friendlyError } from '../lib/errors';
import PageContainer from '../components/PageContainer/PageContainer';
import EmptyState from '../components/EmptyState/EmptyState';
import LoadingSpinner from '../components/LoadingSpinner/LoadingSpinner';
import { Settings, Plus, Trash2, Edit2, Check, X } from 'lucide-react';
import './ServiceManagementPage.css';

const ServiceManagementPage = () => {
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [formError, setFormError] = useState(null);
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);

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
      setError(null);
      setServices(await listServices());
    } catch (err) {
      console.error(err);
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
    setFormError(null);
  };

  const handleSave = async () => {
    setFormError(null);

    const price = parseFloat(formData.base_price);
    const duration = parseInt(formData.default_duration, 10);

    if (!formData.name.trim()) {
      setFormError('נא להזין שם שירות.');
      return;
    }
    if (Number.isNaN(price) || price < 0) {
      setFormError('המחיר חייב להיות מספר חיובי.');
      return;
    }
    if (Number.isNaN(duration) || duration <= 0) {
      setFormError('משך הטיפול חייב להיות מספר דקות חיובי.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: formData.name.trim(),
        description: formData.description.trim(),
        base_price: price,
        default_duration: duration
      };

      if (editingId) {
        await updateService(editingId, payload);
      } else {
        await createService(payload);
      }

      resetForm();
      fetchServices();
    } catch (err) {
      console.error(err);
      const isDuplicate = (err?.message || '').includes('service_types_name_unique');
      setFormError(
        isDuplicate ? 'כבר קיים שירות בשם זה.' : friendlyError(err, 'שגיאה בשמירת השירות.')
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('האם אתה בטוח שברצונך למחוק שירות זה? תורים קיימים לא יימחקו.')) return;

    try {
      setError(null);
      await deleteService(id);
      fetchServices();
    } catch (err) {
      console.error(err);
      setError(friendlyError(err, 'שגיאה במחיקת השירות.'));
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
    setFormError(null);
  };

  return (
    <PageContainer size="md" className="service-management-page">
      <header className="page-header">
        <Settings size={32} className="header-icon" />
        <h1>ניהול שירותים</h1>
        <p>הוסף, ערוך ומחק את סוגי השירותים שהעסק מציע</p>
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
              <label htmlFor="service-name">שם השירות *</label>
              <input id="service-name" type="text" name="name" value={formData.name} onChange={handleInputChange} placeholder="לדוגמה: תספורת" />
            </div>
            <div className="form-group">
              <label htmlFor="service-price">מחיר בסיסי (₪) *</label>
              <input id="service-price" type="number" name="base_price" min="0" step="0.5" value={formData.base_price} onChange={handleInputChange} placeholder="לדוגמה: 150" />
            </div>
            <div className="form-group">
              <label htmlFor="service-duration">משך זמן בדקות *</label>
              <input id="service-duration" type="number" name="default_duration" min="5" step="5" value={formData.default_duration} onChange={handleInputChange} placeholder="לדוגמה: 45" />
            </div>
            <div className="form-group full-width">
              <label htmlFor="service-desc">תיאור</label>
              <textarea id="service-desc" name="description" value={formData.description} onChange={handleInputChange} placeholder="תיאור קצר של השירות..." />
            </div>
          </div>
          {formError && <p className="error-text">{formError}</p>}
          <div className="form-actions">
            <button className="btn-primary" onClick={handleSave} disabled={saving}>
              <Check size={18} /> {saving ? 'שומר...' : 'שמור'}
            </button>
            <button className="btn-secondary" onClick={resetForm} disabled={saving}>
              <X size={18} /> ביטול
            </button>
          </div>
        </div>
      )}

      {loading && <LoadingSpinner text="טוען שירותים..." />}
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
                <button className="icon-btn edit" onClick={() => startEdit(service)} title="ערוך" disabled={isAdding || !!editingId}>
                  <Edit2 size={18} />
                </button>
                <button className="icon-btn delete" onClick={() => handleDelete(service.id)} title="מחק" disabled={isAdding || !!editingId}>
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
