import { Link, useLocation } from 'react-router-dom';
import { Calendar, LayoutDashboard, Info, Menu } from 'lucide-react';
import { useState } from 'react';
import './Navbar.css';

const Navbar = () => {
  const [isOpen, setIsOpen] = useState(false);
  const location = useLocation();

  const isActive = (path) => location.pathname === path ? 'active' : '';

  return (
    <nav className="navbar">
      <div className="navbar-container">
        <Link to="/" className="navbar-logo">
          <Calendar className="logo-icon" />
          <span>ShiftSync</span>
        </Link>
        
        <div className="menu-icon" onClick={() => setIsOpen(!isOpen)}>
          <Menu />
        </div>

        <ul className={isOpen ? 'nav-menu active' : 'nav-menu'}>
          <li className="nav-item">
            <Link to="/dashboard" className={`nav-links ${isActive('/dashboard')}`} onClick={() => setIsOpen(false)}>
              <LayoutDashboard size={18} />
              לוח בקרה
            </Link>
          </li>
          <li className="nav-item">
            <Link to="/schedule" className={`nav-links ${isActive('/schedule')}`} onClick={() => setIsOpen(false)}>
              <Calendar size={18} />
              משמרות
            </Link>
          </li>
          <li className="nav-item">
            <Link to="/about" className={`nav-links ${isActive('/about')}`} onClick={() => setIsOpen(false)}>
              <Info size={18} />
              אודות
            </Link>
          </li>
        </ul>
      </div>
    </nav>
  );
};

export default Navbar;
