import { Link, useParams } from 'react-router-dom';
import { CheckCircle, Calendar, User, ArrowRight } from 'lucide-react';
import PageContainer from '../components/PageContainer/PageContainer';
import './BookingSuccessPage.css';

const BookingSuccessPage = () => {
  const { businessId } = useParams();

  return (
    <PageContainer size="sm" className="success-page">
      <div className="success-header">
        <CheckCircle size={80} className="success-icon" />
        <h1>התור שלך נקבע בהצלחה!</h1>
        <p>שלחנו לך הודעת אישור לוואטסאפ עם כל פרטי הביקור.</p>
        
        <div className="booking-details">
          <h3>פרטי הביקור:</h3>
          <p><strong>תאריך:</strong> 15 באוקטובר 2023</p>
          <p><strong>שעה:</strong> 10:00</p>
          <p><strong>זמן מוערך:</strong> שעה ו-45 דקות</p>
        </div>

        <Link to={`/book/${businessId || 1}`} className="btn-secondary">
          <ArrowRight size={18} />
          חזרה להזמנת תור נוסף
        </Link>
      </div>
    </PageContainer>
  );
};

export default BookingSuccessPage;
