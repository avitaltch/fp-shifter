import { Routes, Route } from 'react-router-dom';
import Navbar from './components/Navbar/Navbar';
import Footer from './components/Footer/Footer';
import LandingPage from './pages/LandingPage';
import LoginPage from './pages/LoginPage';
import ManagerDashboardPage from './pages/ManagerDashboardPage';
import ShiftAssignmentPage from './pages/ShiftAssignmentPage';
import CustomerBookingPage from './pages/CustomerBookingPage';
import BookingSuccessPage from './pages/BookingSuccessPage';
import EmployeeAvailabilityPage from './pages/EmployeeAvailabilityPage';
import MyShiftsPage from './pages/MyShiftsPage';

function App() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <Navbar />
      <main style={{ flex: 1 }}>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/manager/dashboard" element={<ManagerDashboardPage />} />
          <Route path="/manager/assignment" element={<ShiftAssignmentPage />} />
          <Route path="/booking" element={<CustomerBookingPage />} />
          <Route path="/booking/success" element={<BookingSuccessPage />} />
          <Route path="/employee/availability" element={<EmployeeAvailabilityPage />} />
          <Route path="/employee/shifts" element={<MyShiftsPage />} />
        </Routes>
      </main>
      <Footer />
    </div>
  );
}

export default App;
