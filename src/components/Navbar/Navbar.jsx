import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Calendar, LayoutDashboard, Clock, Scissors, CheckCircle, Menu, X, LogOut, LogIn, Users, Star, Briefcase, UserRound } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import './Navbar.css';

const DRAWER_MQ = '(max-width: 1100px)';

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

  const isActive = (path) => location.pathname === path ? 'active' : '';
  const closeMenu = () => setIsOpen(false);

  const isStaff = role === 'Employee' || role === 'Admin';
  // Burger/drawer only on narrow viewports — never force it for Admin on desktop.
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
          {/* Customer View */}
          <li className="nav-item">
            <Link to="/book" className={`nav-links ${isActive('/book')}`} onClick={closeMenu}>
              <Calendar size={18} />
              הזמנת תור
            </Link>
          </li>

          {/* Admin View */}
          {role === 'Admin' && (
            <>
              <li className="nav-item">
                <Link to="/admin/dashboard" className={`nav-links ${isActive('/admin/dashboard')}`} onClick={closeMenu}>
                  <LayoutDashboard size={18} />
                  לוח בקרה
                </Link>
              </li>
              <li className="nav-item">
                <Link to="/admin/assign" className={`nav-links ${isActive('/admin/assign')}`} onClick={closeMenu}>
                  <Users size={18} />
                  שיבוץ משמרות
                </Link>
              </li>
              <li className="nav-item">
                <Link to="/admin/services" className={`nav-links ${isActive('/admin/services')}`} onClick={closeMenu}>
                  <Star size={18} />
                  ניהול שירותים
                </Link>
              </li>
              <li className="nav-item">
                <Link to="/admin/team" className={`nav-links ${isActive('/admin/team')}`} onClick={closeMenu}>
                  <Briefcase size={18} />
                  ניהול צוות
                </Link>
              </li>
            </>
          )}

          {/* Employee View — staff only */}
          {isStaff && (
            <>
              <li className="nav-item">
                <Link to="/employee/shifts" className={`nav-links ${isActive('/employee/shifts')}`} onClick={closeMenu}>
                  <Clock size={18} />
                  המשמרות שלי
                </Link>
              </li>
              <li className="nav-item">
                <Link to="/employee/availability" className={`nav-links ${isActive('/employee/availability')}`} onClick={closeMenu}>
                  <CheckCircle size={18} />
                  הזנת זמינות
                </Link>
              </li>
              <li className="nav-item">
                <Link to="/employee/recommendations" className={`nav-links ${isActive('/employee/recommendations')}`} onClick={closeMenu}>
                  <Star size={18} />
                  משמרות פתוחות
                </Link>
              </li>
              <li className="nav-item">
                <Link to="/employee/profile" className={`nav-links ${isActive('/employee/profile')}`} onClick={closeMenu}>
                  <UserRound size={18} />
                  הפרופיל שלי
                </Link>
              </li>
            </>
          )}

          {/* Auth Actions */}
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
