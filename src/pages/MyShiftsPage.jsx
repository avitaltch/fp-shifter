import { Clock, User } from 'lucide-react';
import { appointmentItems, appointments, serviceTypes, users } from '../data/mockData';
import './MyShiftsPage.css';

const MyShiftsPage = () => {
  // Let's pretend the logged in user is "שי" (u3)
  const currentUserId = 'u3';
  const currentUser = users.find(u => u.id === currentUserId);
  
  const myTasks = appointmentItems.filter(item => item.user_id === currentUserId);

  return (
    <div className="my-shifts-page fade-in">
      <div className="shifts-container">
        <header className="page-header">
          <User size={32} className="header-icon" />
          <h1>המשמרות שלי - {currentUser?.first_name}</h1>
          <p>הטיפולים ששובצת אליהם להיום (15 באוקטובר 2023)</p>
        </header>

        <div className="tasks-list">
          {myTasks.length === 0 ? (
            <p>אין לך טיפולים שנקבעו להיום.</p>
          ) : (
            myTasks.map(task => {
              const service = serviceTypes.find(s => s.id === task.service_type_id);
              const appointment = appointments.find(a => a.id === task.appointment_id);
              // In real app, we'd fetch customer name via appointment.customer_id
              const customerName = "נועה לוי"; // mock

              return (
                <div key={task.id} className="task-card">
                  <div className="task-time">
                    <Clock size={16} />
                    <span>{task.start_time} - {task.end_time}</span>
                  </div>
                  <div className="task-details">
                    <h3>{service?.name}</h3>
                    <p>לקוחה: <strong>{customerName}</strong></p>
                    <span className={`status-badge ${task.status.toLowerCase()}`}>
                      {task.status}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};

export default MyShiftsPage;
