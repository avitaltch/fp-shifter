import './Footer.css';

const Footer = () => {
  return (
    <footer className="footer">
      <div className="container footer-inner">
        <div className="footer-brand">
          <span className="footer-brand-dot" aria-hidden="true" />
          <p>ShiftSync</p>
          <span>כל הביקור, בתיאום אחד.</span>
        </div>
        <p className="footer-copyright">© {new Date().getFullYear()} כל הזכויות שמורות.</p>
      </div>
    </footer>
  );
};

export default Footer;
