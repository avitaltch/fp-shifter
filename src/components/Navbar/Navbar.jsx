import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Calendar, LayoutDashboard, Clock, Scissors, CheckCircle, Menu, LogOut, LogIn, Users, Star, Briefcase } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import './Navbar.css';

const Navbar = () => {
  const [isOpen, setIsOpen] = useState(false);
  const { session, role, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await signOut();
    navigate('/login');
  };

  const isActive = (path) => location.pathname === path ? 'active' : '';
  const closeMenu = () => setIsOpen(false);

  const isStaff = role === 'Employee' || role === 'Admin';

  return (
    <nav className="navbar">
      <div className="navbar-container">
        <Link to="/" className="navbar-logo">
          <Scissors className="logo-icon" />
          <span>ShiftSync</span>
        </Link>

        <div className="menu-icon" onClick={() => setIsOpen(!isOpen)}>
          <Menu />
        </div>

        <ul className={isOpen ? 'nav-menu active' : 'nav-menu'}>
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
            </>
          )}

          {/* Auth Actions */}
          <li className="nav-item auth-item">
            {session ? (
              <button onClick={handleLogout} className="nav-links logout-btn">
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
