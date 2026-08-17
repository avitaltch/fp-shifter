import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  BellRing,
  CalendarCheck,
  Check,
  CircleCheck,
  Clock3,
  Sparkles,
  UsersRound,
  Waypoints,
} from 'lucide-react';
import './LandingPage.css';

const FEATURES = [
  {
    icon: Waypoints,
    tone: 'indigo',
    number: '01',
    title: 'ביקור מורכב, מסלול אחד',
    text: 'מחברים כמה שירותים ברצף ומוצאים אוטומטית את אנשי הצוות הנכונים לכל שלב.',
  },
  {
    icon: UsersRound,
    tone: 'coral',
    number: '02',
    title: 'הצוות נשאר מסונכרן',
    text: 'כל העברה בין נותני שירות ברורה מראש, בלי שרשורי הודעות ותיאומים ידניים.',
  },
  {
    icon: BellRing,
    tone: 'mint',
    number: '03',
    title: 'היומן עובד בשבילכם',
    text: 'זמינות אמיתית, תזכורות חכמות ומילוי ביטולים עוזרים לשמור על יום עבודה מלא.',
  },
];

const LandingPage = () => {
  return (
    <div className="landing-page">
      <section className="hero-section container" aria-labelledby="hero-title">
        <div className="hero-copy">
          <div className="hero-eyebrow">
            <Sparkles size={15} aria-hidden="true" />
            תיאום חכם לעסקי שירות
          </div>
          <h1 id="hero-title" className="hero-title">
            ביקור אחד. כמה שירותים.
            <span> הכל מתחבר.</span>
          </h1>
          <p className="hero-subtitle">
            ShiftSync בונה את רצף השירותים, בודק מי פנוי לכל שלב ומציג ללקוח
            רק זמנים שבאמת עובדים — לצוות וליומן.
          </p>
          <div className="hero-actions">
            <Link to="/book" className="btn-primary hero-primary-action">
              הזמנת תור חדש
              <ArrowLeft size={18} aria-hidden="true" />
            </Link>
            <Link to="/about" className="btn-secondary">קרא עוד על המערכת</Link>
          </div>
          <ul className="hero-assurances" aria-label="יתרונות מרכזיים">
            <li><Check size={15} aria-hidden="true" /> ללא אפליקציה ללקוח</li>
            <li><Check size={15} aria-hidden="true" /> זמינות בזמן אמת</li>
            <li><Check size={15} aria-hidden="true" /> עברית מההתחלה</li>
          </ul>
        </div>

        <figure className="schedule-visual" aria-labelledby="schedule-caption">
          <div className="visual-orbit visual-orbit--one" aria-hidden="true" />
          <div className="visual-orbit visual-orbit--two" aria-hidden="true" />
          <div className="schedule-window">
            <div className="schedule-window-header">
              <span className="schedule-date">
                <CalendarCheck size={17} aria-hidden="true" />
                הביקור של נועה
              </span>
              <span className="schedule-status">
                <CircleCheck size={14} aria-hidden="true" />
                המסלול מוכן
              </span>
            </div>
            <div className="schedule-summary">
              <div>
                <span>יום שני</span>
                <strong>09:30–11:15</strong>
              </div>
              <span className="schedule-duration"><Clock3 size={15} /> שעה ו־45 דק׳</span>
            </div>
            <div className="service-route" aria-label="שלושה שירותים רצופים">
              <div className="route-line" aria-hidden="true"><span /></div>
              <div className="route-step route-step--active">
                <span className="route-node">1</span>
                <div><strong>ייעוץ</strong><small>דנה · 09:30</small></div>
              </div>
              <div className="route-step">
                <span className="route-node">2</span>
                <div><strong>טיפול</strong><small>מאיה · 10:00</small></div>
                <span className="handoff-pill">החלפת מטפל/ת</span>
              </div>
              <div className="route-step">
                <span className="route-node">3</span>
                <div><strong>סיום ומעקב</strong><small>דנה · 10:45</small></div>
              </div>
            </div>
            <div className="schedule-footer-note">
              <Sparkles size={15} aria-hidden="true" />
              כל נותני השירות פנויים — בלי חפיפות
            </div>
          </div>
          <figcaption id="schedule-caption">
            ShiftSync הופך כמה שירותים למסלול ביקור אחד וברור.
          </figcaption>
        </figure>
      </section>

      <section className="features-section container" aria-labelledby="features-title">
        <div className="features-heading">
          <span>פחות תיאומים. יותר יום עבודה.</span>
          <h2 id="features-title">המערכת שמבינה איך השירותים שלכם מתחברים</h2>
        </div>
        <div className="features-grid">
          {FEATURES.map(({ icon: Icon, tone, number, title, text }, index) => (
            <article
              key={number}
              className={`feature-card feature-card--${tone}`}
              style={{ '--feature-delay': `${index * 90}ms` }}
            >
              <span className="feature-number" aria-hidden="true">{number}</span>
              <span className="feature-icon"><Icon size={25} aria-hidden="true" /></span>
              <h3>{title}</h3>
              <p>{text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-cta container" aria-label="התחלת הזמנה">
        <div>
          <span className="cta-kicker">היומן יכול להרגיש פשוט יותר</span>
          <h2>נותנים ללקוח לבחור. אנחנו דואגים שהכל יסתדר.</h2>
        </div>
        <Link to="/book" className="btn-primary">
          מתחילים בבחירת שירותים
          <ArrowLeft size={18} aria-hidden="true" />
        </Link>
      </section>
    </div>
  );
};

export default LandingPage;
