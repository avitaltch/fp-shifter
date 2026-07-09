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
import AboutPage from './pages/AboutPage';
import ProtectedRoute from './components/ProtectedRoute/ProtectedRoute';

function App() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <Navbar />
      <main style={{ flex: 1 }}>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/booking" element={<CustomerBookingPage />} />
          <Route path="/booking/success" element={<BookingSuccessPage />} />
          
          <Route path="/manager/dashboard" element={
            <ProtectedRoute allowedRoles={['Manager']}>
              <ManagerDashboardPage />
            </ProtectedRoute>
          } />
          <Route path="/manager/assignment" element={
            <ProtectedRoute allowedRoles={['Manager']}>
              <ShiftAssignmentPage />
            </ProtectedRoute>
          } />
          
          <Route path="/employee/availability" element={
            <ProtectedRoute allowedRoles={['Employee', 'Manager']}>
              <EmployeeAvailabilityPage />
            </ProtectedRoute>
          } />
          <Route path="/employee/shifts" element={
            <ProtectedRoute allowedRoles={['Employee', 'Manager']}>
              <MyShiftsPage />
            </ProtectedRoute>
          } />
        </Routes>
      </main>
      <Footer />
    </div>
  );
}

export default App;
