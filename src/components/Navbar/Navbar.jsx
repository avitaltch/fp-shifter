import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Calendar, LayoutDashboard, Clock, Scissors, CheckCircle, UserPlus, Menu, LogOut, LogIn } from 'lucide-react';
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import './Navbar.css';

const Navbar = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [session, setSession] = useState(null);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };

  const isActive = (path) => location.pathname === path ? 'active' : '';

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
            <Link to="/booking" className={`nav-links ${isActive('/booking')}`} onClick={() => setIsOpen(false)}>
              <Calendar size={18} />
              הזמנת תור
            </Link>
          </li>
          {/* Manager View */}
          <li className="nav-item">
            <Link to="/manager/dashboard" className={`nav-links ${isActive('/manager/dashboard')}`} onClick={() => setIsOpen(false)}>
              <LayoutDashboard size={18} />
              דאשבורד מנהל
            </Link>
          </li>
          {/* Employee View */}
          <li className="nav-item">
            <Link to="/employee/shifts" className={`nav-links ${isActive('/employee/shifts')}`} onClick={() => setIsOpen(false)}>
              <Clock size={18} />
              המשמרות שלי
            </Link>
          </li>
          <li className="nav-item">
            <Link to="/employee/availability" className={`nav-links ${isActive('/employee/availability')}`} onClick={() => setIsOpen(false)}>
              <CheckCircle size={18} />
              הזנת זמינות
            </Link>
          </li>
          
          {/* Auth Actions */}
          <li className="nav-item auth-item">
            {session ? (
              <button onClick={handleLogout} className="nav-links logout-btn">
                <LogOut size={18} />
                התנתק
              </button>
            ) : (
              <Link to="/login" className={`nav-links ${isActive('/login')}`} onClick={() => setIsOpen(false)}>
                <LogIn size={18} />
                התחברות
              </Link>
            )}
          </li>
        </ul>
      </div>
    </nav>
  );
};

export default Navbar;
