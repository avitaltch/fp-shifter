import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarSearch } from 'lucide-react';
import PageContainer from '../components/PageContainer/PageContainer';
import PageHeader from '../components/PageHeader/PageHeader';

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const BookingEntryPage = () => {
  const navigate = useNavigate();
  const [businessSlug, setBusinessSlug] = useState('');
  const [error, setError] = useState('');

  const openBusiness = (event) => {
    event.preventDefault();
    const slug = businessSlug.trim().toLowerCase();
    if (!SLUG_PATTERN.test(slug)) {
      setError('קוד העסק אינו תקין. אפשר למצוא אותו בקישור שקיבלתם מהעסק.');
      return;
    }
    navigate(`/book/${slug}`);
  };

  return (
    <PageContainer size="sm">
      <PageHeader
        icon={CalendarSearch}
        title="הזמנת תור"
        subtitle="לכל עסק יש קישור הזמנה אישי"
      />
      <form className="card profile-form" onSubmit={openBusiness}>
        <div className="input-group">
          <label htmlFor="booking-business-slug">קוד העסק</label>
          <input
            id="booking-business-slug"
            dir="ltr"
            value={businessSlug}
            onChange={(event) => setBusinessSlug(event.target.value)}
            placeholder="business-name"
            autoComplete="off"
          />
        </div>
        {error && <p className="error-text" role="alert">{error}</p>}
        <button className="btn-primary" type="submit">המשך להזמנה</button>
      </form>
    </PageContainer>
  );
};

export default BookingEntryPage;
