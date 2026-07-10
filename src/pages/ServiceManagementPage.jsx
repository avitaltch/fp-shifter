import { useState, useCallback } from 'react';
import { listServices, createService, updateService, deleteService } from '../lib/api';
import { friendlyError } from '../lib/errors';
import { useAsyncData } from '../hooks/useAsyncData';
import { useAction } from '../hooks/useAction';
import PageContainer from '../components/PageContainer/PageContainer';
import PageHeader from '../components/PageHeader/PageHeader';
import Alert from '../components/Alert/Alert';
import EmptyState from '../components/EmptyState/EmptyState';
import LoadingSpinner from '../components/LoadingSpinner/LoadingSpinner';
import { Settings, Plus, Trash2, Edit2, Check, X } from 'lucide-react';
import './ServiceManagementPage.css';

const EMPTY_FORM = { name: '', description: '', base_price: '', default_duration: '' };

// Client-side validation; returns { payload } or { error }.
function validateServiceForm(formData) {
  const price = parseFloat(formData.base_price);
  const duration = parseInt(formData.default_duration, 10);

  if (!formData.name.trim()) return { error: 'נא להזין שם שירות.' };
  if (Number.isNaN(price) || price < 0) return { error: 'המחיר חייב להיות מספר חיובי.' };
  if (Number.isNaN(duration) || duration <= 0) {
    return { error: 'משך הטיפול חייב להיות מספר דקות חיובי.' };
  }
  return {
    payload: {
      name: formData.name.trim(),
      description: formData.description.trim(),
      base_price: price,
      default_duration: duration,
    },
  };
}

const ServiceManagementPage = () => {
  const [formError, setFormError] = useState(null);
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState(EMPTY_FORM);

  const fetchServices = useCallback(() => listServices(), []);
  const { data, loading, error, refetch } = useAsyncData(fetchServices, {
    errorMessage: 'שגיאה בטעינת השירותים.',
  });
  const { message: deleteMessage, run } = useAction();

  const services = data ?? [];

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
  };

  const resetForm = () => {
    setFormData(EMPTY_FORM);
    setIsAdding(false);
    setEditingId(null);
    setFormError(null);
  };

  const handleSave = async () => {
    setFormError(null);
    const { payload, error: validationError } = validateServiceForm(formData);
    if (validationError) {
      setFormError(validationError);
      return;
    }

    setSaving(true);
    try {
      if (editingId) {
        await updateService(editingId, payload);
      } else {
        await createService(payload);
      }
      resetForm();
      refetch();
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
    const { ok } = await run(id, () => deleteService(id), {
      errorFallback: 'שגיאה במחיקת השירות.',
    });
    if (ok) refetch();
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
      <PageHeader
        icon={Settings}
        title="ניהול שירותים"
        subtitle="הוסף, ערוך ומחק את סוגי השירותים שהעסק מציע"
      />

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
          <Alert type="error">{formError}</Alert>
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
      <Alert type="error">{error}</Alert>
      <Alert type={deleteMessage?.type}>{deleteMessage?.text}</Alert>

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
