import { FileSearch } from 'lucide-react';
import './EmptyState.css';

const EmptyState = ({ 
  text = 'לא נמצאו נתונים.', 
  icon: Icon = FileSearch,
  className = '' 
}) => {
  return (
    <div className={`empty-state-component ${className}`}>
      {Icon && <Icon size={48} className="empty-state-icon" />}
      <p className="empty-state-text">{text}</p>
    </div>
  );
};

export default EmptyState;
