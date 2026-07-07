import { Link } from 'react-router-dom';
import { CheckCircle } from 'lucide-react';
import './BookingSuccessPage.css';

const BookingSuccessPage = () => {
  return (
    <div className="success-page fade-in">
      <div className="success-container">
        <CheckCircle size={80} className="success-icon" />
        <h1>התור שלך נקבע בהצלחה!</h1>
        <p>שלחנו לך הודעת אישור לוואטסאפ עם כל פרטי הביקור.</p>
        
        <div className="booking-details">
          <h3>פרטי הביקור:</h3>
          <p><strong>תאריך:</strong> 15 באוקטובר 2023</p>
          <p><strong>שעה:</strong> 10:00</p>
          <p><strong>זמן מוערך:</strong> שעה ו-45 דקות</p>
        </div>

        <Link to="/" className="home-link">חזרה לעמוד הבית</Link>
      </div>
    </div>
  );
};

export default BookingSuccessPage;
