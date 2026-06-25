import './Footer.css';

const Footer = () => {
  return (
    <footer className="footer">
      <div className="container">
        <p>© {new Date().getFullYear()} ShiftSync. כל הזכויות שמורות.</p>
        <p className="footer-subtext">פלטפורמה חכמה לניהול משמרות</p>
      </div>
    </footer>
  );
};

export default Footer;
