import { Link } from 'react-router-dom';
import { CalendarCheck, Users, Clock } from 'lucide-react';
import './LandingPage.css';

const LandingPage = () => {
  return (
    <div className="landing-page container">
      <section className="hero-section text-center">
        <h1 className="hero-title">ניהול משמרות, עכשיו <span className="text-primary">ללא חיכוך</span></h1>
        <p className="hero-subtitle">פלטפורמה חכמה, קלה ונקייה לתכנון משמרות העובדים שלך.</p>
        <div className="hero-actions">
          <Link to="/book" className="btn-primary">
            הזמנת תור חדש
          </Link>
          <Link to="/about" className="btn-secondary">קרא עוד</Link>
        </div>
      </section>

      <section className="features-section">
        <div className="card feature-card">
          <CalendarCheck className="feature-icon" size={40} />
          <h3>תכנון מהיר</h3>
          <p>שיבוץ משמרות בקליק, חוסך זמן יקר למנהל.</p>
        </div>
        <div className="card feature-card">
          <Users className="feature-icon" size={40} />
          <h3>ניהול צוותים</h3>
          <p>סנכרון מלא עם הצוות, זמינות עובדים בלייב.</p>
        </div>
        <div className="card feature-card">
          <Clock className="feature-icon" size={40} />
          <h3>זמינות חכמה</h3>
          <p>לקוחות רואים רק שעות שבהן באמת יש עובד פנוי ומיומן.</p>
        </div>
      </section>
    </div>
  );
};

export default LandingPage;
