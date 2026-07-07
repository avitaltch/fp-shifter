import { Users, AlertCircle } from 'lucide-react';
import './ShiftAssignmentPage.css';

const ShiftAssignmentPage = () => {
  return (
    <div className="assignment-page fade-in">
      <div className="assignment-container">
        <header className="page-header">
          <Users size={32} className="header-icon" />
          <h1>ניהול שיבוצים למשמרות</h1>
          <p>מסך זה יאפשר למנהלת לשבץ עובדים באופן ידני במקרה הצורך, מעבר לאלגוריתם האוטומטי.</p>
        </header>
        
        <div className="alert-box">
          <AlertCircle size={24} />
          <span>פיצ'ר תחת פיתוח (Coming Soon)</span>
        </div>
      </div>
    </div>
  );
};

export default ShiftAssignmentPage;
