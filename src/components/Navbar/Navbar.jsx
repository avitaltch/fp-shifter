import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Calendar, LayoutDashboard, Clock, Scissors, CheckCircle, Menu, X, LogOut, LogIn, Users, Star, Briefcase, UserRound } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import './Navbar.css';

// Real mobile only — desktop always shows the full organized nav.
const DRAWER_MQ = '(max-width: 900px)';

const ADMIN_LINKS = [
  { to: '/admin/dashboard', icon: LayoutDashboard, label: 'לוח בקרה' },
  { to: '/admin/assign', icon: Users, label: 'שיבוץ משמרות' },
  { to: '/admin/services', icon: Star, label: 'ניהול שירותים' },
  { to: '/admin/team', icon: Briefcase, label: 'ניהול צוות' },
];

const STAFF_LINKS = [
  { to: '/employee/shifts', icon: Clock, label: 'המשמרות שלי' },
  { to: '/employee/availability', icon: CheckCircle, label: 'הזנת זמינות' },
  { to: '/employee/recommendations', icon: Star, label: 'משמרות פתוחות' },
];

const Navbar = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [isNarrow, setIsNarrow] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(DRAWER_MQ).matches : false
  );
  const { session, role, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const handleLogout = async () => {
    setIsOpen(false);
    await signOut();
    navigate('/login');
  };

  const isActive = (path) => (location.pathname === path ? 'active' : '');
  const closeMenu = () => setIsOpen(false);

  const isStaff = role === 'Employee' || role === 'Admin';
  const useDrawer = isNarrow;

  useEffect(() => {
    const mq = window.matchMedia(DRAWER_MQ);
    const onChange = () => setIsNarrow(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  // Close the drawer on route change and unlock body scroll
  useEffect(() => {
    setIsOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!useDrawer) setIsOpen(false);
  }, [useDrawer]);

  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  const renderLink = ({ to, icon: Icon, label }) => (
    <li key={to} className="nav-item">
      <Link to={to} className={`nav-links ${isActive(to)}`} onClick={closeMenu}>
        <Icon size={18} />
        {label}
      </Link>
    </li>
  );

  return (
    <nav className={`navbar${useDrawer ? ' navbar--drawer' : ''}`}>
      <div className="navbar-container">
        <Link to="/" className="navbar-logo" onClick={closeMenu}>
          <Scissors className="logo-icon" />
          <span>ShiftSync</span>
        </Link>

        {useDrawer && (
          <button
            type="button"
            className="menu-icon"
            onClick={() => setIsOpen((open) => !open)}
            aria-label={isOpen ? 'סגור תפריט' : 'פתח תפריט'}
            aria-expanded={isOpen}
            aria-controls="primary-nav"
          >
            {isOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        )}

        {useDrawer && isOpen && (
          <button
            type="button"
            className="nav-backdrop"
            aria-label="סגור תפריט"
            onClick={closeMenu}
          />
        )}

        <ul id="primary-nav" className={isOpen ? 'nav-menu active' : 'nav-menu'}>
          {/* Management group */}
          {role === 'Admin' && (
            <>
              <li className="nav-group-label" aria-hidden="true">ניהול</li>
              {ADMIN_LINKS.map(renderLink)}
              <li className="nav-divider" role="separator" aria-orientation="vertical" />
            </>
          )}

          {/* Work group — all staff */}
          {isStaff && (
            <>
              <li className="nav-group-label" aria-hidden="true">עבודה</li>
              {STAFF_LINKS.map(renderLink)}
              <li className="nav-divider" role="separator" aria-orientation="vertical" />
            </>
          )}

          {/* Customer booking */}
          {renderLink({ to: '/book', icon: Calendar, label: 'הזמנת תור' })}

          {/* Personal area: profile + auth */}
          {isStaff && (
            <li className="nav-item">
              <Link to="/employee/profile" className={`nav-links ${isActive('/employee/profile')}`} onClick={closeMenu}>
                <UserRound size={18} />
                הפרופיל שלי
              </Link>
            </li>
          )}
          <li className="nav-item auth-item">
            {session ? (
              <button type="button" onClick={handleLogout} className="nav-links logout-btn">
                <LogOut size={18} />
                התנתק
              </button>
            ) : (
              <Link to="/login" className={`nav-links ${isActive('/login')}`} onClick={closeMenu}>
                <LogIn size={18} />
                כניסת צוות
              </Link>
            )}
          </li>
        </ul>
      </div>
    </nav>
  );
};

export default Navbar;
